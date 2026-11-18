#!/usr/bin/env python3
"""Pull only main commits whose push CI passed; keep secrets and data on EC2."""

import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path

REPO = 'BYTULOCHKIN/rkr-car-paint-crm'
ROOT = Path('/opt/rkr-crm')
STATE = Path('/var/lib/paintauto-deploy')
MIRROR = STATE / 'repository.git'
SHA = re.compile(r'[0-9a-f]{40}')


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def output(*args):
    return run(*args, stdout=subprocess.PIPE).stdout.strip()


def compose(*args, root=ROOT, image=None):
    env = dict(os.environ)
    if image:
        env['CRM_IMAGE'] = image
    return run('docker', 'compose', '--env-file', str(ROOT / '.env.production'),
               '--project-directory', str(root), '-f', str(root / 'compose.production.yaml'),
               *args, env=env)


def set_image(env_text, image):
    # Change only this non-secret setting; never shell-source production secrets.
    lines = [line for line in env_text.splitlines()
             if not re.match(r'^\s*(?:export\s+)?CRM_IMAGE\s*=', line)]
    return '\n'.join(lines) + '\nCRM_IMAGE=' + image + '\n'


def atomic_text(path, text):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(text)
    temporary.chmod(0o600)
    temporary.replace(path)


def ci_passed(sha):
    url = (f'https://api.github.com/repos/{REPO}/actions/workflows/ci.yml/runs'
           f'?head_sha={sha}&branch=main&event=push&per_page=1')
    request = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'paintauto-deploy', 'X-GitHub-Api-Version': '2022-11-28'
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        runs = json.load(response)['workflow_runs']
    if not (runs and runs[0]['head_sha'] == sha
            and runs[0]['head_branch'] == 'main' and runs[0]['event'] == 'push'):
        return False
    request = urllib.request.Request(runs[0]['jobs_url'], headers=dict(request.headers))
    with urllib.request.urlopen(request, timeout=20) as response:
        jobs = json.load(response)['jobs']
    # The workflow also waits for deployment, so gate on the checks job itself.
    return any(job['name'] == 'checks' and job['status'] == 'completed'
               and job['conclusion'] == 'success' for job in jobs)


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
    for name in ('compose.production.yaml', 'deploy/Caddyfile',
                 'deploy/backup-to-s3.sh', 'deploy/upload-backup.py'):
        target = ROOT / name
        # Write in place: Caddyfile is a bind mount and must keep its inode.
        target.write_bytes((source / name).read_bytes())
        target.chmod(0o755 if name.endswith('.sh') else 0o644)


def deploy(source, sha):
    image = f'rkr-crm:{sha}'
    compose('config', '--quiet', root=source, image=image)
    # Keep the current container serving traffic throughout the build.
    compose('build', 'crm', root=source, image=image)
    # A newer push supersedes a slow build before any production changes.
    if main_sha() != sha:
        print('Main advanced during build; leaving production unchanged.', flush=True)
        return
    run('systemctl', 'start', 'paintauto-backup.service')
    current = output('docker', 'compose', '--env-file', str(ROOT / '.env.production'),
                     '-f', str(ROOT / 'compose.production.yaml'), 'ps', '-q', 'crm')
    old_image = output('docker', 'inspect', '--format', '{{.Image}}', current)
    rollback_image = f'rkr-crm:rollback-{sha}'
    run('docker', 'tag', old_image, rollback_image)
    previous = STATE / 'previous'
    previous.mkdir(exist_ok=True)
    shutil.copyfile(ROOT / '.env.production', previous / '.env.production')
    for name in ('compose.production.yaml', 'deploy/Caddyfile',
                 'deploy/backup-to-s3.sh', 'deploy/upload-backup.py'):
        target = previous / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    old_env = (previous / '.env.production').read_text()
    try:
        install_files(source)
        atomic_text(ROOT / '.env.production', set_image(old_env, image))
        compose('config', '--quiet')
        compose('up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180')
        compose('exec', '-T', 'caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile')
        smoke_test()
    except Exception:
        print('Deployment failed; restoring previous container and configuration.', flush=True)
        install_files(previous)
        atomic_text(ROOT / '.env.production', set_image(old_env, rollback_image))
        compose('up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180')
        compose('exec', '-T', 'caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile')
        smoke_test()
        raise
    # Controller changes take effect only after the release passes health checks.
    shutil.copyfile(source / 'deploy/autodeploy.py', '/usr/local/lib/paintauto/autodeploy.py')
    status = ROOT / 'deploy-status'
    status.mkdir(exist_ok=True)
    status.chmod(0o755)
    atomic_text(status / 'release.json', json.dumps({'commit': sha}) + '\n')
    (status / 'release.json').chmod(0o644)
    atomic_text(STATE / 'current-sha', sha + '\n')
    (STATE / 'failed-sha').unlink(missing_ok=True)
    print(f'Deployed {sha} successfully.', flush=True)
    # Bound accumulated release images and build cache on the 30 GiB EBS disk.
    try:
        keep = {'release': 3, 'rollback': 2}
        for tag in output('docker', 'image', 'ls', 'rkr-crm', '--format', '{{.Tag}}').splitlines():
            kind = 'rollback' if tag.startswith('rollback-') else 'release'
            candidate = tag.removeprefix('rollback-')
            if SHA.fullmatch(candidate):
                keep[kind] -= 1
                if keep[kind] < 0 and f'rkr-crm:{tag}' not in (image, rollback_image):
                    run('docker', 'image', 'rm', f'rkr-crm:{tag}')
        run('docker', 'builder', 'prune', '--force', '--keep-storage', '2GB')
    except subprocess.CalledProcessError:
        print('Release is healthy; image-cache cleanup needs attention.', flush=True)


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
        # Anonymous GitHub REST allows 60 requests/hour. Two calls per CI query,
        # at most once every three timer ticks, also leaves room for diagnostics.
        query = STATE / 'ci-query.json'
        if query.exists():
            previous_query = json.loads(query.read_text())
            if previous_query['sha'] == sha and time.time() - previous_query['time'] < 150:
                return
        atomic_text(query, json.dumps({'sha': sha, 'time': time.time()}))
        if not ci_passed(sha):
            print(f'Waiting for successful push CI on main at {sha}.', flush=True)
            return
        if shutil.disk_usage(STATE).free < 5 * 1024**3:
            raise RuntimeError('Less than 5 GiB free; production left unchanged')
        with tempfile.TemporaryDirectory(prefix='release-', dir=STATE) as staging:
            source = Path(staging)
            archive = source / 'source.tar'
            run('git', '--git-dir', str(MIRROR), 'archive', '--format=tar',
                '--output', str(archive), sha)
            with tarfile.open(archive) as tar:
                tar.extractall(source, filter='data')
            archive.unlink()
            try:
                deploy(source, sha)
            except Exception:
                atomic_text(STATE / 'failed-sha', sha + '\n')
                raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Commands never include runtime secrets, and compose config uses --quiet.
        print(f'Autodeploy failed: {error}', file=sys.stderr, flush=True)
        sys.exit(1)
