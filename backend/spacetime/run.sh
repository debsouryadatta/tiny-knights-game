#!/usr/bin/env bash
set -euo pipefail
spacetime_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$spacetime_dir/../.." && pwd)"
prior_dir="$project_dir/../empire-game/backend/spacetime"
cli="${SPACETIME_CLI:-$prior_dir/.tools/spacetime}"
case "${1:-publish}" in
  publish)
    cd "$spacetime_dir/module/spacetimedb"
    exec "$cli" --root-dir="$prior_dir/.runtime" publish tiny-knights-prototype --server http://127.0.0.1:3005 --yes
    ;;
  generate)
    cd "$spacetime_dir/module/spacetimedb"
    exec "$cli" --root-dir="$prior_dir/.runtime" generate --lang typescript --out-dir "$spacetime_dir/bindings" --yes
    ;;
  integration)
    cd "$project_dir"
    exec npx tsx backend/spacetime/integration.ts
    ;;
  *) echo "Usage: bash backend/spacetime/run.sh publish|generate|integration" >&2; exit 1 ;;
esac
