import {test,expect} from '@playwright/test';

test('Space attacks and recall and regen have live visual feedback',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.locator('input[name="room"]').fill(`FX${Date.now().toString(36)}`);
  await page.locator('#create-room').click();
  await page.locator('#lobby-start').click();
  await page.waitForFunction(()=>window.realm?.state.connected&&window.realm.state.playerId);
  await expect(page.locator('#join-screen')).toBeHidden();
  if(info.project.name==='desktop'){
    await expect(page.locator('[data-action="attack"] kbd')).toBeVisible();
    await page.keyboard.down('Space');
    await expect.poll(()=>page.evaluate(()=>window.realm.match.actors.find(a=>a.id===window.realm.state.playerId).attackHeld)).toBe(true);
    await expect(page.locator('[data-action="attack"]')).toHaveClass(/active/);
    await page.keyboard.up('Space');
    await expect.poll(()=>page.evaluate(()=>window.realm.match.actors.find(a=>a.id===window.realm.state.playerId).attackHeld)).toBe(false);
  }
  await page.locator('[data-action="recall"]').click();
  await expect(page.locator('#cast-status')).toContainText('Recalling');
  await expect.poll(()=>page.evaluate(()=>window.realm.state.renderer.effects.recalls)).toBe(1);
  await page.waitForTimeout(800);
  await page.screenshot({path:info.outputPath('recall-channel.png')});
  await expect(page.locator('#cast-status')).toBeHidden({timeout:6000});
  await expect.poll(()=>page.evaluate(()=>window.realm.state.renderer.effects.recalls)).toBe(0);
  const before=await page.evaluate(()=>window.realm.state.renderer.effects.received);
  await page.locator('[data-action="regen"]').click();
  await expect.poll(()=>page.evaluate(()=>window.realm.state.renderer.effects.received)).toBeGreaterThan(before);
  await page.waitForTimeout(150);
  await page.screenshot({path:info.outputPath('regeneration.png')});
  await expect(page.locator('[data-action="regen"]')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('hit, dash, shockwave, death and respawn render without stale effects',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async()=>{
    const {createRenderer}=await import('/src/renderer.js');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:1000';document.body.append(canvas);
    const actor={id:'fx-hero',name:'Knight',kind:'hero',hero:'knight',team:'blue',x:10,y:53,hp:660,maxHp:660,inputSeq:0};
    const rival={...actor,id:'fx-rival',name:'Rival',team:'red',x:12,y:52};
    let state={room:'fixture',tick:1,elapsed:0,actors:[actor,rival],structures:[],resources:[],effects:[]};
    const renderer=createRenderer(canvas,{getState:()=>state,getPlayerId:()=>actor.id,getView:()=>({})});
    await renderer.ready;
    window.fxFixture={
      set(actors,effects){state={...state,tick:state.tick+1,elapsed:state.elapsed+.1,actors,effects};},
      actor,rival,stats:()=>renderer.getStats(),close:()=>{renderer.destroy();canvas.remove();}
    };
  });
  try{
    await page.evaluate(()=>{
      const f=window.fxFixture;
      f.set([f.actor,{...f.rival,hp:480}],[{id:'hit-1',kind:'hit',x:10,y:53,target:{x:12,y:52},sourceId:'fx-hero',targetId:'fx-rival',amount:180,style:'melee',team:'blue',ttl:.7}]);
    });
    await page.waitForTimeout(120);
    await page.screenshot({path:info.outputPath('melee-impact.png')});
    await page.evaluate(()=>{
      const f=window.fxFixture;
      f.set([{...f.actor,x:12,y:53},f.rival],[{id:'dash-1',kind:'ability',abilitySlot:1,x:10,y:53,target:{x:12,y:53},sourceId:'fx-hero',team:'blue',ttl:.7},{id:'wave-1',kind:'ability',abilitySlot:3,x:12,y:53,sourceId:'fx-hero',team:'blue',ttl:.7}]);
    });
    await page.waitForTimeout(160);
    await page.screenshot({path:info.outputPath('skills.png')});
    await page.evaluate(()=>{
      const f=window.fxFixture;
      f.set([{...f.actor,hp:0},f.rival],[{id:'death-1',kind:'death',x:10,y:53,targetId:'fx-hero',team:'blue',ttl:.7}]);
    });
    await page.waitForTimeout(170);
    await page.screenshot({path:info.outputPath('death.png')});
    await page.evaluate(()=>{const f=window.fxFixture;f.set([f.actor,f.rival],[{id:'respawn-1',kind:'respawn',x:10,y:53,targetId:'fx-hero',team:'blue',ttl:.7}]);});
    await page.waitForTimeout(170);
    await page.screenshot({path:info.outputPath('respawn.png')});
    await expect.poll(()=>page.evaluate(()=>window.fxFixture.stats().effects.active)).toBe(0);
    expect(errors).toEqual([]);
  }finally{await page.evaluate(()=>window.fxFixture.close());}
});
