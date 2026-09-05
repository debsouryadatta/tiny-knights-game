import { WORLD, files, bakeTerrain, drawObject, getVisibleObjects, drawRiver } from './world.js';
import { getMoveSpeed, moveContinuous } from '../shared/movement';
import { loadAssets } from './asset-loader.js';
import { createCombatEffects } from './combat-effects.js';
import { spawnFor } from '../shared/map';
import { advanceRunPhase } from './sprite-motion.js';

const TILE = 64;
const colors = { blue: '#79c9ff', red: '#ef7972' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createRenderer(canvas, options) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const images = {}, tracks = new Map(), actorsById=new Map();
  const scenery=[],drawItems=[],drawPool=[],visibleActors=[];
  const viewport={left:0,top:0,right:0,bottom:0};
  function queueDraw(y,kind,subject,track){
    const index=drawItems.length,item=drawPool[index]||(drawPool[index]={});
    item.y=y;item.kind=kind;item.subject=subject;item.track=track;drawItems.push(item);
  }
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const combatEffects=createCombatEffects({reducedMotion});
  let terrain, minimapBase, stopped = false, request = 0, last = 0, time = 0;
  let width = 1, height = 1, scale = 1, dpr = 1, marker = null, hover = null;
  let camera = { x: WORLD.W / 2, y: WORLD.H / 2 }, snapped = false;
  let lastTick = -1, lastState = null, drawn = 0, fps = 60;
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
    manifest[`${team}-core`] = `Buildings/${color} Buildings/Monastery.png`;
  }
  const criticalKey=key=>['grass','tree1','rock','rock2','blueBanner','redBanner'].includes(key)||/^(blue|red)-.*-(Idle)$/.test(key)||/^(blue|red)-(tower|core)$/.test(key);
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
      if(prediction) delete prediction.stopAck;
      if(!command.x&&!command.y){correction={x:0,y:0};history=[];}
      commands.push({seq:command.seq,...localInput});commands=commands.slice(-40);
    } else if(['move','recall','gather'].includes(command.type)||(command.type==='attack'&&!localInput.x&&!localInput.y)){localInput={x:0,y:0,at:0};commands=[];history=[];correction={x:0,y:0};}
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
    const x=track.x,y=track.y,dead=actor.hp<=0;
    const deathAge=dead?time-track.deadAt:0;
    if(dead&&(!Number.isFinite(deathAge)||deathAge>1))return;
    const moving=!dead&&track.moving,attacking=!dead&&track.swingUntil>time;
    const kind=actor.kind==='companion'?'companion':actor.hero||'knight';
    const pose=attacking?'Attack':moving?'Run':'Idle';
    const image=images[`${actor.team}-${kind}-${pose}`]||images[`${actor.team}-${kind}-Idle`];
    const baseSize=actor.kind==='hero'?164:actor.kind==='companion'?116:88;
    const size=baseSize*(kind==='lancer'?320/192:1);
    const anchor=kind==='lancer'?.61:.72;
    ctx.save();
    ctx.globalAlpha=dead?Math.max(0,1-deathAge):1;
    ctx.fillStyle='#081a2655';ctx.beginPath();ctx.ellipse(x,y+2,baseSize*.14,baseSize*.055,0,0,Math.PI*2);ctx.fill();
    if(!dead&&actor.kind==='hero'){
      ctx.fillStyle=local?'#ffe8a519':`${colors[actor.team]}19`;
      ctx.beginPath();ctx.ellipse(x,y+2,29,20,0,0,Math.PI*2);ctx.fill();
      ring(x,y+2,29,local?'#fff0b0':colors[actor.team],.8);
    }else if(!dead&&actor.kind==='companion'){
      ctx.strokeStyle=colors[actor.team];ctx.lineWidth=2/scale;
      ctx.beginPath();ctx.moveTo(x-18,y+3);ctx.lineTo(x,y+13);ctx.lineTo(x+18,y+3);ctx.stroke();
    }
    if(!dead&&actor.sprintUntil>(options.getState()?.elapsed||0)&&moving){
      ctx.save();ctx.strokeStyle='#b8f5d2';ctx.lineWidth=2;ctx.globalAlpha=.5;
      for(let i=0;i<3;i++){const back=-track.face;ctx.beginPath();ctx.moveTo(x+back*18,y-8-i*8);ctx.lineTo(x+back*(30+i*6),y-8-i*8);ctx.stroke();}
      ctx.restore();
    }
    if(image){
      const frameSize=image.height,count=Math.max(1,Math.floor(image.width/frameSize));
      const attackProgress=clamp((time-track.swingAt)/.36,0,1);
      const frame=dead?0:attacking?Math.min(count-1,Math.floor(attackProgress*count)):Math.floor(moving?(track.runPhase||0):time*5)%count;
      const thrust=attacking&&!reducedMotion?Math.sin(attackProgress*Math.PI)*5:0;
      ctx.save();ctx.translate(Math.round(x+track.face*thrust),Math.round(y));ctx.scale(track.face,1);
      if(dead&&!reducedMotion){ctx.translate(0,5*deathAge);ctx.rotate(Math.min(1,deathAge/.25)*1.35);}
      const hurtAge=time-(track.hurtAt??-10);
      if(!dead&&hurtAge<.1)ctx.filter='brightness(1.8) saturate(.4)';
      ctx.drawImage(image,frame*frameSize,0,frameSize,frameSize,-size/2,-size*anchor,size,size);
      ctx.restore();
    }
    ctx.restore();
  }
  // Draw status after scenery so tree canopies cannot hide a fighting hero's health.
  function actorOverlay(actor, track, local) {
    if (options.getView().tactical) return;
    const hero = actor.kind === 'hero', companion = actor.kind === 'companion';
    const x = track.x, y = track.y - (hero ? 64 : companion ? 43 : 34);
    const size = hero ? 58 : companion ? 34 : 25;
    ctx.save(); ctx.translate(x, y);
    const uiScale = clamp(1 / scale, .8, 1.5); ctx.scale(uiScale, uiScale);
    bar(0, 0, track.displayHp??actor.hp, actor.maxHp, actor.team, size);
    if((track.displayHp??actor.hp)>actor.hp){ctx.fillStyle='#eaa478';ctx.fillRect(-size/2+size*actor.hp/actor.maxHp,0,size*((track.displayHp??actor.hp)-actor.hp)/actor.maxHp,4);}
    if (hero) {
      ctx.fillStyle = '#152521';
      for (let i = 1; i < 4; i++) ctx.fillRect(-size / 2 + size * i / 4, 0, 1, 4);
      ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#102418'; ctx.lineWidth = 3;
      const label = `${local ? 'YOU' : String(actor.name || 'Rival').slice(0, 16)} · ${actor.level || 1}`;
      ctx.strokeText(label, 0, -6); ctx.fillStyle = local ? '#fff0b0' : '#fff5e5'; ctx.fillText(label, 0, -6);

    }
    ctx.restore();
  }
  function structureSprite(s) {
    const image = images[`${s.team}-${s.kind}`], x = (s.x + .5) * TILE, y = (s.y + .5) * TILE;
    const size = s.kind === 'core' ? 190 : 104;
    const spriteHeight = image ? size * image.height / image.width : 100;
    if (image) ctx.drawImage(image, x - size / 2, y - spriteHeight * .85, size, spriteHeight);
    else { ctx.fillStyle = colors[s.team]; ctx.fillRect(x - 22, y - 50, 44, 50); }
    bar(x, y - spriteHeight * .72, s.hp, s.maxHp, s.team, s.kind === 'core' ? 80 : 50);
  }
  function constructionSprite(actor,elapsed){
    const build=actor.buildChannel;if(!build)return;
    const x=(build.x+.5)*TILE,y=(build.y+.5)*TILE,image=images[`${actor.team}-tower`];
    ctx.save();ctx.globalAlpha=.4;
    if(image){const h=104*image.height/image.width;ctx.drawImage(image,x-52,y-h*.85,104,h);}
    ctx.restore();ring(x,y,32,colors[actor.team],.85);
    const remaining=Math.max(0,build.until-elapsed);
    ctx.fillStyle='#152521';ctx.fillRect(x-35,y+22,70,7);
    ctx.fillStyle=colors[actor.team];ctx.fillRect(x-34,y+23,68*clamp(1-remaining/2.5,0,1),5);
    ctx.font='700 15px system-ui';ctx.textAlign='center';ctx.fillStyle='#fff3cf';
    ctx.fillText(`Building ${remaining.toFixed(1)}s`,x,y-90);
  }
  function drawMap(target) {
    if (!target || !minimapBase) return;
    const m = target.getContext('2d'), w = target.width, h = target.height, state = options.getState();
    m.clearRect(0, 0, w, h); m.drawImage(minimapBase, 0, 0, w, h);
    if (!state) return;
    for (const s of state.structures) if (s.hp > 0) { m.fillStyle = colors[s.team]; m.fillRect((s.x + .5) / 64 * w - 2, (s.y + .5) / 64 * h - 2, s.kind === 'core' ? 6 : 3, s.kind === 'core' ? 6 : 3); }
    for (const a of state.actors) if (a.hp > 0) {
      const x = (a.x + .5) / 64 * w, y = (a.y + .5) / 64 * h;
      m.fillStyle = a.id === options.getPlayerId() ? '#fff4ba' : colors[a.team];
      if (a.kind === 'creep') { m.fillRect(x - .75, y - .75, 1.5, 1.5); continue; }
      m.beginPath(); m.arc(x, y, a.id === options.getPlayerId() ? 3.5 : a.kind === 'hero' ? 2.8 : 1.5, 0, Math.PI * 2); m.fill();
      if (a.kind === 'hero') { m.strokeStyle = '#152521'; m.lineWidth = 1; m.stroke(); }
    }
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
    scale = view.tactical ? Math.min(width / WORLD.W, height / WORLD.H) * .94 : clamp(Math.min(width / (TILE * (width < height ? 10 : 18)), height / (TILE * 9)), .5, 1.3);
    if (state && state !== lastState) {
      lastState=state;
      if(state.elapsed<priorElapsed || prediction?.id!==options.getPlayerId()){prediction=null;commands=[];history=[];correction={x:0,y:0};minimumAckAge=Infinity;lastAck=-1;localInput={x:0,y:0,at:0};tracks.clear();combatEffects.reset();snapped=false;}
      if(state.tick!==lastTick){
        if(lastArrival)arrivalInterval=clamp(arrivalInterval*.85+(ms-lastArrival)*.15,75,220);
        lastArrival=ms;
      }
      priorElapsed=state.elapsed;
      lastTick = state.tick;
      const active = new Set();
      actorsById.clear();
      for (const a of state.actors) {
        actorsById.set(a.id,a);
        active.add(a.id); const tx = (a.x + .5) * TILE, ty = (a.y + .5) * TILE;
        let t = tracks.get(a.id);
        if (!t) { t = { x: tx, y: ty, tx, ty, fromX:tx,fromY:ty,received:ms,hp:a.hp, face: a.team === 'blue' ? 1 : -1 }; tracks.set(a.id, t); }
        const died=a.hp<=0&&t.hp>0, revived=a.hp>0&&t.hp<=0;
        if(died){t.deadAt=time;t.swingUntil=0;t.moving=false;}
        if(revived){t.deadAt=undefined;t.spawnAt=time;}
        if(a.hp<t.hp){t.damage=Math.round(t.hp-a.hp);t.hurtAt=time;t.hurtUntil=time+.65;}t.hp=a.hp;
        const strike=state.effects.findLast(e=>e.kind==='hit'&&e.sourceId===a.id&&e.style!=='magic');
        if(strike&&strike.id!==t.lastStrike){
          t.lastStrike=strike.id;t.swingAt=time;t.swingUntil=time+.36;
          if(strike.target&&Math.abs(strike.target.x-a.x)>.05)t.face=Math.sign(strike.target.x-a.x);
        }else if(!strike&&a.cooldown>(t.cooldown||0)+.15&&a.lastAction==='In combat'){t.swingAt=time;t.swingUntil=time+.36;}
        t.cooldown=a.cooldown;
        const positionChanged=tx!==t.tx||ty!==t.ty;
        if (Math.abs(tx - t.tx) > 1) t.face = tx > t.tx ? 1 : -1;
        const elapsed=state.elapsed-(t.elapsed??state.elapsed);
        const displaced=Math.hypot(tx-t.tx,ty-t.ty)>TILE*(getMoveSpeed(a,state.elapsed)*Math.max(elapsed,0)+.25);
        const forced=displaced||died||revived;
        if(forced){t.fromX=t.x=tx;t.fromY=t.y=ty;t.vx=t.vy=0;}
        // Commands broadcast state between simulation ticks, often with identical
        // positions. Preserve the current segment's clock so those updates cannot
        // repeatedly postpone movement. Health, effects and input acks still apply.
        if(positionChanged||forced){
          t.vx=elapsed>0?(tx-t.tx)/elapsed:0;t.vy=elapsed>0?(ty-t.ty)/elapsed:0;
          t.fromX=t.x;t.fromY=t.y;t.received=ms;t.duration=arrivalInterval;
          t.tx=tx;t.ty=ty;
        }
        t.elapsed=state.elapsed;
        if (Math.hypot(t.x - tx, t.y - ty) > TILE * 6) { t.x = t.fromX=tx; t.y = t.fromY=ty; }
        if(a.id===options.getPlayerId()){
          const ack=a.inputSeq??0, acknowledged=commands.find(c=>c.seq===ack);
          if(ack!==lastAck&&acknowledged){minimumAckAge=Math.min(minimumAckAge,ms-acknowledged.at);lastAck=ack;}
          commands=commands.filter(c=>c.seq>ack);
          if(!prediction||forced||Math.hypot(prediction.x-a.x,prediction.y-a.y)>5||a.hp<=0){prediction={id:a.id,x:a.x,y:a.y};history=[];correction={x:0,y:0};t.x=tx;t.y=ty;}
          // Compare like-for-like times: a server snapshot is older than this frame.
          // Pulling the current prediction directly toward it creates WAN rubber-banding.
          const sampleAt=ms-clamp(Number.isFinite(minimumAckAge)?minimumAckAge/2:50,0,500);
          let before;for(let i=history.length-1;i>=0;i--)if(history[i].at<=sampleAt){before=history[i];break;}
          const after=history.find(p=>p.at>=sampleAt);
          if(before&&after&&(localInput.x||localInput.y)){
            const f=after.at===before.at?0:(sampleAt-before.at)/(after.at-before.at);
            const ex=a.x-(before.x+(after.x-before.x)*f),ey=a.y-(before.y+(after.y-before.y)*f);
            correction=Math.hypot(ex,ey)>.16?{x:ex,y:ey}:{x:0,y:0};
          }
          const stoppedInput=localInput.at&&!localInput.x&&!localInput.y;
          if(stoppedInput&&(a.inputSeq||0)>=sequence&&prediction.stopAck!==sequence){
            // Stop on release. Rebase once when that exact stop is acknowledged,
            // rather than easing toward old snapshots for several more frames.
            prediction.x=a.x;prediction.y=a.y;prediction.stopAck=sequence;
            history=[];correction={x:0,y:0};t.moving=false;
          }
          if(!localInput.at){prediction.x=a.x;prediction.y=a.y;history=[];correction={x:0,y:0};}
        }
      }
      for (const id of tracks.keys()) if (!active.has(id)) tracks.delete(id);
    }
    let audioDistance=0,audioMoving=false;
    for (const [id,t] of tracks) {
      const priorX=t.x,priorY=t.y;
      const local=id===options.getPlayerId(), controlled=local&&prediction&&localInput.at&&(ms-localInput.at<350||!localInput.x&&!localInput.y);
      const actor=actorsById.get(id);
      if(controlled && actor?.hp>0){
        const oldX=prediction.x,oldY=prediction.y;
        const speed = getMoveSpeed(actor, state.elapsed);
        moveContinuous(state,prediction,localInput.x*speed*dt,localInput.y*speed*dt);
        if(local){audioDistance=Math.hypot(prediction.x-oldX,prediction.y-oldY);audioMoving=!!(localInput.x||localInput.y);}
        const blend=1-Math.exp(-dt/.18);
        if(localInput.x||localInput.y){moveContinuous(state,prediction,correction.x*blend,correction.y*blend);correction.x*=1-blend;correction.y*=1-blend;}

        t.x=(prediction.x+.5)*TILE;t.y=(prediction.y+.5)*TILE;t.moving=!!(localInput.x||localInput.y)&&Math.hypot(prediction.x-oldX,prediction.y-oldY)>.002;
        history.push({at:ms,x:prediction.x,y:prediction.y});while(history.length&&history[0].at<ms-2000)history.shift();
        if(localInput.x)t.face=Math.sign(localInput.x);
      }else{
        const previousX=t.x,previousY=t.y;
        const age=ms-t.received,blend=clamp(age/(t.duration||100),0,1);
        // Interpolate to known positions. Extrapolating beyond a stopped snapshot
        // makes idle actors coast and then rewind when the next packet arrives.
        const extra=0;
        t.x=t.fromX+(t.tx-t.fromX)*blend+(t.vx||0)*extra;t.y=t.fromY+(t.ty-t.fromY)*blend+(t.vy||0)*extra;
        t.moving=t.hp>0&&Math.hypot(t.x-previousX,t.y-previousY)>.1;
        if(local){audioDistance=Math.hypot(t.x-priorX,t.y-priorY)/TILE;audioMoving=audioDistance>.002&&age<250;}
        if(local&&prediction){prediction.x=t.x/TILE-.5;prediction.y=t.y/TILE-.5;}
      }
      t.runPhase=advanceRunPhase(t.runPhase||0,t.moving?Math.hypot(t.x-priorX,t.y-priorY):0,actor&&state?getMoveSpeed(actor,state.elapsed):0,dt);
      t.displayHp=(t.displayHp??t.hp)+(t.hp-(t.displayHp??t.hp))*(1-Math.exp(-dt/.2));
    }
    combatEffects.update(state,time,tracks);
    const me = tracks.get(options.getPlayerId());
    if(me)options.onLocalMotion?.({x:me.x/TILE-.5,y:me.y/TILE-.5,distance:audioDistance,moving:audioMoving,now:ms});
    const player = state?.actors.find(a => a.id === options.getPlayerId());
    const spawn = spawnFor(player?.team || 'blue', 0);
    const focus = me || { x: (spawn.x + .5) * TILE, y: (spawn.y + .5) * TILE };
    // A fixed team-oriented offset cannot rotate or slide as lane waypoints change.
    const lead = Math.min(90, width / scale * .07, height / scale * .12);
    const direction=player?.team==='red'?-1:1;
    const target = view.tactical ? { x: WORLD.W / 2, y: WORLD.H / 2 } : view.inspect || {
      x: focus.x + direction * lead * .45,
      y: focus.y - height / scale * .1
    };
    if (!snapped && me) { camera = { x: me.x, y: me.y }; snapped = true; }
    // Local motion already reconciles; an extra camera lerp adds input latency.
    camera.x=target.x;camera.y=target.y;
    const hw = width / scale / 2, hh = height / scale / 2;
    camera.x = hw >= WORLD.W / 2 ? WORLD.W / 2 : clamp(camera.x, hw, WORLD.W - hw);
    camera.y = hh >= WORLD.H / 2 ? WORLD.H / 2 : clamp(camera.y, hh, WORLD.H - hh);
    ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(scale, scale); ctx.translate(-camera.x, -camera.y);
    viewport.left=camera.x-hw;viewport.top=camera.y-hh;viewport.right=camera.x+hw;viewport.bottom=camera.y+hh;
    const terrainReady = terrain.draw(ctx,viewport,view.tactical);
    if(!view.tactical)drawRiver(ctx,images,viewport,reducedMotion?0:time);
    if(view.tactical&&minimapBase)ctx.drawImage(minimapBase,0,0,WORLD.W,WORLD.H);
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
    combatEffects.drawGround(ctx,{bounds,scale,tactical:view.tactical});
    drawItems.length=0;visibleActors.length=0;
    if(!view.tactical)for(const o of getVisibleObjects(viewport,images,scenery))queueDraw(o.y,0,o);
    if (state) {
      for (const s of state.structures) if (s.hp > 0) queueDraw((s.y+.5)*TILE,1,s);
      for (const a of state.actors) {
        if(a.buildChannel&&a.hp>0)queueDraw((a.buildChannel.y+.5)*TILE,2,a);
        const t=tracks.get(a.id);
        if(t&&(a.hp>0||time-t.deadAt<1)&&t.x>=bounds.left&&t.x<=bounds.right&&t.y>=bounds.top&&t.y<=bounds.bottom){
          queueDraw(t.y,3,a,t);
          if(a.hp>0)visibleActors.push(a,t);
          if(a.fountainHealing&&a.hp>0)ring(t.x,t.y,35,'#9de9b4',.5);
        }
      }
    }
    drawItems.sort((a,b)=>a.y-b.y);drawn=drawItems.length;
    for(const item of drawItems){
      if(item.kind===0)drawObject(ctx,images,item.subject,time);
      else if(item.kind===1)structureSprite(item.subject);
      else if(item.kind===2)constructionSprite(item.subject,state.elapsed);
      else actorSprite(item.subject,item.track,item.subject.id===options.getPlayerId());
    }
    combatEffects.drawOverlay(ctx,{bounds,scale,tactical:view.tactical});
    if (marker && time - marker.at < 1.5) ring((marker.x + .5) * TILE, (marker.y + .5) * TILE, 14 + (time - marker.at) * 8, '#fff0ad', 1 - (time - marker.at) / 1.5);
    if (view.buildMode && hover) { const x = (hover.x + .5) * TILE, y = (hover.y + .5) * TILE; ctx.fillStyle = '#f8d77c55'; ctx.fillRect(x - 32, y - 32, 64, 64); ring(x, y, TILE * 5, '#f3d080', .6); }
    for(let i=0;i<visibleActors.length;i+=2)actorOverlay(visibleActors[i],visibleActors[i+1],visibleActors[i].id===options.getPlayerId());
    ctx.restore();
    if(!playable && terrainReady)finishReady();
  }
  request = requestAnimationFrame(frame);
  return { ready, screenToTile, screenToWorld, predictCommand, drawMap, setMarker: tile => { marker = { ...tile, at: time }; }, setHover: tile => { hover = tile; }, getStats: () => ({ fps: Math.round(fps), drawn, ready: !!terrain&&!contextLost, terrainChunks:terrain?.count??0, canvasPixels:canvas.width*canvas.height, camera: { ...camera }, scale, predicted:prediction?{x:prediction.x,y:prediction.y}:null, pendingInputs:commands.length, effects:combatEffects.getStats(), localMoving:tracks.get(options.getPlayerId())?.moving??false, rendered:tracks.get(options.getPlayerId())?{x:tracks.get(options.getPlayerId()).x,y:tracks.get(options.getPlayerId()).y}:null }), destroy() { stopped = true; combatEffects.reset(); cancelAnimationFrame(request); resizeObserver.disconnect();canvas.removeEventListener('contextlost',onContextLost);canvas.removeEventListener('contextrestored',onContextRestored);terrain?.clear(); } };
}
