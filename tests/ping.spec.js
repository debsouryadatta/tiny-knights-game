import {test,expect} from '@playwright/test';

test('ping updates while idle and fits beside corner controls',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.waitForFunction(()=>window.realm?.state.ready);
  await page.locator('input[name="room"]').fill(`QA${Date.now().toString(36)}`);
  await page.locator('#join').click();await expect(page.locator('#join-screen')).toBeHidden();
  const ping=page.locator('#ping-indicator');
  await expect(ping).toHaveText(/Ping \d+ ms/);
  const samples=Number(await ping.getAttribute('data-samples'));
  await expect.poll(async()=>Number(await ping.getAttribute('data-samples')),{timeout:10000}).toBeGreaterThan(samples);
  const bounds=await ping.boundingBox();expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
  const help=await page.locator('#grid-toggle').boundingBox();expect(bounds.x+bounds.width).toBeLessThanOrEqual(help.x);
  await page.screenshot({path:info.outputPath('ping-hud.png')});
  expect(errors).toEqual([]);
});

test('socket loss replaces the ping with reconnecting and a fresh reply restores it',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  let connection;
  await page.routeWebSocket(/\/subscribe/,ws=>{connection=ws;ws.connectToServer();});
  await page.goto('/');await page.waitForFunction(()=>window.realm?.state.ready);
  await page.locator('input[name="room"]').fill(`QA${Date.now().toString(36)}`);
  await page.locator('#join').click();
  await expect(page.locator('#ping-indicator')).toHaveText(/Ping \d+ ms/);
  await connection.close({code:1012,reason:'Reconnect test'});
  await expect(page.locator('#ping-indicator')).toHaveText('Reconnecting');
  await expect(page.locator('#ping-indicator')).toHaveText(/Ping \d+ ms/,{timeout:15000});
});
