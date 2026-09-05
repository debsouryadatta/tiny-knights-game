import {test,expect} from '@playwright/test';

test('Credits sits top-right and mobile prompt waits for valid entry actions',async({page},info)=>{
  for(const mode of ['quick-play','create-room','join']){
    await page.goto('/');
    await expect(page.locator('.mobile-play-prompt')).toBeHidden();
    const credits=page.getByRole('link',{name:'Credits',exact:true});
    const box=await credits.boundingBox();const viewport=page.viewportSize();
    expect(box.x+box.width).toBeGreaterThan(viewport.width-40);expect(box.y).toBeLessThan(40);
    await page.locator('#'+mode).click();
    await expect(page.locator('.mobile-play-prompt')).toBeHidden();
    await page.locator('input[name="name"]').fill('Entry tester');
    if(mode==='join')await page.locator('input[name="room"]').fill('ENTRYTEST');
    await page.locator('#'+mode).click();
    if(info.project.name==='desktop')await expect(page.locator('.mobile-play-prompt')).toBeHidden();
    else {
      await expect(page.locator('.mobile-play-prompt')).toBeVisible();
      await page.locator('#mobile-play-dismiss').click();
      await expect(page.locator('.mobile-play-prompt')).toBeHidden();
    }
  }
});

test('iPhone Home Screen guide and installed mode',async({page},info)=>{
  test.skip(info.project.name==='desktop');
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});
    Element.prototype.requestFullscreen=undefined;
  });
  await page.goto('/');
  await expect(page.locator('.mobile-play-prompt')).toBeVisible();
  await expect(page.locator('#mobile-play-start')).toHaveText('Add to Home Screen');
  await page.locator('#mobile-play-start').click();
  await expect(page.getByRole('dialog')).toContainText('Open as Web App');
  await expect(page.getByRole('dialog')).toContainText('Internet is required');
  await page.getByRole('button',{name:'Got it',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.mobile-play-prompt')).toBeHidden();
  await page.locator('input[name="name"]').fill('iPhone tester');
  await page.locator('#create-room').click();
  await page.locator('#lobby-start').click();
  await expect(page.locator('#join-screen')).toBeHidden();
  await page.locator('#fullscreen').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.locator('#install-guide').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.getByRole('button',{name:'Got it',exact:true}).click();
  await expect(page.locator('#join-screen')).toBeHidden();
  await page.evaluate(()=>{Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>true});});
  await page.setViewportSize({width:844,height:390});
  await page.evaluate(()=>dispatchEvent(new Event('resize')));
  await expect(page.locator('.mobile-play-prompt')).toBeHidden();
  expect(await page.evaluate(async()=> (await import('/src/fullscreen.js')).enterFullscreen())).toBe('standalone');
  await page.evaluate(()=>{Object.defineProperty(navigator,'standalone',{get:()=>false});const original=window.matchMedia;window.matchMedia=q=>q==='(display-mode: standalone)'?{matches:true}:original(q);});
  expect(await page.evaluate(async()=> (await import('/src/fullscreen.js')).enterFullscreen())).toBe('standalone');
});

test('iPhone landing prompt can be dismissed and stays hidden when installed',async({page},info)=>{
  test.skip(info.project.name==='desktop');
  await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'}));
  await page.goto('/');
  await expect(page.locator('.mobile-play-prompt')).toBeVisible();
  await page.locator('#mobile-play-dismiss').click();
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.mobile-play-prompt')).toBeHidden();
  await page.reload();
  await expect(page.locator('.mobile-play-prompt')).toBeVisible();
  await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{get:()=>true}));
  await page.reload();
  await expect(page.locator('.mobile-play-prompt')).toBeHidden();
});

test('Home Screen manifest and app icons are served',async({request})=>{
  const response=await request.get('/manifest.webmanifest');expect(response.ok()).toBe(true);
  const manifest=await response.json();expect(manifest.display).toBe('standalone');expect(manifest.start_url).toBe('/');
  for(const path of ['/icons/apple-touch-icon.png',...manifest.icons.map(i=>i.src)]){
    const icon=await request.get(path);expect(icon.ok()).toBe(true);expect(icon.headers()['content-type']).toContain('image/png');
  }
  const html=await (await request.get('/')).text();expect(html).toContain('apple-mobile-web-app-capable');
});

test('mobile landscape prompt uses a gesture and handles unsupported fullscreen',async({page},info)=>{
  test.skip(info.project.name==='desktop');
  await page.addInitScript(()=>{
    window.fullscreenRequests=0;
    Element.prototype.requestFullscreen=async()=>{window.fullscreenRequests++;throw new Error('Unsupported');};
  });
  await page.goto('/');
  await expect(page.locator('.mobile-play-prompt')).toBeHidden();
  await page.locator('input[name="name"]').fill('Rotate tester');
  await page.locator('#create-room').click();
  await expect(page.locator('.mobile-play-prompt')).toBeVisible();
  expect(await page.evaluate(()=>window.fullscreenRequests)).toBe(0);
  await page.locator('#mobile-play-start').click();
  expect(await page.evaluate(()=>window.fullscreenRequests)).toBe(1);
  await expect(page.locator('#mobile-play-tip')).toContainText('Rotate your device');
  await page.locator('#mobile-play-dismiss').click();
  await expect(page.locator('.mobile-play-prompt')).toBeHidden();
  await expect(page.locator('#waiting-lobby')).toBeVisible();
});

test('supported mobile APIs request fullscreen then landscape, and rotation clears prompt',async({page},info)=>{
  test.skip(info.project.name==='desktop');
  await page.addInitScript(()=>{
    window.mobileCalls=[];
    Element.prototype.requestFullscreen=async()=>{window.mobileCalls.push('fullscreen');Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>document.documentElement});};
    Object.defineProperty(screen,'orientation',{configurable:true,value:{lock:async mode=>{window.mobileCalls.push(mode);}}});
  });
  await page.goto('/');await page.locator('input[name="name"]').fill('Fullscreen tester');await page.locator('#create-room').click();await page.locator('#mobile-play-start').click();
  expect(await page.evaluate(()=>window.mobileCalls)).toEqual(['fullscreen','landscape']);
  await page.setViewportSize({width:844,height:390});
  await expect(page.locator('.mobile-play-prompt')).toBeHidden();
});

test('Tiny Knights branding and share artwork are present in crawler-readable HTML',async({page,request})=>{
  for(const path of ['/','/credits.html','/explore.html']){
    const response=await request.get(path);expect(response.ok()).toBe(true);
    const html=await response.text();expect(html).not.toContain('Little Realm');
    expect(html).toContain('property="og:image" content="https://tinyknights.fun/art/duel-lobby.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('property="og:site_name" content="Tiny Knights"');
  }
  await page.goto('/');await expect(page).toHaveTitle('Tiny Knights');
  await expect(page.locator('#draft .wordmark')).toContainText('TINY KNIGHTS');
  const image=await request.get('/art/duel-lobby.png');expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/png');
});

test('empty names are rejected; landing counter updates only after starting a game',async({page,browser,baseURL},info)=>{
  await page.goto('/');
  const name=page.locator('input[name="name"]');
  await expect(name).toHaveValue('');
  await expect(page.locator('#games-played')).toHaveText(/^[\d,]+ games played$/);
  const count=()=>page.locator('#games-played').innerText().then(s=>BigInt(s.replace(/[^\d]/g,'')));
  const initial=await count();
  expect(initial).toBeGreaterThanOrEqual(100n);
  await page.locator('#quick-play').click();
  await expect(page.locator('#join-error')).toContainText('Enter your name');
  await expect(page.locator('#waiting-lobby')).toBeHidden();
  await name.fill('   ');await page.locator('#create-room').click();
  await expect(page.locator('#join-error')).toContainText('Enter your name');
  const context=await browser.newContext({baseURL});
  try{
    const player=await context.newPage();await player.goto('/');
    await player.locator('input[name="name"]').fill('Counter tester');
    await player.locator('#create-room').click();
    await expect(player.locator('#waiting-lobby')).toBeVisible();
    if(await player.locator('.mobile-play-prompt').isVisible())await player.locator('#mobile-play-dismiss').click();
    expect(await count()).toBe(initial);
    await player.locator('#lobby-start').click();
    await expect(player.locator('#join-screen')).toBeHidden();
    await expect.poll(count).toBe(initial+1n);
    await page.reload();await expect(name).toHaveValue('');
    await expect.poll(count).toBe(initial+1n);
    await page.screenshot({path:info.outputPath('landing.png')});
  }finally{await context.close();}
});

test('favicon and credits load with correct attribution and builder links',async({page,request},info)=>{
  await page.goto('/');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href','/favicon.svg');
  const icon=await request.get('/favicon.svg');expect(icon.ok()).toBe(true);expect(await icon.text()).toContain('<svg');
  await page.getByRole('link',{name:'Credits',exact:true}).click();
  await expect(page).toHaveURL(/\/credits.html$/);
  await expect(page.getByRole('heading',{name:'Built by'})).toBeVisible();
  for(const href of ['https://x.com/debsourya005','https://x.com/khichdiNcode','https://github.com/debsouryadatta','https://github.com/qKitNp','https://heltonyan.itch.io/pixelcombat','https://creativecommons.org/licenses/by/4.0/'])await expect(page.locator(`a[href="${href}"]`)).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('credits.png'),fullPage:true});
  await page.getByRole('link',{name:'Back to Tiny Knights'}).click();
  await expect(page.locator('#draft')).toBeVisible();
});
