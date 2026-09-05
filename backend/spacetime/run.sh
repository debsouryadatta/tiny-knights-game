#!/usr/bin/env bash
set -euo pipefail
spacetime_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$spacetime_dir/../.." && pwd)"
prior_dir="$project_dir/../empire-game/backend/spacetime"
cli="${SPACETIME_CLI:-$prior_dir/.tools/spacetime}"
case "${1:-publish}" in
  cloud-publish)
    cd "$project_dir"
    # Cloud uses the user's Maincloud login, never the isolated local identity.
    exec "${SPACETIME_CLOUD_CLI:-spacetime}" publish debsouryadatta-tiny-knights --server maincloud --module-path backend/spacetime/module/spacetimedb --no-config --delete-data=never --yes
    ;;
  dev)
    cd "$project_dir"
    # Reuse the identity that owns the existing local database. Do not replace
    # the user's global cloud login or reset any match data.
    exec "$cli" --root-dir="$prior_dir/.runtime" dev --delete-data=never --yes
    ;;
  publish)
    cd "$spacetime_dir/module/spacetimedb"
    exec "$cli" --root-dir="$prior_dir/.runtime" publish tiny-knights-prototype --server http://127.0.0.1:3005 --delete-data=never --yes
    ;;
  generate)
    cd "$spacetime_dir/module/spacetimedb"
    exec "$cli" --root-dir="$prior_dir/.runtime" generate --lang typescript --out-dir "$spacetime_dir/bindings" --yes
    ;;
  integration)
    cd "$project_dir"
    exec npx tsx backend/spacetime/integration.ts
    ;;
  *) echo "Usage: bash backend/spacetime/run.sh dev|publish|cloud-publish|generate|integration" >&2; exit 1 ;;
esac
