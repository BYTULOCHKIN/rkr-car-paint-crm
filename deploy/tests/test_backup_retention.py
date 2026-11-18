import datetime
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('backup', Path(__file__).parents[1] / 'upload-backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)
NOW = datetime.datetime(2026, 11, 18, 12, 0, tzinfo=datetime.timezone.utc)


def name(index):
    return f'crm-2026-11-18T10-{index:02d}-00.000Z-{index:06d}'


def version(index, version_id=None, latest=True):
    return {'Key': f'daily/{name(index)}.tar.gz', 'VersionId': version_id or str(index),
            'IsLatest': latest, 'Size': 9, 'LastModified': NOW + datetime.timedelta(minutes=index)}


def snapshot(root, index):
    path = root / name(index)
    path.mkdir()
    (path / 'crm.sqlite').write_bytes(b'snapshot')
    (path / 'manifest.json').write_text(json.dumps({'databases': ['crm.sqlite']}))
    return path


class FakeS3:
    def __init__(self, versions, markers=None):
        self.versions = versions
        self.markers = markers or []
        self.deleted = []
        self.upload_failure = False
        self.delete_failure = False
        self.unconfirmed_upload = False

    def upload_file(self, archive, bucket, key, **kwargs):
        if self.upload_failure:
            raise RuntimeError('upload failed')
        if not self.unconfirmed_upload:
            self.versions.append({'Key': key, 'VersionId': 'uploaded', 'IsLatest': True,
                                  'Size': Path(archive).stat().st_size,
                                  'LastModified': NOW + datetime.timedelta(days=1)})

    def get_paginator(self, operation):
        if operation != 'list_object_versions':
            raise AssertionError(operation)
        return SimpleNamespace(paginate=lambda **kwargs: iter([
            {'Versions': self.versions[:2]},
            {'Versions': self.versions[2:], 'DeleteMarkers': self.markers}
        ]))

    def delete_objects(self, Bucket, Delete):
        if self.delete_failure:
            return {'Errors': [{'Code': 'AccessDenied'}]}
        for item in Delete['Objects']:
            assert 'VersionId' in item
            self.deleted.append(item)
            self.versions[:] = [value for value in self.versions
                                if (value['Key'], value['VersionId']) != (item['Key'], item['VersionId'])]
            self.markers[:] = [value for value in self.markers
                               if (value['Key'], value['VersionId']) != (item['Key'], item['VersionId'])]
        return {}


class BackupRetentionTests(unittest.TestCase):
    def test_retains_four_latest_sets_and_permanently_removes_old_versions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for index in range(7):
                snapshot(root, index)
            outside = root / 'outside'
            outside.mkdir()
            (outside / 'keep').write_text('untouched')
            (root / name(8)).symlink_to(outside, target_is_directory=True)
            incomplete = root / '.incomplete-example'
            incomplete.mkdir()
            (root / 'manual-note').write_text('untouched')
            archive = root / 'upload.tar.gz'
            archive.write_bytes(b'new archive')
            old_version = version(5, version_id='older-version-of-retained-key', latest=False)
            marker = {'Key': version(1)['Key'], 'VersionId': 'old-delete-marker', 'IsLatest': False}
            unrelated = {'Key': 'daily/_verification/test.txt', 'VersionId': 'leave-alone',
                         'Size': 1, 'IsLatest': True, 'LastModified': NOW}
            client = FakeS3([*[version(i) for i in range(6)], old_version, unrelated], [marker])
            backup.upload_and_retain(client, 'bucket', archive, f'{name(6)}.tar.gz', root)
            kept = [item for item in client.versions if backup.ARCHIVE_KEY.fullmatch(item['Key'])]
            self.assertEqual(len(kept), 4)
            self.assertEqual({item['Key'] for item in kept},
                             {f'daily/{name(i)}.tar.gz' for i in (3, 4, 5, 6)})
            self.assertEqual({p.name for p in root.iterdir() if backup.completed_snapshot(p)},
                             {name(i) for i in (3, 4, 5, 6)})
            self.assertTrue(any(item['VersionId'] == 'older-version-of-retained-key' for item in client.deleted))
            self.assertEqual(client.markers, [])
            self.assertIn(unrelated, client.versions)
            self.assertTrue((outside / 'keep').exists())
            self.assertTrue(incomplete.exists())
            self.assertTrue((root / 'manual-note').exists())

    def test_failed_upload_preserves_every_existing_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for i in range(5):
                snapshot(root, i)
            archive = root / 'upload.tar.gz'
            archive.write_bytes(b'archive')
            client = FakeS3([version(i) for i in range(4)])
            client.upload_failure = True
            with self.assertRaisesRegex(RuntimeError, 'upload failed'):
                backup.upload_and_retain(client, 'bucket', archive, f'{name(4)}.tar.gz', root)
            self.assertEqual(client.deleted, [])
            self.assertTrue(all((root / name(i)).exists() for i in range(5)))

    def test_unconfirmed_remote_copy_never_triggers_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for i in range(5):
                snapshot(root, i)
            archive = root / 'upload.tar.gz'
            archive.write_bytes(b'archive')
            client = FakeS3([version(i) for i in range(4)])
            client.unconfirmed_upload = True
            with self.assertRaisesRegex(RuntimeError, 'not confirmed'):
                backup.upload_and_retain(client, 'bucket', archive, f'{name(4)}.tar.gz', root)
            self.assertEqual(client.deleted, [])
            self.assertTrue(all((root / name(i)).exists() for i in range(5)))

    def test_partial_s3_delete_error_preserves_local_recovery_points(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for i in range(5):
                snapshot(root, i)
            archive = root / 'upload.tar.gz'
            archive.write_bytes(b'archive')
            client = FakeS3([version(i) for i in range(4)])
            client.delete_failure = True
            with self.assertRaisesRegex(RuntimeError, 'AccessDenied'):
                backup.upload_and_retain(client, 'bucket', archive, f'{name(4)}.tar.gz', root)
            self.assertTrue(all((root / name(i)).exists() for i in range(5)))

    def test_new_upload_is_protected_even_with_equal_or_skewed_timestamps(self):
        versions = [version(i) for i in range(5)]
        versions[0]['Size'] = 42
        retained, obsolete, _ = backup.retention_plan(versions, [], versions[0]['Key'], 42)
        self.assertIn(name(0), retained)
        self.assertEqual(len(retained), 4)
        self.assertNotIn(versions[0]['Key'], {item['Key'] for item in obsolete})

    def test_local_cleanup_refuses_to_run_without_complete_current_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for i in range(4):
                snapshot(root, i)
            snapshot(root, 4)
            (root / name(4) / 'crm.sqlite').unlink()
            with self.assertRaisesRegex(RuntimeError, 'not verified'):
                backup.prune_local(root, {name(4)}, name(4))
            self.assertTrue(all((root / name(i)).exists() for i in range(5)))


if __name__ == '__main__':
    unittest.main()
