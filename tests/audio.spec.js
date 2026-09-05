import {test,expect} from '@playwright/test';

test('all shipped clips decode to finite non-silent audio without clipping',async({page})=>{
 await page.goto('/');
 const clips=await page.evaluate(async()=>{
  const {sounds}=await import('/src/audio/config.js');
  const context=new OfflineAudioContext(1,44100,44100);
  return Promise.all(Object.entries(sounds).map(async([name,spec])=>{
   const response=await fetch('/audio/'+encodeURIComponent(spec.file));
   if(!response.ok)throw new Error(`Missing clip: ${name}`);
   const buffer=await context.decodeAudioData(await response.arrayBuffer());
   const samples=buffer.getChannelData(0);
   let peak=0,energy=0;
   for(const sample of samples){peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}
   return {name,duration:buffer.duration,peak,rms:Math.sqrt(energy/samples.length)};
  }));
 });
 expect(clips).toHaveLength(7);
 for(const clip of clips){
  expect(clip.duration,clip.name).toBeGreaterThan(.1);
  expect(clip.duration,clip.name).toBeLessThan(3);
  expect(clip.peak,clip.name).toBeLessThan(1);
  expect(clip.rms,clip.name).toBeGreaterThan(.001);
 }
});

test('failed clip downloads report an error and keep mute usable',async({page})=>{
 await page.route('**/audio/*.wav',route=>route.abort());
 await page.goto('/');
 await expect(page.locator('#sound')).toBeAttached();
 await page.evaluate(()=>{document.body.classList.remove('join-active');document.querySelector('#join-screen').remove();});
 await page.locator('#sound').click();
 await expect.poll(()=>page.evaluate(()=>window.realm.audio.error)).toContain('unavailable');
 await page.locator('#sound').click();
 await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','false');
});

test('audio initializes only on gesture; controls retain independent volumes',async({page})=>{
 await page.goto('/');
 await expect.poll(()=>page.evaluate(()=>!!window.realm)).toBe(true);
 expect(await page.evaluate(()=>window.realm.audio.initialized)).toBe(false);
 // Show the real match controls without requiring a running match server.
 await page.evaluate(()=>document.body.classList.remove('join-active'));
 await page.locator('#join-screen').evaluate(el=>el.remove());
 await page.locator('#sound').click();
 await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>page.evaluate(()=>window.realm.audio.loaded)).toBe(7);
 await page.locator('#help').click();
 await page.locator('#ambience-volume').fill('20');
 await page.locator('#sfx-volume').fill('80');
 expect(await page.evaluate(()=>window.realm.audio.volumes)).toEqual({ambience:.2,sfx:.8});
 await page.locator('#resume').click();
 await page.locator('#sound').click();
 await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','false');
 expect(await page.evaluate(()=>window.realm.audio.volumes)).toEqual({ambience:.2,sfx:.8});
 expect(await page.evaluate(()=>window.realm.audio.voices)).toBe(0);
});

test('unavailable audio leaves controls usable without uncaught errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;});
 await page.goto('/');await expect(page.locator('#sound')).toBeAttached();
 await page.evaluate(()=>{document.body.classList.remove('join-active');document.querySelector('#join-screen').remove();});
 await page.locator('#sound').click();
 await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','false');
 expect(await page.evaluate(()=>window.realm.audio.error)).toContain('unavailable');
 expect(errors).toEqual([]);
});

test('real Web Audio follows hero proximity and deduplicates confirmed effects',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {createAudioEngine}=await import('/src/audio/engine.js');
  const {createGameplayAudio}=await import('/src/audio/gameplay.js');
  const {createWorldAmbience}=await import('/src/audio/ambience.js');
  const audio=createAudioEngine(),ambience=createWorldAmbience(audio),game=createGameplayAudio(audio,{onPosition:p=>ambience.update(p)});
  // Install a real user-gesture activation control for the isolated audio fixture.
  const button=document.createElement('button');button.id='audio-fixture';button.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(button);
  window.audioFixture={audio,ambience,game};button.onclick=()=>audio.toggle();
  return true;
 });
 expect(result).toBe(true);await page.locator('#audio-fixture').click();
 await expect.poll(()=>page.evaluate(()=>window.audioFixture.audio.getStats().loaded)).toBe(7);
 const results=await page.evaluate(()=>{
  const {audio,game,ambience}=window.audioFixture;
  const state={room:'fixture',elapsed:1,phase:'playing',actors:[{id:'me',x:31.5,y:32,hp:100}],effects:[]},session={playerId:'me'};
  game.snapshot(state,session,'connected');
  game.frame({x:31.5,y:32,distance:0,moving:false,now:1000});
  const near=ambience.getStats().river;
  state.effects=[{id:'hit',kind:'hit',x:31.5,y:32}];game.snapshot(state,session,'connected');game.snapshot(state,session,'connected');
  const played=audio.getStats().played;
  // Camera data is intentionally irrelevant to the adapter.
  state.camera={x:0,y:0};game.snapshot(state,session,'connected');
  const unchanged=ambience.getStats().river;
  game.frame({x:2,y:32,distance:29.5,moving:false,now:1016});
  const far=ambience.getStats().river;
  state.effects.push({id:'far',kind:'hit',x:63,y:32});game.snapshot(state,session,'connected');
  const afterFar=audio.getStats().played;
  game.snapshot(state,session,'connected',true);
  const voices=audio.getStats().voices;
  audio.destroy();return {near,far,unchanged,played,afterFar,voices};
 });
 expect(results.near).toBeGreaterThan(0);expect(results.far).toBe(0);expect(results.unchanged).toBe(results.near);
 expect(results.played).toBe(1);expect(results.afterFar).toBe(1);expect(results.voices).toBe(0);
});

test('live match produces footsteps and confirmed ability audio',async({page},info)=>{
 test.skip(!process.env.AUDIO_LIVE_MATCH,'Requires a running match server');
 await page.goto('/');
 await page.locator('input[name="room"]').fill('SFX'+Date.now().toString(36));
 await page.locator('#join').click();
 await page.waitForFunction(()=>window.realm?.state.connected&&window.realm?.state.playerId);
 await page.locator('#sound').click();
 await expect.poll(()=>page.evaluate(()=>window.realm.audio.loaded)).toBe(7);
 const before=await page.evaluate(()=>window.realm.audio.played);
 if(info.project.name==='desktop'){
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(650);await page.keyboard.up('ArrowUp');
 }else{
  const box=await page.locator('#joystick').boundingBox();
  const cdp=await page.context().newCDPSession(page);
  const finger={id:10,x:box.x+box.width/2,y:box.y+box.height*.2,radiusX:6,radiusY:6,force:1};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});
  await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 await expect.poll(()=>page.evaluate(()=>window.realm.audio.played)).toBeGreaterThan(before);
 await page.waitForTimeout(300);
 const afterMove=await page.evaluate(()=>window.realm.audio.played);
 await page.locator('[data-slot="2"]').click();
 await expect.poll(()=>page.evaluate(()=>window.realm.audio.played)).toBeGreaterThan(afterMove);
 await page.locator('#sound').click();
 expect(await page.evaluate(()=>window.realm.audio.voices)).toBe(0);
});
