# Quick Play and victory rules

Quick Play creates a frozen public lobby and searches for a waiting human. Two online waiting players start immediately. If nobody joins within 60 seconds, the server starts a bot match.

The waiting screen lists ongoing public matches with hero-kill score, elapsed time and available side. Joining one requires an explicit click. The server rechecks availability atomically; a stale offer must not remove the player's existing search. Private rooms, finished games, full games, offline-only games and disconnected players' reserved seats are excluded.

“Keep waiting for a human” disables the timeout. Live match offers remain available, as does “Play against bot.” Reconnect preserves the search and can pair it with another online waiting player. Cancelling removes the waiting room.

## Scoring and movement

- First to 21 enemy hero kills wins. Enemy core destruction remains an independent victory condition.
- Enemy hero deaths credit the opposing team even when a companion, minion or structure lands the last hit. Other victims grant existing XP/rewards but no victory points.
- Team score is stored separately from personal defeats. A player replacing an unclaimed bot inherits its progression, starts at base and does not reset the score.
- Existing snapshots cannot reveal past hero-only kills, so missing team scores start at zero. New rounds reset both teams to zero.
- Allied heroes, companions and minions do not block movement. Enemies, structures and terrain remain solid.
- The two-pixel gold XP line shows progress within the current level. It resets on level-up and remains full at the level cap.

## Verification and rollout

Tests cover the real SDK queue flow and browser waiting screen, plus deterministic simulation/UI tests for scoring, XP and collision. Automated tests use isolated local databases, not production matches.

Verified on 5 September 2026: 115 unit tests, 42 browser checks, and all three SDK suites passed. The queue suite includes the reconnect-pairing regression. Browser checks include six phone viewport sizes, touch cancellation, motion regression, stale offer removal, and desktop/landscape/portrait scoring screens. Module typechecking and the production build passed. Physical devices were not tested.

```sh
npx tsx --test shared/*.test.ts src/*.test.js src/*.test.ts src/audio/*.test.js
SPACETIME_TEST_URI=http://127.0.0.1:3013 SPACETIME_TEST_DATABASE=realm-queue-integration npx tsx backend/spacetime/quick-integration.ts
PLAYWRIGHT_BASE_URL=http://localhost:4181 npx playwright test tests/quick-ui.spec.js --project=desktop
PLAYWRIGHT_BASE_URL=http://localhost:4181 npx playwright test tests/issue-progression.spec.js
npm run build
```

Publish the backend before the frontend: the client requires the new queue views and reducers. The queue table is additive; publishing must use `--delete-data=never`. Regenerated bindings are included. No production deployment is performed by these test commands.
