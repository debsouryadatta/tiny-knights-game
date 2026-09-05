import {test,expect} from '@playwright/test';

test('command-only snapshots do not delay interpolation or extend its stopping tail',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createRenderer}=await import('/src/renderer.js');
    const actor={id:'interpolation-fixture',name:'Remote',kind:'hero',hero:'knight',team:'blue',x:10,y:53,hp:660,maxHp:660,inputSeq:0};
    const initial={tick:1,elapsed:0,actors:[actor],structures:[],resources:[],effects:[]};
    let regular=initial,chatty=initial;
    const canvases=[0,1].map(()=>{const c=document.createElement('canvas');c.style.cssText='width:400px;height:300px';document.body.append(c);return c;});
    const make=(canvas,getState)=>createRenderer(canvas,{getState,getPlayerId:()=>actor.id,getView:()=>({})});
    const baseline=make(canvases[0],()=>regular),duplicate=make(canvases[1],()=>chatty);
    try{
      await Promise.all([baseline.ready,duplicate.ready]);
      let lastTick=0;const samples=[];
      const start=performance.now();
      await new Promise(resolve=>{
        // Asset readiness can register this sampler between the two renderers'
        // RAF callbacks. Update snapshots and compare only after both callbacks
        // complete, so the fixture compares identical presentation timestamps.
        const queueSample=()=>requestAnimationFrame(now=>setTimeout(()=>sample(now),0));
        function sample(now){
          const elapsed=now-start,tick=Math.floor(elapsed/100);
          if(tick!==lastTick){
            // 10Hz positions, then stop. Command updates arrive between ticks.
            regular={...initial,tick:tick+1,elapsed:tick/10,actors:[{...actor,x:10+Math.min(tick,8)*.4}]};
            chatty=regular;lastTick=tick;
          }else{
            chatty={...chatty,actors:chatty.actors.map(a=>({...a,inputSeq:(a.inputSeq||0)+1}))};
          }
          const a=baseline.getStats().rendered,b=duplicate.getStats().rendered;
          if(a&&b&&elapsed>250)samples.push({at:elapsed,difference:Math.hypot(a.x-b.x,a.y-b.y),x:b.x});
          if(elapsed>=1300)resolve();else queueSample();
        }queueSample();
      });
      return {samples,maxDifference:Math.max(...samples.map(s=>s.difference)),stopRange:Math.max(...samples.filter(s=>s.at>1100).map(s=>s.x))-Math.min(...samples.filter(s=>s.at>1100).map(s=>s.x))};
    }finally{baseline.destroy();duplicate.destroy();canvases.forEach(c=>c.remove());}
  });
  expect(result.samples.length).toBeGreaterThan(20);
  expect(result.maxDifference).toBeLessThan(.01);
  expect(result.stopRange).toBeLessThan(.01);
});

test('release freezes the hero immediately and acknowledged stop has no tail or camera slide',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createRenderer}=await import('/src/renderer.js');
    const canvas=document.createElement('canvas');canvas.style.cssText='width:844px;height:390px';document.body.append(canvas);
    const actor={id:'stop-fixture',name:'Stop',kind:'hero',hero:'knight',team:'blue',x:10,y:53,hp:660,maxHp:660,inputSeq:0};
    let state={tick:1,elapsed:0,actors:[actor],structures:[],resources:[],effects:[]};
    const renderer=createRenderer(canvas,{getState:()=>state,getPlayerId:()=>actor.id,getView:()=>({})});
    await renderer.ready;await new Promise(r=>requestAnimationFrame(r));
    const start=performance.now(),commands=[],frozen=[],settled=[];
    let lastInput=-100,lastSnapshot=0,stopped=false;
    try{
      await new Promise(resolve=>{
        function sample(now){
          const elapsed=now-start;
          if(elapsed>1700){resolve();return;}
          if(elapsed<900&&elapsed-lastInput>=90){const c={type:'steer',x:1,y:0};renderer.predictCommand(c);commands.push({at:elapsed,seq:c.seq});lastInput=elapsed;}
          if(elapsed>=900&&!stopped){const c={type:'steer',x:0,y:0};renderer.predictCommand(c);commands.push({at:elapsed,seq:c.seq});stopped=true;}
          if(elapsed-lastSnapshot>=100){
            const delayed=Math.max(0,elapsed-180),ack=commands.filter(c=>c.at<=delayed).at(-1);
            state={...state,tick:state.tick+1,elapsed:elapsed/1000,actors:[{...actor,x:10+Math.min(delayed,900)*.005,inputSeq:ack?.seq||0}]};lastSnapshot=elapsed;
          }
          const stats=renderer.getStats();
          if(elapsed>930&&elapsed<1040)frozen.push(stats.predicted.x);
          if(elapsed>1250)settled.push({x:stats.predicted.x,y:stats.predicted.y,cameraY:stats.camera.y,moving:stats.localMoving});
          requestAnimationFrame(sample);
        }requestAnimationFrame(sample);
      });
      return {frozenRange:Math.max(...frozen)-Math.min(...frozen),settled,frames:settled.length};
    }finally{renderer.destroy();canvas.remove();}
  });
  expect(result.frames).toBeGreaterThan(5);
  expect(result.frozenRange).toBeLessThan(.001);
  const first=result.settled[0];
  for(const sample of result.settled){
    expect(Math.hypot(sample.x-first.x,sample.y-first.y)).toBeLessThan(.001);
    expect(Math.abs(sample.cameraY-first.cameraY)).toBeLessThan(.01);
    expect(sample.moving).toBe(false);
  }
});

test('delayed server snapshots do not repeatedly pull local movement backwards',async({page},info)=>{
  test.skip(info.project.name!=='desktop');
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createRenderer}=await import('/src/renderer.js');
    const canvas=document.createElement('canvas');
    canvas.style.cssText='width:844px;height:390px';document.body.append(canvas);
    const actor={id:'motion-fixture',name:'Test',kind:'hero',hero:'knight',team:'blue',x:10,y:53,hp:360,maxHp:360,inputSeq:0};
    let state={tick:1,elapsed:.1,actors:[actor],structures:[],resources:[],effects:[]};
    const renderer=createRenderer(canvas,{getState:()=>state,getPlayerId:()=>actor.id,getView:()=>({})});
    await renderer.ready;await new Promise(resolve=>requestAnimationFrame(resolve));
    const start=performance.now(),commands=[],positions=[];let lastInput=0,lastSnapshot=0;
    try{
      await new Promise(resolve=>{
        function frame(now){
          const elapsed=now-start;if(elapsed>1700){resolve();return;}
          if(elapsed-lastInput>=90){const command={type:'steer',x:1,y:0};renderer.predictCommand(command);commands.push({at:elapsed,seq:command.seq});lastInput=elapsed;}
          if(elapsed-lastSnapshot>=100){
            const delayed=Math.max(0,elapsed-220),ack=commands.filter(c=>c.at<=delayed).at(-1);
            state={...state,tick:state.tick+1,elapsed:elapsed/1000,actors:[{...actor,x:10+Math.max(0,delayed-90)*.005,inputSeq:ack?.seq||0}]};lastSnapshot=elapsed;
          }
          const position=renderer.getStats().predicted;
          if(position&&elapsed>350)positions.push({at:elapsed,x:position.x});
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
      const deltas=positions.slice(1).map((p,i)=>p.x-positions[i].x);
      return {frames:positions.length,backward:Math.min(...deltas),distance:positions.at(-1).x-positions[0].x};
    }finally{renderer.destroy();canvas.remove();}
  });
  expect(result.frames).toBeGreaterThan(15);
  expect(result.backward).toBeGreaterThan(-.02);
  expect(result.distance).toBeGreaterThan(3);
});
