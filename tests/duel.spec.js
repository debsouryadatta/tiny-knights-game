import { enterPlayerName } from './helpers/player-name.js';
import { test, expect } from '@playwright/test';

async function openLobby(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.realm?.state.ready);
  await expect(page.locator('#join-screen')).toBeVisible();
  await expect(page.locator('select[name="size"]')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /match size/i })).toHaveCount(0);
}

async function submitDraft(page, room, name, create = false) {
  await openLobby(page);
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="room"]').fill(room);
  await enterPlayerName(page);await page.locator(create ? '#create-room' : '#join').click();
}

async function join(page, room, name, create = false) {
  await submitDraft(page, room, name, create);
  await page.waitForFunction(() => window.realm?.state.connected && window.realm.state.playerId);
  if (create) await page.locator('#lobby-start').click();
  await expect(page.locator('#join-screen')).toBeHidden();
  await expect(page.locator('#hero-name')).toHaveText(name);
  if (!create) await expect.poll(() => page.evaluate(() => window.realm.state.room)).toBe(room);
  return page.evaluate(() => window.realm.state.playerId);
}

async function roster(page) {
  return page.evaluate(() => {
    const match = window.realm.match;
    return {
      size: match?.size,
      heroes: match?.actors.filter(a => a.kind === 'hero').map(a => ({
        id: a.id, team: a.team, bot: a.bot,
      })).sort((a, b) => a.id.localeCompare(b.id)),
      companions: match?.actors.filter(a => a.kind === 'companion').map(a => ({
        id: a.id, ownerId: a.ownerId, team: a.team,
      })).sort((a, b) => a.id.localeCompare(b.id)),
    };
  });
}

test('same room admits two opposing players with one companion each and rejects a third', async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'Authoritative multiplayer rules are covered once.');
  test.setTimeout(120000);
  const contexts = [];
  try {
    // Separate storage gives every player an independent server identity.
    for (let i = 0; i < 3; i++) contexts.push(await browser.newContext({ baseURL }));
    const [first, second, third] = await Promise.all(contexts.map(context => context.newPage()));
    const firstId = await join(first, '', 'Duel One', true);
    const room = await first.evaluate(() => window.realm.state.room);
    const secondId = await join(second, room, 'Duel Two');
    expect(secondId).not.toBe(firstId);
    const playerIds = [firstId, secondId].sort();

    for (const page of [first, second]) {
      await expect.poll(async () => (await roster(page)).heroes?.filter(a => !a.bot).map(a => a.id).sort()).toEqual(playerIds);
      const current = await roster(page);
      expect(current.size).toBe(1);
      expect(current.heroes).toHaveLength(2);
      expect(current.heroes.map(a => a.team).sort()).toEqual(['blue', 'red']);
      expect(current.companions).toHaveLength(2);
      for (const hero of current.heroes) {
        const owned = current.companions.filter(a => a.ownerId === hero.id);
        expect(owned).toHaveLength(1);
        expect(owned[0].team).toBe(hero.team);
      }
    }
    const expectedRoster = await roster(first);
    await expect.poll(() => roster(second)).toEqual(expectedRoster);

    await submitDraft(third, room, 'Duel Three');
    await expect(third.locator('#join-error')).toContainText(/(?:match|room) is full/i);
    await expect(third.locator('#join-screen')).toBeVisible();
    expect(await third.evaluate(() => window.realm.state.playerId)).toBeUndefined();
    for (const page of [first, second]) {
      const tick = await page.evaluate(() => window.realm.state.tick);
      await expect.poll(() => page.evaluate(() => window.realm.state.tick)).toBeGreaterThan(tick);
      expect(await roster(page)).toEqual(expectedRoster);
    }

    // Wait for a real wave so an empty array cannot pass the lane assertion.
    await expect.poll(() => first.evaluate(() => {
      const minions = window.realm?.match?.actors.filter(a => a.kind === 'creep') ?? [];
      return [...new Set(minions.map(a => a.team))].sort();
    }), { timeout: 65000 }).toEqual(['blue', 'red']);
    for (const page of [first, second]) {
      await expect.poll(() => page.evaluate(() => {
        const minions = window.realm?.match?.actors.filter(a => a.kind === 'creep') ?? [];
        return minions.length > 0 && minions.every(a => a.lane === 1);
      })).toBe(true);
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test('duel lobby fits the viewport without horizontal overflow', async ({ page }, info) => {
  await openLobby(page);
  for (const selector of ['input[name="name"]', 'input[name="room"]', '#join']) {
    const control = page.locator(selector);
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const screenshot = await page.screenshot({ path: info.outputPath('duel-lobby.png'), fullPage: true });
  await info.attach('duel lobby', { body: screenshot, contentType: 'image/png' });
});
