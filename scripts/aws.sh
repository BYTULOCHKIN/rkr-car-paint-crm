#!/bin/sh
set -eu

# Keep the deployment session inside the gitignored local artifacts directory.
CRM_ROOT=$(cd "$(dirname "$0")/.." && pwd)
CRM_AWS_STATE="$CRM_ROOT/.artifacts/deploy/aws"
CRM_AWS_CLI="$CRM_ROOT/.artifacts/deploy/aws-cli/aws"

if [ ! -x "$CRM_AWS_CLI" ]; then
  echo 'AWS CLI is missing from .artifacts/deploy/aws-cli/aws.' >&2
  echo 'Install the official AWS CLI locally, or use a configured system aws command.' >&2
  exit 1
fi

umask 077
mkdir -p "$CRM_AWS_STATE/login-cache"
export AWS_CONFIG_FILE="$CRM_AWS_STATE/config"
export AWS_SHARED_CREDENTIALS_FILE="$CRM_AWS_STATE/credentials"
export AWS_LOGIN_CACHE_DIRECTORY="$CRM_AWS_STATE/login-cache"
export AWS_PROFILE="${AWS_PROFILE:-paintauto}"
export AWS_REGION="${AWS_REGION:-eu-north-1}"
export AWS_PAGER=''
export AWS_CLI_AUTO_PROMPT=off

exec "$CRM_AWS_CLI" "$@"
