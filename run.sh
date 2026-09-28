#!/usr/bin/env bash
# Delegate execution to scripts/run.sh
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$ROOT/scripts/run.sh" "$@"
