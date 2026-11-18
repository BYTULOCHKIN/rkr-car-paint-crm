#!/usr/bin/env python3
"""Publish an immutable public image asset only after checks and build succeed."""

import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

ASSET = 'paintauto-linux-arm64.tar.gz'


def gh(*args):
    return subprocess.run(['gh', *args], check=True, text=True, stdout=subprocess.PIPE).stdout


def main():
    sha = os.environ['GITHUB_SHA']
    repo = os.environ['GITHUB_REPOSITORY']
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Invalid commit')
    tag = f'paintauto-deploy-{sha}'
    directory = Path('.artifacts/release')
    archive = directory / ASSET
    size = archive.stat().st_size
    if not 0 < size < 1024**3:
        raise ValueError('Image archive must be smaller than 1 GiB')
    with archive.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    manifest = {
        'schema': 1, 'commit': sha, 'architecture': 'arm64',
        'image': f'rkr-crm:{sha}', 'asset': ASSET, 'sha256': digest, 'bytes': size,
        'workflow': f'https://github.com/{repo}/actions/runs/{os.environ["GITHUB_RUN_ID"]}'
    }
    (directory / 'release.json').write_text(json.dumps(manifest, indent=2) + '\n')
    existing = subprocess.run(
        ['gh', 'release', 'view', tag, '--repo', repo, '--json', 'isDraft,targetCommitish,url'],
        text=True, capture_output=True
    )
    if existing.returncode == 0:
        release = json.loads(existing.stdout)
        if release['targetCommitish'] != sha:
            raise ValueError('Existing release targets a different commit')
        if not release['isDraft']:
            print('This immutable commit release is already published; leaving its assets unchanged.')
            return
        gh('release', 'delete', tag, '--repo', repo, '--yes', '--cleanup-tag')
    elif 'not found' not in existing.stderr.lower() and '404' not in existing.stderr:
        raise RuntimeError('Cannot check existing deployment release: ' + existing.stderr)
    notes = directory / 'notes.md'
    notes.write_text(
        f'ARM64 production runtime for commit {sha}.\n\n'
        f'Build: {manifest["workflow"]}\n\n'
        'Runtime secrets and business databases stay on EC2.\n'
    )
    gh('release', 'create', tag, '--repo', repo, '--target', sha, '--draft',
       '--prerelease', '--title', f'PaintAuto deploy {sha[:7]}', '--notes-file', str(notes))
    gh('release', 'upload', tag, str(archive), str(directory / 'release.json'), '--repo', repo)
    # Until publication, anonymous EC2 requests cannot observe a partial release.
    gh('release', 'edit', tag, '--repo', repo, '--draft=false', '--latest=false')
    print(f'Published https://github.com/{repo}/releases/tag/{tag}')


if __name__ == '__main__':
    main()
