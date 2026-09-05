import {test,expect} from '@playwright/test';

// Real simulation, UI and renderer; main/network are deliberately not started.
// These deterministic fixtures never create or mutate a remote database room.
async function fixture(page){
  await page.route('**/src/main.js',route=>route.fulfill({contentType:'application/javascript',body:''}));
  await page.goto('/');
  await page.evaluate(async()=>{
    await import('/src/combat-polish.css');
    const {createGame,addPlayer,applyCommand,stepGame}=await import('/shared/simulation.ts');
    const {createUI}=await import('/src/ui.js');
    const {createRenderer}=await import('/src/renderer.js');
    let state=createGame('LOCAL-FIXTURE');
    const id=addPlayer(state,{name:'Progression hero',hero:'knight',companion:'guardian',size:1});
    state.actors=state.actors.filter(a=>a.id===id);state.structures=[];state.resources=[];state.bank.blue={wood:800,gold:400};
    const session={playerId:id,room:state.room,token:'local-only'};
    const actor=()=>state.actors.find(a=>a.id===id);
    let ui;
    const publish=()=>{state={...state};ui.update(state,session,'connected');};
    const command=c=>{const result=applyCommand(state,id,c);publish();return result;};
    const client={status:'connected',lobby:{started:true},command};
    const audio={getStats:()=>({enabled:true,busy:false}),subscribe:()=>()=>{},toggle:async()=>{},setVolume:()=>{}};
    ui=createUI({client,audio});ui.setReady(true);publish();
    const renderer=createRenderer(document.querySelector('#game'),{getState:()=>state,getPlayerId:()=>id,getView:()=>ui.getView()});
    await renderer.ready;
    const g=document.querySelector('#game').getContext('2d'),originalText=g.fillText.bind(g),texts=[];
    g.fillText=(text,...args)=>{texts.push(String(text));if(texts.length>500)texts.splice(0,250);return originalText(text,...args);};
    const step=seconds=>{for(let i=0;i<Math.round(seconds*10);i++)stepGame(state,.1);publish();};
    window.issueFixture={
      state:()=>state,actor,command,step,texts,
      change(values){Object.assign(actor(),values);publish();},
      roundtrip(){state=JSON.parse(JSON.stringify(state));publish();},
      kill(kind,bot=false){
        const a=actor();a.cooldown=0;a.protectedUntil=0;
        const target={...a,id:`victim-${a.kills}`,kind,team:'red',x:a.x+1,y:a.y,hp:1,maxHp:kind==='hero'?660:180,bot:false,buildChannel:undefined};
        state.actors.push(target);
        if(bot){a.bot=true;stepGame(state,.1);a.bot=false;}else applyCommand(state,id,{type:'attack',targetId:target.id});
        state.actors=state.actors.filter(other=>other.id!==target.id);publish();return target.hp;
      },
      build(){texts.length=0;return command({type:'build',x:13,y:53});},
      stop(){renderer.destroy();ui.destroy();},
    };
  });
  await expect(page.locator('#join-screen')).toBeHidden();
}

test('#15 kill progression appears in HUD and survives a snapshot round-trip',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
  await expect(page.locator('#hero-class')).toHaveText('knight · Lv 1');
  await expect(page.locator('#hero-class')).toBeVisible();
  expect(await page.evaluate(()=>window.issueFixture.kill('creep'))).toBe(0);
  expect(await page.evaluate(()=>window.issueFixture.actor().xp)).toBe(25);
  await expect(page.locator('#kills')).toHaveText('1 defeats');
  expect(await page.evaluate(()=>window.issueFixture.kill('hero'))).toBe(0);
  await expect(page.locator('#hero-class')).toHaveText('knight · Lv 2');
  await expect(page.locator('#kills')).toHaveText('2 defeats');
  // Portrait folds personal defeats into the always-visible 1v1 scoreboard.
  await expect(page.locator('#blue-score')).toHaveText('1');
  await expect(page.locator('#blue-score')).toBeVisible();
  expect(await page.evaluate(()=>window.issueFixture.actor().maxHp)).toBeGreaterThan(660);
  await page.evaluate(()=>window.issueFixture.roundtrip());
  await expect(page.locator('#hero-class')).toHaveText('knight · Lv 2');
  expect(await page.evaluate(()=>window.issueFixture.actor().xp)).toBe(125);
  expect(await page.evaluate(()=>window.issueFixture.kill('hero',true))).toBe(0);
  expect(await page.evaluate(()=>window.issueFixture.actor().xp)).toBe(225);
  await page.screenshot({path:info.outputPath('level-and-defeats.png')});
  expect(errors).toEqual([]);
});

test('thin XP bar tracks this level, resets on level-up and fills at cap',async({page},info)=>{
  await fixture(page);
  const bar=page.locator('#xp-progress');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-valuenow','0');
  await page.evaluate(()=>window.issueFixture.kill('creep'));
  await expect(bar).toHaveAttribute('aria-valuenow','25');
  await expect(bar).toHaveAttribute('aria-valuetext','75 XP to level 2');
  await page.evaluate(()=>window.issueFixture.change({level:2,xp:100}));
  await expect(bar).toHaveAttribute('aria-valuenow','0');
  await page.evaluate(()=>window.issueFixture.change({level:2,xp:170}));
  await expect(bar).toHaveAttribute('aria-valuenow','50');
  expect(await page.locator('#xp-bar').evaluate(el=>getComputedStyle(el).transform)).toBe('matrix(0.5, 0, 0, 1, 0, 0)');
  const box=await bar.boundingBox();expect(box.height).toBe(2);expect(box.width).toBeGreaterThan(80);
  await page.screenshot({path:info.outputPath('xp-progress.png')});
  await page.evaluate(()=>{window.issueFixture.roundtrip();});
  await expect(bar).toHaveAttribute('aria-valuenow','50');
  await page.evaluate(()=>window.issueFixture.change({level:10,xp:2340}));
  await expect(bar).toHaveAttribute('aria-valuenow','100');
  await expect(bar).toHaveAttribute('aria-valuetext','Maximum level');
});

test('21st hero kill ends the match with the correct score and result',async({page},info)=>{
  await fixture(page);
  await page.evaluate(()=>{window.issueFixture.state().heroScore={blue:20,red:7};window.issueFixture.kill('hero');});
  await expect(page.locator('#blue-score')).toHaveText('21');
  await expect(page.locator('#red-score')).toHaveText('7');
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#result-body')).toContainText('reaching 21 hero kills');
  expect(await page.evaluate(()=>window.issueFixture.state().winner)).toBe('blue');
  await page.screenshot({path:info.outputPath('21-kill-victory.png')});
});

test('#16 fountain status and heal effects follow allied ground while Regen remains independent',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
  await page.evaluate(()=>{window.issueFixture.change({hp:100,x:10,y:53});window.issueFixture.step(.5);});
  await expect(page.locator('#combat-feedback')).toHaveText('Fountain healing · restoring health');
  expect(await page.evaluate(()=>window.issueFixture.actor().hp)).toBeGreaterThan(100);
  expect(await page.evaluate(()=>window.issueFixture.state().effects.some(e=>e.kind==='heal'))).toBe(true);
  await expect(page.locator('[data-action="regen"]')).toBeEnabled();
  await page.screenshot({path:info.outputPath('fountain.png')});
  const hp=await page.evaluate(()=>window.issueFixture.actor().hp);
  await page.evaluate(()=>{window.issueFixture.change({x:20,y:39});window.issueFixture.step(.2);});
  await expect(page.locator('#combat-feedback')).not.toContainText('Fountain');
  expect(await page.evaluate(()=>window.issueFixture.actor().hp)).toBe(hp);
  await page.locator('[data-action="regen"]').click();
  expect(await page.evaluate(()=>window.issueFixture.actor().hp)).toBeGreaterThan(hp);
  await expect(page.locator('[data-action="regen"]')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('#17 construction ghost counts down, refunds on cancel and becomes one tower',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
  expect(await page.evaluate(()=>window.issueFixture.build())).toEqual({ok:true});
  await expect(page.locator('#cast-status')).toContainText('Building tower');
  await expect(page.locator('#cast-status')).toContainText('2.5s');
  expect(await page.evaluate(()=>window.issueFixture.state().structures.length)).toBe(0);
  expect(await page.evaluate(()=>window.issueFixture.state().bank.blue.wood)).toBe(720);
  await expect.poll(()=>page.evaluate(()=>window.issueFixture.texts.includes('Building 2.5s'))).toBe(true);
  await page.screenshot({path:info.outputPath('tower-ghost.png')});
  await page.evaluate(()=>window.issueFixture.step(1));
  await expect(page.locator('#cast-status')).toContainText('1.5s');
  await page.locator('[data-action="recall"]').click();
  expect(await page.evaluate(()=>window.issueFixture.actor().buildChannel)).toBeUndefined();
  expect(await page.evaluate(()=>window.issueFixture.state().bank.blue.wood)).toBe(800);
  await expect(page.locator('#cast-status')).toContainText('Recalling');
  expect(await page.evaluate(()=>window.issueFixture.build())).toEqual({ok:true});
  await page.evaluate(()=>{window.issueFixture.roundtrip();window.issueFixture.step(2.5);window.issueFixture.texts.length=0;});
  await expect(page.locator('#cast-status')).toBeHidden();
  expect(await page.evaluate(()=>window.issueFixture.state().structures.length)).toBe(1);
  expect(await page.evaluate(()=>window.issueFixture.state().bank.blue)).toEqual({wood:720,gold:360});
  await page.waitForTimeout(100);
  expect(await page.evaluate(()=>window.issueFixture.texts.some(text=>text.startsWith('Building ')))).toBe(false);
  await page.screenshot({path:info.outputPath('tower-complete.png')});
  expect(errors).toEqual([]);
});
