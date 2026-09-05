import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,addPlayer,applyCommand} from './simulation';
test('effect IDs stay unique past buffer cap, serialize and support old snapshots',()=>{
 let s=createGame('audio',1);const id=addPlayer(s,{name:'Test',hero:'knight',companion:'guardian',size:1});
 const ids=new Set();
 for(let i=0;i<100;i++){
  s.tick+=1;
  const hero=s.actors.find(a=>a.id===id)!;hero.abilityCooldowns=[0,0,0];
  assert.equal(applyCommand(s,id,{type:'ability',slot:2}).ok,true);
  const effect=s.effects.at(-1)!;assert.ok(!ids.has(effect.id));ids.add(effect.id);
  if(i===70)s=JSON.parse(JSON.stringify(s));
 }
 assert.equal(s.effects.length,60);assert.equal(ids.size,100);
});
