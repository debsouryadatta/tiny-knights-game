# Little Realm — Divided Realm prototype

The main route is now a 2v2/3v3 multiplayer prototype built on this repository's Canvas 2D engine and Tiny Swords sprites. Choose a hero and personal companion, gather shared resources, build towers, and destroy the enemy core. Empty seats are bots; share a room code to play together.

Run `npm install` then `npm run dev -- --port 4177`. Open http://localhost:4177. The frontend requires SpacetimeDB on port 3005, database `tiny-knights-prototype`. `bash backend/spacetime/run.sh publish` publishes the module; `bash backend/spacetime/run.sh integration` checks real SDK multiplayer behavior. The convenience script currently reuses the CLI/runtime in adjacent `empire-game/backend/spacetime`; this is not yet a standalone deployment installer. Production needs a hosted backend and secure reverse proxy, not just the static build.

Current controls: WASD/arrows or joystick for continuous movement, hold Space/Attack to attack, Q/E/F for three skills, R recall, T regen, C gather, B tower placement, M overview, G grid, Escape cancel. Tap an enemy to target it. Drag a skill to aim and release to cast; drag toward Cancel to abort. Recall takes three seconds and movement or damage interrupts it. Landscape is recommended; fullscreen support varies by browser/OS.

Actors now use continuous positions and physical separation. Tiles remain terrain and construction units. Shared collision runs on both server and local prediction; stop/release and simultaneous movement/action inputs have separate handling.

Map controls: tap the minimap to open/close overview, drag it to inspect distant regions, or tap an overview region to zoom there. Drag the battlefield to pan. Return to hero, Escape, or a fresh movement gesture restores following. Looking around never sends a movement command. The HUD omits stale movement-intent messages and shows recent damage sources and the last hit on death. Combat budgets and measured survival tests are documented in `design/combat-balance.md`.

Companions use a deterministic planner by default. The optional server-side LLM adapter is included, but live provider-backed planning is not configured or verified for this handoff. No provider keys belong in client code.

Startup is staged: a native progress panel appears before JavaScript, then 16 essential images load with six concurrent requests. Hero selection can be submitted immediately; entry waits for the first usable frame to prevent an invisible spawn. The other 25 images load afterward with visible Idle/tree fallbacks. Terrain prepares at most one chunk per frame, and minimap decoration runs in short slices. Essential failures offer a retry; optional failures leave the game playable. External Google Fonts are no longer requested.

The play camera is 22% closer. All heroes now have Dash (180 damage, 8-second cooldown), Sprint (1.5x speed for 3 seconds, 12-second cooldown), and Shockwave (150 damage with knockback, 16-second cooldown). Hero basic DPS is 60; soldier DPS is 5. See `design/combat-balance.md` for formulas and limitations.

Checks: `npm run build`, `npx tsx --test shared/*.test.ts`, and `npx playwright test` with frontend/backend running. Browser tests use local Chrome on desktop and two touch viewports. Current verification: 31 shared tests, real-backend integration, 28 gameplay/browser checks and 12 staged-loading checks passed; 23 viewport-inapplicable checks skipped. Slow/failed image requests are simulated, not physical-phone benchmarks. See `design/verification.md` for earlier evidence and limitations.

## Original explorer (preserved at /explore.html)

The documentation below describes the original peaceful explorer, not the new match route. Its old browser-test launch instructions are historical; use the commands above for the new prototype.

An explorable, top-down knight adventure made with the supplied Tiny Swords Free Pack. This first iteration is a peaceful world to wander: five discoverable regions, an animated knight, a village, woodland, flowers, sheep, rivers, and wooden bridges.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates a distributable site in `dist`; `npm run preview` serves it locally. Keep the original `Tiny Swords (Free Pack)` directory in the project root: `public` links to it so Vite includes the supplied assets in production builds.

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
