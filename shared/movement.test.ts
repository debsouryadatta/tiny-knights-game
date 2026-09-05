import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,addPlayer,applyCommand,stepGame} from './simulation';
import {canOccupy,moveContinuous} from './movement';
import type {Actor} from './types';

function arena(kind:Actor['kind'],team:Actor['team']) {
  const state=createGame('COLLISION');
  const id=addPlayer(state,{name:'Walker',hero:'knight',companion:'guardian',size:1});
  const hero=state.actors.find(a=>a.id===id)!;
  Object.assign(hero,{x:10,y:53,protectedUntil:0});
  const other:Actor={...hero,id:'blocker',kind,team,x:11,y:53,bot:false};
  state.actors=[hero,other];state.structures=[];state.resources=[];
  return {state,hero,other};
}

for(const kind of ['hero','companion','creep'] as const){
  test(`walk and dash through allied ${kind}, but not enemy ${kind}`,()=>{
    for(const team of ['blue','red'] as const){
      const {state,hero,other}=arena(kind,team);
      assert.equal(canOccupy(state,other,hero.id),team==='blue');
      // Unknown/spawning actors must still find a genuinely empty position.
      assert.equal(canOccupy(state,other),false);
      moveContinuous(state,hero,2,0);
      if(team==='blue')assert.ok(Math.abs(hero.x-12)<1e-6);
      else assert.ok(hero.x<10.45);
      hero.x=10;
      assert.equal(applyCommand(state,hero.id,{type:'ability',slot:1,x:15,y:53}).ok,true);
      if(team==='blue')assert.ok(hero.x>12);
      else assert.ok(hero.x<10.45);
    }
  });
}

test('click-to-move reaches a destination occupied by an ally',()=>{
  const {state,hero,other}=arena('companion','blue');
  assert.equal(applyCommand(state,hero.id,{type:'move',x:other.x,y:other.y}).ok,true);
  for(let i=0;i<8;i++)stepGame(state,.1);
  assert.ok(Math.hypot(hero.x-11,hero.y-53)<.05);
});

test('allied structures remain solid and dead enemies do not block',()=>{
  const {state,hero,other}=arena('creep','red');other.hp=0;
  assert.equal(canOccupy(state,other,hero.id),true);
  state.structures=[{id:'tower',kind:'tower',team:'blue',x:11,y:53,hp:500,maxHp:500,cooldown:0}];
  assert.equal(canOccupy(state,other,hero.id),false);
  moveContinuous(state,hero,2,0);assert.ok(hero.x<10.3);
});
