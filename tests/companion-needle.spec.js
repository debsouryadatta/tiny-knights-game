import { test, expect } from '@playwright/test';

async function join(page, room = `QA${Date.now().toString(36)}`) {
  await page.addInitScript(() => {
    window.__companionNeedleParse = async (query) => {
      if (/farm|gather|wood|gold/i.test(query)) return { ok: true, command: { type: 'order', order: 'gather' } };
      if (/stay|escort|follow/i.test(query)) return { ok: true, command: { type: 'order', order: 'escort' } };
      return { ok: false, reason: 'empty' };
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => window.realm?.state.ready);
  await page.locator('input[name="name"]').fill('Playtester');
  await page.locator('input[name="room"]').fill(room);
  await page.locator('#join').click();
  await page.waitForFunction(() => window.realm?.state.connected && window.realm.state.playerId);
  await expect(page.locator('#join-screen')).toBeHidden();
}

test('typed companion line issues the matching standing order', async ({ page }) => {
  await join(page);
  await page.locator('#companion-toggle').click();
  await expect(page.locator('#companion-command')).toBeVisible();
  await page.locator('#companion-line').fill('come back to me');
  await page.locator('#companion-send').click();
  await expect.poll(() =>
    page.evaluate(() => window.realm.match.actors.find(a => a.ownerId === window.realm.state.playerId && a.kind === 'companion')?.order),
  ).toBe('escort');
  await page.locator('#companion-line').fill('go farm wood');
  await page.locator('#companion-send').click();
  await expect.poll(() =>
    page.evaluate(() => window.realm.match.actors.find(a => a.ownerId === window.realm.state.playerId && a.kind === 'companion')?.order),
  ).toBe('gather');
  await page.locator('#companion-line').fill("what's the meta");
  await page.locator('#companion-send').click();
  await expect(page.locator('#message')).toContainText("Didn't catch that");
  await expect.poll(() =>
    page.evaluate(() => window.realm.match.actors.find(a => a.ownerId === window.realm.state.playerId && a.kind === 'companion')?.order),
  ).toBe('gather');
});
