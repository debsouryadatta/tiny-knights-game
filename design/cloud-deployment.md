# Cloud deployment

## Live backend

- Account: debsouryadatta
- Database: `debsouryadatta-tiny-knights`
- Host: `https://maincloud.spacetimedb.com`
- Identity: `c20086aae859b3f5d8f35fa4fa2cd134e71670bb658481c2396c93504f7e7182`
- Dashboard: https://spacetimedb.com/debsouryadatta-tiny-knights

Publish updates using `bash backend/spacetime/run.sh cloud-publish`. This uses your globally logged-in Maincloud account and refuses data deletion. It ignores local configuration overrides intentionally. The existing local database and its owner identity remain unchanged; use `npm run game` for local development. Local match data is not copied to the cloud.

## Vercel frontend

- Production: https://little-realm-duel.vercel.app
- Project: https://vercel.com/debsouryadattas-projects/little-realm-duel
- Deployment source: private `debsouryadatta/tiny-knights-game`, branch `main`.
- Initial deployed game commit: `85cc5c6`.

Created and deployed through Vercel's browser UI, without the Vercel CLI. Vercel could not clone the friend-owned private repository's branch. Its clone workflow created an empty private repository under `debsouryadatta`; the verified local game history was pushed there and imported successfully. The original `qKitNp/tiny-knights-game` remote remains unchanged, and its `feature/mobile-moba-prototype` branch also contains the game commit. Neither repository was made public.

Vercel builds with `npm run build` and serves `dist`, using the Vite preset. These settings are in `vercel.json`. The following public build-time variables were set for Production and Preview:

```dotenv
VITE_SPACETIME_URI=https://maincloud.spacetimedb.com
VITE_SPACETIME_DATABASE=debsouryadatta-tiny-knights
VITE_COMPANION_PLANNER=false
```

Use the same values for previews only if previews should share the same cloud database. Redeploy after changing build-time variables. No publisher token or model-provider secret belongs in a `VITE_` variable. Client identities are created by the SpacetimeDB SDK; session storage separates cloud and local identities.

To deploy future frontend changes after committing and testing, push to the deployment repository (the original remote is not Vercel's connected source):

```sh
git push git@github.com:debsouryadatta/tiny-knights-game.git HEAD:main
```

Backend changes still require `bash backend/spacetime/run.sh cloud-publish`; a Vercel build does not publish the SpacetimeDB module.

The browser connects directly to Maincloud. Vercel serves static assets; Vite's local proxy and ngrok are not needed in production. All supplied sprite files must remain in Git alongside the relative `public` asset symlink.

Companions retain their deterministic game logic. The optional local `/api/health` and `/api/companion-plan` gateway is disabled in production by default. Enabling provider-backed LLM planning later requires a secured server-side endpoint, not a browser API key.

## Checks and limits

### Production browser verification, 2026-09-05

Vercel reported the production deployment Ready, and its public URL served the expected lobby and artwork. The production Playwright run passed 7 checks, with 2 intentional mobile skips: two independent players occupy opposite teams, each owns one companion, a third player is rejected, both teams spawn central-lane minions, Space attack toggles correctly, recall and regeneration show live feedback, and desktop/landscape/portrait lobbies fit their viewports.

```sh
PLAYWRIGHT_BASE_URL=https://little-realm-duel.vercel.app npx playwright test tests/duel.spec.js tests/combat-polish.spec.js --grep 'same room|duel lobby|Space attacks' --output=test-results-production
```

A separate real-browser production check verified movement, stable hero and camera positions after stopping, and identity resume after reloading. Every game WebSocket connected to `wss://maincloud.spacetimedb.com/v1/database/debsouryadatta-tiny-knights/subscribe`. There were no localhost, ngrok, or local planner requests and no uncaught page errors. The public URL works without Vercel authentication. These are smoke/integration checks, not latency or load benchmarks.

### Latest backend deployment, 2026-09-05

Published the working-tree 1v1/combat backend with `bash backend/spacetime/run.sh cloud-publish` using SpacetimeDB CLI 2.10.0. The build and publish both succeeded. Maincloud reported an update to the existing database with the identity listed above. The command used `--no-config --delete-data=never --yes`; no database reset or replacement occurred. A pre-publish SQL query found no match rooms.

The cloud integration command below passed against Maincloud. It verified rejection of sizes 0, 2, and 3; two opposing players and two companions; third-player rejection and reserved slots; the 64x64 map; scheduled simulation ticks; replicated continuous movement; simultaneous steering, attack, and skill input; immediate release; malformed-input rejection; recall cancellation; batched movement input ending in a stop; companion orders; host-only restart; disconnect bot takeover; and identity resume after restart.

At 13:43 UTC, a follow-up cloud SQL query found test room `INTEGRATION-1788615774953` at revision 142. The suite disconnected all clients. The deployed scheduler removes inactive integration rooms after their creation time is more than two minutes old; cleanup completion was not checked in this run.

SHA-256 checks before publishing and after integration confirmed unchanged backend entrypoint, shared simulation, types, map, and integration test sources. The published backend entrypoint hash was `5dc980aec837f11864745e8aff558f1dfcb3fd4450e61eccaa34e04ff8daca1c`; the shared simulation hash was `4b7de8fc766f8f03ca3c0180c25382a0a75e706485bf7390354fb181346feb5e`.

No backend deployment blockers remain. This verification covers the live backend and SDK integration. Frontend browser verification and Vercel deployment belong to the separate frontend task. No frontend files or Git commits were changed by this backend operation.

### Earlier verification and ongoing limits

Verified after initial deployment: production build, 31 shared simulation tests, 40 local browser checks with 23 viewport-specific skips, the real two-client Maincloud integration suite, and a production-build browser smoke test using two distinct Maincloud players with identity resume. The production browser made no local planner API requests and used only Maincloud game WebSockets. The three readability-only cleanup files produce identical normalized JavaScript to their original versions.

Run cloud integration with:

```sh
SPACETIME_TEST_URI=https://maincloud.spacetimedb.com SPACETIME_TEST_DATABASE=debsouryadatta-tiny-knights npx tsx backend/spacetime/integration.ts
```

Tests create temporary match rooms, not extra databases. This is a prototype deployment, not a load-tested production service. Maincloud usage consumes account credits. Monitor the dashboard, particularly the scheduled 100ms simulation and snapshot bandwidth. Publishing the backend does not deploy the frontend or update the GitHub PR automatically.

References: [Maincloud deployment](https://spacetimedb.com/docs/how-to/deploy/maincloud/), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
