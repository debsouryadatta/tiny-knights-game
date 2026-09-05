import {test,expect} from '@playwright/test';

test('scenery culling is pixel identical to drawing the full pack scene',async({page},info)=>{
  test.skip(info.project.name!=='desktop','Raster equivalence is viewport independent.');
  await page.route('**/__pack-culling',route=>route.fulfill({contentType:'text/html',body:'<canvas></canvas>'}));
  await page.goto('/__pack-culling');
  const result=await page.evaluate(async()=>{
    const {objects,files,drawObject,getVisibleObjects}=await import('/src/world.js');
    const {loadAssets}=await import('/src/asset-loader.js');
    const images={};await loadAssets(Object.entries(files),images,{});
    const canvases=[0,1].map(()=>{const canvas=document.createElement('canvas');canvas.width=844;canvas.height=390;return canvas;});
    let pixelsDiffer=0;const counts=[];
    for(const [left,top]of [[600,1800],[1600,1700],[2600,600]]){
      const bounds={left,top,right:left+844,bottom:top+390};
      const clipped=getVisibleObjects(bounds,images);counts.push(clipped.length);
      for(let i=0;i<2;i++){
        const g=canvases[i].getContext('2d');g.clearRect(0,0,844,390);g.save();g.translate(-left,-top);
        for(const o of (i?clipped:[...objects]).sort((a,b)=>a.y-b.y))drawObject(g,images,o,0);
        g.restore();
      }
      const a=canvases[0].getContext('2d').getImageData(0,0,844,390).data,b=canvases[1].getContext('2d').getImageData(0,0,844,390).data;
      for(let i=0;i<a.length;i++)if(a[i]!==b[i])pixelsDiffer++;
    }
    return{pixelsDiffer,counts,total:objects.length};
  });
  expect(result.pixelsDiffer).toBe(0);
  expect(Math.max(...result.counts)).toBeLessThan(result.total/4);
});

test('pack scenery renders and river animates at play zoom',async({page},info)=>{
  test.skip(info.project.name==='mobile-portrait','Landscape art acceptance.');
  await page.route('**/__pack-visuals',route=>route.fulfill({contentType:'text/html',body:'<style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas id="scene"></canvas>'}));
  await page.goto('/__pack-visuals');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(async()=>{
    const {createRenderer}=await import('/src/renderer.js');
    const {createGame,addPlayer}=await import('/shared/simulation.ts');
    const state=createGame('ARTTEST',1);
    const id=addPlayer(state,{name:'Art QA',hero:'knight',companion:'guardian',size:1});
    const view={inspect:{x:32*64,y:32*64},tactical:false,grid:false};
    window.artView=view;
    window.artRenderer=createRenderer(document.querySelector('canvas'),{getState:()=>state,getPlayerId:()=>id,getView:()=>view});
    await window.artRenderer.ready;
  });
  await expect.poll(()=>page.evaluate(()=>window.artRenderer.getStats().ready)).toBe(true);
  await page.waitForTimeout(1800);
  const before=await page.locator('canvas').screenshot();
  await page.waitForTimeout(400);
  const after=await page.locator('canvas').screenshot();
  expect(before.equals(after)).toBe(false);
  await page.screenshot({path:`tests/pack-river-${info.project.name}.png`});
  await page.evaluate(()=>{window.artView.inspect={x:9*64,y:55*64};});
  await page.waitForTimeout(500);
  await page.screenshot({path:`tests/pack-shrine-${info.project.name}.png`});
  expect(errors).toEqual([]);
});
