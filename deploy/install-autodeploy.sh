#!/bin/bash
# Run as root from the reviewed repository checkout on the existing EC2 server.
set -euo pipefail
umask 077

CRM_BASELINE=${1:?Pass the current GitHub main SHA to skip old commits}
[[ "$CRM_BASELINE" =~ ^[0-9a-f]{40}$ ]] || exit 1
test -f /opt/rkr-crm/.env.production
test -f deploy/autodeploy.py

install -d -m 700 /var/lib/paintauto-deploy /usr/local/lib/paintauto
install -m 600 deploy/autodeploy.py /usr/local/lib/paintauto/autodeploy.py
if [ ! -f /var/lib/paintauto-deploy/current-sha ]; then
  printf '%s\n' "$CRM_BASELINE" > /var/lib/paintauto-deploy/current-sha
fi
install -d -m 755 /opt/rkr-crm/deploy-status
if [ ! -f /opt/rkr-crm/deploy-status/release.json ]; then
  printf '{"commit":null}\n' > /opt/rkr-crm/deploy-status/release.json
  chmod 644 /opt/rkr-crm/deploy-status/release.json
fi

install -d -m 700 /var/lib/paintauto-deploy/bootstrap
cp /opt/rkr-crm/compose.production.yaml /var/lib/paintauto-deploy/bootstrap/
cp /opt/rkr-crm/deploy/Caddyfile /var/lib/paintauto-deploy/bootstrap/
install -m 644 compose.production.yaml /opt/rkr-crm/compose.production.yaml
# Preserve the Caddyfile bind-mount inode.
cat deploy/Caddyfile > /opt/rkr-crm/deploy/Caddyfile
docker compose --env-file /opt/rkr-crm/.env.production -f /opt/rkr-crm/compose.production.yaml config --quiet
docker compose --env-file /opt/rkr-crm/.env.production -f /opt/rkr-crm/compose.production.yaml up -d --no-build --pull never --wait --wait-timeout 180 caddy

install -m 644 deploy/paintauto-deploy.service deploy/paintauto-deploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now paintauto-deploy.timer
systemctl list-timers paintauto-deploy.timer --no-pager
