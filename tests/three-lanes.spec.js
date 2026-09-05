import {test,expect} from '@playwright/test';

test('three-lane lobby, live waves and battlefield overview',async({page},info)=>{
  await page.goto('/');
  await page.locator('input[name="name"]').fill('Lane Captain');
  await page.locator('[data-choice="size"] [data-value="3"]').click();
  await page.locator('#create-room').click();
  if(await page.locator('.mobile-play-prompt').isVisible())await page.locator('#mobile-play-dismiss').click();
  await expect(page.locator('#waiting-lobby')).toBeVisible();
  await expect(page.locator('#lobby-map')).toBeVisible();
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('#lobby-map');
    return canvas?.getContext('2d').getImageData(canvas.width/2,canvas.height/2,1,1).data[3]>0;
  });
  const aspect=await page.locator('#lobby-map').evaluate(c=>c.width/c.height);
  expect(aspect).toBeCloseTo(80/56);
  await expect(page.locator('#starting-lane')).toContainText('Top');
  for(const team of ['blue','red'])for(const lane of ['Top','Mid','Bottom'])await expect(page.locator(`#lobby-roster .team-${team}`)).toContainText(`${lane} lane`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('three-lane-lobby.png')});
  await page.locator('#lobby-start').click();
  await expect(page.locator('#join-screen')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>{
    const s=window.realm?.match;
    return s&&['blue','red'].every(team=>[0,1,2].every(lane=>s.actors.some(a=>a.kind==='creep'&&a.team===team&&a.lane===lane)));
  }),{timeout:20000}).toBe(true);
  await page.locator('#map-button').click();
  await expect(page.locator('#tactical-hint')).toContainText('Top · Mid · Bottom');
  await expect(page.locator('#map-button')).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:info.outputPath('three-lane-overview.png')});
  // Terrain collision and the displayed route must agree at all three bridges.
  const crossings=await page.evaluate(async()=>{
    const {bridgeCenters,isWalkable}=await import('/shared/map.ts');
    return bridgeCenters.map(p=>isWalkable(Math.round(p.x),Math.round(p.y)));
  });
  expect(crossings).toEqual([true,true,true]);
  await page.locator('#return-hero').click();
  await expect(page.locator('#map-button')).toHaveAttribute('aria-pressed','false');
  const map=await page.locator('#minimap').boundingBox();
  expect(map.width/map.height).toBeCloseTo(80/56,1);
  await page.mouse.move(map.x+map.width*.3,map.y+map.height*.5);
  await page.mouse.down();
  await page.mouse.move(map.x+map.width*.9,map.y+map.height*.3,{steps:8});
  await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.realm.state.renderer.camera.x)).toBeGreaterThan(4200);
  await page.locator('#return-hero').click();
});
