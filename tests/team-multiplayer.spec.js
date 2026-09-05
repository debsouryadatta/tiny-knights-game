import {test,expect} from '@playwright/test';
async function draft(page,size,name){
  await page.goto('/');await page.locator('input[name="name"]').fill(name);
  await page.locator(`[data-choice="size"] [data-value="${size}"]`).click();
}
async function dismiss(page){if(await page.locator('.mobile-play-prompt').isVisible())await page.locator('#mobile-play-dismiss').click();}
for(const size of [1,2,3])test(`${size}v${size} selector creates a complete responsive team lobby`,async({page})=>{
  await draft(page,size,'Captain');await page.locator('#create-room').click();await dismiss(page);
  await expect(page.locator('#waiting-lobby')).toBeVisible();
  await expect(page.locator('#waiting-lobby .legend')).toContainText(`${size}v${size}`);
  await expect(page.locator('.lobby-seat')).toHaveCount(size*2);
  await expect(page.locator('#lobby-roster .team-blue h2')).toHaveText(`Blue team · 1/${size}`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const selector of ['#lobby-start','#lobby-leave']){await page.locator(selector).scrollIntoViewIfNeeded();const box=await page.locator(selector).boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);}
  await page.screenshot({path:test.info().outputPath(`lobby-${size}.png`)});
  await page.locator('#lobby-start').click();await expect(page.locator('#join-screen')).toBeHidden();
  await expect(page.locator('#connection')).toContainText(`${size}v${size}`);
  expect(await page.evaluate(()=>window.realm.match.actors.filter(a=>a.kind==='hero').length)).toBe(size*2);
});
test('six browsers ready, play and reconnect to a shared 3v3 room',async({browser,baseURL},info)=>{
  test.skip(info.project.name!=='desktop');test.setTimeout(120000);
  const contexts=[],pages=[];
  try{
    for(let i=0;i<6;i++){const c=await browser.newContext({baseURL});contexts.push(c);const p=await c.newPage();pages.push(p);await draft(p,i===0?3:1,`Player ${i+1}`);
      if(i===0)await p.locator('#create-room').click();else{await p.locator('input[name="room"]').fill(await pages[0].locator('#lobby-copy').innerText());await p.locator('#join').click();}
      await expect(p.locator('#waiting-lobby .legend')).toContainText('3v3');
    }
    await expect(pages[0].locator('#lobby-start')).toBeDisabled();
    for(const p of pages.slice(1))await p.locator('#lobby-ready').click();
    await expect(pages[0].locator('#lobby-start')).toBeEnabled();
    await expect(pages[0].locator('#lobby-roster .team-blue h2')).toHaveText('Blue team · 3/3');
    await expect(pages[0].locator('#lobby-roster .team-red h2')).toHaveText('Red team · 3/3');
    await pages[0].screenshot({path:test.info().outputPath('six-player-ready.png')});
    const ids=await Promise.all(pages.map(p=>p.evaluate(()=>window.realm.state.playerId)));
    expect(new Set(ids).size).toBe(6);
    await pages[0].locator('#lobby-start').click();for(const p of pages)await expect(p.locator('#join-screen')).toBeHidden();
    const before=await pages[0].evaluate(()=>window.realm.match.actors.filter(a=>a.kind==='hero').map(a=>({id:a.id,x:a.x})));
    for(const p of pages){const x=await p.evaluate(()=>window.realm.state.x);await p.keyboard.down('d');await expect.poll(()=>p.evaluate(()=>window.realm.state.x)).toBeGreaterThan(x);await p.keyboard.up('d');}
    await expect.poll(()=>pages[0].evaluate(before=>before.every(a=>window.realm.match.actors.find(b=>b.id===a.id).x>a.x),before)).toBe(true);
    await pages[5].reload();await pages[5].locator('input[name="name"]').fill('Reconnected');await pages[5].locator('input[name="room"]').fill(await pages[0].evaluate(()=>window.realm.state.room));await pages[5].locator('#join').click();
    await expect(pages[5].locator('#join-screen')).toBeHidden();expect(await pages[5].evaluate(()=>window.realm.state.playerId)).toBe(ids[5]);
    await pages[0].locator('#help').click();await expect(pages[0].locator('#match-roster .lobby-seat')).toHaveCount(6);
    await pages[0].screenshot({path:test.info().outputPath('six-player-roster.png')});
  }finally{for(const c of contexts)await c.close();}
});
test('Quick Play resume is scoped to the selected match size',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  await draft(page,2,'Duo');await page.locator('#quick-play').click();
  await expect(page.locator('#quick-bot')).toBeVisible();await page.locator('#quick-bot').click();
  await expect(page.locator('#join-screen')).toBeHidden();
  const duo=await page.evaluate(()=>({room:window.realm.state.room,id:window.realm.state.playerId}));
  await page.reload();await page.locator('input[name="name"]').fill('Trio');await page.locator('[data-choice="size"] [data-value="3"]').click();await page.locator('#quick-play').click();
  await expect(page.locator('#waiting-lobby .legend')).toContainText('3v3');
  expect(await page.evaluate(()=>window.realm.state.room)).not.toBe(duo.room);
  await page.locator('#lobby-leave').click();await page.locator('[data-choice="size"] [data-value="2"]').click();await page.locator('#quick-play').click();
  await expect(page.locator('#join-screen')).toBeHidden();
  expect(await page.evaluate(()=>({room:window.realm.state.room,id:window.realm.state.playerId}))).toEqual(duo);
});
