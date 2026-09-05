import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGameplayAudio} from './gameplay.js';
function setup(){
 const calls=[],audio={play:(...v)=>calls.push(v),setActive(){}},adapter=createGameplayAudio(audio,{random:()=>.5});
 const state={room:'test',elapsed:1,phase:'playing',actors:[{id:'me',hp:100,x:0,y:0}],effects:[]};
 const update=()=>adapter.snapshot(state,{playerId:'me'},'connected');
 update();return {adapter,state,calls,update};
}
test('effects baseline, deduplicate, map target positions, reset on reconnect/restart',()=>{
 const {adapter,state,calls,update}=setup();
 state.effects=[{id:'1',kind:'hit',x:9,y:9,target:{x:3,y:4}}];update();update();
 assert.deepEqual(calls,[['hit',{distance:5}]]);
 adapter.snapshot(state,{playerId:'me'},'reconnecting');update();assert.equal(calls.length,1);
 state.elapsed=0;state.effects=[{id:'2',kind:'build',x:0,y:0}];update();assert.equal(calls.length,1);
 state.effects.push({id:'3',kind:'ability',abilitySlot:2,x:0,y:0});update();assert.equal(calls[1][0],'sprint');
});
test('stride follows distance; stops, gaps, collisions and teleports produce no bursts',()=>{
 const {adapter,calls}=setup();
 let now=0,x=0;
 function move(distance,moving=true,dt=16){now+=dt;x+=distance;adapter.frame({x,y:0,distance,moving,now});}
 for(let i=0;i<30;i++)move(.05);assert.equal(calls.length,1);
 for(let i=0;i<30;i++)move(.075);assert.equal(calls.length,2);
 move(0,false);move(10);move(.9,true,1000);
 for(let i=0;i<10;i++)move(0);assert.equal(calls.length,2);
});
test('muted/dropped events are consumed and hidden/dead/finished state is inactive',()=>{
 const {adapter,state,calls,update}=setup();
 state.effects=[{id:'old',kind:'gather',x:0,y:0}];update();calls.length=0;update();assert.equal(calls.length,0);
 for(const reason of ['hidden','dead','finished']){
  if(reason==='dead')state.actors[0].hp=0;if(reason==='finished')state.phase='finished';
  adapter.snapshot(state,{playerId:'me'},'connected',reason==='hidden');
  assert.equal(adapter.getStats().active,false);
 }
});
