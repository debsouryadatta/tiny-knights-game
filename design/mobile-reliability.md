# Mobile reliability and control polish

The reported screenshot showed connected gameplay sprites but black terrain and an empty minimap background. The probable failure was the shared 4096 × 4096 terrain canvas. The exact device failure was not remotely confirmed.

## Changes

- Terrain is drawn from 512 × 512 chunks with a 12-entry cache. The terrain cache uses at most 12 MiB of raw pixels, excluding other graphics allocations. Evicted canvases release their backing dimensions.
- The 512 × 512 minimap background is painted independently. Tactical overview uses that small map rather than building the full-size canvas.
- Main rendering is capped near 1.5 million pixels and 2048 pixels per edge. Canvas context restoration rebuilds caches and minimap state.
- Movement packets tolerate mobile network batching while retaining sustained rate limits. Stop/release commands remain immediate. Excess continuous movement packets are dropped without flooding the HUD with errors.
- Controls share proportional sizing and safe-area anchors; important touch targets are at least 44 CSS pixels. Compact landscape player information sits beside the minimap.
- Prediction correction compares historical local positions with estimated snapshot age, applies gradual collision-aware correction and adapts remote interpolation to arrival cadence.

## Verification scope

Tests cover an artificial 2048-pixel canvas limit, synthetic context-loss/restoration events, colored minimap and battlefield pixels, bounded cache size, public ngrok rendering, 20-packet input bursts followed by stop, responsive control bounds and hit targets, simultaneous touch movement/attack, and 220 ms delayed renderer snapshots. Synthetic context-loss tests exercise recovery handlers, not a real Android GPU allocation failure.

Browser checks include 844 × 390, 1600 × 720, 390 × 844, 667 × 375 and 1280 × 720 layouts. The root inspected live gameplay in the in-app browser and saved mobile/large-landscape screenshots. Source Tiny Swords artwork and the existing blue/gold control design are preserved. This is a refinement, not an artwork redesign.

Repeated automated tests exhausted the prototype's room cap. Disconnected timestamp-named QA fixtures older than two minutes are now cleaned up by the scheduler. Connected rooms and ordinary player room codes are excluded. Removed test matches are disposable and not recoverable; actual play sessions were not reset.

The existing ngrok URL remains the public entry point. A physical retest on the friend's device is still required to confirm its particular rendering failure is resolved.

Final combined run: 22 browser checks passed, with 23 intentional viewport-specific skips. All 18 simulation tests and the real two-client backend integration passed. The public ngrok test loaded the chunk renderer and verified colored terrain. Three parallel agents covered HUD, motion and phone regression checks. The final serial run avoided the earlier competing test-output directories and room-cap failures.
