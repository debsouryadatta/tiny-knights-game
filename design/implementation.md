# Divided realm implementation

User direction: build on qKitNp/tiny-knights-game, make the map similar to supplied map-reference.png, and improve smoothness, playability and interaction with parallel agents.

Keep the original Canvas 2D engine approach and supplied animated Tiny Swords art. Preserve the original peaceful explorer at explore.html. New main scene connects the tested identity-authoritative SpacetimeDB match rules, rather than dropping multiplayer from the previous prototype. A separate `little-realm-live` database prevents the new map changing existing matches.

64 by64 logical cells,64pixels each; square4096world. Blue southwest fortress and lush western jungle contrast with red northeast fortress and ash eastern jungle. Three connected lanes, winding central river, bridges, paired jungle clearings, cliff/forest boundaries and resource camps. Terrain/collision derives from shared geometry. Decorative detail never substitutes for gameplay state. At close zoom, a hero remains large enough to read on a phone. Tactical view shows the full map.

Rendering: baked terrain, cached faction-tinted sprites, visible-object culling, depth-sorted actors, camera easing and200ms tile interpolation. Input: keyboard, analogue touch, tap destinations, contextual resource/enemy actions, feedback markers and build preview. HUD: small status bars, real resource costs/cooldowns, companion orders, map, fullscreen, draft/reconnect/results.

Verification: unit simulation/map tests, real SDK two-client join/move/reconnect tests, in-app browser visuals, saved desktop/mobile screenshots, collision/bridge reachability and bounded renderer telemetry. No claim of physical-phone battery/GPU testing. Keep provider keys server-side; local companion planner remains default.
