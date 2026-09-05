# 1v1 duel verification

Built September 5, 2026. Three subagents handled simulation, rendering, and multiplayer browser tests. The main agent integrated the lobby and corrected escort spacing.

## Rules and checks

- Server accepts only size 1. Two heroes, opposing teams, exactly one companion each. A third identity is rejected; legacy larger rooms require a new room.
- Three-minion formations use the central lane and bridge. Target retention limits unnecessary changes of direction. Twelve minions per side maximum.
- Guardian and Scout escort; Harvester gathers. Escorts move away when the owner approaches, preserving physical collision without trapping the player.
- Build, backend TypeScript, all 38 shared tests, and real SDK integration passed.
- Duel browser suite: four passed, two viewport-specific skips. Two isolated clients, full-room rejection, non-empty minion waves, and responsive lobby bounds verified.
- Desktop controls, recall, skills, reconnect, resources and staged loading passed. A concurrent test-output directory collision caused one trace cleanup failure; the same regression passed in a separate output directory.
- Touch movement and attack independence passed in both 844×390 and 390×844 after fixing escort body-blocking.

## Visual review

IAB was used first to inspect the lobby and enter a live match. Existing Playwright tests supplied repeatable desktop/mobile screenshots. Images were inspected with view_image, including the 1536×1024 concept and native-size implementation, 1280×720 desktop, 844×390 landscape and 390×844 portrait.

| Check | Review and correction |
| --- | --- |
| Composition | Dark draft panel at left, battlefield art at right, clear primary action. |
| Typography | Gold serif heading and explicit system-font control sizing. |
| Palette | Navy backgrounds, warm gold selection and primary action, readable muted labels. |
| Asset framing | Production Tiny Swords selection sprites retained; corrected sprite-sheet frame sizing and Lancer crop. |
| Responsive behavior | Removed inherited narrow landscape layout; explicit two-column draft on short screens and single-column portrait. |
| Initial render | Hero and companion visible with lane ahead; terrain prepared before entry and seams repaired. |
| Copy | Removed team-size selector and three-lane claims; added necessary room-sharing and temporary-bot explanations. |

Intentional deviations from the generated concept: existing game sprites replace invented character portraits; the generated standalone background has sunset lighting; the heading wraps onto two lines; decorative panel framing is omitted. The landscape draft rearranges fields to fit. Canvas terrain and fortress details are retained from the existing game rather than replaced with generated tiles. Visual review passed for the implemented direction; this is not a claim of pixel-identical reproduction of the concept.

## Artwork

Built-in image generation produced the concept and background. The project asset is `public/art/duel-lobby.png`.

Concept source: `/Users/debsouryadatta/.codex/generated_images/01a071b1-991c-7473-a0a8-6860eec085f7/exec-3629a03b-564c-4d2a-85fe-c4e5a59bb924.png`.

Background brief: wide pixel-art fantasy forest at blue twilight with gold sunlight; a blue knight and one small guardian on the right, facing a single stone lane and distant red fortress; quiet navy left side for native HTML controls; no text, logos, UI, or watermark.

Concept brief: full desktop LITTLE REALM 1v1 lobby; navy left panel, gold serif "One lane. One rival." heading; name, hero, companion, optional room code, Create duel; pixel-art battlefield at right; native HTML controls and no unrelated navigation.

The local database was updated without deleting data. The existing ngrok tunnel targets port 4177; it depends on this computer and both local services staying running. This turn did not publish the revised module to Maincloud or deploy a permanent frontend.
