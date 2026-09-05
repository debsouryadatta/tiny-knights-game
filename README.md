# Little Realm

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
