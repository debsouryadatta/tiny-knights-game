import { createWorldAmbience } from './audio/ambience.js';
import { createGameplayAudio } from './audio/gameplay.js';
import { createAudioEngine } from './audio/engine.js';
import { GameClient } from './network.ts';
import { createCompanionNeedle } from './companion-needle.js';
import './duel-lobby.css';
import './combat-polish.css';
import { createRenderer } from './renderer.js';
import { createInput } from './input.js';
import { createUI } from './ui.js';
import { WIDTH, HEIGHT, TILE, isWalkable } from '../shared/map.ts';

const canvas = document.querySelector('#game');
const client = new GameClient();
const audio = createAudioEngine();
const unlockAudio = (event) => {
  if (event.isTrusted && !event.target?.closest?.('#sound')) audio.unlock();
};
document.addEventListener('pointerdown', unlockAudio);
document.addEventListener('keydown', unlockAudio);
const ambience = createWorldAmbience(audio);
const gameplayAudio = createGameplayAudio(audio, {
  onPosition: (position) => ambience.update(position),
});
let renderer;
let disposed = false,
  queuedJoin = null;
const joinMatch = client.join.bind(client);
client.join = (draft) => {
  if (queuedJoin) return queuedJoin;
  queuedJoin = (async () => {
    await renderer.ready;
    if (disposed)
      throw new Error('Game closed before joining. Please reopen it.');
    return joinMatch(draft);
  })().finally(() => {
    queuedJoin = null;
  });
  return queuedJoin;
};
const sendCommand = client.command.bind(client);
client.command = (command) => {
  if (client.lobby?.started === false) return;
  renderer?.predictCommand?.(command);
  sendCommand(command);
};
const companionNeedle = createCompanionNeedle();
const ui = createUI({ client, audio, companionNeedle, onViewChange: () => {} });
const refresh = () => {
  gameplayAudio.snapshot(
    client.state,
    client.session,
    client.status,
    document.hidden,
  );
  ui.update(client.state, client.session, client.status, client.error);
};
const visibility = () =>
  gameplayAudio.snapshot(
    client.state,
    client.session,
    client.status,
    document.hidden,
  );
document.addEventListener('visibilitychange', visibility);
const unsubscribe = client.subscribe(refresh);
const options = {
  onLocalMotion: (motion) => gameplayAudio.frame(motion),
  getState: () => client.state,
  getPlayerId: () => client.session?.playerId ?? null,
  getView: () => ui.getView(),
  onCommand: (command) => client.command(command),
  onLoadProgress: (progress) => ui.setLoadState(progress),
};
renderer = createRenderer(canvas, options);
const input = createInput(canvas, renderer, options);
const mapTimer = setInterval(() => {
  const minimap = document.querySelector('#minimap');
  if (minimap) renderer.drawMap(minimap);
}, 200);
refresh();
renderer.ready
  .then(() => {
    if (!disposed) ui.setReady(true);
  })
  .catch((error) => {
    console.error(error);
    if (!disposed) ui.setLoadState({ playable: false, error });
  });
window.addEventListener('pagehide', () => {
  disposed = true;
  document.removeEventListener('visibilitychange', visibility);
  document.removeEventListener('pointerdown', unlockAudio);
  document.removeEventListener('keydown', unlockAudio);
  audio.destroy();
  companionNeedle.destroy();
  client.disconnect();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    disposed = true;
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('pointerdown', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
    audio.destroy();
    clearInterval(mapTimer);
    unsubscribe();
    companionNeedle.destroy();
    client.disconnect();
    ui.destroy();
    input.destroy();
    renderer.destroy();
  });

// Read-only, non-secret playtest telemetry. No identity tokens or command API exposed.
window.realm = {
  get audio() {
    return {
      ...audio.getStats(),
      ...gameplayAudio.getStats(),
      ambience: ambience.getStats(),
    };
  },
  get state() {
    const me = client.state?.actors.find(
      (a) => a.id === client.session?.playerId,
    );
    return {
      ready: renderer.getStats().ready,
      connected: client.status === 'connected',
      x: (me?.x ?? 8) * TILE,
      y: (me?.y ?? 56) * TILE,
      room: client.session?.room,
      playerId: me?.id,
      hp: me?.hp,
      phase: client.state?.phase,
      tick: client.state?.tick,
      renderer: renderer.getStats(),
      needle: companionNeedle.getStatus(),
    };
  },
  walkable: (x, y) => isWalkable(Math.floor(x / TILE), Math.floor(y / TILE)),
  world: { width: WIDTH * TILE, height: HEIGHT * TILE },
  get match() {
    return client.state ? JSON.parse(JSON.stringify(client.state)) : null;
  },
};
