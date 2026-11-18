#!/bin/bash
set -euo pipefail
umask 077
cd /opt/rkr-crm

exec 9>/run/lock/paintauto-backup.lock
flock -n 9 || exit 0

if ! find data -maxdepth 1 -type f \( -name 'crm.sqlite' -o -name 'crm.sqlite.org-*.sqlite' \) -print -quit | grep -q .; then
  echo 'No CRM databases yet; skipping backup.'
  exit 0
fi

CRM_SNAPSHOT=$(docker compose --env-file .env.production -f compose.production.yaml exec -T crm node /opt/crm/backup.mjs /app/data/crm.sqlite /backups)
CRM_SNAPSHOT_NAME=${CRM_SNAPSHOT#/backups/}
if [[ ! "$CRM_SNAPSHOT_NAME" =~ ^crm-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}\.[0-9]{3}Z-[[:alnum:]]{6}$ ]]; then
  echo 'Backup returned an unexpected snapshot name.' >&2
  exit 1
fi

CRM_ARCHIVE=$(mktemp /var/tmp/paintauto-backup.XXXXXX.tar.gz)
trap 'rm -f "$CRM_ARCHIVE"' EXIT
tar -C backups -czf "$CRM_ARCHIVE" "$CRM_SNAPSHOT_NAME"
/usr/bin/python3 deploy/upload-backup.py "$CRM_ARCHIVE" "$CRM_SNAPSHOT_NAME.tar.gz"

# Prune only completed snapshots after a successful off-server upload.
/usr/bin/python3 - <<'PY'
import re
import shutil
import time
from pathlib import Path

cutoff = time.time() - 7 * 24 * 60 * 60
for snapshot in Path('/opt/rkr-crm/backups').iterdir():
    if (re.fullmatch(r'crm-[A-Za-z0-9.:-]+', snapshot.name)
            and not snapshot.is_symlink() and snapshot.is_dir()
            and (snapshot / 'manifest.json').is_file()
            and snapshot.stat().st_mtime < cutoff):
        shutil.rmtree(snapshot)
PY
