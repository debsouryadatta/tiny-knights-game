import { enterPlayerName } from './helpers/player-name.js';
import {test,expect} from '@playwright/test';

test('bot button starts a match immediately without selecting human-only waiting',async({page})=>{
 await page.goto('/');await enterPlayerName(page);await page.locator('#quick-play').click();
 await expect(page.locator('#quick-queue')).toBeVisible();
 if(await page.locator('.mobile-play-prompt').isVisible())await page.locator('#mobile-play-dismiss').click();
 await expect(page.locator('#quick-countdown')).toContainText('until remaining seats use bots');
 await expect(page.locator('#quick-bot')).toBeVisible();
 await page.locator('#quick-bot').click();
 await expect(page.locator('#join-screen')).toBeHidden({timeout:5000});
 expect(await page.evaluate(()=>window.realm.match.actors.some(a=>a.kind==='hero'&&a.bot))).toBe(true);
});

test('live offer refresh removes every stale game and preserves focused choices',async({page})=>{
 await page.route('**/src/main.js',route=>route.fulfill({contentType:'application/javascript',body:''}));await page.goto('/');
 await page.evaluate(async()=>{
 const {createUI}=await import('/src/ui.js');const {createGame,addPlayer}=await import('/shared/simulation.ts');
 const state=createGame('QUEUE'),playerId=addPlayer(state,{name:'QA',hero:'knight',companion:'guardian',size:1});
 const client={status:'connected',state,roster:[{playerId,online:true}],command(){},lobby:{started:false,publicMatch:true,hostPlayerId:playerId,readyPlayers:'[]'},quickQueue:{humanOnly:true,deadlineMicros:0n},quickOffers:['A','B','C'].map(room=>({room,blueScore:2,redScore:1,elapsed:50,side:'red'}))};
 const audio={getStats:()=>({enabled:true}),subscribe:()=>()=>{}};const ui=createUI({client,audio});
 const update=()=>ui.update(state,{playerId,room:'QUEUE'},'connected');update();window.queueFixture={client,update};
 });
 await expect(page.locator('.quick-offer')).toHaveCount(3);await page.screenshot({path:test.info().outputPath('queue-offers.png')});await page.locator('.quick-offer[data-room="C"] button').focus();
 await page.evaluate(()=>{window.queueFixture.client.quickOffers=window.queueFixture.client.quickOffers.slice(2);window.queueFixture.update();});
 await expect(page.locator('.quick-offer')).toHaveCount(1);await expect(page.locator('.quick-offer button')).toBeFocused();
 await page.evaluate(()=>{window.queueFixture.client.quickOffers=[];window.queueFixture.update();});
 await expect(page.locator('.quick-offer')).toHaveCount(0);await expect(page.locator('#quick-offers')).toContainText('No open games');
});

test('Quick Play offers explicit mid-game consent, human-only waiting, and bot fallback',async({browser,baseURL},info)=>{
 test.setTimeout(150000);
 test.skip(info.project.name!=='desktop');
 const contexts=[];
 const newPlayer=async()=>{const context=await browser.newContext({baseURL,viewport:{width:844,height:390},isMobile:true,hasTouch:true});contexts.push(context);const page=await context.newPage();await page.goto('/');return page;};
 try{
  const first=await newPlayer();await enterPlayerName(first);await first.locator('#quick-play').click();if(await first.locator('.mobile-play-prompt').isVisible())await first.locator('#mobile-play-dismiss').click();
  await expect(first.locator('#quick-queue')).toBeVisible();await expect(first.locator('#quick-countdown')).toContainText('until remaining seats use bots');
  await expect(first.locator('#quick-countdown')).toContainText(/(?:5\d|60)s/);
  await expect(first.locator('#join-screen')).toBeHidden({timeout:65000});
  const originalRoom=await first.evaluate(()=>window.realm.state.room);
  const second=await newPlayer();await enterPlayerName(second);await second.locator('#quick-play').click();if(await second.locator('.mobile-play-prompt').isVisible())await second.locator('#mobile-play-dismiss').click();
  await expect(second.locator('#quick-queue')).toBeVisible();
  const offer=second.locator(`.quick-offer[data-room="${originalRoom}"]`);
  await expect(offer).toContainText(/Blue \d+ – \d+ Red/);
  await second.locator('#quick-wait').click();await expect(second.locator('#quick-countdown')).toContainText('Waiting for humans');
  await expect(second.locator('#quick-bot')).toBeVisible();
  await second.waitForTimeout(61000);await expect(second.locator('#quick-queue')).toBeVisible();
  await offer.locator('button').click();await expect(second.locator('#join-screen')).toBeHidden();
  expect(await second.evaluate(()=>window.realm.state.room)).toBe(originalRoom);
  await expect(second.locator('#blue-score')).toHaveAttribute('aria-label',/hero kills: \d+ of 21/);
  const third=await newPlayer();await enterPlayerName(third);await third.locator('#quick-play').click();if(await third.locator('.mobile-play-prompt').isVisible())await third.locator('#mobile-play-dismiss').click();await expect(third.locator('#quick-queue')).toBeVisible();
  await third.locator('#quick-wait').click();await third.locator('#quick-bot').click();await expect(third.locator('#join-screen')).toBeHidden();
 }finally{for(const context of contexts)await context.close();}
});

test('waiting humans pair automatically and queue controls fit phone portrait',async({browser,baseURL},info)=>{
 test.skip(info.project.name!=='desktop');
 const a=await browser.newContext({baseURL,viewport:{width:390,height:844},isMobile:true,hasTouch:true}),b=await browser.newContext({baseURL});
 try{
 const first=await a.newPage(),second=await b.newPage();await first.goto('/');await second.goto('/');
 await enterPlayerName(first);await first.locator('#quick-play').click();if(await first.locator('.mobile-play-prompt').isVisible())await first.locator('#mobile-play-dismiss').click();await expect(first.locator('#quick-queue')).toBeVisible();await first.locator('#quick-wait').click();
 await expect(first.locator('#quick-bot')).toBeVisible();
 const overflow=await first.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);
 for(const selector of ['#quick-bot','#lobby-leave']){const box=await first.locator(selector).boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);}
 await enterPlayerName(second);await second.locator('#quick-play').click();if(await second.locator('.mobile-play-prompt').isVisible())await second.locator('#mobile-play-dismiss').click();await expect(first.locator('#join-screen')).toBeHidden();await expect(second.locator('#join-screen')).toBeHidden();
 expect(await second.evaluate(()=>window.realm.state.room)).toBe(await first.evaluate(()=>window.realm.state.room));
 }finally{await a.close();await b.close();}
});
