import test from 'node:test';
import assert from 'node:assert/strict';
import { getMainAction, createMainActionHold } from '../src/contextual-action.js';
import { createInput } from '../src/input.js';

function scene(heroKind = 'knight') {
  const hero = { id: 'player', hero: heroKind, hp: 100, team: 'blue', x: 0, y: 0 };
  const state = { actors: [hero], structures: [], resources: [{ kind: 'wood', amount: 20, x: 1.5, y: 0 }] };
  return { state, hero };
}

test('near living wood or gold swaps to Gather, empty or distant nodes do not', () => {
  const { state, hero } = scene();
  for (const kind of ['wood', 'gold']) {
    state.resources[0].kind = kind;
    assert.equal(getMainAction(state, hero), 'gather');
  }
  state.resources[0].amount = 0;
  assert.equal(getMainAction(state, hero), 'attack');
  state.resources[0].amount = 20;
  state.resources[0].x = 1.5001;
  assert.equal(getMainAction(state, hero), 'attack');
  assert.equal(getMainAction(null, hero), 'attack');
});

for (const heroKind of ['knight', 'lancer', 'ranger']) {
  for (const kind of ['hero', 'companion', 'creep', 'tower', 'core']) {
    test(`${heroKind}: living enemy ${kind} has priority at exact class range`, () => {
      const { state, hero } = scene(heroKind);
      const range = heroKind === 'ranger' ? 5 : 1.6;
      const enemy = { id: 'enemy', kind, hp: 10, team: 'red', x: range, y: 0 };
      const targets = ['core', 'tower'].includes(kind) ? state.structures : state.actors;
      targets.push(enemy);
      assert.equal(getMainAction(state, hero), 'attack');
      enemy.x += .001;
      assert.equal(getMainAction(state, hero), 'gather');
      enemy.x = range;
      enemy.hp = 0;
      assert.equal(getMainAction(state, hero), 'gather');
      enemy.hp = 10;
      enemy.team = 'blue';
      assert.equal(getMainAction(state, hero), 'gather');
    });
  }
}

test('held attack releases on Gather context and never starts another action until a new press', () => {
  let action = 'attack';
  const commands = [];
  const hold = createMainActionHold({ getAction: () => action, send: c => commands.push(c) });
  hold.update();
  assert.deepEqual(commands, []);
  hold.press();
  hold.press();
  hold.update({ repeat: true });
  action = 'gather';
  hold.update({ repeat: true });
  action = 'attack';
  hold.update({ repeat: true });
  hold.release();
  assert.deepEqual(commands, [{ type: 'attack', held: true }, { type: 'attack', held: true }, { type: 'attack', held: false }]);
  action = 'gather';
  hold.press();
  action = 'attack';
  hold.update({ repeat: true });
  hold.release();
  assert.deepEqual(commands.at(-1), { type: 'gather' });
  assert.equal(commands.length, 4);
});

test('Space uses contextual action, C forces gather, and keyup releases even after controls disable', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const fakeWindow = new EventTarget();
  globalThis.window = fakeWindow as any;
  globalThis.document = new EventTarget() as any;
  const { state, hero } = scene();
  const commands = [];
  const view = { inputDisabled: false };
  const input = createInput(new EventTarget(), {}, {
    getState: () => state, getPlayerId: () => hero.id,
    getView: () => view, onCommand: c => commands.push(c),
  });
  const key = (type, value) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { key: value, repeat: false });
    fakeWindow.dispatchEvent(event);
  };
  try {
    key('keydown', ' ');
    key('keyup', ' ');
    assert.deepEqual(commands, [{ type: 'gather' }]);
    state.actors.push({ ...hero, id: 'enemy', team: 'red', x: 1 });
    key('keydown', 'c');
    key('keyup', 'c');
    assert.deepEqual(commands.at(-1), { type: 'gather' });
    key('keydown', ' ');
    assert.deepEqual(commands.at(-1), { type: 'attack', held: true });
    view.inputDisabled = true;
    key('keyup', ' ');
    assert.deepEqual(commands.at(-1), { type: 'attack', held: false });
  } finally {
    input.destroy();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
