import { enterPlayerName } from './helpers/player-name.js';
import {test,expect} from '@playwright/test';

const sizes=[[667,375],[740,360],[844,390],[932,430],[390,844],[320,568]];
const controls=['#joystick','#map-button','#sound','#grid-toggle','#fullscreen','#help','#companion-toggle',
  '[data-action="attack"]','[data-slot="1"]','[data-slot="2"]','[data-slot="3"]',
  '[data-action="recall"]','[data-action="regen"]','[data-action="gather"]','[data-action="build"]'];
const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
async function boxes(page,selectors){return page.evaluate(selectors=>selectors.map(selector=>{
  const element=document.querySelector(selector),r=element.getBoundingClientRect();
  return {selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
}),selectors);}
function within(box,width,height,label=box.selector){
  expect.soft(box.x,`${label} left`).toBeGreaterThanOrEqual(-1);
  expect.soft(box.y,`${label} top`).toBeGreaterThanOrEqual(-1);
  expect.soft(box.right,`${label} right`).toBeLessThanOrEqual(width+1);
  expect.soft(box.bottom,`${label} bottom`).toBeLessThanOrEqual(height+1);
}
async function reachable(page,selector,width,height){
  const locator=page.locator(selector);await locator.scrollIntoViewIfNeeded();
  const [box]=await boxes(page,[selector]);within(box,width,height);
  expect.soft(box.width,`${selector} touch width`).toBeGreaterThanOrEqual(44);
  expect.soft(box.height,`${selector} touch height`).toBeGreaterThanOrEqual(44);
  expect.soft(await locator.evaluate(el=>{
    const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return hit===el||el.contains(hit);
  }),`${selector} has an unobscured touch center`).toBe(true);
}
async function hudGeometry(page,width,height,label,insets={left:0,right:0,top:0,bottom:0}){
  const measured=await boxes(page,controls);
  for(const b of measured){within(b,width,height,`${label} ${b.selector}`);expect.soft(b.width,`${label} ${b.selector} width`).toBeGreaterThanOrEqual(44);expect.soft(b.height,`${label} ${b.selector} height`).toBeGreaterThanOrEqual(44);expect.soft(b.x,`${label} ${b.selector} left inset`).toBeGreaterThanOrEqual(insets.left-1);expect.soft(b.right,`${label} ${b.selector} right inset`).toBeLessThanOrEqual(width-insets.right+1);expect.soft(b.y,`${label} ${b.selector} top inset`).toBeGreaterThanOrEqual(insets.top-1);expect.soft(b.bottom,`${label} ${b.selector} bottom inset`).toBeLessThanOrEqual(height-insets.bottom+1);}
  for(let i=0;i<measured.length;i++)for(let j=i+1;j<measured.length;j++)expect.soft(overlaps(measured[i],measured[j]),`${label} ${measured[i].selector} overlaps ${measured[j].selector}`).toBe(false);
  const regions=await boxes(page,['.hero-panel','.companion','.bank','.utility','.room-strip','.resource-bank']);
  for(const region of regions)within(region,width,height,`${label} ${region.selector}`);
  for(const [a,b] of [[regions[0],regions[1]],[regions[2],regions[3]],[regions[0],regions[2]],[regions[1],regions[4]]])expect.soft(overlaps(a,b),`${label} ${a.selector} overlaps ${b.selector}`).toBe(false);
  for(const selector of ['.skill-name','.economy-actions span','#hero-name','#hero-class','#hp-value']){
    const labels=await page.locator(selector).evaluateAll(elements=>elements.filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {selector:el.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
    for(const box of labels)within(box,width,height,`${label} ${box.selector}`);
  }
  expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label} no horizontal page overflow`).toBe(true);
}

for(const [width,height] of sizes)test(`mobile draft, private lobby and combat remain usable at ${width}x${height}`,async({browser},info)=>{
  test.skip(info.project.name!=='desktop','Each test constructs its own mobile viewport.');
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(process.env.PLAYWRIGHT_BASE_URL||'http://localhost:4179');
    await page.waitForFunction(()=>window.realm?.state.ready);
    await page.locator('input[name="name"]').fill('Long Commander 123');
    for(const selector of ['input[name="name"]','[data-choice="hero"] button[data-value="knight"]','[data-choice="companion"] button[data-value="guardian"]','input[name="room"]','#join','#quick-play','#create-room'])await reachable(page,selector,width,height);
    await page.screenshot({path:info.outputPath('draft.png')});

    // A shortened visual viewport exercises form scrolling, not an actual OS keyboard.
    const keyboardHeight=Math.max(220,Math.floor(height*.55));
    await page.setViewportSize({width,height:keyboardHeight});
    await page.locator('input[name="room"]').fill('SCROLL12');
    for(const selector of ['input[name="room"]','#join','#quick-play','#create-room'])await reachable(page,selector,width,keyboardHeight);
    await page.screenshot({path:info.outputPath('keyboard-sized-draft.png')});
    await page.setViewportSize({width,height});
    await enterPlayerName(page);await page.locator('#create-room').click();
    await expect(page.locator('#waiting-lobby')).toBeVisible();
    if(await page.locator('.mobile-play-prompt').isVisible())await page.locator('#mobile-play-dismiss').click();
    for(const selector of ['#lobby-copy','#lobby-start','#lobby-leave'])await reachable(page,selector,width,height);
    await expect(page.locator('#lobby-roster')).toContainText('Long Commander 123');
    await page.screenshot({path:info.outputPath('waiting-lobby.png')});
    await page.locator('#lobby-start').click();
    await expect(page.locator('#join-screen')).toBeHidden();
    await page.waitForFunction(()=>window.realm?.match?.actors.some(a=>a.id===window.realm.state.playerId));
    await hudGeometry(page,width,height,'standard');
    const statusOverlap=await page.evaluate(()=>{
      const feedback=document.querySelector('#combat-feedback'),text=feedback.textContent,hidden=feedback.hidden;
      feedback.textContent='Fountain healing · restoring health';feedback.hidden=false;
      const hero=document.querySelector('.hero-panel').getBoundingClientRect(),companion=document.querySelector('.companion').getBoundingClientRect();
      const overlap=Math.min(hero.right,companion.right)-Math.max(hero.left,companion.left)>1&&Math.min(hero.bottom,companion.bottom)-Math.max(hero.top,companion.top)>1;
      feedback.textContent=text;feedback.hidden=hidden;return overlap;
    });
    expect.soft(statusOverlap,'Expanded fountain status does not overlap companion').toBe(false);
    await page.screenshot({path:info.outputPath('combat.png')});
    await page.locator('#companion-toggle').click();
    for(const order of ['gather','escort','attack','defend'])await reachable(page,`[data-order="${order}"]`,width,height);
    await page.locator('[data-order="escort"]').click();

    await page.locator('#help').click();
    await expect(page.locator('#help-dialog')).toBeVisible();
    for(const selector of ['#help-dialog .close','#ambience-volume','#sfx-volume','#leave','#resume'])await reachable(page,selector,width,height);
    await page.screenshot({path:info.outputPath('help-dialog.png')});
    await page.locator('#resume').click();
    await expect(page.locator('#help-dialog')).toBeHidden();

    // CSS variables are a reproducible inset simulation, not hardware notch detection.
    const insets=width>height?{left:44,right:44,top:0,bottom:21}:{left:0,right:0,top:24,bottom:21};
    await page.evaluate(insets=>{for(const [edge,value] of Object.entries(insets))document.documentElement.style.setProperty(`--safe-${edge}`,`${value}px`);},insets);
    await hudGeometry(page,width,height,'simulated safe area',insets);
    await page.locator('[data-action="recall"]').click();
    await expect(page.locator('#cast-status')).toContainText('Recalling');
    const [cast,...neighbors]=await boxes(page,['#cast-status','.companion','.bank','.utility']);
    within(cast,width,height,'recall status');
    for(const neighbor of neighbors)expect.soft(overlaps(cast,neighbor),`Recall status overlaps ${neighbor.selector}`).toBe(false);
    await page.screenshot({path:info.outputPath('safe-area-combat.png')});
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
