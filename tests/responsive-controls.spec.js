import {test,expect} from '@playwright/test';

const sizes=[[1600,720],[844,390],[390,844]];
const controls=['#joystick','#map-button','#sound','#grid-toggle','#fullscreen','#help','#companion-toggle',
  '[data-action="attack"]','[data-slot="1"]','[data-slot="2"]','[data-slot="3"]',
  '[data-action="recall"]','[data-action="regen"]','[data-action="gather"]','[data-action="build"]'];

for(const [width,height] of sizes)test(`touch HUD has usable non-overlapping targets at ${width}x${height}`,async({browser},info)=>{
  test.skip(info.project.name!=='desktop');
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4177/');
    await page.waitForFunction(()=>window.realm?.state.ready);
    await page.locator('input[name="room"]').fill(`HUD${Date.now().toString(36)}`);
    await page.locator('#create-room').click();
    await page.locator('#lobby-start').click();
    await expect(page.locator('#join-screen')).toBeHidden();
    const boxes=await page.evaluate(selectors=>selectors.map(selector=>{
      const el=document.querySelector(selector),r=el.getBoundingClientRect();
      return {selector,x:r.x,y:r.y,width:r.width,height:r.height};
    }),controls);
    for(const b of boxes){
      expect(b.width,`${b.selector} width`).toBeGreaterThanOrEqual(44);
      expect(b.height,`${b.selector} height`).toBeGreaterThanOrEqual(44);
      expect(b.x,`${b.selector} left`).toBeGreaterThanOrEqual(0);
      expect(b.y,`${b.selector} top`).toBeGreaterThanOrEqual(0);
      expect(b.x+b.width,`${b.selector} right`).toBeLessThanOrEqual(width+1);
      expect(b.y+b.height,`${b.selector} bottom`).toBeLessThanOrEqual(height+1);
    }
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j];
      const overlap=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1;
      expect(overlap,`${a.selector} overlaps ${b.selector}`).toBe(false);
    }
    const labels=await page.locator('.skill-name').evaluateAll(els=>els.map(el=>{
      const r=el.getBoundingClientRect();return {name:el.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom};
    }));
    for(const l of labels){
      expect(l.x,`${l.name} clipped left`).toBeGreaterThanOrEqual(0);
      expect(l.right,`${l.name} clipped right`).toBeLessThanOrEqual(width);
      expect(l.bottom,`${l.name} clipped bottom`).toBeLessThanOrEqual(height);
      for(const b of boxes.filter(b=>!b.selector.startsWith('[data-slot'))){
        const overlap=Math.min(l.right,b.x+b.width)-Math.max(l.x,b.x)>1&&Math.min(l.bottom,b.y+b.height)-Math.max(l.y,b.y)>1;
        expect(overlap,`${l.name} label overlaps ${b.selector}`).toBe(false);
      }
    }
    const economyLabels=await page.locator('.economy-actions span').evaluateAll(els=>els.map(el=>{
      const r=el.getBoundingClientRect();return {name:el.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom};
    }));
    for(const selector of ['.room-strip','.resource-bank']){
      const b=await page.locator(selector).boundingBox();
      for(const l of economyLabels){
        const overlap=Math.min(l.right,b.x+b.width)-Math.max(l.x,b.x)>1&&Math.min(l.bottom,b.y+b.height)-Math.max(l.y,b.y)>1;
        expect(overlap,`${l.name} label overlaps ${selector}`).toBe(false);
      }
    }
    await page.screenshot({path:info.outputPath(`responsive-controls-${width}x${height}.png`)});
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
