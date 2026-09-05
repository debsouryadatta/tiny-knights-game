import { enterPlayerName } from './helpers/player-name.js';
import {test,expect} from '@playwright/test';

async function join(page){
  await page.goto('/');
  await page.waitForFunction(()=>window.realm?.state.ready);
  await page.locator('input[name="name"]').fill('HUD tester');
  await page.locator('input[name="room"]').fill(`HUD${Date.now().toString(36)}`);
  await enterPlayerName(page);await page.locator('#create-room').click();
  await page.locator('#lobby-start').click();
  await page.waitForFunction(()=>window.realm?.state.playerId&&window.realm.state.connected);
  await expect(page.locator('#join-screen')).toBeHidden();
}
const position=page=>page.evaluate(()=>({x:window.realm.state.x,y:window.realm.state.y}));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
async function drag(page,locator,from,to){
  const b=await locator.boundingBox();expect(b).not.toBeNull();
  await page.mouse.move(b.x+b.width*from[0],b.y+b.height*from[1]);
  await page.mouse.down();
  await page.mouse.move(b.x+b.width*to[0],b.y+b.height*to[1],{steps:12});
  await page.mouse.up();
}

test('overview closes in one tap and minimap inspection never moves the hero',async({page},info)=>{
  await join(page);
  const initial=await position(page),map=page.locator('#map-button');
  await map.click();
  await expect(map).toHaveAttribute('aria-pressed','true');
  await map.click();
  await expect(map).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#tactical-hint')).toBeHidden();
  await drag(page,page.locator('#minimap'),[.25,.7],[.8,.2]);
  await expect(page.locator('#return-hero')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.realm.state.renderer.camera.x)).toBeGreaterThan(2200);
  await page.waitForTimeout(500);
  expect(distance(initial,await position(page))).toBeLessThan(2);
  await page.locator('#return-hero').click();
  await expect(page.locator('#return-hero')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>window.realm.state.renderer.camera.x)).toBeLessThan(1600);
  const cameraBefore=await page.evaluate(()=>window.realm.state.renderer.camera.x);
  await drag(page,page.locator('#game'),[.5,.4],[.38,.4]);
  await expect(page.locator('#return-hero')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.realm.state.renderer.camera.x)).toBeGreaterThan(cameraBefore+20);
  expect(distance(initial,await position(page))).toBeLessThan(2);
  await page.screenshot({path:info.outputPath('gameplay-ux.png')});
});

test('inspection recenters on movement and idle hero has no stale Moving toast',async({page},info)=>{
  await join(page);
  await drag(page,page.locator('#minimap'),[.2,.7],[.75,.25]);
  await expect(page.locator('#return-hero')).toBeVisible();
  const before=await position(page);
  if(info.project.name==='desktop'){
    await page.keyboard.down('d');await page.waitForTimeout(450);await page.keyboard.up('d');
  }else{
    const b=await page.locator('#joystick').boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
    await page.mouse.move(b.x+b.width*.8,b.y+b.height/2);
    await page.waitForTimeout(450);await page.mouse.up();
  }
  await expect(page.locator('#return-hero')).toBeHidden();
  await expect.poll(async()=>distance(before,await position(page))).toBeGreaterThan(5);
  await page.waitForTimeout(400);const stopped=await position(page);
  await page.waitForTimeout(500);
  expect(distance(stopped,await position(page))).toBeLessThan(2);
  await expect(page.locator('#message')).not.toHaveText(/^Moving$/i);
});
