import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatEffects } from './combat-effects.js';

const state = (effects = [], actors = [], elapsed = 10) => ({ room: 'test', elapsed, effects, actors });
const event = (id, kind = 'hit', extra = {}) => ({ id, kind, x: 2, y: 3, team: 'blue', ...extra });
function context() {
  const calls = [], stack = [];
  const ctx = { globalAlpha: .37, lineWidth: 7, calls,
    createLinearGradient() { return { addColorStop() {} }; },
    save() { stack.push([this.globalAlpha, this.lineWidth]); },
    restore() { [this.globalAlpha, this.lineWidth] = stack.pop(); },
  };
  for (const name of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'stroke', 'fill', 'ellipse', 'arc', 'setLineDash', 'strokeText', 'fillText', 'fillRect']) {
    ctx[name] = (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${name} has a non-finite coordinate`);
      calls.push([name, ...args, ctx.globalAlpha]);
    };
  }
  return ctx;
}

test('IDs deduplicate across snapshots and effects outlive removal from a network tick', () => {
  const fx = createCombatEffects();
  fx.update(state([event('one')]), 20);
  fx.update(state([event('one')]), 20.1);
  assert.equal(fx.getStats().received, 1);
  fx.update(state(), 20.2);
  assert.equal(fx.getStats().active, 1);
  fx.update(state([event('one')]), 21);
  assert.equal(fx.getStats().active, 0);
});

test('recall channel cancels, completion-only events burst, and stale snapshots do not restart channels', () => {
  const fx = createCombatEffects();
  const actor = { id: 'hero', x: 3, y: 4, hp: 100, recallUntil: 13 };
  fx.update(state([], [actor]), 50);
  assert.equal(fx.getStats().recalls, 1);
  fx.update(state([], [actor]), 54);
  assert.equal(fx.getStats().received, 1);
  fx.update(state([], [{ ...actor, recallUntil: undefined }], 11), 54.1);
  assert.equal(fx.getStats().recalls, 0);
  assert.equal(fx.getStats().active, 1);
  fx.reset();
  fx.update(state([event('done', 'recall', { sourceId: 'hero', targetId: 'hero', target: { x: 20, y: 20 } })]), 80);
  assert.equal(fx.getStats().recalls, 0);
  assert.equal(fx.getStats().active, 2);
  fx.update(state(), 81);
  assert.equal(fx.getStats().active, 0);
});

test('authoritative completion replaces a channel once at its origin', () => {
  const fx = createCombatEffects();
  const actor = { id: 'hero', x: 3, y: 4, hp: 100, recallUntil: 13 };
  fx.update(state([], [actor]), 50);
  fx.update(state([event('done', 'recall', { sourceId: 'hero', target: { x: 20, y: 20 } })],
    [{ ...actor, x: 20, y: 20, recallUntil: undefined }], 13), 53);
  assert.equal(fx.getStats().recalls, 0);
  assert.equal(fx.getStats().received, 3);
});

test('bounded memory, malformed coordinates, late events, reset and match rewind', () => {
  const fx = createCombatEffects({ maxEffects: 8 });
  for (let n = 0; n < 600; n++) fx.update(state([event(n)]), 10);
  assert.equal(fx.getStats().active, 8);
  assert.ok(fx.getStats().seen <= 512);
  fx.reset();
  fx.update(state([event('bad', 'hit', { x: NaN }), event('late', 'hit', { at: 1 })]), 10);
  assert.equal(fx.getStats().active, 0);
  fx.update(state([event('ok')]), 11);
  fx.update(state([], [], 0), 12);
  assert.equal(fx.getStats().active, 0);
  assert.equal(fx.getStats().seen, 0);
});

test('every effect draws finite deterministic geometry, respects culling and restores context', () => {
  for (const reducedMotion of [false, true]) {
    const fx = createCombatEffects({ reducedMotion });
    const kinds = ['hit', 'heal', 'ability', 'death', 'recall', 'respawn', 'build', 'gather', 'dash', 'shockwave'];
    const events = kinds.map((kind, i) => event(String(i), kind, { target: { x: 5, y: 5 }, amount: 42 }));
    events.push(event('projectile', 'hit', { style: 'projectile', target: { x: 6, y: 5 } }));
    fx.update(state(events), 10);
    fx.update(state(events), 10.15);
    const a = context(), b = context();
    fx.drawGround(a); fx.drawOverlay(a);
    fx.drawGround(b); fx.drawOverlay(b);
    assert.deepEqual(a.calls, b.calls);
    assert.equal(a.globalAlpha, .37); assert.equal(a.lineWidth, 7);
    fx.drawGround(a, { tactical: true });
    fx.drawOverlay(a, { bounds: { left: 10000, top: 10000, right: 11000, bottom: 11000 } });
    assert.equal(fx.getStats().groundDrawn, 0);
    assert.equal(fx.getStats().overlayDrawn, 0);
  }
});

test('combat labels keep a 12px screen minimum on mobile with proportionate outlines', () => {
  for (const reducedMotion of [false, true]) {
    const fx = createCombatEffects({ reducedMotion });
    const snapshot = state([event('damage', 'hit', { amount: 42 }), event('health', 'heal', { amount: 24 })]);
    fx.update(snapshot, 10); fx.update(snapshot, 10.15);
    for (const scale of [.5, .61, 1, 1.3, undefined, NaN, 0]) {
      const ctx = context(), labels = [];
      ctx.strokeText = (label) => labels.push({ label, font: ctx.font, outline: ctx.lineWidth });
      fx.drawOverlay(ctx, { scale });
      const effectiveScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      const expectedSize = Math.max(17, 12 / effectiveScale);
      assert.deepEqual(labels.map(label => label.label), ['−42', '+24']);
      for (const label of labels) {
        assert.equal(label.font, `700 ${expectedSize}px system-ui`);
        assert.ok(expectedSize * effectiveScale >= 12);
        assert.equal(label.outline, expectedSize * 3 / 17);
      }
      assert.equal(ctx.lineWidth, 7);
    }
    fx.update(state(), 12);
    assert.equal(fx.getStats().active, 0);
  }
});
