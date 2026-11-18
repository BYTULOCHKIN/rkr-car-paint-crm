#!/bin/bash
# First-boot setup for a NEW Ubuntu 24.04 EC2 instance. Contains no secrets.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# A small EC2 instance needs extra headroom for the Next.js production build.
if [ ! -e /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get -o DPkg::Lock::Timeout=180 update
apt-get -o DPkg::Lock::Timeout=180 install -y ca-certificates curl rsync
install -m 0755 -d /etc/apt/keyrings
curl --fail --silent --show-error --retry 3 https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

apt-get -o DPkg::Lock::Timeout=180 update
apt-get -o DPkg::Lock::Timeout=180 install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

install -d -o ubuntu -g ubuntu -m 0755 /opt/rkr-crm
install -d -o 1000 -g 1000 -m 0700 /opt/rkr-crm/data /opt/rkr-crm/backups
touch /var/lib/paintauto-bootstrap.done
