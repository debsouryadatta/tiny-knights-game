#!/usr/bin/env bash
set -euo pipefail
spacetime_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$spacetime_dir/../.." && pwd)"
cli="${SPACETIME_CLI:-spacetime}"
server="${SPACETIME_SERVER:-home}"
database="${SPACETIME_DATABASE:-little-realm-teams-v2}"
case "${1:-publish}" in
  dev)
    cd "$project_dir"
    exec "$cli" dev --delete-data=never --yes
    ;;
  publish)
    cd "$project_dir"
    exec "$cli" publish -s "$server" --module-path "$spacetime_dir/module/spacetimedb" --delete-data=never --yes "$database"
    ;;
  generate)
    cd "$project_dir"
    exec "$cli" generate --lang typescript -o "$spacetime_dir/bindings" --yes --module-path "$spacetime_dir/module/spacetimedb"
    ;;
  integration)
    cd "$project_dir"
    exec npx tsx backend/spacetime/integration.ts
    ;;
  *) echo "Usage: bash backend/spacetime/run.sh dev|publish|generate|integration" >&2; exit 1 ;;
esac
