import { test, expect } from '@playwright/test';

for (const entry of ['quick-play', 'create-room', 'join']) {
  test(`${entry} shows three tips for seven seconds before connecting`, async ({ page }) => {
    let connections = 0;
    page.on('websocket', socket => { if (socket.url().includes('/v1/')) connections++; });
    // The landing stats subscription may reconnect independently of match entry.
    await page.route('**/src/platform-stats.ts*', route => route.fulfill({
      contentType: 'application/javascript',
      body: 'export const watchGamesPlayed = () => () => {};',
    }));
    await page.goto('/');
    await page.waitForFunction(() => window.realm?.state.ready);
    await page.locator('input[name="name"]').fill('Splash QA');
    if (entry === 'join') await page.locator('input[name="room"]').fill('INTROQA');
    const started = Date.now();
    await page.locator(`#${entry}`).click();
    const splash = page.locator('#match-intro');
    await expect(splash).toBeVisible();
    await expect(page.locator('#intro-objective')).toContainText('21 hero kills');
    await expect(page.locator('#intro-tip strong')).toHaveText('Gather');
    await expect(page.locator('#intro-title')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(splash).toBeVisible();

    await expect(page.locator('#intro-tip strong')).toHaveText('Attack');

    await expect(page.locator('#intro-tip strong')).toHaveText('Escort / Defend');
    const fits = await splash.evaluate(el => {
      const footer = el.querySelector('footer').getBoundingClientRect();
      return el.scrollWidth <= el.clientWidth && footer.bottom <= innerHeight && footer.left >= 0;
    });
    expect(fits).toBe(true);
    await page.screenshot({ path: test.info().outputPath('splash.png') });

    await expect(splash).toBeVisible();
    expect(connections).toBe(0);
    expect(await page.evaluate(() => window.realm.state.playerId)).toBeUndefined();

    await expect(splash).not.toBeVisible();
    expect(Date.now() - started).toBeGreaterThanOrEqual(6900);
    expect(Date.now() - started).toBeLessThan(10000);
  });
}

test('invalid name does not open intro', async ({ page }) => {
  await page.goto('/');
  await page.locator('#quick-play').click();
  await expect(page.locator('#join-error')).toHaveText('Enter your name to play.');
  await expect(page.locator('#match-intro')).not.toBeVisible();
});
