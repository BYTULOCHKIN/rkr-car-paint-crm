#!/usr/bin/env python3
"""Upload a backup using the EC2 instance role, without stored access keys."""

import os
import re
import sys
from pathlib import Path

import boto3


def main() -> None:
    archive = Path(sys.argv[1])
    object_name = sys.argv[2]
    if not re.fullmatch(r"crm-[A-Za-z0-9.:-]+\.tar\.gz", object_name):
        raise ValueError("Unexpected backup object name")
    if not archive.is_file():
        raise FileNotFoundError(archive)
    bucket = os.environ["BACKUP_S3_BUCKET"]
    region = os.environ.get("AWS_DEFAULT_REGION", "eu-north-1")
    key = f"daily/{object_name}"
    boto3.client("s3", region_name=region).upload_file(
        str(archive), bucket, key, ExtraArgs={"ServerSideEncryption": "AES256"}
    )
    print(f"Backup uploaded to s3://{bucket}/{key}")


if __name__ == "__main__":
    main()
