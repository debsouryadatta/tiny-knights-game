import {test,expect} from '@playwright/test';

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
