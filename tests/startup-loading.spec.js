import { test, expect } from '@playwright/test';

const room = () => `QA${Date.now().toString(36)}`;
const criticalArt = /Tilemap_color2\.png/;
const optionalArt = /(?:House1|Tree[234]|Bushe[1234]|_Run|_Attack1|_Shoot|_Right_Attack|_Interact%20Axe)\.png/;

async function draft(page, name) {
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="room"]').fill(room());
  await page.locator('#join').click();
}

test('native progress is visible before the game module arrives', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/src/main.js', async route => { await gate; await route.continue(); });
  await page.goto('/', { waitUntil: 'commit' });
  try {
    await expect(page.locator('#loading')).toBeVisible();
    await expect(page.locator('#load-progress')).toBeVisible();
    await expect(page.locator('#load-title')).toHaveText('Opening Little Realm');
  } finally { release(); }
  await page.waitForFunction(() => window.realm?.state.ready);
});

test('optional artwork does not block entering a live match', async ({ page }) => {
  let release, held = 0;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(optionalArt, async route => { held++; await gate; await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => window.realm?.state.ready);
    await expect.poll(() => held).toBeGreaterThan(0);
    await expect(page.locator('#load-title')).toHaveText('Finishing scenery');
    const progress = await page.locator('#load-progress').evaluate(el => ({ value: el.value, max: el.max }));
    expect(progress.value).toBeLessThan(progress.max);
    await draft(page, 'Optional QA');
    await page.waitForFunction(() => window.realm?.state.connected && window.realm.state.playerId);
    await expect(page.locator('#join-screen')).toBeHidden();
    const tick = await page.evaluate(() => window.realm.state.tick);
    await expect.poll(() => page.evaluate(() => window.realm.state.tick)).toBeGreaterThan(tick);
  } finally { release(); }
});

test('early draft submission queues once without spawning before essential art', async ({ page }) => {
  let release, connections = 0;
  const gate = new Promise(resolve => { release = resolve; });
  page.on('websocket', socket => { if (socket.url().includes('/v1/')) connections++; });
  await page.route(criticalArt, async route => { await gate; await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  try {
    await draft(page, 'Queued QA');
    await expect(page.locator('#join')).toBeDisabled();
    await expect(page.locator('#load-detail')).toContainText('Your selection is saved');
    // Repeated form submission must not create another queued join.
    await page.locator('#draft').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.realm.state.ready)).toBe(false);
    expect(await page.evaluate(() => window.realm.state.playerId)).toBeUndefined();
    expect(connections).toBe(0);
  } finally { release(); }
  await page.waitForFunction(() => window.realm?.state.connected && window.realm.state.playerId);
  await expect(page.locator('#hero-name')).toHaveText('Queued QA');
  await page.waitForTimeout(350);
  expect(connections).toBe(1);
  expect(await page.evaluate(() => window.realm.match.actors.filter(a => a.name === 'Queued QA' && a.kind !== 'companion').length)).toBe(1);
});

test('critical artwork failure displays a retry and cannot enter a match', async ({ page }) => {
  await page.route(criticalArt, route => route.abort('failed'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#load-title')).toHaveText('Artwork could not load');
  await expect(page.locator('#load-retry')).toBeVisible();
  await draft(page, 'Failure QA');
  await expect(page.locator('#join-error')).not.toBeEmpty();
  expect(await page.evaluate(() => window.realm.state.playerId)).toBeUndefined();
  await page.unroute(criticalArt);
  await page.locator('#load-retry').click();
  await page.waitForFunction(() => window.realm?.state.ready);
  await expect(page.locator('#load-retry')).toBeHidden();
});
