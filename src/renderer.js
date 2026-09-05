import { WORLD, files, bakeTerrain, drawObject, getVisibleObjects } from './world.js';
import { getMoveSpeed, moveContinuous } from '../shared/movement';
import { loadAssets } from './asset-loader.js';

const TILE = 64;
const colors = { blue: '#79c9ff', red: '#ef7972' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createRenderer(canvas, options) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const images = {}, tracks = new Map();
  let terrain, minimapBase, stopped = false, request = 0, last = 0, time = 0;
  let width = 1, height = 1, scale = 1, dpr = 1, marker = null, hover = null;
  let camera = { x: WORLD.W / 2, y: WORLD.H / 2 }, snapped = false;
  let lastTick = -1, drawn = 0, fps = 60;
  let prediction = null, sequence = 0, commands = [], localInput = {x:0,y:0,at:0}, priorElapsed = 0;
  let history=[], correction={x:0,y:0}, minimumAckAge=Infinity, lastAck=-1, arrivalInterval=100, lastArrival=0;
  let contextLost=false, playable=false, finishReady, minimapGeneration=0;
  const firstFrame = new Promise(resolve=>{finishReady=resolve;});
  const rebuildMinimap=()=>{
    if(!terrain||!minimapBase)return;
    const m=minimapBase.getContext('2d');if(!m)return;
    m.clearRect(0,0,512,512);m.drawImage(terrain.overview,0,0,512,512);
    const generation=++minimapGeneration;
    const objects=getVisibleObjects({left:0,top:0,right:WORLD.W,bottom:WORLD.H});let cursor=0;
    const slice=()=>{
      if(stopped||generation!==minimapGeneration)return;
      const start=performance.now();m.save();m.scale(512/WORLD.W,512/WORLD.H);
      while(cursor<objects.length&&performance.now()-start<3)drawObject(m,images,objects[cursor++],0);
      m.restore();if(cursor<objects.length)setTimeout(slice,16);
    };
    setTimeout(slice,16);
  };
  const onContextLost=event=>{event.preventDefault();contextLost=true;terrain?.clear();};
  const onContextRestored=()=>{contextLost=false;terrain?.clear();resize();rebuildMinimap();};
  canvas.addEventListener('contextlost',onContextLost);
  canvas.addEventListener('contextrestored',onContextRestored);
  const manifest = { ...files };
  delete manifest.deepgrass;delete manifest.sheep;delete manifest.gold;
  for (const team of ['blue', 'red']) {
    const color = team === 'blue' ? 'Blue' : 'Red';
    for (const [kind, folder] of Object.entries({ knight: 'Warrior', ranger: 'Archer', lancer: 'Lancer', companion: 'Pawn' })) {
      for (const state of ['Idle', 'Run']) manifest[`${team}-${kind}-${state}`] = `Units/${color} Units/${folder}/${folder}_${state}.png`;
      manifest[`${team}-${kind}-Attack`] = `Units/${color} Units/${folder}/${folder}_${{knight:'Attack1',ranger:'Shoot',lancer:'Right_Attack',companion:'Interact Axe'}[kind]}.png`;
    }
    manifest[`${team}-tower`] = `Buildings/${color} Buildings/Tower.png`;
    manifest[`${team}-core`] = `Buildings/${color} Buildings/Castle.png`;
  }
  const criticalKey=key=>['grass','tree1','rock','rock2'].includes(key)||/^(blue|red)-.*-(Idle)$/.test(key)||/^(blue|red)-(tower|core)$/.test(key);
  const critical=Object.entries(manifest).filter(([key])=>criticalKey(key));
  const optional=Object.entries(manifest).filter(([key])=>!criticalKey(key));
  const progress=(phase, counts, error)=>options.onLoadProgress?.({phase,...counts,playable,error});
  const ready = loadAssets(critical,images,{stopped:()=>stopped,onProgress:counts=>progress('essential',counts)}).then(async () => {
    if (stopped) return;
    terrain = bakeTerrain(images);
    minimapBase = document.createElement('canvas');
    minimapBase.width = 512; minimapBase.height = 512;
    minimapBase.addEventListener('contextrestored',rebuildMinimap);
    terrain.overview.addEventListener('contextrestored',rebuildMinimap);
    rebuildMinimap();
    progress('preparing',{completed:critical.length,total:critical.length});
    await firstFrame;if(stopped)return;
    playable=true;progress('playable',{completed:critical.length,total:critical.length});options.onReady?.();
    void loadAssets(optional,images,{optional:true,stopped:()=>stopped,onProgress:counts=>progress('details',counts)}).then(errors=>{
      if(stopped)return;rebuildMinimap();progress('complete',{completed:optional.length,total:optional.length},errors.length?'Some decorative artwork could not load. Basic visuals remain available.':undefined);
    }).catch(error=>{if(!stopped)progress('complete',{completed:0,total:optional.length},error.message);});
  }).catch(error => { terrain = undefined; progress('error',{completed:0,total:critical.length},error.message);console.error('World renderer:', error); options.onReady?.(error); throw error; });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5, 2048/width, 2048/height, Math.sqrt(1500000/(width*height)));
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.imageSmoothingEnabled = false;
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas); resize();
  function screenToTile(x, y) {
    const rect = canvas.getBoundingClientRect();
    return { x: clamp(Math.floor((x - rect.left - width / 2) / scale / TILE + camera.x / TILE), 0, WORLD.W / TILE - 1), y: clamp(Math.floor((y - rect.top - height / 2) / scale / TILE + camera.y / TILE), 0, WORLD.H / TILE - 1) };
  }
  function screenToWorld(x,y) {
    const rect=canvas.getBoundingClientRect();
    return {x:clamp((x-rect.left-width/2)/scale/TILE+camera.x/TILE-.5,0,63),y:clamp((y-rect.top-height/2)/scale/TILE+camera.y/TILE-.5,0,63)};
  }
  function predictCommand(command) {
    const actor=options.getState()?.actors.find(a=>a.id===options.getPlayerId());
    const view=options.getView();
    const startsSteering=command.type==='steer'&&(command.x||command.y)&&(!(localInput.x||localInput.y)||performance.now()-localInput.at>350);
    if((view.inspect||view.tactical)&&(command.type==='move'||startsSteering))view.returnToHero?.();
    if(command.type==='steer'){
      command.seq=sequence=Math.max(sequence,actor?.inputSeq||0)+1;
      const length=Math.max(1,Math.hypot(command.x,command.y));
      command.x/=length;command.y/=length;
      localInput={x:command.x,y:command.y,at:performance.now()};
      if(prediction){delete prediction.settleX;delete prediction.settleY;}
      commands.push({seq:command.seq,...localInput});commands=commands.slice(-40);
    } else if(['move','recall','gather'].includes(command.type)){localInput={x:0,y:0,at:0};commands=[];history=[];correction={x:0,y:0};}
  }
  function ring(x, y, radius, color, alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 2 / scale;
    ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  function bar(x, y, hp, max, team, size = 42) {
    ctx.fillStyle = '#152521'; ctx.fillRect(x - size / 2 - 1, y - 1, size + 2, 6);
    ctx.fillStyle = colors[team]; ctx.fillRect(x - size / 2, y, size * clamp(hp / max, 0, 1), 4);
  }
  function actorSprite(actor, track, local) {
    const x = track.x, y = track.y, moving = track.moving;
    const attacking=track.swingUntil>time;
    const kind = actor.kind === 'companion' ? 'companion' : actor.hero || 'knight';
    const image = images[`${actor.team}-${kind}-${attacking?'Attack':moving ? 'Run' : 'Idle'}`] || images[`${actor.team}-${kind}-Idle`];
    const size = actor.kind === 'hero' ? 144 : actor.kind === 'companion' ? 106 : 104;
    ctx.fillStyle = '#10241855'; ctx.beginPath(); ctx.ellipse(x, y + 1, size * .14, size * .055, 0, 0, Math.PI * 2); ctx.fill();
    if (local) ring(x, y + 2, 24, '#fff0b0', .8);
    if (actor.sprintUntil > (options.getState()?.elapsed || 0)) {
      ring(x, y + 2, 29, '#bbf4ba', .65);
      if (moving) {
        ctx.strokeStyle = '#b8f5d2'; ctx.lineWidth = 2; ctx.globalAlpha = .65;
        for (let i = 0; i < 3; i++) { const back = -track.face; ctx.beginPath(); ctx.moveTo(x + back * 18, y - 8 - i * 8); ctx.lineTo(x + back * (32 + i * 5), y - 8 - i * 8); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
    }
    if (image) {
      const frameSize = image.height, count = Math.max(1, Math.floor(image.width / frameSize));
      const frame = attacking?Math.min(count-1,Math.floor((time-track.swingAt)*count/.45)):Math.floor(time * (moving ? 10 : 6)) % count;
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(track.face, 1);
      ctx.drawImage(image, frame * frameSize, 0, frameSize, frameSize, -size / 2, -size * .72, size, size); ctx.restore();
    } else { ctx.fillStyle = colors[actor.team]; ctx.fillRect(x - 12, y - 30, 24, 30); }
    if (local || actor.hp < actor.maxHp || options.getView().tactical) bar(x, y - 58, actor.hp, actor.maxHp, actor.team);
    if(track.hurtUntil>time){ctx.fillStyle='#fff4dc';ctx.font='bold 16px system-ui';ctx.textAlign='center';ctx.fillText(`−${track.damage}`,x,y-80-(.6-(track.hurtUntil-time))*32);}
    if(actor.recallUntil>(options.getState()?.elapsed||0)){ring(x,y,32+Math.sin(time*6)*3,'#72dcff');ring(x,y,45,'#72dcff',.4);}
    if (local && !options.getView().tactical) {
      ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
      ctx.strokeStyle = '#102418'; ctx.lineWidth = 4; ctx.strokeText(actor.name, x, y - 67); ctx.fillStyle = '#fff7d7'; ctx.fillText(actor.name, x, y - 67);
    }
  }
  function structureSprite(s) {
    const image = images[`${s.team}-${s.kind}`], x = (s.x + .5) * TILE, y = (s.y + .5) * TILE;
    const size = s.kind === 'core' ? 240 : 104;
    const spriteHeight = image ? size * image.height / image.width : 100;
    if (image) ctx.drawImage(image, x - size / 2, y - spriteHeight * .85, size, spriteHeight);
    else { ctx.fillStyle = colors[s.team]; ctx.fillRect(x - 22, y - 50, 44, 50); }
    bar(x, y - spriteHeight * .72, s.hp, s.maxHp, s.team, s.kind === 'core' ? 80 : 50);
    if (s.kind === 'core') {
      ctx.save(); ctx.shadowColor = colors[s.team]; ctx.shadowBlur = 15;
      ctx.fillStyle = colors[s.team]; ctx.beginPath(); ctx.moveTo(x, y - 55); ctx.lineTo(x + 12, y - 32); ctx.lineTo(x, y - 15); ctx.lineTo(x - 12, y - 32); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
  function drawMap(target) {
    if (!target || !minimapBase) return;
    const m = target.getContext('2d'), w = target.width, h = target.height, state = options.getState();
    m.clearRect(0, 0, w, h); m.drawImage(minimapBase, 0, 0, w, h);
    if (!state) return;
    for (const s of state.structures) if (s.hp > 0) { m.fillStyle = colors[s.team]; m.fillRect((s.x + .5) / 64 * w - 2, (s.y + .5) / 64 * h - 2, s.kind === 'core' ? 6 : 3, s.kind === 'core' ? 6 : 3); }
    for (const a of state.actors) if (a.hp > 0 && a.kind !== 'creep') { m.fillStyle = a.id === options.getPlayerId() ? '#fff4ba' : colors[a.team]; m.beginPath(); m.arc((a.x + .5) / 64 * w, (a.y + .5) / 64 * h, a.id === options.getPlayerId() ? 3.2 : 1.8, 0, Math.PI * 2); m.fill(); }
    m.strokeStyle = '#fff8cfaa'; m.lineWidth = 1;
    m.strokeRect((camera.x - width / scale / 2) / WORLD.W * w, (camera.y - height / scale / 2) / WORLD.H * h, width / scale / WORLD.W * w, height / scale / WORLD.H * h);
  }
  function frame(ms) {
    if (stopped) return;
    request = requestAnimationFrame(frame);
    if(contextLost)return;
    const dt = Math.min((ms - last) / 1000 || .016, .1); last = ms; time += dt; fps += (1 / dt - fps) * .03;
    const state = options.getState(), view = options.getView();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#17242a'; ctx.fillRect(0, 0, width, height);
    if (!terrain) return;
    scale = view.tactical || !state ? Math.min(width / WORLD.W, height / WORLD.H) * .94 : 1.22 * Math.max(.48, Math.min(1.12, width / (TILE * (width < height ? 11 : 20))));
    if (state && state.tick !== lastTick) {
      if(state.elapsed<priorElapsed || prediction?.id!==options.getPlayerId()){prediction=null;commands=[];history=[];correction={x:0,y:0};minimumAckAge=Infinity;lastAck=-1;localInput={x:0,y:0,at:0};tracks.clear();snapped=false;}
      if(lastArrival)arrivalInterval=clamp(arrivalInterval*.85+(ms-lastArrival)*.15,75,220);
      lastArrival=ms;
      priorElapsed=state.elapsed;
      lastTick = state.tick;
      const active = new Set();
      for (const a of state.actors) {
        active.add(a.id); const tx = (a.x + .5) * TILE, ty = (a.y + .5) * TILE;
        let t = tracks.get(a.id);
        if (!t) { t = { x: tx, y: ty, tx, ty, fromX:tx,fromY:ty,received:ms,hp:a.hp, face: a.team === 'blue' ? 1 : -1 }; tracks.set(a.id, t); }
        if(a.hp<t.hp){t.damage=Math.round(t.hp-a.hp);t.hurtUntil=time+.6;}t.hp=a.hp;
        if(a.cooldown>(t.cooldown||0)+.15&&a.lastAction==='In combat'){t.swingAt=time;t.swingUntil=time+.45;}t.cooldown=a.cooldown;
        t.moving=Math.hypot(tx-t.tx,ty-t.ty)>1;
        if (Math.abs(tx - t.tx) > 1) t.face = tx > t.tx ? 1 : -1;
        const elapsed=state.elapsed-(t.elapsed??state.elapsed);
        t.vx=elapsed>0?(tx-t.tx)/elapsed:0;t.vy=elapsed>0?(ty-t.ty)/elapsed:0;t.elapsed=state.elapsed;
        t.fromX=t.x;t.fromY=t.y;t.received=ms;t.duration=arrivalInterval;
        t.tx = tx; t.ty = ty;
        if (Math.hypot(t.x - tx, t.y - ty) > TILE * 6) { t.x = t.fromX=tx; t.y = t.fromY=ty; }
        if(a.id===options.getPlayerId()){
          const ack=a.inputSeq??0, acknowledged=commands.find(c=>c.seq===ack);
          if(ack!==lastAck&&acknowledged){minimumAckAge=Math.min(minimumAckAge,ms-acknowledged.at);lastAck=ack;}
          commands=commands.filter(c=>c.seq>ack);
          if(!prediction||Math.hypot(prediction.x-a.x,prediction.y-a.y)>5||a.hp<=0){prediction={id:a.id,x:a.x,y:a.y};history=[];correction={x:0,y:0};t.x=tx;t.y=ty;}
          // Compare like-for-like times: a server snapshot is older than this frame.
          // Pulling the current prediction directly toward it creates WAN rubber-banding.
          const sampleAt=ms-clamp(Number.isFinite(minimumAckAge)?minimumAckAge/2:50,0,500);
          let before;for(let i=history.length-1;i>=0;i--)if(history[i].at<=sampleAt){before=history[i];break;}
          const after=history.find(p=>p.at>=sampleAt);
          if(before&&after){
            const f=after.at===before.at?0:(sampleAt-before.at)/(after.at-before.at);
            const ex=a.x-(before.x+(after.x-before.x)*f),ey=a.y-(before.y+(after.y-before.y)*f);
            correction=Math.hypot(ex,ey)>.16?{x:ex,y:ey}:{x:0,y:0};
          }
          const stoppedInput=localInput.at&&!localInput.x&&!localInput.y;
          if(stoppedInput&&(a.inputSeq||0)>=sequence){prediction.settleX=a.x;prediction.settleY=a.y;}
          if(!localInput.at){prediction.x=a.x;prediction.y=a.y;history=[];correction={x:0,y:0};}
        }
      }
      for (const id of tracks.keys()) if (!active.has(id)) tracks.delete(id);
    }
    for (const [id,t] of tracks) {
      const local=id===options.getPlayerId(), controlled=local&&prediction&&localInput.at&&(ms-localInput.at<350||!localInput.x&&!localInput.y);
      if(controlled && state?.actors.find(a=>a.id===id)?.hp>0){
        const oldX=prediction.x,oldY=prediction.y;
        const speed = getMoveSpeed(state.actors.find(a=>a.id===id), state.elapsed);
        moveContinuous(state,prediction,localInput.x*speed*dt,localInput.y*speed*dt);
        const blend=1-Math.exp(-dt/.18);
        if(localInput.x||localInput.y){moveContinuous(state,prediction,correction.x*blend,correction.y*blend);correction.x*=1-blend;correction.y*=1-blend;}
        else if(prediction.settleX!==undefined){prediction.x+=(prediction.settleX-prediction.x)*blend;prediction.y+=(prediction.settleY-prediction.y)*blend;}
        t.x=(prediction.x+.5)*TILE;t.y=(prediction.y+.5)*TILE;t.moving=!!(localInput.x||localInput.y)&&Math.hypot(prediction.x-oldX,prediction.y-oldY)>.002;
        history.push({at:ms,x:prediction.x,y:prediction.y});while(history.length&&history[0].at<ms-2000)history.shift();
        if(localInput.x)t.face=Math.sign(localInput.x);
      }else{
        const age=ms-t.received,blend=clamp(age/(t.duration||100),0,1);
        // Bridge a single late snapshot, but never extrapolate across a long outage.
        const extra=clamp(age-(t.duration||100),0,60)/1000;
        t.x=t.fromX+(t.tx-t.fromX)*blend+(t.vx||0)*extra;t.y=t.fromY+(t.ty-t.fromY)*blend+(t.vy||0)*extra;
        if(local&&prediction){prediction.x=t.x/TILE-.5;prediction.y=t.y/TILE-.5;}
      }
    }
    const me = tracks.get(options.getPlayerId());
    const target = view.tactical || !state ? { x: WORLD.W / 2, y: WORLD.H / 2 } : view.inspect || me || { x: WORLD.W * .16, y: WORLD.H * .8 };
    if (!snapped && me) { camera = { x: me.x, y: me.y }; snapped = true; }
    // Local motion already reconciles; an extra camera lerp adds input latency.
    camera.x=target.x;camera.y=target.y;
    const hw = width / scale / 2, hh = height / scale / 2;
    camera.x = hw >= WORLD.W / 2 ? WORLD.W / 2 : clamp(camera.x, hw, WORLD.W - hw);
    camera.y = hh >= WORLD.H / 2 ? WORLD.H / 2 : clamp(camera.y, hh, WORLD.H - hh);
    ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(scale, scale); ctx.translate(-camera.x, -camera.y);
    terrain.draw(ctx,{left:camera.x-hw,top:camera.y-hh,right:camera.x+hw,bottom:camera.y+hh},view.tactical||!state);
    if((view.tactical||!state)&&minimapBase)ctx.drawImage(minimapBase,0,0,WORLD.W,WORLD.H);
    if(me&&!view.tactical){
      const actor=state?.actors.find(a=>a.id===options.getPlayerId());
      if(actor?.attackHeld || view.aim){
        const range=view.aim?.range??(actor.hero==='ranger'?4.5:1.6);
        ring(me.x,me.y,range*TILE,'#96deff',.35);
        if(view.aim?.slot===1){const dx=view.aim.dx||0,dy=view.aim.dy||0;ctx.strokeStyle='#b6eaff';ctx.lineWidth=4/scale;ctx.beginPath();ctx.moveTo(me.x,me.y);ctx.lineTo(me.x+dx*range*TILE,me.y+dy*range*TILE);ctx.stroke();ring(me.x+dx*range*TILE,me.y+dy*range*TILE,20,'#fff2ae',.8);}
      }
      const targetActor=actor?.attackTargetId&&[...state.actors,...state.structures].find(a=>a.id===actor.attackTargetId&&a.hp>0);
      if(targetActor)ring((targetActor.x+.5)*TILE,(targetActor.y+.5)*TILE,29,'#ff766c');
    }
    if (view.grid || view.buildMode) {
      ctx.strokeStyle = '#f6f2ca25'; ctx.lineWidth = 1 / scale; ctx.beginPath();
      for (let x = Math.floor((camera.x - hw) / TILE) * TILE; x < camera.x + hw; x += TILE) { ctx.moveTo(x, camera.y - hh); ctx.lineTo(x, camera.y + hh); }
      for (let y = Math.floor((camera.y - hh) / TILE) * TILE; y < camera.y + hh; y += TILE) { ctx.moveTo(camera.x - hw, y); ctx.lineTo(camera.x + hw, y); } ctx.stroke();
    }
    if (state) for (const r of state.resources) if (r.amount > 0) {
      const x = (r.x + .5) * TILE, y = (r.y + .5) * TILE;
      ctx.fillStyle = r.kind === 'gold' ? '#e2bc58' : '#b8de86'; ctx.beginPath(); ctx.arc(x, y - 5, 5, 0, Math.PI * 2); ctx.fill();
    }
    const bounds = { left: camera.x - hw - 160, top: camera.y - hh - 160, right: camera.x + hw + 160, bottom: camera.y + hh + 180 };
    const items = (view.tactical||!state?[]:getVisibleObjects(bounds)).map(o => ({ y: o.y, render: () => drawObject(ctx, images, o, time) }));
    if (state) {
      for (const s of state.structures) if (s.hp > 0) items.push({ y: (s.y + .5) * TILE, render: () => structureSprite(s) });
      for (const a of state.actors) if (a.hp > 0) { const t = tracks.get(a.id); if (t && t.x >= bounds.left && t.x <= bounds.right && t.y >= bounds.top && t.y <= bounds.bottom) items.push({ y: t.y, render: () => actorSprite(a, t, a.id === options.getPlayerId()) }); }
    }
    items.sort((a, b) => a.y - b.y); drawn = items.length; for (const item of items) item.render();
    if (state) for (const e of state.effects) {
      const x = (e.x + .5) * TILE, y = (e.y + .5) * TILE;
      ring(x, y, e.abilitySlot === 3 ? TILE * 3 : e.kind === 'ability' ? 50 : 22, e.kind === 'gather' ? '#efcf70' : colors[e.team], .75);
      if(e.abilitySlot===3)ring(x,y,TILE*1.7,'#fff0b0',.6);
      if (e.target) {
        ctx.save(); ctx.strokeStyle = colors[e.team]; ctx.lineWidth = e.abilitySlot===1 ? 18 : 2; ctx.globalAlpha=e.abilitySlot===1?.35:1;
        ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo((e.target.x + .5) * TILE, (e.target.y + .5) * TILE - 20); ctx.stroke();
        if(e.abilitySlot===1){ctx.lineWidth=3;ctx.globalAlpha=.9;ctx.strokeStyle='#fff3c3';ctx.stroke();}ctx.restore();
      }
    }
    if (marker && time - marker.at < 1.5) ring((marker.x + .5) * TILE, (marker.y + .5) * TILE, 14 + (time - marker.at) * 8, '#fff0ad', 1 - (time - marker.at) / 1.5);
    if (view.buildMode && hover) { const x = (hover.x + .5) * TILE, y = (hover.y + .5) * TILE; ctx.fillStyle = '#f8d77c55'; ctx.fillRect(x - 32, y - 32, 64, 64); ring(x, y, TILE * 5, '#f3d080', .6); }
    ctx.restore();
    if(!playable)finishReady();
  }
  request = requestAnimationFrame(frame);
  return { ready, screenToTile, screenToWorld, predictCommand, drawMap, setMarker: tile => { marker = { ...tile, at: time }; }, setHover: tile => { hover = tile; }, getStats: () => ({ fps: Math.round(fps), drawn, ready: !!terrain&&!contextLost, terrainChunks:terrain?.count??0, canvasPixels:canvas.width*canvas.height, camera: { ...camera }, scale, predicted:prediction?{x:prediction.x,y:prediction.y}:null, pendingInputs:commands.length }), destroy() { stopped = true; cancelAnimationFrame(request); resizeObserver.disconnect();canvas.removeEventListener('contextlost',onContextLost);canvas.removeEventListener('contextrestored',onContextRestored);terrain?.clear(); } };
}
