import {test,expect} from '@playwright/test';

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
