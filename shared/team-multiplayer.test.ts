import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, addPlayer, applyCommand, stepGame} from './simulation';
import {spawnFor} from './map';

for (const size of [1,2,3] as const) {
  test(`${size}v${size} allocates balanced unique heroes with personal companions`, () => {
    const state=createGame('teams',size);
    assert.equal(state.actors.length,size*4);
    const ids=[];
    for(let i=0;i<size*2;i++) {
      const id=addPlayer(state,{name:`Player ${i}`,hero:'knight',companion:'guardian',size});
      ids.push(id);
      const hero=state.actors.find(a=>a.id===id)!;
      assert.equal(hero.team,i%2?'red':'blue');
      assert.equal(state.actors.filter(a=>a.ownerId===id).length,1);
      assert.equal(hero.bot,false);
    }
    assert.equal(new Set(ids).size,size*2);
    assert.throws(()=>addPlayer(state,{name:'Overflow',hero:'knight',companion:'guardian',size}),/full/);
    const rematch=createGame('teams',size);
    for(const id of [...ids].reverse()) assert.equal(addPlayer(rematch,{name:id,hero:'ranger',companion:'scout',size},id),id);
    assert.throws(()=>addPlayer(rematch,{name:'Occupied',hero:'knight',companion:'guardian',size},ids[0]),/full/);
    for(const hero of rematch.actors.filter(a=>a.kind==='hero')) {
      const index=Number(hero.id.slice(-1));
      assert.deepEqual({x:hero.x,y:hero.y},spawnFor(hero.team,index*2));
    }
  });
}
test('six players can steer independently in the same authoritative tick',()=>{
  const s=createGame('six',3);
  const ids=Array.from({length:6},(_,i)=>addPlayer(s,{name:`P${i}`,hero:'knight',companion:'guardian',size:3}));
  const before=ids.map(id=>s.actors.find(a=>a.id===id)!.x);
  ids.forEach(id=>assert.equal(applyCommand(s,id,{type:'steer',x:1,y:0}).ok,true));
  stepGame(s,.1);
  ids.forEach((id,i)=>assert.ok(s.actors.find(a=>a.id===id)!.x>before[i]));
});
test('team size mismatch cannot mutate existing players',()=>{
  const s=createGame('size',3),before=JSON.stringify(s);
  assert.throws(()=>addPlayer(s,{name:'Wrong',hero:'knight',companion:'guardian',size:2}),/match/);
  assert.equal(JSON.stringify(s),before);
});
test('reserved disconnected seats stay unavailable and offers balance around them',async()=>{
  const {availablePlayerSlot}=await import('./simulation');
  const s=createGame('reserved',3);
  const blue=addPlayer(s,{name:'Blue',hero:'knight',companion:'guardian',size:3});
  const red=addPlayer(s,{name:'Red',hero:'knight',companion:'guardian',size:3});
  const next=addPlayer(s,{name:'Blue 2',hero:'knight',companion:'guardian',size:3});
  s.actors.find(a=>a.id===red)!.bot=true;
  const seat=availablePlayerSlot(s,new Set([blue,red,next]));
  assert.equal(seat?.id,'red-hero-1');
});
