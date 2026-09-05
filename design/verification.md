# Prototype verification — September 5, 2026

Primary reference: `map-reference.png`, supplied by the user. Gameplay uses individual Tiny Swords sprites and shared geometry, not a flattened generated image. The frontend-building workflow guided visual comparison and mobile checks.

| Dimension | Implemented | Remaining difference |
| --- | --- | --- |
| Composition | Southwest blue base, northeast red base, three lanes | Available castles instead of custom crystal shrines |
| Territory | Green west and red/ash east | Brighter original asset palette than the reference |
| Water | Winding central river and three stone crossings | Simpler banks, no waterfalls |
| Jungle | Mirrored resource camps, rocks and dense forests | Simpler than hand-painted camp enclosures |
| Scale | 64 × 64 cells at 64 px; 4096 px square | Wider lanes favor mobile navigation |
| Framing | Following camera and clickable tactical overview | Optional grid rather than baked-in grid |
| Mobile | Joystick, action buttons, compact HUD, fullscreen request | Browser-emulated touch, not physical-phone testing |

Tree trunks share forest collision; canopy overhang can overlap neighboring walkable cells. Decorative fortress walls are not a complete siege collision system. This is a reference-inspired playable iteration, not pixel-exact reproduction.

## Evidence

- Production build and 12 simulation tests passed.
- Browser suite: 10 checks passed, two intentional mobile skips for the desktop-only economy test.
- Real SDK checks cover two-client state, movement, reserved seats, reconnect and host restart.
- Viewports: desktop 1280 × 720, touch 844 × 390 and 390 × 844. Gameplay and overview screenshots are in `tests/new-realm-*.png`.
- In-app browser checked draft, connected match, world interaction, companion controls and help. No reported missing assets or page errors.
- Terrain caching, scenery culling and movement interpolation are implemented. Physical-phone FPS/battery improvements have not been measured.

## Supporting generated reference

`gameplay-reference.png` used the built-in image-generation tool with the supplied screenshot as reference. Direction: landscape mobile gameplay in the green/ash river-and-stone-bridge world, readable knight and companion, compact HUD, no phone frame. This is a design aid, not gameplay evidence or a runtime atlas. Runtime art is the repository's Tiny Swords pack.

## Limits

Local services, not public deployment. Live LLM calls and physical-phone performance remain unverified. Fullscreen depends on browser support. Browser tests enter build mode; placement/spending have simulation coverage. Original explorer preserved at `/explore.html`. No commit or push performed.
