import { test, expect } from '@playwright/test';
import { WIDTH, HEIGHT, baseFor, spawnFor, isWalkable, resourceSeeds, laneWaypoints } from '../shared/map.ts';

async function join(page, room) {
  await page.goto('/');
  await page.waitForFunction(() => window.realm?.state.ready);
  await page.locator('input[name="name"]').fill('Playtester');
  if(room){
    await page.locator('input[name="room"]').fill(room);
    await page.locator('#join').click();
  }else{
    await page.locator('#create-room').click();
    await expect(page.locator('#waiting-lobby')).toBeVisible();
    room=await page.locator('#lobby-copy').textContent();
    await page.locator('#lobby-start').click();
  }
  await page.waitForFunction(() => window.realm?.state.connected && window.realm.state.playerId);
  await expect(page.locator('#join-screen')).toBeHidden();
  return room;
}

async function tapTile(page, tile, touch) {
  const point = await page.evaluate(({ x, y }) => {
    const r = document.querySelector('#game').getBoundingClientRect();
    const { camera, scale } = window.realm.state.renderer;
    return { x: r.left + r.width / 2 + ((x + .5) * 64 - camera.x) * scale, y: r.top + r.height / 2 + ((y + .5) * 64 - camera.y) * scale };
  }, tile);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

test('draft, live input, overview, grid, companion orders and menu', async ({ page, isMobile }, info) => {
  const errors = [], missing = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && /\.(png|jpg|js|css)(\?|$)/.test(response.url())) missing.push(`${response.status()} ${response.url()}`); });
  await join(page);
  await expect(page.locator('#hero-name')).toHaveText('Playtester');
  await expect.poll(() => page.evaluate(() => window.realm.state.tick)).toBeGreaterThan(1);
  const before = await page.evaluate(() => ({ x: window.realm.state.x, y: window.realm.state.y }));
  if (isMobile) {
    const box = await page.locator('#joystick').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 7, box.y + box.height / 2);
    await page.waitForTimeout(900);
    await page.mouse.up();
  } else {
    await page.keyboard.down('d');
    await page.waitForTimeout(900);
    await page.keyboard.up('d');
  }
  await expect.poll(() => page.evaluate(p => Math.hypot(window.realm.state.x - p.x, window.realm.state.y - p.y), before)).toBeGreaterThan(0);
  await page.locator('#grid-toggle').click();
  await expect(page.locator('#grid-toggle')).toHaveClass(/active/);
  await page.locator('#companion-toggle').click();
  await page.locator('[data-order="escort"]').click();
  await expect.poll(() => page.evaluate(() => window.realm.match.actors.find(a => a.ownerId === window.realm.state.playerId && a.kind === 'companion')?.order)).toBe('escort');
  await page.locator('#help').click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.locator('#resume').click();
  await expect(page.locator('#help-dialog')).toBeHidden();
  await page.screenshot({ path: info.outputPath('new-realm.png') });
  await page.locator('#map-button').click();
  await expect(page.locator('#tactical-hint')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: info.outputPath('new-realm-overview.png') });
  const destination = await page.evaluate(() => {
    const me = window.realm.match.actors.find(a => a.id === window.realm.state.playerId);
    for (const [dx, dy] of [[0,-3], [3,0], [-3,0], [0,3]]) {
      const x=me.x+dx,y=me.y+dy;
      if(window.realm.walkable(x*64,y*64)) return {x,y};
    }
  });
  const beforeTap = await page.evaluate(() => ({ x: window.realm.state.x, y: window.realm.state.y }));
  await tapTile(page, destination, isMobile);
  await expect(page.locator('#return-hero')).toBeVisible();
  await expect(page.locator('#tactical-hint')).toBeHidden();
  await page.waitForTimeout(400);
  expect(await page.evaluate(p => Math.hypot(window.realm.state.x-p.x,window.realm.state.y-p.y), beforeTap)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect(missing).toEqual([]);
});

test('refresh and rejoin keeps the same player identity', async ({ page }) => {
  const room = await join(page);
  const id = await page.evaluate(() => window.realm.state.playerId);
  await join(page, room);
  expect(await page.evaluate(() => window.realm.state.playerId)).toBe(id);
});

test('resource gathering and ability reach the authoritative simulation', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Shared server behavior is covered once; touch actions are covered by the viewport smoke tests.');
  await join(page);
  await page.locator('[data-action="ability"][data-slot="1"]').click();
  await expect.poll(() => page.evaluate(() => window.realm.match.actors.find(a => a.id === window.realm.state.playerId)?.abilityCooldown)).toBeGreaterThan(0);
  await page.locator('[data-action="gather"]').click();
  await expect.poll(() => page.evaluate(() => window.realm.match.actors.find(a => a.id === window.realm.state.playerId)?.gathered), { timeout: 25000 }).toBeGreaterThan(0);
  await expect(page.locator('#message')).toContainText('Gathering');
  const bank = await page.evaluate(() => {
    const me = window.realm.match.actors.find(a => a.id === window.realm.state.playerId);
    return window.realm.match.bank[me.team];
  });
  expect(bank.wood + bank.gold).toBeGreaterThan(0);
  await page.locator('[data-action="build"]').click();
  await expect(page.locator('[data-action="build"]')).toHaveClass(/active/);
  await expect(page.locator('#message')).toContainText('Build a tower');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="build"]')).not.toHaveClass(/active/);
});

test('all resource sites and the duel lane connect both bases', () => {
  const start = baseFor('blue');
  const visited = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const p = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: p.x + dx, y: p.y + dy };
      const key = `${next.x},${next.y}`;
      if (!visited.has(key) && isWalkable(next.x, next.y)) { visited.add(key); queue.push(next); }
    }
  }
  expect(WIDTH * HEIGHT).toBe(4096);
  for (const team of ['blue', 'red']) {
    const base = baseFor(team);
    expect(visited.has(`${base.x},${base.y}`), `${team} base`).toBe(true);
    for (let slot = 0; slot < 6; slot++) {
      const spawn = spawnFor(team, slot);
      expect(visited.has(`${spawn.x},${spawn.y}`), `${team} spawn ${slot}`).toBe(true);
    }
    for (const lane of [1]) {
      for (const point of laneWaypoints(team, lane)) expect(visited.has(`${point.x},${point.y}`), `${team} lane ${lane} waypoint`).toBe(true);
    }
  }
  for (const resource of resourceSeeds()) expect(visited.has(`${resource.x},${resource.y}`), `${resource.kind} at ${resource.x},${resource.y}`).toBe(true);
});
