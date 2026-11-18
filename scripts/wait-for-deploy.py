#!/usr/bin/env python3
"""Display live EC2 deployment stages in GitHub Actions and write a timing table."""

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

URL = 'https://paintauto.pp.ua/.well-known/paintauto-release.json'
LABELS = {
    'download': 'Завантаження готового ARM64-образу',
    'verify': 'Перевірка SHA256 та конфігурації',
    'load': 'Імпорт образу, перевірка ARM64 і коміту',
    'backup': 'Резервна копія SQLite у S3',
    'start': 'Запуск контейнера та Docker healthcheck',
    'healthcheck': 'Перевірка публічного HTTPS',
    'rollback': 'Повернення попереднього контейнера'
}


def read_status():
    request = urllib.request.Request(URL, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def stage_result(data, sha, stage):
    candidate = data.get('deployment', {})
    if candidate.get('commit') != sha:
        return None
    step = candidate.get('steps', {}).get(stage, {})
    if step.get('status') == 'success':
        # The final stage confirms both the successful health probe and publication.
        if stage != 'healthcheck' or (candidate.get('status') == 'success' and data.get('commit') == sha):
            return step
    if candidate.get('status') in ('failed', 'superseded'):
        failed = candidate.get('failed_stage', candidate.get('stage', 'unknown'))
        raise RuntimeError(f"EC2 deployment {candidate['status']} at {failed}; see deployment summary and server journal")
    return None


def summary(sha):
    summary_file = os.environ.get('GITHUB_STEP_SUMMARY')
    if not summary_file:
        return
    try:
        data = read_status()
    except (OSError, ValueError):
        print('Could not fetch deployment summary.', flush=True)
        return
    candidate = data.get('deployment', {})
    if candidate.get('commit') != sha:
        return
    lines = [
        '### Розгортання PaintAuto на AWS',
        f'Коміт: {sha[:7]}. Стан: **{candidate.get("status", "unknown")}**.',
        '',
        '| Етап на EC2 | Результат | Час |',
        '| --- | --- | --- |'
    ]
    for key, step in candidate.get('steps', {}).items():
        label = LABELS.get(key, key)
        lines.append(f'| {label} | {step["status"]} | {step.get("seconds", "—")} с |')
    lines.extend(['', f'Разом на EC2: **{candidate.get("seconds", "—")} с**.',
                  '', '[Відкрити CRM](https://paintauto.pp.ua)', ''])
    with Path(summary_file).open('a') as destination:
        destination.write('\n'.join(lines))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', choices=LABELS)
    parser.add_argument('--summary', action='store_true')
    parser.add_argument('--timeout', type=int, default=600)
    args = parser.parse_args()
    sha = os.environ['EXPECTED_SHA']
    if args.summary:
        summary(sha)
        return
    if not args.stage:
        parser.error('--stage or --summary is required')
    deadline = time.monotonic() + args.timeout
    previous = None
    while time.monotonic() < deadline:
        try:
            data = read_status()
        except (OSError, ValueError):
            time.sleep(3)
            continue
        candidate = data.get('deployment', {})
        state = (candidate.get('commit'), candidate.get('stage'), candidate.get('status'))
        if state != previous:
            print(f'EC2: commit={state[0]}, stage={state[1]}, status={state[2]}', flush=True)
            previous = state
        result = stage_result(data, sha, args.stage)
        if result:
            print(f'{LABELS[args.stage]}: success ({result["seconds"]} seconds on EC2)', flush=True)
            return
        time.sleep(3)
    raise RuntimeError(f'Timed out waiting for EC2 stage {args.stage}')


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        print(f'::error::{error}', file=sys.stderr, flush=True)
        sys.exit(1)
