#!/usr/bin/env python3
"""Load checked ARM64 release images from GitHub; never build on production."""

import contextlib
import datetime
import fcntl
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = 'BYTULOCHKIN/rkr-car-paint-crm'
ROOT = Path('/opt/rkr-crm')
STATE = Path('/var/lib/paintauto-deploy')
MIRROR = STATE / 'repository.git'
SHA = re.compile(r'[0-9a-f]{40}')
ASSET = 'paintauto-linux-arm64.tar.gz'
STAGES = ('download', 'verify', 'load', 'backup', 'start', 'healthcheck')
CONFIG_FILES = ('compose.production.yaml', 'deploy/Caddyfile',
                'deploy/backup-to-s3.sh', 'deploy/upload-backup.py')


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def output(*args):
    return run(*args, stdout=subprocess.PIPE).stdout.strip()


def compose(*args, root=None, image=None):
    root = ROOT if root is None else root
    env = dict(os.environ)
    if image:
        env['CRM_IMAGE'] = image
    return run('docker', 'compose', '--env-file', str(ROOT / '.env.production'),
               '--project-directory', str(root), '-f', str(root / 'compose.production.yaml'),
               *args, env=env)


def set_image(env_text, image):
    lines = [line for line in env_text.splitlines()
             if not re.match(r'^\s*(?:export\s+)?CRM_IMAGE\s*=', line)]
    return '\n'.join(lines) + '\nCRM_IMAGE=' + image + '\n'


def atomic_text(path, text):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(text)
    temporary.chmod(0o600)
    temporary.replace(path)


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')


class DeploymentStatus:
    """Public progress contains commit hashes, fixed stage names and timings only."""

    def __init__(self, sha):
        self.path = ROOT / 'deploy-status/release.json'
        self.path.parent.mkdir(exist_ok=True)
        self.path.parent.chmod(0o755)
        active = json.loads(self.path.read_text()).get('commit') if self.path.exists() else None
        self.record = {
            'commit': active,
            'deployment': {
                'commit': sha, 'status': 'running', 'started_at': utc_now(),
                'steps': {stage: {'status': 'pending'} for stage in STAGES}
            }
        }
        self.started = time.monotonic()
        self.publish()

    def publish(self):
        self.record['deployment']['updated_at'] = utc_now()
        atomic_text(self.path, json.dumps(self.record) + '\n')
        self.path.chmod(0o644)

    @contextlib.contextmanager
    def step(self, name):
        step = {'status': 'running', 'started_at': utc_now()}
        self.record['deployment']['steps'][name] = step
        self.record['deployment']['stage'] = name
        self.publish()
        started = time.monotonic()
        print(f'STAGE {name}: started', flush=True)
        try:
            yield
        except Exception:
            step['status'] = 'failed'
            self.record['deployment']['failed_stage'] = name
            raise
        else:
            step['status'] = 'success'
        finally:
            step['seconds'] = round(time.monotonic() - started, 2)
            step['completed_at'] = utc_now()
            self.publish()
            print(f"STAGE {name}: {step['status']} ({step['seconds']}s)", flush=True)

    def finish(self, status):
        self.record['deployment']['status'] = status
        self.record['deployment']['seconds'] = round(time.monotonic() - self.started, 2)
        if status == 'success':
            self.record['commit'] = self.record['deployment']['commit']
        self.publish()


def release_url(sha, asset):
    return f'https://github.com/{REPO}/releases/download/paintauto-deploy-{sha}/{asset}'


def published_release(sha):
    request = urllib.request.Request(release_url(sha, 'release.json'), headers={
        'User-Agent': 'paintauto-deploy', 'Cache-Control': 'no-cache'
    })
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read(65537)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None  # The checked build has not been published yet.
        raise
    if len(raw) > 65536:
        raise ValueError('Release manifest is too large')
    manifest = json.loads(raw)
    if (manifest.get('schema') != 1 or manifest.get('commit') != sha
            or manifest.get('image') != f'rkr-crm:{sha}'
            or manifest.get('architecture') != 'arm64'
            or manifest.get('asset') != ASSET
            or not isinstance(manifest.get('sha256'), str)
            or not re.fullmatch(r'[0-9a-f]{64}', manifest['sha256'])
            or not isinstance(manifest.get('bytes'), int)
            or not 0 < manifest['bytes'] < 1024**3):
        raise ValueError('Invalid ARM64 release manifest')
    return manifest


def download_image(sha, manifest, destination):
    digest = hashlib.sha256()
    size = 0
    request = urllib.request.Request(release_url(sha, ASSET), headers={'User-Agent': 'paintauto-deploy'})
    with urllib.request.urlopen(request, timeout=60) as response, destination.open('wb') as archive:
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > manifest['bytes']:
                raise ValueError('Image exceeds its declared size')
            digest.update(chunk)
            archive.write(chunk)
    return size, digest.hexdigest()


def main_sha():
    run('git', '--git-dir', str(MIRROR), 'fetch', '--quiet', '--depth=1', 'origin',
        '+refs/heads/main:refs/remotes/origin/main')
    sha = output('git', '--git-dir', str(MIRROR), 'rev-parse', 'refs/remotes/origin/main')
    if not SHA.fullmatch(sha):
        raise RuntimeError('Invalid main commit SHA')
    return sha


def smoke_test():
    for attempt in range(12):
        try:
            with urllib.request.urlopen('https://paintauto.pp.ua/auth/sign-up', timeout=10) as response:
                if response.status == 200:
                    return
        except (OSError, ValueError):
            pass
        time.sleep(5)
    raise RuntimeError('Public HTTPS health check failed')


def install_files(source):
    for name in CONFIG_FILES:
        target = ROOT / name
        # Caddyfile is a bind mount: preserve its inode.
        target.write_bytes((source / name).read_bytes())
        target.chmod(0o755 if name.endswith('.sh') else 0o644)


def install_controller(source):
    shutil.copyfile(source / 'deploy/autodeploy.py', '/usr/local/lib/paintauto/autodeploy.py')
    changed = False
    for name in ('paintauto-deploy.service', 'paintauto-deploy.timer'):
        target = Path('/etc/systemd/system') / name
        contents = (source / 'deploy' / name).read_bytes()
        if target.read_bytes() != contents:
            target.write_bytes(contents)
            target.chmod(0o644)
            changed = True
    if changed:
        run('systemctl', 'daemon-reload')


def cleanup_images(image, rollback_image):
    try:
        keep = {'release': 3, 'rollback': 2}
        for tag in output('docker', 'image', 'ls', 'rkr-crm', '--format', '{{.Tag}}').splitlines():
            kind = 'rollback' if tag.startswith('rollback-') else 'release'
            if SHA.fullmatch(tag.removeprefix('rollback-')):
                keep[kind] -= 1
                if keep[kind] < 0 and f'rkr-crm:{tag}' not in (image, rollback_image):
                    run('docker', 'image', 'rm', f'rkr-crm:{tag}')
    except subprocess.CalledProcessError:
        print('Release is healthy; image cleanup needs attention.', flush=True)


def deploy(source, sha, manifest, status):
    image = manifest['image']
    archive = source / ASSET
    applying = False
    try:
        with status.step('download'):
            size, digest = download_image(sha, manifest, archive)
        with status.step('verify'):
            if size != manifest['bytes'] or digest != manifest['sha256']:
                raise ValueError('Image size or SHA256 checksum does not match')
            compose('config', '--quiet', root=source, image=image)
        with status.step('load'):
            run('docker', 'image', 'load', '--input', str(archive))
            identity = output('docker', 'image', 'inspect', '--format',
                              '{{.Architecture}} {{index .Config.Labels "org.opencontainers.image.revision"}}', image)
            if identity != f'arm64 {sha}':
                raise ValueError('Loaded image architecture or commit does not match')
        archive.unlink()
        if main_sha() != sha:
            status.finish('superseded')
            print('Main advanced; production left unchanged.', flush=True)
            return
        with status.step('backup'):
            run('systemctl', 'start', 'paintauto-backup.service')
            current = output('docker', 'compose', '--env-file', str(ROOT / '.env.production'),
                             '-f', str(ROOT / 'compose.production.yaml'), 'ps', '-q', 'crm')
            old_image = output('docker', 'inspect', '--format', '{{.Image}}', current)
            rollback_image = f'rkr-crm:rollback-{sha}'
            run('docker', 'tag', old_image, rollback_image)
            previous = STATE / 'previous'
            previous.mkdir(exist_ok=True)
            shutil.copyfile(ROOT / '.env.production', previous / '.env.production')
            for name in CONFIG_FILES:
                target = previous / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, target)
            old_env = (previous / '.env.production').read_text()
        with status.step('start'):
            applying = True
            install_files(source)
            atomic_text(ROOT / '.env.production', set_image(old_env, image))
            compose('config', '--quiet')
            compose('up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180')
            compose('exec', '-T', 'caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile')
        with status.step('healthcheck'):
            smoke_test()
            install_controller(source)
    except Exception:
        if applying:
            status.record['deployment']['status'] = 'rolling_back'
            status.publish()
            with status.step('rollback'):
                install_files(previous)
                atomic_text(ROOT / '.env.production', set_image(old_env, rollback_image))
                compose('up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180')
                compose('exec', '-T', 'caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile')
                smoke_test()
        raise
    atomic_text(STATE / 'current-sha', sha + '\n')
    (STATE / 'failed-sha').unlink(missing_ok=True)
    status.finish('success')
    print(f'Deployed {sha} successfully.', flush=True)
    cleanup_images(image, rollback_image)


def main():
    os.umask(0o077)
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE / 'lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        if not MIRROR.exists():
            run('git', 'init', '--bare', '--quiet', str(MIRROR))
            run('git', '--git-dir', str(MIRROR), 'remote', 'add', 'origin',
                f'https://github.com/{REPO}.git')
        sha = main_sha()
        for marker in ('current-sha', 'failed-sha'):
            if (STATE / marker).exists() and (STATE / marker).read_text().strip() == sha:
                return
        manifest = published_release(sha)
        if manifest is None:
            print(f'Waiting for checked ARM64 release {sha}.', flush=True)
            return
        if shutil.disk_usage(STATE).free < 3 * 1024**3:
            raise RuntimeError('Less than 3 GiB free; production left unchanged')
        status = DeploymentStatus(sha)
        try:
            with tempfile.TemporaryDirectory(prefix='release-', dir=STATE) as staging:
                source = Path(staging)
                archive = source / 'source.tar'
                run('git', '--git-dir', str(MIRROR), 'archive', '--format=tar',
                    '--output', str(archive), sha)
                with tarfile.open(archive) as tar:
                    tar.extractall(source, filter='data')
                archive.unlink()
                deploy(source, sha, manifest, status)
        except Exception:
            atomic_text(STATE / 'failed-sha', sha + '\n')
            status.finish('failed')
            raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Autodeploy failed: {error}', file=sys.stderr, flush=True)
        sys.exit(1)
