import { isWalkable } from '../shared/map';
export function createInput(canvas, renderer, options) {
  const keys = new Set(),
    listeners = [];
  let press = null,
    vector = '',
    lastSteer = 0,
    attacking = false;
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  };
  const player = () =>
    options.getState()?.actors.find((a) => a.id === options.getPlayerId());
  const disabled = () =>
    options.getView().inputDisabled || !player() || player().hp <= 0;
  const send = (command) => {
    if (!disabled()) options.onCommand(command);
  };
  function stop() {
    if (vector && vector !== '0,0')
      options.onCommand({ type: 'steer', x: 0, y: 0 });
    if (attacking) options.onCommand({ type: 'attack', held: false });
    keys.clear();
    vector = '';
    attacking = false;
    press = null;
  }
  function steer() {
    const x =
      Number(keys.has('d') || keys.has('arrowright')) -
      Number(keys.has('a') || keys.has('arrowleft'));
    const y =
      Number(keys.has('s') || keys.has('arrowdown')) -
      Number(keys.has('w') || keys.has('arrowup'));
    const next = `${x},${y}`,
      now = performance.now();
    if (next !== vector || ((x || y) && now - lastSteer > 100)) {
      if (x || y || (vector && vector !== '0,0')) send({ type: 'steer', x, y });
      vector = next;
      lastSteer = now;
    }
  }
  listen(window, 'keydown', (e) => {
    if (
      /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) ||
      e.target.isContentEditable ||
      disabled()
    )
      return;
    const key = e.key.toLowerCase();
    if (
      ![
        'w',
        'a',
        's',
        'd',
        'arrowup',
        'arrowleft',
        'arrowdown',
        'arrowright',
        ' ',
        'q',
        'e',
        'f',
        'r',
        'c',
        't',
      ].includes(key)
    )
      return;
    e.preventDefault();
    keys.add(key);
    if (!e.repeat) {
      if (key === ' ') {
        attacking = true;
        send({ type: 'attack', held: true });
      }
      if (['q', 'e', 'f'].includes(key))
        send({ type: 'ability', slot: ['q', 'e', 'f'].indexOf(key) + 1 });
      if (key === 'r') send({ type: 'recall' });
      if (key === 'c') send({ type: 'gather' });
      if (key === 't') send({ type: 'regen' });
    }
    steer();
  });
  listen(window, 'keyup', (e) => {
    keys.delete(e.key.toLowerCase());
    if (e.key === ' ' && attacking) {
      send({ type: 'attack', held: false });
      attacking = false;
    }
    steer();
  });
  listen(window, 'blur', stop);
  listen(document, 'visibilitychange', () => {
    if (document.hidden) stop();
  });
  listen(canvas, 'contextmenu', (e) => e.preventDefault());
  listen(canvas, 'pointermove', (e) => {
    renderer.setHover(renderer.screenToTile(e.clientX, e.clientY));
    if (!press || press.id !== e.pointerId || options.getView().buildMode)
      return;
    const dx = e.clientX - press.x,
      dy = e.clientY - press.y;
    if (Math.hypot(dx, dy) > 10) press.dragged = true;
    if (press.dragged && !press.tactical) {
      const view = options.getView();
      view.inspect = {
        x: Math.max(0, Math.min(4096, press.camera.x - dx / press.scale)),
        y: Math.max(0, Math.min(4096, press.camera.y - dy / press.scale)),
      };
    }
  });
  listen(canvas, 'pointerdown', (e) => {
    if (disabled() || e.button > 2) return;
    const stats = renderer.getStats();
    press = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      camera: stats.camera,
      scale: stats.scale,
      tactical: options.getView().tactical,
    };
    canvas.setPointerCapture(e.pointerId);
  });
  listen(canvas, 'pointercancel', () => {
    press = null;
  });
  listen(canvas, 'pointerup', (e) => {
    if (!press || press.id !== e.pointerId) return;
    const prior = press;
    press = null;
    if (disabled()) return;
    if (prior.tactical) {
      const point = renderer.screenToWorld(e.clientX, e.clientY),
        view = options.getView();
      view.inspect = { x: (point.x + 0.5) * 64, y: (point.y + 0.5) * 64 };
      view.tactical = false;
      return;
    }
    if (prior.dragged || options.getView().inspect) return;
    const tile = renderer.screenToTile(e.clientX, e.clientY),
      point = renderer.screenToWorld(e.clientX, e.clientY),
      state = options.getState(),
      me = player();
    renderer.setMarker(tile);
    if (options.getView().buildMode) return send({ type: 'build', ...tile });
    const distance = (o) => Math.hypot(o.x - point.x, o.y - point.y);
    const enemy = [...state.actors, ...state.structures]
      .filter((a) => a.hp > 0 && a.team !== me.team && distance(a) < 1.1)
      .sort((a, b) => distance(a) - distance(b))[0];
    if (enemy) return send({ type: 'attack', targetId: enemy.id });
    if (e.button === 2) return send({ type: 'attack' });
    if (!isWalkable(tile.x, tile.y)) return;
    send({ type: 'move', ...tile });
  });
  const timer = setInterval(() => {
    if (disabled()) {
      stop();
      return;
    }
    steer();
    if (attacking) send({ type: 'attack', held: true });
  }, 100);
  return {
    destroy() {
      stop();
      clearInterval(timer);
      listeners.forEach((remove) => remove());
    },
  };
}
