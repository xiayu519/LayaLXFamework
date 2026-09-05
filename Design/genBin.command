#!/bin/bash
set -uo pipefail

LX_DESIGN_DIR="$(cd "$(dirname "$0")" && pwd)"
npm --prefix "$LX_DESIGN_DIR/../LayaProject" run tables:generate
LX_TABLES_EXIT_CODE=$?

if [ "$LX_TABLES_EXIT_CODE" -ne 0 ]; then
    printf 'Luban table generation failed with exit code %s.\n' "$LX_TABLES_EXIT_CODE"
fi
if [ "${1:-}" != "--no-pause" ]; then
    printf 'Press Return to close...'
    read -r _
fi
exit "$LX_TABLES_EXIT_CODE"
