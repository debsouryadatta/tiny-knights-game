# Self-hosted deployment

## Live backend

- Database: `tiny-knights-teams-v3`
- SDK origin: `https://spacetime.tinkerers.space`
- WebSocket: `wss://spacetime.tinkerers.space`
- CLI server alias: `home`
- Health check: `https://spacetime.tinkerers.space/v1/ping`

Cloudflare and Caddy terminate TLS before forwarding traffic to the SpacetimeDB node. The browser connects directly to this origin. Vercel serves only the static frontend and does not proxy the realtime connection.

Publish backend changes with SpacetimeDB CLI 2.10.0:

```sh
bash backend/spacetime/run.sh publish
bash backend/spacetime/run.sh generate
```

Publication never deletes data automatically. A breaking schema change needs an explicit migration decision. Do not add `--delete-data` without accepting that it wipes the database.

## Vercel frontend

- Production: https://little-realm-duel.vercel.app
- Project: `little-realm-duel`
- Deployment repository: `debsouryadatta/tiny-knights-game`

Set these public build-time variables for Production, Preview, and Development:

```dotenv
VITE_SPACETIMEDB_URI=https://spacetime.tinkerers.space
VITE_SPACETIMEDB_DB_NAME=tiny-knights-teams-v3
VITE_COMPANION_PLANNER=false
```

The SpacetimeDB values are public connection details, not publisher credentials. Do not put login tokens or server secrets in a `VITE_` variable. Redeploy after changing build-time variables.

Deploy the frontend with the authenticated Vercel CLI or by pushing the verified commit to `main` in the deployment repository:

```sh
vercel --prod --yes
```

## Verification

```sh
spacetime server ping home
spacetime list -s home
spacetime sql -s https://spacetime.tinkerers.space tiny-knights-teams-v3 "SELECT room, revision FROM match_state"
npx tsx backend/spacetime/integration.ts
npm run build
```

The built client must contain `https://spacetime.tinkerers.space` and must not contain the raw server IP or the retired hosted-service origin. Opening the SpacetimeDB origin itself returns an empty 404; `/v1/ping` is the health endpoint.

## Multiplayer release compatibility

Vercel's `build:verified` checks the configured SpacetimeDB protocol before compiling the frontend. Set `VITE_SPACETIMEDB_URI` and `VITE_SPACETIMEDB_DB_NAME` to the exact verified backend. Run `npm run check:backend` to diagnose a blocked release; it never creates a room. A missing reducer, unreachable endpoint or different version must stop the rollout.

For the transition from the live square duel to the rectangular team map, publish and test a separate versioned backend database first, then point the new frontend build at it. This avoids moving still-open old clients onto incompatible geometry. Keep the old duel database available for those existing sessions. Do not publish the rectangular frontend against the legacy duel module or assume a GitHub/Vercel push updates SpacetimeDB.

Local playability testing uses `tiny-knights-playability-dev` on port 3024. Real browser flow tests are `tests/multiplayer-flows.spec.js`; use a fresh database and a fixed frontend build. Do not run independent Quick Play test suites concurrently against the same database, since their players could match each other.

Production team release: database `tiny-knights-teams-v3`, frontend `https://www.tinyknights.fun`. `little-realm-teams-v2` remains on the host but is no longer the publish target.
