import { enterPlayerName } from './helpers/player-name.js';
import { test, expect } from '@playwright/test';

const pageErrors = new WeakMap();
test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'These multitouch checks use Chromium CDP.');
  const errors = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({ page }) => expect(pageErrors.get(page) || []).toEqual([]));

async function touchControls(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const point = async selector => {
    const r = await page.locator(selector).boundingBox();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const touch = (id, p) => ({ id, x: p.x, y: p.y, radiusX: 6, radiusY: 6, force: 1 });
  const send = (type, points = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const hold = async (selector = '[data-action="attack"]') => {
    const joy = await point('#joystick'), moving = { x: joy.x + 30, y: joy.y }, action = await point(selector);
    await send('touchStart', [touch(1, joy)]);
    await send('touchMove', [touch(1, moving)]);
    await send('touchStart', [touch(1, moving), touch(2, action)]);
    return { moving, action };
  };
  return { hold, send, touch };
}
async function join(page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await page.waitForFunction(() => window.realm?.state.ready);
  await enterPlayerName(page);await page.locator('#create-room').click();
  await page.locator('#lobby-start').click();
  await expect(page.locator('#join-screen')).toBeHidden();
}
const hero = page => page.evaluate(() => window.realm.match.actors.find(a => a.id === window.realm.state.playerId));

test('rotation cancels both touches and leaves movement stopped after layout changes', async ({ page }) => {
  await join(page);
  const controls = await touchControls(page);
  await controls.hold();
  await expect.poll(async () => Boolean((await hero(page)).attackHeld)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => { const a = await hero(page); return !a.attackHeld && !(a.steer?.x || a.steer?.y); }).toBe(true);
  const stopped = await hero(page);
  await page.waitForTimeout(300);
  const later = await hero(page);
  expect(Math.hypot(later.x - stopped.x, later.y - stopped.y)).toBeLessThan(.01);
  await controls.send('touchCancel');
  await controls.hold();
  await expect.poll(async () => Boolean((await hero(page)).attackHeld)).toBe(true);
  await controls.send('touchCancel');
});

test('skill finger release preserves joystick; pointercancel stops all without scrolling', async ({ page }) => {
  await join(page);
  const controls = await touchControls(page);
  const { action } = await controls.hold('[data-slot="1"]');
  await expect(page.locator('#aim-cancel')).toBeVisible();
  await controls.send('touchEnd', [controls.touch(2, action)]);
  await expect.poll(async () => (await hero(page)).abilityCooldowns[0]).toBeGreaterThan(0);
  await expect.poll(async () => (await hero(page)).steer?.x || 0).toBeGreaterThan(0);
  await controls.send('touchCancel');
  await expect.poll(async () => (await hero(page)).steer?.x || 0).toBe(0);
  await expect(page.locator('#aim-cancel')).toBeHidden();
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
});

// Exercise actual UI touch handlers with deterministic life-cycle transitions.
// Only the server transport is replaced, so death does not require timing a fight.
async function fixture(page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/mobile-input-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"><div id="ui"></div>',
  }));
  await page.goto('/mobile-input-fixture');
  await page.evaluate(async () => {
    const { createUI } = await import('/src/ui.js');
    const actor = { id: 'hero', name: 'Touch QA', kind: 'hero', hero: 'knight', team: 'blue', hp: 100, maxHp: 100, x: 10, y: 10, kills: 0, respawnAt: 10, abilityCooldowns: [0, 0, 0] };
    const state = { actors: [actor], structures: [], resources: [], bank: { blue: { wood: 0, gold: 0 }, red: { wood: 0, gold: 0 } }, phase: 'playing', elapsed: 0 };
    const commands = [], client = { status: 'connected', lobby: null, ping: {}, command: c => commands.push(c) };
    const audio = { getStats: () => ({ enabled: true }), subscribe: () => () => {} };
    const ui = createUI({ client, audio });
    const session = { playerId: 'hero', room: 'TOUCH' };
    window.touchFixture = { commands, ui, update(hp, status = 'connected') { actor.hp = hp; client.status = status; ui.update(state, session, status, null); } };
    window.touchFixture.update(100);
  });
}

test('death clears touches and respawn requires a new gesture', async ({ page }) => {
  await fixture(page);
  const controls = await touchControls(page);
  await controls.hold();
  await page.evaluate(() => { window.touchFixture.commands.length = 0; window.touchFixture.update(0); });
  const releases = await page.evaluate(() => window.touchFixture.commands);
  expect(releases).toContainEqual({ type: 'steer', x: 0, y: 0 });
  expect(releases).toContainEqual({ type: 'attack', held: false });
  await page.evaluate(() => { window.touchFixture.commands.length = 0; window.touchFixture.update(100); });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.touchFixture.commands)).toEqual([]);
  await controls.send('touchCancel');
});

test('disconnect cancels aimed skill and joystick, reconnect never auto-casts', async ({ page }) => {
  await fixture(page);
  const controls = await touchControls(page);
  const { action } = await controls.hold('[data-slot="1"]');
  await expect(page.locator('#aim-cancel')).toBeVisible();
  await page.evaluate(() => window.touchFixture.update(100, 'reconnecting'));
  await expect(page.locator('#aim-cancel')).toBeHidden();
  await page.evaluate(() => { window.touchFixture.commands.length = 0; window.touchFixture.update(100); });
  await controls.send('touchEnd', [controls.touch(2, action)]);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.touchFixture.commands)).toEqual([]);
  await controls.send('touchCancel');
});
