# Approved mobile controls redesign

User approved replacing grid-locked actors with continuous MOBA movement on September 5, 2026. Terrain and buildings retain tile coordinates. Actors use physical separation rather than one actor per logical cell.

Controls follow the supplied Mobile Legends screenshot: minimap upper-left, score/time upper-center, joystick lower-left, large basic attack lower-right, three skills in an arc, Recall and Regen below center. Gather, Build and companion orders remain secondary controls. Original Tiny Swords art remains.

Shared movement integrates normalized steering with collision, explicit stop and input expiry. The local hero predicts input; the server validates positions, combat and resources. Remote actors interpolate snapshots. Attack intent remains independent of steering. Skills have separate cooldowns; aimed skills use press-drag-release. Recall channels and cancels on movement or damage.

Implementation split: shared simulation and collision; backend command transport and independent rate limits; renderer/input; mobile HUD; root integration and browser verification. Acceptance includes simultaneous joystick plus attack/skill, release-to-stop, diagonal speed, walls, real damage, cooldowns and recall interruption. Local server stays on port 4177.

## Verification

Build and 18 simulation tests passed. Full browser suite passed 15 checks with nine viewport-specific skips, then an additional rapid W+D regression passed. Real SDK two-client integration passed continuous movement, simultaneous steering/attack/skill, release, validation, recall cancellation, identity reconnect and host restart. Touch input tests use genuine CDP multi-touch on 844 × 390 and 390 × 844 browser viewports. Physical phones and adverse WAN latency remain unverified.

In-app browser verified the live HUD and connected match. Saved browser captures in `tests/moba-*.png` were inspected alongside the supplied screenshot and `mobile-controls-concept.png`. Comparison covered minimap placement, score/time hierarchy, circular blue/gold controls, three-skill arc, recall/regen location, thumb separation and portrait fit. Text is real state and real class ability names. No fake concept scores or levels were copied. Intentional differences are the existing Tiny Swords world, vector weapon/shield icons instead of raster skill paintings, and compact build/gather/companion controls. This is the approved control pattern, not identical Mobile Legends artwork.

The frontend and imagegen skills supplied the control concept and visual comparison. `mobile-controls-concept.png` was generated with the built-in tool. Prompt: complete landscape mobile MOBA HUD over a Tiny Swords woodland; top-left minimap, top-center score/time, bottom-left joystick, bottom-right large Attack and three-skill arc, lower-center Recall/Regen, secondary Gather/Build, blue/gold circular controls, open battlefield, no logo or phone frame. Actual runtime art remains repository assets.

Focused render sampling observed approximately 0.0833 tiles per frame through 28 consecutive corridor frames at 60 Hz despite 100 ms server snapshots. Fixed outgoing diagonal normalization and a delayed stop correction. This is local browser evidence, not a physical-phone FPS guarantee. Reconciliation is prototype-grade correction, not a full input-history replay system.
