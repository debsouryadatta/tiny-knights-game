import {test,expect} from '@playwright/test';

test('terrain and minimap survive a 2048px canvas limit and context recovery',async({page},info)=>{
  test.skip(info.project.name!=='mobile-landscape');
  await page.addInitScript(()=>{
    const proto=HTMLCanvasElement.prototype;
    for(const key of ['width','height']){
      const descriptor=Object.getOwnPropertyDescriptor(proto,key);
      Object.defineProperty(proto,key,{...descriptor,set(value){
        if(value>2048)throw new Error(`Test device canvas limit: ${key}=${value}`);
        descriptor.set.call(this,value);
      }});
    }
  });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(()=>window.realm?.state.ready);
  await page.locator('input[name="room"]').fill(`MEM${Date.now().toString(36)}`);
  await page.locator('#join').click();
  await page.waitForFunction(()=>window.realm?.state.connected&&window.realm.state.playerId);
  await expect.poll(()=>page.evaluate(()=>window.realm.state.renderer.terrainChunks)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.realm.state.renderer.terrainChunks)).toBeLessThanOrEqual(12);
  expect(await page.evaluate(()=>window.realm.state.renderer.canvasPixels)).toBeLessThanOrEqual(1503000);
  const colored=()=>page.evaluate(()=>{
    const canvas=document.querySelector('#minimap'),g=canvas.getContext('2d');
    const pixels=g.getImageData(0,0,canvas.width,canvas.height).data;
    let terrain=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]>70&&pixels[i+1]>pixels[i]*1.05)terrain++;
    return terrain;
  });
  await expect.poll(colored).toBeGreaterThan(500);
  await page.evaluate(()=>document.querySelector('#game').dispatchEvent(new Event('contextlost',{cancelable:true})));
  expect(await page.evaluate(()=>window.realm.state.ready)).toBe(false);
  await page.evaluate(()=>document.querySelector('#game').dispatchEvent(new Event('contextrestored')));
  await expect.poll(()=>page.evaluate(()=>window.realm.state.ready)).toBe(true);
  await expect.poll(colored).toBeGreaterThan(500);
  await page.screenshot({path:'tests/mobile-rendering-verified.png'});
  expect(errors).toEqual([]);
});

test('public tunnel serves the chunk renderer and a colored mobile battlefield',async({browser},info)=>{
  test.skip(info.project.name!=='mobile-landscape');
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,extraHTTPHeaders:{'ngrok-skip-browser-warning':'true'}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('https://tops-still-basilisk.ngrok-free.app/');
    await page.waitForFunction(()=>window.realm?.state.ready,undefined,{timeout:30000});
    await page.locator('input[name="room"]').fill(`TUN${Date.now().toString(36)}`);
    await page.locator('#join').click();
    await page.waitForFunction(()=>window.realm?.state.connected&&window.realm.state.playerId);
    await expect.poll(()=>page.evaluate(()=>window.realm.state.renderer.terrainChunks)).toBeGreaterThan(0);
    expect(await page.evaluate(()=>window.realm.state.renderer.terrainChunks)).toBeLessThanOrEqual(12);
    const colored=await page.evaluate(()=>{
      const c=document.querySelector('#game'),g=c.getContext('2d'),p=g.getImageData(0,0,c.width,c.height).data;
      let colored=0;for(let i=0;i<p.length;i+=4)if(p[i]>40&&p[i+1]>60)colored++;
      return colored/(p.length/4);
    });
    expect(colored).toBeGreaterThan(.2);
    await page.screenshot({path:'tests/mobile-tunnel-rendering-verified.png'});
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
