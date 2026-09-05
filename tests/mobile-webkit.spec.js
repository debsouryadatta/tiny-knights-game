import { test, expect } from '@playwright/test';

test('touch music toggles once per tap and zoom recovery preserves pinch',async({page},info)=>{
  test.skip(info.project.name==='desktop');
  await page.goto('/');
  await page.waitForFunction(()=>!!window.realm);
  await page.evaluate(()=>{document.body.classList.remove('join-active');document.querySelector('#join-screen').remove();});
  await page.locator('#sound').tap();
  await expect.poll(()=>page.evaluate(()=>window.realm.audio.state)).toBe('running');
  for(const enabled of [false,true,false,true]){
    await page.locator('#sound').tap();
    expect(await page.evaluate(()=>window.realm.audio.enabled)).toBe(enabled);
    expect(await page.evaluate(()=>visualViewport.scale)).toBe(1);
  }
  await expect(page.locator('#reset-view')).toBeHidden();
  await page.evaluate(()=>{Object.defineProperty(visualViewport,'scale',{configurable:true,get:()=>2});visualViewport.dispatchEvent(new Event('resize'));});
  await expect(page.locator('#reset-view')).toBeVisible();
  await page.locator('#reset-view').click();
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute('content',/maximum-scale/);
  expect(await page.locator('#game').evaluate(el=>getComputedStyle(el).touchAction)).toBe('pinch-zoom');
  await page.evaluate(()=>{Object.defineProperty(visualViewport,'scale',{configurable:true,get:()=>1});visualViewport.dispatchEvent(new Event('resize'));});
  await expect(page.locator('#reset-view')).toBeHidden();
});

// WebKit engine emulation, not a claim of testing iOS hardware or its browser chrome.
test('WebKit phone lobby, gameplay, rotation and sound controls remain usable', async ({ page }, info) => {
  test.skip(info.project.name !== 'webkit-mobile', 'Opt in with MOBILE_WEBKIT=1 and install Playwright WebKit.');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.realm?.state.ready);
  await page.locator('input[name="name"]').fill('WebKit phone');
  expect(await page.locator('input[name="name"]').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await page.locator('#create-room').tap();
  await expect(page.locator('#waiting-lobby')).toBeVisible();
  if(await page.locator('.mobile-play-prompt').isVisible())await page.locator('#mobile-play-dismiss').tap();
  for (const id of ['lobby-start', 'lobby-leave']) {
    const box = await page.locator('#' + id).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(390);
  }
  await page.locator('#lobby-start').tap();
  await expect(page.locator('#join-screen')).toBeHidden();
  await expect(page.locator('#hero-name')).toHaveText('WebKit phone');
  const initialScale=await page.evaluate(()=>visualViewport.scale);
  for(const selector of ['#game','#hero-name','#sound']){
    const box=await page.locator(selector).boundingBox();
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
  }
  expect(await page.evaluate(()=>visualViewport.scale)).toBe(initialScale);
  expect(await page.locator('#game').evaluate(el=>getComputedStyle(el).touchAction)).toBe('pinch-zoom');
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).touchAction)).toBe('manipulation');
  expect(await page.locator('#game').evaluate(el=>el.dispatchEvent(new Event('gesturestart',{bubbles:true,cancelable:true})))).toBe(true);
  await page.locator('[data-slot="2"]').tap();
  await expect.poll(() => page.evaluate(() => {
    const hero = window.realm.match.actors.find(a => a.id === window.realm.state.playerId);
    return hero.abilityCooldowns[1];
  })).toBeGreaterThan(0);
  await page.locator('#sound').tap();
  expect(await page.evaluate(() => window.realm.audio.enabled)).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#hero-name')).toHaveText('WebKit phone');
  await page.locator('#help').tap();
  await expect(page.locator('#help-dialog')).toBeVisible();
  expect(await page.locator('#help-dialog').evaluate(el=>el.dispatchEvent(new Event('gesturestart',{bubbles:true,cancelable:true})))).toBe(true);
  await page.locator('#help-dialog .close').tap();
  await expect(page.locator('#help-dialog')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('webkit-phone-portrait.png') });
  expect(errors).toEqual([]);
});
