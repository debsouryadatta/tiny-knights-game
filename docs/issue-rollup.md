# Gameplay and lobby update

Source issues: https://github.com/qKitNp/tiny-knights-game/issues

| Issue | Implemented in this project |
| --- | --- |
| #3 | Proximity effects and ambience, default-enabled after the first browser gesture, independent volumes and mute |
| #4 | Pack shoreline animation, bridge details, Monastery cores, faction banners, painted controls, walkable tree clearance |
| #13 | Public Quick Play with bot fallback, capacity checks and identity resume |
| #15 | Kill XP, levels 1–10, health and basic-attack growth, persisted progression |
| #16 | Allied core/spawn healing, independent of Regen |
| #17 | 2.5-second tower construction, reserved costs/spacing/cap, cancellation refunds and countdown |
| #18 | Contextual main-button and Space gathering near living resources |
| #19 | Enemies in attack range take priority over nearby resources |

The requested private lobby includes Create Room, code entry, roster, guest readiness, host Start Match, invite copying, leave, and disconnected-seat reservations. Public games remain 1v1, matching this project's existing rules. The current map retains its single walkable crossing. No historical 2v2/3v3 rules or extra crossings were copied.

All 436 supplied art/audio files moved unchanged to `public/assets/tiny-swords` and `public/assets/audio`. The supplied audio contains seven effects and synthesized ambience, not a separate music recording. Browser autoplay restrictions still require an initial click, tap, or keypress.

## Verification

Validated 102 unit tests, both real-SDK integration suites, seven lobby browser checks, 32 gameplay browser checks, 37 audio/loading/ping checks, and desktop/landscape visual captures. Viewport-specific duplicates and the optional external tunnel test are skipped where inapplicable. Supplied audio was decoded and checked for finite, non-silent samples and live event playback; this is not a subjective listening review.

```sh
npx tsx --test shared/*.test.ts src/*.test.js src/*.test.ts src/audio/*.test.js
SPACETIME_TEST_URI=http://127.0.0.1:3011 npx tsx backend/spacetime/integration.ts
SPACETIME_TEST_URI=http://127.0.0.1:3011 npx tsx backend/spacetime/lobby-integration.ts
PLAYWRIGHT_BASE_URL=http://localhost:4178 AUDIO_LIVE_MATCH=1 npx playwright test
npm run build
```

The local QA server on port 3011 is an isolated in-memory SpacetimeDB 2.10 instance. Port 4178 overrides the frontend URI for that test server only. It does not change the configured self-hosted production endpoint or production data.

## Mobile pass

The follow-up mobile QA uses a fresh isolated server on port 3012 and frontend on port 4179. Six viewport cases cover 667×375, 740×360, 844×390, 932×430, 390×844 and 320×568, including simulated safe insets and keyboard-sized viewports. Four Chromium multitouch tests cover rotation, pointer cancellation, death, and reconnect. A WebKit smoke test covers lobby, gameplay, rotation and sound controls. All pass; a further 22 loading/lobby/responsive regression checks pass.

The landscape waiting panel is approximately 245px tall instead of 421px. Interactive targets remain at least 44px, phone inputs use 16px text, and dynamic health/status text no longer overlaps the companion panel. Rotation and death release captured pointers rather than retaining movement or attacks.

Running animation advances with travel distance. Combat numbers keep a minimum 12px screen size. Exact sprite bounds reduce measured scenery submissions from 366 to 52 in the forest and 463 to 38 at the river; exhaustive-versus-culled captures are pixel-identical. Reused buffers avoid per-frame draw closures. Desktop CPU-throttled emulation stayed at 60fps before and after; these results do not establish real-phone FPS or thermal behavior. Cold rendering still showed occasional preparation spikes near 40ms.

```sh
PLAYWRIGHT_BASE_URL=http://localhost:4179 npx playwright test tests/mobile-layout.spec.js --project=desktop
PLAYWRIGHT_BASE_URL=http://localhost:4179 npx playwright test tests/mobile-input.spec.js --project=mobile-landscape
npx playwright install webkit
MOBILE_WEBKIT=1 PLAYWRIGHT_BASE_URL=http://localhost:4179 npx playwright test tests/mobile-webkit.spec.js --project=webkit-mobile
```

No physical phone, actual OS keyboard, browser chrome, or thermal/battery test was available. Chromium and WebKit emulation are complementary checks, not substitutes for that final device pass.

## Release order

The new frontend requires the additive `room_lobby` table, `lobby_roster` view and lobby reducers. Publish the backend before deploying the frontend. Existing tables retain their schema; do not use `--delete-data`.

```sh
# Publishes to the new little-realm-live database by default.
bash backend/spacetime/run.sh publish
bash backend/spacetime/run.sh integration
npx tsx backend/spacetime/lobby-integration.ts
```

The existing database rejected this checkout's CLI identity, so the completed module was published to a new database named `little-realm-live` on the same self-hosted server. Local development and every Vercel environment now use it. The original database remains unchanged. No changes should be pushed to the source qKitNp repository.
