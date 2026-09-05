# Self-hosted deployment

## Live backend

- Database: `tiny-knights-prototype`
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
VITE_SPACETIMEDB_DB_NAME=tiny-knights-prototype
VITE_COMPANION_PLANNER=false
```

The SpacetimeDB values are public connection details, not publisher credentials. Do not put login tokens or server secrets in a `VITE_` variable. Redeploy after changing build-time variables.

Deploy the frontend with:

```sh
vercel --prod
```

## Verification

```sh
spacetime server ping home
spacetime list -s home
spacetime sql -s home tiny-knights-prototype "SELECT room, revision FROM match_state"
npx tsx backend/spacetime/integration.ts
npm run build
```

The built client must contain `https://spacetime.tinkerers.space` and must not contain the raw server IP or the retired hosted-service origin. Opening the SpacetimeDB origin itself returns an empty 404; `/v1/ping` is the health endpoint.
