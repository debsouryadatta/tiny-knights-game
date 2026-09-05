import {test,expect} from '@playwright/test';

// Use a fresh local database: Quick Play deliberately retains disconnected seats.
// Every player owns an independent browser context and therefore an identity.
async function prepare(browser,baseURL,size,name){
  const context=await browser.newContext({baseURL,viewport:{width:1280,height:720}});
  const page=await context.newPage();
  await page.goto('/');
  await page.locator('input[name="name"]').fill(name);
  await page.locator(`[data-choice="size"] [data-value="${size}"]`).click();
  return {context,page};
}
async function joined(page){await expect.poll(()=>page.evaluate(()=>window.realm?.state.playerId),{timeout:20000}).toBeTruthy();}
async function playing(page){await expect(page.locator('#join-screen')).toBeHidden({timeout:20000});}
async function explore(page){
  const before=await page.evaluate(()=>({tick:window.realm.state.tick,x:window.realm.state.x,y:window.realm.state.y}));
  await page.locator('#map-button').click();
  await expect(page.locator('#map-button')).toHaveAttribute('aria-pressed','true');
  await page.locator('#return-hero').click();
  const box=await page.locator('#minimap').boundingBox();
  await page.mouse.move(box.x+box.width*.15,box.y+box.height*.5);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.92,box.y+box.height*.22,{steps:16});
  await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.realm.state.renderer.camera.x)).toBeGreaterThan(4500);
  // Exploring is a camera action; the live match continues in the background.
  await expect.poll(()=>page.evaluate(()=>window.realm.state.tick)).toBeGreaterThan(before.tick+10);
  await page.locator('#return-hero').click();
  await expect.poll(()=>page.evaluate(()=>Math.abs(window.realm.state.renderer.camera.x-window.realm.state.x))).toBeLessThan(100);
}
for(const size of [2,3])for(const mode of ['private','quick'])test(`${size}v${size} ${mode}: all players join, move, explore and reconnect`,async({browser,baseURL},info)=>{
  test.skip(info.project.name!=='desktop');test.setTimeout(150000);
  const players=[];
  try{
    players.push(...await Promise.all(Array.from({length:size*2},(_,i)=>prepare(browser,baseURL,size,`${mode} ${size} Player ${i+1}`))));
    const pages=players.map(p=>p.page),host=pages[0];
    if(mode==='private'){
      await host.locator('#create-room').click();await joined(host);
      const room=await host.locator('#lobby-copy').innerText();
      await Promise.all(pages.slice(1).map(async p=>{await p.locator('input[name="room"]').fill(room);await p.locator('#join').click();await joined(p);}));
      await expect(host.locator('#lobby-start')).toBeDisabled();
      await Promise.all(pages.slice(1).map(p=>p.locator('#lobby-ready').click()));
      await expect(host.locator('#lobby-start')).toBeEnabled();
      await host.locator('#lobby-start').click();
    }else{
      await Promise.all(pages.map(async p=>{await p.locator('#quick-play').click();await joined(p);}));
    }
    await Promise.all(pages.map(playing));
    const seats=await Promise.all(pages.map(p=>p.evaluate(()=>({id:window.realm.state.playerId,room:window.realm.state.room}))));
    expect(new Set(seats.map(s=>s.room)).size).toBe(1);
    expect(new Set(seats.map(s=>s.id)).size).toBe(size*2);
    for(const p of pages)expect(await p.evaluate(()=>window.realm.match.actors.filter(a=>a.kind==='hero'&&!a.bot).length)).toBe(size*2);
    // Exercise real input on every independent client, then verify replication.
    const before=await host.evaluate(()=>window.realm.match.actors.filter(a=>a.kind==='hero').map(a=>({id:a.id,x:a.x})));
    await Promise.all(pages.map(async p=>{
      const x=await p.evaluate(()=>window.realm.state.x);
      await p.keyboard.down('d');
      await expect.poll(()=>p.evaluate(()=>window.realm.state.x)).toBeGreaterThan(x+12);
      await p.keyboard.up('d');
    }));
    await expect.poll(()=>host.evaluate(before=>before.every(a=>window.realm.match.actors.find(b=>b.id===a.id).x>a.x),before)).toBe(true);
    await explore(host);
    await host.screenshot({path:info.outputPath(`${mode}-${size}-live.png`)});
    // Reload actually drops the transport, then reconnect using the retained identity.
    const last=pages.at(-1),seat=seats.at(-1);
    await last.reload();await last.locator('input[name="name"]').fill('Reconnected teammate');
    await last.locator('input[name="room"]').fill(seat.room);await last.locator('#join').click();await playing(last);
    expect(await last.evaluate(()=>window.realm.state.playerId)).toBe(seat.id);
    await explore(last);
    const initial=await host.evaluate(()=>window.realm.state.tick);
    await expect.poll(()=>host.evaluate(()=>window.realm.state.tick),{timeout:15000}).toBeGreaterThan(initial+100);
    await expect.poll(()=>Promise.all(pages.map(p=>p.evaluate(()=>window.realm.state.connected)))).toEqual(Array(size*2).fill(true));
    console.log(JSON.stringify({mode,size,players:seats.length,room:seats[0].room,renderer:await host.evaluate(()=>window.realm.state.renderer)}));
  }finally{await Promise.all(players.map(p=>p.context.close()));}
});
