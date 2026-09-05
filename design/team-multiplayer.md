# Team multiplayer

Branch: `codex/team-multiplayer`, based on `feature/mobile-moba-prototype`.

## Working plan

1. Discovery: complete. The supplied worktree was the original explorer; the completed duel lives on the feature branch.
2. Exploration: complete. Reviewed client, shared simulation, backend and tests with two read-only explorers.
3. Decisions: three playable lanes in every mode; offer 1v1, 2v2 and 3v3, default 1v1. Every hero has a personal companion. Teams share resources and the existing core/21-kill victory rules.
4. Architecture: complete. Extend existing JSON snapshots and reducer rules, preserving the SpacetimeDB schema and authoritative 10 Hz simulation. A separate transport or per-player simulation would duplicate existing code and introduce synchronization risk.
5. Implementation: complete.
6. Quality review: complete. Both reviewers verified their findings were fixed.
7. Handoff: complete. Local preview and isolated backend are running; production is unchanged.

## Behavior and implementation

- `shared/types.ts` and `shared/simulation.ts`: validated team sizes, balanced allocation, spaced spawns and exact-seat rematches.
- `backend/spacetime/module/spacetimedb/src/index.ts`: capacity is twice team size. Reserved disconnected players retain seats. Code joins inherit room size. Private hosts start after all reserved guests are online and ready; open seats use bots. Disconnect clears readiness and combat controls.
- Quick Play matches only the same size and starts a full online roster. The existing 60-second bot fallback remains. Team queue host controls waiting/bot start. Reconnects reevaluate full queues. Running-match offers remain an explicit user choice and must never destroy a source queue containing teammates.
- `src/ui.js`, lobby styles and `src/spacetime-client.ts`: accessible mode selector, mode-specific resume storage, team-grouped roster, occupancy, readiness and connection status. Invite links include mode; server room state remains authoritative.
- Existing renderer already draws every hero and companion. No client-controlled authoritative positions or fake multiplayer.

## Verification

Use isolated SpacetimeDB at `http://127.0.0.1:3024`, database `tiny-knights-teams-dev`, and a separate frontend port. Do not publish to the live database. Validate all three capacities, balanced allocation, frozen lobbies, readiness, full-room rejection, simultaneous commands, disconnect/reconnect, host transfer, rematches and size-separated queues with real SDK connections. Run existing shared tests, build and focused browser regression tests, plus live Codex in-app browser checks.

## Initial team-mode verification

- 123 shared/client unit tests pass.
- Production build and strict backend TypeScript check pass. `git diff --check` passes.
- Real SDK tests pass: original duel integration, private lobby integration, team integration and Quick Play integration. Team coverage includes all capacities, six concurrent commands, exact-seat rematches, disconnect readiness, source-room preservation, advertised team assignment, four-player queue reconnection and six-player automatic start.
- The Quick Play timer suite ran against a second isolated database, `tiny-knights-teams-quick`, to avoid tests pairing with each other. It verified the actual 60-second bot deadline, human-only waiting beyond the deadline, running-match consent and stale-offer atomicity.
- 29 distinct browser checks pass across desktop, 844×390 landscape and 390×844 portrait, including six independent browser sessions and match-size-specific Quick Play resume. Viewport-inapplicable duplicate tests were skipped.
- Live Codex in-app verification: six independent tabs joined room EA179E as three Blue and three Red players, readied, started and displayed the same match clock. The roster showed six names and health values. Additional portrait/landscape checks covered the selector, six-seat lobby, scrolling and team gameplay.

Early runs exposed a hot-reload interruption and outdated test expectations. The final desktop run passed; the mobile lobby check was rerun successfully after dismissing the existing optional mobile-play prompt. An older landscape CSS rule that stacked teams was corrected and visually verified. The offer/seat mismatch found in review now uses one shared allocation function.

## Handoff and limits

Branch `codex/team-multiplayer` originally started from `fa2c1cd`, the completed duel feature branch, and was rebased onto `4cd7d49` from origin/main. The complete feature is consolidated into one commit on top of origin/main. The original supplied worktree was detached at the initial explorer commit; no pre-existing changes were present.

The frontend is at `http://localhost:4184`, using local SpacetimeDB `http://127.0.0.1:3024`, database `tiny-knights-teams-dev`. An ignored `.env.local` points this worktree at that database; `.env.example` records the public settings. The live frontend/database have not been deployed or modified. Deploy the server module and frontend together when releasing these modes.

Teams are assigned automatically and balanced by reserved human seats. The shared economy and 21-kill/core victory rules remain. The three-lane update below supersedes the original single-lane map decision. Tests cover local real-network clients, not physical devices, WAN latency or production load. Running-match invitations preserve disconnected players' existing reserved seats.

## Three-lane update

User correction: three lanes are required, including a better overall battlefield experience. Implementation is split across parallel map, simulation and rendering agents, with UI and integration handled by the main agent.

1. Discovery and exploration complete: all three waypoint routes existed, but collision, art and waves enabled only Mid.
2. Decisions and architecture complete: enable Top/Mid/Bottom across all sizes from shared map geometry; preserve team networking and economy. Each lane has a real river crossing. Default assignments are Mid for solo, Top/Bottom for duos, Top/Mid/Bottom for trios; players can rotate freely.
3. Implementation complete: all-lane terrain, bridges, minimap labels, lane-aware bots and waves, roster assignments, lobby battlefield preview. First wave at 12 seconds, repeating every 30 seconds. Old room assignments normalize on join/tick.
4. Map/rendering integration review complete. All 136 shared/client tests, strict backend TypeScript check, production build and real SDK team integration pass. 18 browser checks pass across desktop, 844×390 landscape and 390×844 portrait (six viewport-inapplicable duplicates skipped), including six simultaneous clients, all mode lobbies, all-lane waves and overview navigation. Live Codex in-app inspection confirmed the three roads, crossings, labels and active waves. The preview-paint assertion is also verified in a focused follow-up run.

The four-minute isolated 3v3 simulation benchmark averaged 0.52 ms per tick (p95 1.53 ms, maximum 11.06 ms). This measures simulation CPU only, not WAN latency or physical-device performance. No material findings remained in map/rendering and UI reviews.

## Rectangular battlefield update

Discovery and design: replace the 64×64 square with 80×56 tiles. Preserve three lanes in every mode. Keep rotationally mirrored bases and resources, outer Top/Bottom routes, a direct diagonal Mid route and three separate bridges. The larger width gives teams more room without expanding total area excessively.

Implementation and review complete: world rendering, camera bounds, pointer navigation, terrain chunks, lobby map and minimap use the rectangular dimensions. Tiles and sprites keep their proportions. Saved square-map snapshots migrate once to map version 2, preserving seats and match progress while relocating positions and clearing old navigation state.

Verification: 140 unit tests, strict backend TypeScript and production build pass. Real SpacetimeDB team integration passes, including six-player control and reconnects. Its readiness test now waits for the ready snapshot before disconnecting, removing an observed timing race. All 14 focused browser checks pass across desktop and both mobile orientations, with four viewport-inapplicable duplicates skipped. They cover map proportions, all-lane waves and minimap inspection beyond the old eastern boundary. Live Codex in-app inspection confirmed the complete rectangular battlefield.

The current local preview uses `tiny-knights-rect-dev` on `http://127.0.0.1:3024`, with frontend `http://localhost:4184`. A new isolated database avoids filling the earlier test database's room cap. Production remains unchanged.

## Main-branch integration

Rebased onto origin/main `4cd7d49`, preserving landing music, the seven-second match intro and the separate Quick Play/private-room entry controls. Resolved UI conflicts by retaining music lifecycle callbacks with team selection and rosters, and combined both browser test lists. Shared tests, backend type checking and production build pass after integration.

The combined browser run passed 50 checks and exposed one landscape layout conflict. Giving match size its own grid area fixed it; all three viewport entry checks then passed, including a strengthened assertion that the size selector stays visible. Music, intro, six-player reconnect and rectangular-map checks passed in the combined run.

## Playability investigation after rollback

The earlier GitHub push did not publish the SpacetimeDB module. A read-only query of `little-realm-live` returned a legacy snapshot with no mapVersion, size 1 and cores at (8,56)/(55,7). The rectangular frontend predicts against different collision and coordinates, explaining blocked/reconciled movement and unsupported team selections. Prior local-only results did not establish a working production deployment.

Fixes on `codex/multiplayer-playability-fixes`:

- A read-only `checkClientVersion` reducer runs before room allocation. The frontend refuses incompatible snapshots, and waits for a successful join before validating saved rooms so the server can migrate them. Stale handshake failures cannot disconnect a newer connection.
- Vercel now runs `build:verified`; compatibility checks read the same production environment settings as Vite. An incompatible or unreachable backend fails the build instead of shipping a mismatched frontend.
- Cache the final static collision grid. One million collision lookups fell from 138 ms to 10.7 ms in the local microbenchmark.
- Protect visible cached terrain during panning. A reproduced one-column camera move now builds only three new chunks instead of five.
- Reuse parsed snapshots when unrelated subscription events or ping updates arrive.

Verification includes 143 unit tests, backend type checking and a verified build; real SDK team integration; four independent multi-browser scenarios covering private/Quick Play at 2v2/3v3, movement replication, far-edge map inspection, reconnect and sustained ticks. Tests run from a copied production build on port 4186 to exclude Vite hot-reload interruptions. A separate old-module fixture proves mismatch rejection before joining. Upgrading that fixture while retaining an old waiting room verifies migration, reconnect and movement with the new client.

The five-minute six-human simulation benchmark improved mean tick time from 1.44 to 1.36 ms and p95 from 6.30 to 5.76 ms. Browser FPS samples are local desktop measurements, not guarantees for physical phones or WAN conditions. Production and origin/main remain reverted; this fix has not been deployed.

Mobile landscape and portrait three-lane checks also passed on the revised client. Tests verify lobby map painting, wave presence on all lanes, overview navigation and inspection beyond the old map width. The legacy compatibility and saved-room migration browser fixtures passed independently.

## Production release

Published the module to the new `little-realm-teams-v2` database and configured Vercel through its CLI. Production is `https://www.tinyknights.fun`; Vercel verified protocol 2 before building. The original duel database remains untouched. Deployment defaults now target the new database, and `.vercelignore` excludes local database data and test recordings.

All four browser flow tests passed against the production URL in 2.8 minutes: private and Quick Play at 2v2/3v3, independent player identities, replicated movement, map exploration, reconnect and sustained ticks. Each sampled host reported 60 FPS and zero pending inputs. Live in-app verification showed the 3v3 battlefield and a 21 ms ping sample.
