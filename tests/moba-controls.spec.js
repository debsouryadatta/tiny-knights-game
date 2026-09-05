import { enterPlayerName } from './helpers/player-name.js';
import { test, expect } from '@playwright/test';

async function join(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.realm?.state.ready);
  await page.locator('input[name="name"]').fill('Controls QA');
  await page.locator('input[name="room"]').fill(`MO${Date.now().toString(36)}`);
  await enterPlayerName(page);await page.locator('#create-room').click();
  await page.locator('#lobby-start').click();
  await page.waitForFunction(() => window.realm?.state.connected && window.realm.state.playerId);
  await expect(page.locator('#join-screen')).toBeHidden();
}
const hero = page => page.evaluate(() => window.realm.match.actors.find(a => a.id === window.realm.state.playerId));
const center = async locator => {const b=await locator.boundingBox();expect(b).not.toBeNull();return {x:b.x+b.width/2,y:b.y+b.height/2};};

test('continuous keyboard movement stops and attack is independent', async ({page},info) => {
  test.skip(info.project.name !== 'desktop');
  await join(page);
  const initial=await hero(page);
  await page.keyboard.down('d');
  await page.keyboard.down(' ');
  await expect.poll(async()=>{const h=await hero(page);return !!h.attackHeld&&h.x>initial.x;}).toBe(true);
  await expect.poll(async()=>{const h=await hero(page);return Math.abs(h.x-Math.round(h.x))>.02;}).toBe(true);
  await page.keyboard.up('d');
  await page.keyboard.up(' ');
  await expect.poll(async()=>!!(await hero(page)).attackHeld).toBe(false);
  await page.waitForTimeout(350);
  const stopped=await hero(page);
  await page.waitForTimeout(500);
  const later=await hero(page);
  expect(Math.hypot(later.x-stopped.x,later.y-stopped.y)).toBeLessThan(.03);
});

test('quick W+D diagonal input moves without normalization or rate errors and stops',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  await join(page);
  const initial=await hero(page);
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await expect.poll(async()=>{const h=await hero(page);return h.x>initial.x+.15&&h.y<initial.y-.15;}).toBe(true);
  await page.keyboard.up('w');
  await page.keyboard.up('d');
  await expect(page.locator('#message')).not.toContainText(/normaliz|rate|too many|too fast/i);
  await page.waitForTimeout(350);
  const stopped=await hero(page);
  await page.waitForTimeout(500);
  const later=await hero(page);
  expect(Math.hypot(later.x-stopped.x,later.y-stopped.y)).toBeLessThan(.03);
});

test('mobile multitouch keeps joystick and attack separate; minimap is upper left', async ({page},info) => {
  test.skip(info.project.name === 'desktop');
  await join(page);
  const map=await page.locator('#map-button').boundingBox();
  expect(map.x).toBeLessThan(35);expect(map.y).toBeLessThan(80);
  const joy=await center(page.locator('#joystick'));
  const attack=await center(page.locator('[data-action="attack"]'));
  const initial=await hero(page);
  const cdp=await page.context().newCDPSession(page);
  const touch=(id,p)=>({id,x:p.x,y:p.y,radiusX:6,radiusY:6,force:1});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,joy)]});
  const moving={x:joy.x+36,y:joy.y};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(1,moving)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,moving),touch(2,attack)]});
  await expect.poll(async()=>{const h=await hero(page);return !!h.attackHeld&&h.x>initial.x+.1;}).toBe(true);
  // CDP touchEnd lists the finger being lifted, not the remaining finger.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[touch(2,attack)]});
  await expect.poll(async()=>!!(await hero(page)).attackHeld).toBe(false);
  const stillMoving=await hero(page);
  await expect.poll(async()=>(await hero(page)).x).toBeGreaterThan(stillMoving.x+.1);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(350);
  const stopped=await hero(page);
  await page.waitForTimeout(500);
  const later=await hero(page);
  expect(Math.hypot(later.x-stopped.x,later.y-stopped.y)).toBeLessThan(.03);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('moba.png')});
});

test('recall channels and movement cancels it',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  await join(page);
  await page.locator('[data-action="recall"]').click();
  await expect.poll(async()=>!!(await hero(page)).recallUntil).toBe(true);
  await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');
  await expect.poll(async()=>!!(await hero(page)).recallUntil).toBe(false);
  await page.locator('[data-action="recall"]').click();
  await expect.poll(async()=>!!(await hero(page)).recallUntil).toBe(true);
  await expect.poll(async()=>(await hero(page)).lastAction,{timeout:6000}).toContain('Recalled');
});

test('three separate skills cast and drag-to-cancel does not consume cooldown',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  await join(page);
  const skill=page.locator('[data-action="ability"][data-slot="1"]');
  const p=await center(skill);
  await page.mouse.move(p.x,p.y);await page.mouse.down();
  await expect(page.locator('#aim-cancel')).toBeVisible();
  const cancel=await center(page.locator('#aim-cancel'));
  await page.mouse.move(cancel.x,cancel.y);await page.mouse.up();
  await page.waitForTimeout(250);
  expect((await hero(page)).abilityCooldowns?.[0]??0).toBe(0);
  for(const slot of [1,2,3]){
    await page.locator(`[data-action="ability"][data-slot="${slot}"]`).click();
    await expect.poll(async()=>(await hero(page)).abilityCooldowns?.[slot-1]??0).toBeGreaterThan(0);
  }
  await page.screenshot({path:info.outputPath('moba-desktop.png')});
});
