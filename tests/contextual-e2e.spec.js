import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/contextual-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"><canvas id="game"></canvas><div id="ui"></div>',
  }));
  await page.goto('/contextual-fixture');
  await page.evaluate(async () => {
    const [{ createUI }, { createInput }, { createGame, addPlayer, applyCommand, stepGame }] = await Promise.all([
      import('/src/ui.js'), import('/src/input.js'), import('/shared/simulation.ts'),
    ]);
    const state = createGame('CONTEXT');
    const playerId = addPlayer(state, { name: 'Context QA', hero: 'knight', companion: 'guardian', size: 1 });
    const hero = state.actors.find(a => a.id === playerId);
    const enemy = state.actors.find(a => a.kind === 'hero' && a.team !== hero.team);
    Object.assign(hero, { x: 10, y: 53, protectedUntil: 0 });
    Object.assign(enemy, { x: 11, y: 53, hp: 0, maxHp: 100, bot: false, protectedUntil: 0, respawnAt: 9999 });
    state.actors = [hero, enemy];
    state.resources = [{ id: 'nearby', kind: 'wood', amount: 100, maxAmount: 100, x: 11, y: 53 }];
    const commands = [];
    const client = { status: 'connected', lobby: null, ping: {}, command(command) {
      commands.push(command);
      const result = applyCommand(state, playerId, command);
      if (!result.ok) throw new Error(result.error);
      queueMicrotask(refresh);
    } };
    const audio = { getStats: () => ({ enabled: true }), subscribe: () => () => {} };
    const ui = createUI({ client, audio });
    const input = createInput(document.querySelector('#game'), {}, {
      getState: () => state, getPlayerId: () => playerId, getView: ui.getView, onCommand: client.command,
    });
    const session = { playerId, room: 'CONTEXT' };
    function refresh() { ui.update(state, session, 'connected', null); }
    window.contextFixture = { state, hero, enemy, commands, input, ui, refresh,
      step(seconds) { for (let time = 0; time < seconds; time += .1) stepGame(state, .1); refresh(); },
    };
    refresh();
  });
  await expect(page.locator('#join-screen')).toBeHidden();
  expect(errors).toEqual([]);
  page.contextualErrors = errors;
});
test.afterEach(async ({ page }) => expect(page.contextualErrors || []).toEqual([]));
const main = page => page.locator('[data-action="attack"]');
const commands = page => page.evaluate(() => window.contextFixture.commands);
const press = (page, locator, mobile) => mobile ? locator.tap() : locator.click();

test('nearby wood/gold labels Gather without auto-harvest; main and Space actually gather', async ({ page }, info) => {
  await expect(main(page)).toHaveAccessibleName('Gather nearby resource');
  await expect(main(page).locator('span').last()).toHaveText('Gather');
  await expect(main(page).locator('span').last()).toBeVisible();
  await page.waitForTimeout(150);
  expect(await commands(page)).toEqual([]);
  expect(await page.evaluate(() => window.contextFixture.state.resources[0].amount)).toBe(100);
  await press(page, main(page), info.project.name.includes('mobile'));
  expect(await commands(page)).toEqual([{ type: 'gather' }]);
  await page.evaluate(() => window.contextFixture.step(1.1));
  expect(await page.evaluate(() => window.contextFixture.hero.gathered)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.contextFixture.state.bank.blue.wood)).toBeGreaterThan(0);
  await page.evaluate(() => { const f = window.contextFixture; f.state.resources[0].kind = 'gold'; f.commands.length = 0; f.refresh(); });
  await page.keyboard.press('Space');
  expect(await commands(page)).toEqual([{ type: 'gather' }]);
  await page.evaluate(() => window.contextFixture.step(1.1));
  expect(await page.evaluate(() => window.contextFixture.state.bank.blue.gold)).toBeGreaterThan(0);
});

test('mixed enemy/resource keeps Attack, damages only on press, dedicated Gather still works', async ({ page }, info) => {
  await page.evaluate(() => { const f = window.contextFixture; f.enemy.hp = 100; f.refresh(); });
  await expect(main(page)).toHaveAccessibleName(/Attack/);
  await expect(main(page).locator('span').last()).toHaveText('Attack');
  await expect(main(page).locator('span').last()).toBeVisible();
  expect(await commands(page)).toEqual([]);
  expect(await page.evaluate(() => window.contextFixture.enemy.hp)).toBe(100);
  await press(page, main(page), info.project.name.includes('mobile'));
  expect(await commands(page)).toEqual([{ type: 'attack', held: true }, { type: 'attack', held: false }]);
  expect(await page.evaluate(() => window.contextFixture.enemy.hp)).toBeLessThan(100);
  expect(await page.evaluate(() => window.contextFixture.state.resources[0].amount)).toBe(100);
  await press(page, page.locator('[data-action="gather"]'), info.project.name.includes('mobile'));
  expect((await commands(page)).at(-1)).toEqual({ type: 'gather' });
  await page.keyboard.press('c');
  expect((await commands(page)).at(-1)).toEqual({ type: 'gather' });
  await page.evaluate(() => window.contextFixture.step(1.1));
  expect(await page.evaluate(() => window.contextFixture.hero.gathered)).toBeGreaterThan(0);
});

test('range/death transitions relabel without auto-actions and cancel an existing attack hold', async ({ page }) => {
  await page.evaluate(() => { const f = window.contextFixture; f.state.resources[0].x = 12; f.refresh(); });
  await expect(main(page)).toHaveAccessibleName(/Attack/);
  await page.evaluate(() => { const f = window.contextFixture; f.state.resources[0].x = 11; f.enemy.hp = 100; f.enemy.x = 14; f.hero.hero = 'ranger'; f.refresh(); });
  await expect(main(page)).toHaveAccessibleName(/Attack/);
  await page.evaluate(() => { const f = window.contextFixture; f.hero.hero = 'knight'; f.refresh(); });
  await expect(main(page)).toHaveAccessibleName('Gather nearby resource');
  expect(await commands(page)).toEqual([]);
  await page.evaluate(() => { const f = window.contextFixture; f.enemy.x = 11; f.refresh(); });
  await page.keyboard.down('Space');
  expect((await commands(page))[0]).toEqual({ type: 'attack', held: true });
  await page.evaluate(() => { const f = window.contextFixture; f.enemy.hp = 0; f.refresh(); });
  await expect(main(page)).toHaveAccessibleName('Gather nearby resource');
  await expect.poll(async () => (await commands(page)).at(-1)).toEqual({ type: 'attack', held: false });
  await page.keyboard.up('Space');
  expect((await commands(page)).some(c => c.type === 'gather')).toBe(false);
  expect(await page.evaluate(() => window.contextFixture.hero.attackHeld)).toBe(false);
  await page.evaluate(() => { const f = window.contextFixture; f.state.resources[0].amount = 0; f.refresh(); });
  await expect(main(page)).toHaveAccessibleName(/Attack/);
});
