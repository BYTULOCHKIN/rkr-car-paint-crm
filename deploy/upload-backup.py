#!/usr/bin/env python3
"""Upload via the EC2 role; keep four verified snapshot sets locally and in S3."""

import json
import os
import re
import shutil
import sys
from pathlib import Path

KEEP = 4
PREFIX = 'daily/crm-'
SNAPSHOT = re.compile(r'crm-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}\.[0-9]{3}Z-[A-Za-z0-9]{6}')
ARCHIVE_KEY = re.compile(r'daily/(' + SNAPSHOT.pattern + r')\.tar\.gz')


def completed_snapshot(path):
    if path.is_symlink() or not path.is_dir() or not SNAPSHOT.fullmatch(path.name):
        return False
    manifest = path / 'manifest.json'
    if manifest.is_symlink() or not manifest.is_file():
        return False
    try:
        databases = json.loads(manifest.read_text())['databases']
        return (isinstance(databases, list) and bool(databases)
                and all(isinstance(name, str)
                        and re.fullmatch(r'crm\.sqlite(?:\.org-.+\.sqlite)?', name)
                        and Path(name).name == name
                        and not (path / name).is_symlink()
                        and (path / name).is_file() for name in databases))
    except (OSError, ValueError, KeyError, TypeError):
        return False


def retention_plan(versions, markers, current_key, expected_size):
    versions = [item for item in versions if ARCHIVE_KEY.fullmatch(item['Key'])]
    markers = [item for item in markers if ARCHIVE_KEY.fullmatch(item['Key'])]
    live = [item for item in versions if item['IsLatest']]
    current = next((item for item in live
                    if item['Key'] == current_key and item['Size'] == expected_size), None)
    if current is None:
        raise RuntimeError('Uploaded backup not confirmed in S3; nothing will be deleted')
    others = sorted((item for item in live if item['Key'] != current_key),
                    key=lambda item: (item['LastModified'], item['Key']), reverse=True)
    retained = [current, *others[:KEEP - 1]]
    retained_ids = {(item['Key'], item['VersionId']) for item in retained}
    obsolete = [item for item in versions if (item['Key'], item['VersionId']) not in retained_ids]
    # Delete concrete versions, not just create delete markers hiding old copies.
    delete_versions = [{'Key': item['Key'], 'VersionId': item['VersionId']} for item in obsolete]
    delete_markers = [{'Key': item['Key'], 'VersionId': item['VersionId']} for item in markers]
    if any(not isinstance(item['VersionId'], str) or not item['VersionId']
           for item in [*retained, *delete_versions, *delete_markers]):
        raise RuntimeError('S3 returned an invalid version identifier; refusing cleanup')
    return {ARCHIVE_KEY.fullmatch(item['Key'])[1] for item in retained}, delete_versions, delete_markers


def delete_versions(client, bucket, items):
    for offset in range(0, len(items), 1000):
        response = client.delete_objects(
            Bucket=bucket, Delete={'Objects': items[offset:offset + 1000], 'Quiet': True}
        )
        if response.get('Errors'):
            codes = sorted({item.get('Code', 'Unknown') for item in response['Errors']})
            raise RuntimeError('S3 retention deletion failed: ' + ', '.join(codes))


def prune_local(root, retained, current_name):
    if current_name not in retained or not completed_snapshot(root / current_name):
        raise RuntimeError('Current local backup is not verified; refusing local cleanup')
    removed = 0
    for snapshot in root.iterdir():
        if snapshot.name not in retained and completed_snapshot(snapshot):
            shutil.rmtree(snapshot)
            removed += 1
    return removed


def upload_and_retain(client, bucket, archive, object_name, local_root):
    match = ARCHIVE_KEY.fullmatch(f'daily/{object_name}')
    if not match or not archive.is_file():
        raise ValueError('Unexpected or missing backup archive')
    current_name = match[1]
    if not completed_snapshot(local_root / current_name):
        raise RuntimeError('Current snapshot is incomplete; upload and cleanup aborted')
    key = f'daily/{object_name}'
    size = archive.stat().st_size
    client.upload_file(str(archive), bucket, key, ExtraArgs={'ServerSideEncryption': 'AES256'})
    print(f'Backup uploaded to s3://{bucket}/{key}', flush=True)
    versions, markers = [], []
    for page in client.get_paginator('list_object_versions').paginate(Bucket=bucket, Prefix=PREFIX):
        versions.extend(page.get('Versions', []))
        markers.extend(page.get('DeleteMarkers', []))
    retained, obsolete, old_markers = retention_plan(versions, markers, key, size)
    # Keep local recovery points unchanged if any remote cleanup operation fails.
    delete_versions(client, bucket, obsolete)
    delete_versions(client, bucket, old_markers)
    removed = prune_local(local_root, retained, current_name)
    print(f'Retention complete: {len(retained)} snapshot sets kept; '
          f'{len(obsolete)} old S3 versions, {len(old_markers)} delete markers '
          f'and {removed} local snapshots removed.', flush=True)


def main():
    import boto3

    archive = Path(sys.argv[1])
    object_name = sys.argv[2]
    bucket = os.environ['BACKUP_S3_BUCKET']
    region = os.environ.get('AWS_DEFAULT_REGION', 'eu-north-1')
    upload_and_retain(boto3.client('s3', region_name=region), bucket, archive,
                      object_name, Path('/opt/rkr-crm/backups'))


if __name__ == '__main__':
    main()
