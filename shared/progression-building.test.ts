import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,addPlayer,applyCommand,stepGame,TOWER_COST} from './simulation';
import {attackDamage,HERO_XP_THRESHOLDS,heroMaxHp} from './balance';
import {baseFor,spawnFor,isWalkable} from './map';
import type {Actor,Command,GameState} from './types';

function setup() {
  const s=createGame('features');
  const id=addPlayer(s,{name:'Builder',hero:'knight',companion:'guardian',size:1});
  const a=s.actors.find(a=>a.id===id)!;
  s.actors=[a];s.structures=[];s.resources=[];
  s.bank.blue={wood:800,gold:400};
  return {s,a,id};
}
function run(s:GameState,seconds:number) {for(let i=0;i<Math.round(seconds*10);i++)stepGame(s,.1);}
function kill(s:GameState,a:Actor,kind:Actor['kind']) {
  const foe:Actor={...a,id:`target-${a.kills}`,team:'red',kind,hp:1,maxHp:kind==='hero'?660:180,x:a.x+1,y:a.y,protectedUntil:0,bot:false,buildChannel:undefined};
  s.actors.push(foe);a.cooldown=0;
  assert.equal(applyCommand(s,a.id,{type:'attack',targetId:foe.id}).ok,true);
  assert.equal(foe.hp,0);
  s.actors=s.actors.filter(other=>other!==foe);
}
function startBuild(s:GameState,a:Actor) {
  for(let y=Math.round(a.y)-4;y<=a.y+4;y++)for(let x=Math.round(a.x)-4;x<=a.x+4;x++) {
    if(applyCommand(s,a.id,{type:'build',x,y}).ok)return {x,y};
  }
  assert.fail('No legal build tile found');
}

test('creep last hits award XP, hero last hits award more and increase only killer stats',()=>{
  const {s,a}=setup();const hp=a.maxHp,dmg=attackDamage(a);
  assert.equal(a.level,1);assert.equal(a.xp,0);
  kill(s,a,'creep');assert.equal(a.xp,25);assert.equal(a.level,1);
  a.hp=300;kill(s,a,'hero');
  assert.equal(a.xp,125);assert.equal(a.level,2);assert.ok(a.maxHp>hp);assert.ok(a.hp>300);assert.ok(attackDamage(a)>dmg);
  assert.equal(a.kills,2);
  const fresh=setup().a;assert.equal(fresh.maxHp,hp);assert.equal(attackDamage(fresh),dmg);
});
test('hero level caps and persists across snapshots, death and old snapshot normalization',()=>{
  const {s,a}=setup();
  for(let i=0;i<100;i++)kill(s,a,'creep');
  assert.equal(a.level,10);assert.equal(a.xp,HERO_XP_THRESHOLDS[9]);assert.equal(a.maxHp,heroMaxHp(a.hero,10));
  const copy:GameState=JSON.parse(JSON.stringify(s));run(copy,.1);
  assert.equal(copy.actors[0].level,10);assert.equal(copy.actors[0].xp,a.xp);
  a.hp=0;a.respawnAt=1;run(s,1.1);assert.equal(a.level,10);assert.equal(a.hp,a.maxHp);
  delete a.level;delete a.xp;a.hp=a.maxHp/2;run(s,.1);
  assert.equal(a.level,1);assert.equal(a.xp,0);assert.equal(a.maxHp,660);
});
test('fountain heals allied core and spawn, emits heal, stops outside and never heals invaders',()=>{
  for(const position of [baseFor('blue'),spawnFor('blue',0)]) {
    const {s,a}=setup();Object.assign(a,position);a.hp=100;
    run(s,.5);assert.ok(a.hp>150);assert.equal(a.fountainHealing,true);
    assert.ok(s.effects.some(e=>e.kind==='heal'&&e.targetId===a.id));assert.equal(a.regenCooldown,0);
    Object.assign(a,{x:20,y:39});const before=a.hp;run(s,.2);assert.equal(a.hp,before);assert.equal(a.fountainHealing,false);
    Object.assign(a,baseFor('red'));run(s,.2);assert.equal(a.hp,before);
    Object.assign(a,{x:20,y:39});applyCommand(s,a.id,{type:'regen'});assert.equal(a.hp,before+a.maxHp*.3);assert.equal(a.regenCooldown,30);
  }
});
test('tower channel reserves cost and finishes exactly once after 2.5 seconds',()=>{
  const {s,a}=setup();a.steer={x:1,y:0,expiresAt:10};a.sprintUntil=10;
  const origin={x:a.x,y:a.y},p=startBuild(s,a);
  assert.deepEqual(s.bank.blue,{wood:800-TOWER_COST.wood,gold:400-TOWER_COST.gold});
  assert.equal(s.structures.length,0);assert.equal(a.sprintUntil,0);
  run(s,2.4);assert.equal(s.structures.length,0);assert.equal(a.x,origin.x);assert.equal(a.y,origin.y);
  const copy:GameState=JSON.parse(JSON.stringify(s));run(copy,.1);
  assert.equal(copy.structures.length,1);assert.equal(copy.actors[0].buildChannel,undefined);assert.equal(copy.structures[0].x,p.x);
  run(copy,1);assert.equal(copy.structures.length,1);assert.equal(copy.bank.blue.wood,720);
});
test('movement, attacks, casts, gather and recall cancel construction and refund once',()=>{
  const commands:Command[]=[{type:'steer',x:1,y:0},{type:'move',x:11,y:53},{type:'attack'}, {type:'ability',slot:1,x:15,y:53},{type:'ability',slot:2},{type:'regen'},{type:'recall'},{type:'gather'}];
  for(const command of commands){
    const {s,a}=setup();startBuild(s,a);assert.equal(applyCommand(s,a.id,command).ok,true,command.type);
    assert.equal(a.buildChannel,undefined,command.type);assert.deepEqual(s.bank.blue,{wood:800,gold:400},command.type);
    run(s,.1);assert.equal(s.structures.length,0);assert.equal(s.bank.blue.wood,800);
  }
});
test('zero and stale steer do not interrupt building; death refunds immediately',()=>{
  const {s,a}=setup();a.inputSeq=5;startBuild(s,a);
  applyCommand(s,a.id,{type:'steer',x:0,y:0,seq:6});assert.ok(a.buildChannel);
  applyCommand(s,a.id,{type:'steer',x:1,y:0,seq:5});assert.ok(a.buildChannel);
  const enemy:Actor={...a,id:'enemy',team:'red',buildChannel:undefined,x:a.x+1,hp:660,maxHp:660,protectedUntil:0,cooldown:0};
  s.actors.push(enemy);a.hp=1;a.protectedUntil=0;
  applyCommand(s,enemy.id,{type:'attack',targetId:a.id});
  assert.equal(a.hp,0);assert.equal(a.buildChannel,undefined);assert.deepEqual(s.bank.blue,{wood:800,gold:400});
  run(s,.2);assert.equal(s.bank.blue.wood,800);
});
test('cooldown-rejected skills and Regen preserve the construction reservation',()=>{
  const {s,a}=setup();startBuild(s,a);
  a.regenCooldown=20;a.abilityCooldowns=[8,12,16];
  const channel={...a.buildChannel},bank={...s.bank.blue};
  for(const command of [{type:'regen'},{type:'ability',slot:1},{type:'ability',slot:2},{type:'ability',slot:3}] as Command[]){
    assert.equal(applyCommand(s,a.id,command).ok,false);
    assert.deepEqual(a.buildChannel,channel);assert.deepEqual(s.bank.blue,bank);
  }
});
test('pending tower placements reserve spacing and team cap, invalid tiles spend nothing',()=>{
  const {s,a}=setup();const p=startBuild(s,a);
  const second:Actor={...a,id:'second',buildChannel:undefined,x:a.x+1};s.actors.push(second);
  const bank={...s.bank.blue};assert.equal(applyCommand(s,second.id,{type:'build',...p}).ok,false);assert.deepEqual(s.bank.blue,bank);
  assert.equal(applyCommand(s,second.id,{type:'build',x:-1,y:-1}).error,'Choose a land tile.');
  for(let i=0;i<5;i++)s.structures.push({id:`existing-${i}`,x:55,y:7,team:'blue',kind:'tower',hp:500,maxHp:500,cooldown:1});
  let cap=false;
  for(let y=second.y-4;y<=second.y+4;y++)for(let x=second.x-4;x<=second.x+4;x++)if(isWalkable(x,y)) {
    if(applyCommand(s,second.id,{type:'build',x,y}).error==='Your team has reached its 6 tower limit.')cap=true;
  }
  assert.ok(cap);assert.deepEqual(s.bank.blue,bank);
});
