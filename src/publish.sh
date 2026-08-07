#!/bin/bash
set -e
cd "$(dirname "$0")/.."

# Load tracked defaults, then machine-specific paths and credentials.
if [ -f .env ]; then
  set -a; source .env; set +a
fi
if [ -f .env.local ]; then
  set -a; source .env.local; set +a
fi

node dist/publish.js "$@"
