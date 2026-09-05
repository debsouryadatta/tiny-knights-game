# Little Realm · Team multiplayer

Choose 1v1, 2v2 or 3v3. Every player controls a hero and one personal companion across an 80×56-tile rectangular battlefield with three playable lanes: Top, Mid and Bottom. Teams share resources and win by destroying the enemy core or reaching 21 team hero kills.

The wider layout has mirrored bases, outer routes around jungle camps and a direct diagonal Mid lane. Each lane has its own river crossing and minion waves, starting at 12 seconds and repeating every 30 seconds. Starting assignments are Mid for 1v1, Top/Bottom for 2v2 and all three lanes for 3v3. Players can rotate freely through the jungle. The lobby previews the battlefield and assignments; press M or tap the minimap for the labeled overview.

Create Room opens a private lobby with an invite code. Players join balanced Blue/Red slots and ready up; the host starts when every guest is online and ready. Empty seats use bots. Joining by code uses the room's size, regardless of the selection on the landing page. Disconnects reserve the player's seat and let a bot take over; reconnect and rematch preserve the same hero slot and team.

Quick Play has separate queues for each size. Full online rosters start automatically. After 60 seconds, remaining seats use bots, unless the queue host chooses to keep waiting. For team queues, only the host controls bot preferences. Players can explicitly accept a same-size running-match offer without deleting the waiting room of teammates left behind.

## Test this worktree locally

Production uses the separate `little-realm-teams-v2` database. Use an isolated local server and frontend together:

```sh
npm ci
cp .env.example .env.local
npm ci --prefix backend/spacetime/module/spacetimedb
spacetime start --listen-addr 127.0.0.1:3024 --data-dir backend/spacetime/.data/team-multiplayer --non-interactive
# In another terminal:
spacetime publish --server http://127.0.0.1:3024 --module-path backend/spacetime/module/spacetimedb --delete-data=never --yes tiny-knights-rect-dev
VITE_SPACETIMEDB_URI=http://127.0.0.1:3024 VITE_SPACETIMEDB_DB_NAME=tiny-knights-rect-dev VITE_COMPANION_PLANNER=false npm run dev -- --port 4184
```

Open `http://localhost:4184`. Keep this frontend connected to the team-enabled module. The default live endpoint below serves the team release; the previous duel database remains separate. Team implementation decisions and verification are recorded in [design/team-multiplayer.md](design/team-multiplayer.md).

```sh
npx tsx --test shared/*.test.ts src/*.test.* src/audio/*.test.js
SPACETIME_TEST_URI=http://127.0.0.1:3024 SPACETIME_TEST_DATABASE=tiny-knights-rect-dev npx tsx backend/spacetime/team-integration.ts
PLAYWRIGHT_BASE_URL=http://localhost:4184 npx playwright test tests/three-lanes.spec.js tests/team-multiplayer.spec.js tests/lobby.spec.js tests/duel.spec.js
```


Heroes earn kill XP up to level 10, gaining health and basic-attack damage. Allied core and spawn fountains restore health without using Regen. Towers take 2.5 seconds to build, reserving their cost; movement or another action cancels construction and refunds it. The main attack button and Space become Gather near a resource unless an enemy is in attack range. C remains a dedicated Gather command.

Play at [little-realm-duel.vercel.app](https://little-realm-duel.vercel.app). The Canvas/Vite frontend runs on Vercel and connects directly to the self-hosted `little-realm-teams-v2` database at `https://spacetime.tinkerers.space`. Caddy terminates TLS and forwards the SDK's secure WebSocket connection to SpacetimeDB. See [cloud deployment](design/cloud-deployment.md) for deployment commands and verification notes.

Run `npm install` then `npm run dev -- --port 4177`. Open http://localhost:4177. Local development and Vercel both connect directly to `https://spacetime.tinkerers.space`, database `little-realm-teams-v2`. `bash backend/spacetime/run.sh publish` publishes the module to the `home` server alias; `bash backend/spacetime/run.sh integration` checks real SDK multiplayer behavior.

Current controls: WASD/arrows or joystick for continuous movement, hold Space/Attack to attack, Q/E/F for three skills, R recall, T regen, C gather, B tower placement, M overview, G grid, Escape cancel. Tap an enemy to target it. Drag a skill to aim and release to cast; drag toward Cancel to abort. Recall takes three seconds and movement or damage interrupts it. Landscape is recommended; fullscreen support varies by browser/OS.

Sound is enabled by default and unlocks on the first click, tap, or keypress, as required by browsers. The music-note button mutes it. The controls dialog has independent ambience and sound-effect volume sliders; muting preserves their values for the current page session. Seven Pixel Combat clips accompany footsteps, hits, abilities, gathering, and building. Synthesized river, forest, and base ambience follows the hero's position. Sound stops while the page is hidden, disconnected, or the hero is dead. This release includes ambience and effects, with no separate music track. Asset attribution and preparation notes are in `public/assets/audio/README.md`.

The top-right Ping indicator measures an application round trip over the live SpacetimeDB socket, including server response time. It uses a temporary read-only session subscription about every three seconds, even while idle. Green means under 100 ms, amber 100–199 ms, and red 200 ms or more. A three-second timeout shows `Ping >3s`; reconnecting hides the old measurement. This is not FPS, Vercel load time, or an ICMP network-only measurement.

### Production SpacetimeDB configuration

This section describes the deployed database. Use the isolated worktree instructions above to test the team release.

Install SpacetimeDB CLI 2.10.0 and configure the self-hosted server once:

```sh
spacetime version use 2.10.0
spacetime server add --url https://spacetime.tinkerers.space --default home
```

Then run this from the repository root:

```sh
npm run game
```

This builds the nested server module, regenerates `backend/spacetime/bindings`, publishes to `little-realm-teams-v2` without deleting data, starts Vite on port 4177, and watches the module. Do not start a second Vite process on the same port. Root `spacetime.json` defines these targets. Personal `spacetime*.local.json` overrides are ignored by Git.

The CLI identity must have update permission on the existing self-hosted database. Do not run `spacetime init` or use a starter template inside this repository. The game module already lives at `backend/spacetime/module/spacetimedb`.

Actors now use continuous positions and physical separation. Tiles remain terrain and construction units. Shared collision runs on both server and local prediction; stop/release and simultaneous movement/action inputs have separate handling.

Map controls: tap the minimap to open/close overview, drag it to inspect distant regions, or tap an overview region to zoom there. Drag the battlefield to pan. Return to hero, Escape, or a fresh movement gesture restores following. Looking around never sends a movement command. The HUD omits stale movement-intent messages and shows recent damage sources and the last hit on death. Combat budgets and measured survival tests are documented in `design/combat-balance.md`.

Companions use a deterministic planner by default. The optional server-side LLM adapter is included, but live provider-backed planning is not configured or verified for this handoff. No provider keys belong in client code.

Startup is staged: a native progress panel appears before JavaScript, then 16 essential images load with six concurrent requests. Hero selection can be submitted immediately; entry waits for the first usable frame to prevent an invisible spawn. The other 25 images load afterward with visible Idle/tree fallbacks. Terrain prepares at most one chunk per frame, and minimap decoration runs in short slices. Essential failures offer a retry; optional failures leave the game playable. External Google Fonts are no longer requested.

The play camera is 22% closer. All heroes now have Dash (180 damage, 8-second cooldown), Sprint (1.5x speed for 3 seconds, 12-second cooldown), and Shockwave (150 damage with knockback, 16-second cooldown). Hero basic DPS is 60; soldier DPS is 5. See `design/combat-balance.md` for formulas and limitations.

Checks: `npm run build`, `npx tsx --test shared/*.test.ts`, and `npx playwright test` with frontend/backend running. Browser tests use local Chrome on desktop and two touch viewports. Historical duel verification: 31 shared tests, real-backend integration, 28 gameplay/browser checks and 12 staged-loading checks passed; 23 viewport-inapplicable checks skipped. Slow/failed image requests are simulated, not physical-phone benchmarks. See `design/verification.md` for earlier evidence and limitations.

## Original explorer (preserved at /explore.html)

The documentation below describes the original peaceful explorer, not the new match route. Its old browser-test launch instructions are historical; use the commands above for the new prototype.

An explorable, top-down knight adventure made with the supplied Tiny Swords Free Pack. This first iteration is a peaceful world to wander: five discoverable regions, an animated knight, a village, woodland, flowers, sheep, rivers, and wooden bridges.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates a distributable site in `dist`; `npm run preview` serves it locally. The supplied pack lives in `public/assets/tiny-swords`, alongside sound effects in `public/assets/audio`. Vite includes both folders in production builds.

## Controls

- WASD or arrow keys: move
- Hold Shift: sprint
- M: toggle world map
- Space: sword animation
- Escape: close a dialog
- Touch devices: directional buttons

The music-note button toggles synthesized wind ambience. The question-mark button opens the control guide. Discoveries last for the current session. Combat, interiors, inventory, and saving are not part of this iteration.

## Check

```sh
eval "$(~/.grok/skills/helium-browser/scripts/launch-cdp.sh http://localhost:5173)"
npx playwright test
```

Browser checks use a throwaway Helium profile through CDP, following the local helium-browser skill. Close that temporary instance and remove its temporary profile after testing. Start the development server on port 5173 before testing. The browser check covers asset loading, walking, sprinting, map controls, and traversable routes to all five landmarks.

Built with JavaScript, Canvas 2D, and Vite. All character, building, tree, bush, sheep, rock, and terrain sprites are from the supplied Tiny Swords pack; paths, bridges, flowers, and interface are drawn for this prototype.
