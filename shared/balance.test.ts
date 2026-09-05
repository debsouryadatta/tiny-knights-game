import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,addPlayer,applyCommand,stepGame} from './simulation';
import {HERO_HP,BASIC_DPS,DASH_DAMAGE,SHOCKWAVE_DAMAGE,TOWER_DAMAGE,attackDamage,attackInterval} from './balance';
function arena(){
 const s=createGame('balance',2),id=addPlayer(s,{name:'Player',hero:'knight',companion:'guardian',size:2});
 const hero=s.actors.find(a=>a.id===id)!;hero.x=6;hero.y=20;hero.protectedUntil=0;
 const enemy=s.actors.find(a=>a.team!==hero.team)!;enemy.bot=false;enemy.x=7;enemy.y=20;
 s.actors=[hero,enemy];s.structures=[];return {s,hero,enemy};
}
test('role durability and ability budgets have measured bounds',()=>{
 for(const kind of ['knight','ranger','lancer'] as const){
  assert.ok(HERO_HP[kind]/BASIC_DPS>=9&&HERO_HP[kind]/BASIC_DPS<=11);
  assert.ok(HERO_HP[kind]/TOWER_DAMAGE>=9&&HERO_HP[kind]/TOWER_DAMAGE<=11);
  const burst=(DASH_DAMAGE+SHOCKWAVE_DAMAGE)/600;
  assert.equal(burst,.55);
 }
});
test('creeps have one twelfth hero DPS, not inherited knight attacks',()=>{
 const {s,hero,enemy}=arena();enemy.kind='creep';enemy.cooldown=0;
 assert.equal(attackDamage(enemy)/attackInterval(enemy),BASIC_DPS/12);
 stepGame(s,.1);assert.equal(hero.hp,HERO_HP.knight-6);
 assert.equal(hero.lastDamage?.sourceKind,'creep');assert.equal(hero.lastDamage?.amount,6);
});
test('tower tanks on soldiers before heroes and reports damage source',()=>{
 const {s,hero,enemy}=arena();enemy.team='blue';enemy.kind='creep';enemy.x=8;
 s.structures=[{id:'tower-test',team:'red',kind:'tower',x:5,y:20,hp:500,maxHp:500,cooldown:0}];
 stepGame(s,.1);assert.equal(hero.hp,hero.maxHp);assert.equal(enemy.hp,enemy.maxHp-TOWER_DAMAGE);
 assert.equal(enemy.lastDamage?.sourceName,'red tower');
 enemy.hp=0;s.structures[0].cooldown=0;stepGame(s,.1);assert.equal(hero.hp,hero.maxHp-TOWER_DAMAGE);
});
test('solo tower allows at least eight seconds to react, then kills by eleven seconds',()=>{
 const {s,hero}=arena();s.actors=[hero];
 s.structures=[{id:'tower-test',team:'red',kind:'tower',x:5,y:20,hp:500,maxHp:500,cooldown:0}];
 let diedAt=0;for(let i=0;i<120;i++){stepGame(s,.1);if(hero.hp===0){diedAt=s.elapsed;break;}}
 assert.ok(diedAt>=8&&diedAt<=11.2,`death at ${diedAt}`);
 assert.equal(hero.lastDamage?.sourceKind,'tower');
});
test('respawn protection stops camp damage and ends on offensive action',()=>{
 const {s,hero,enemy}=arena();hero.hp=0;hero.respawnAt=0;stepGame(s,.1);
 assert.ok(hero.protectedUntil!>s.elapsed);
 enemy.x=hero.x+1;enemy.y=hero.y;const hp=hero.hp;
 applyCommand(s,enemy.id,{type:'attack'});assert.equal(hero.hp,hp);
 applyCommand(s,hero.id,{type:'ability',slot:2});assert.equal(hero.protectedUntil,0);
 enemy.cooldown=0;applyCommand(s,enemy.id,{type:'attack'});assert.ok(hero.hp<hp);
 assert.equal(hero.lastDamage?.amount,Math.round(attackDamage(enemy)));
});
test('persisted health upgrades once and preserves dead actors',()=>{
 const {s,hero,enemy}=arena();hero.maxHp=360;hero.hp=180;enemy.maxHp=360;enemy.hp=0;enemy.respawnAt=100;
 stepGame(s,.1);assert.equal(hero.maxHp,660);assert.equal(hero.hp,330);assert.equal(enemy.hp,0);
 stepGame(s,.1);assert.equal(hero.hp,330);
});
test('actual basic attacks take nine to eleven seconds to defeat an idle knight',()=>{
 const {s,hero,enemy}=arena();let diedAt=0;
 for(let i=0;i<180;i++){applyCommand(s,hero.id,{type:'attack',held:true});stepGame(s,.1);if(enemy.hp===0){diedAt=s.elapsed;break;}}
 assert.ok(diedAt>=9&&diedAt<=11,`basic death at ${diedAt}`);
});
test('primary and ultimate remain useful but cannot instantly kill a healthy hero',()=>{
 const {s,hero,enemy}=arena();const hp=enemy.hp;
 applyCommand(s,hero.id,{type:'ability',slot:1});applyCommand(s,hero.id,{type:'ability',slot:3});
 assert.equal(hp-enemy.hp,DASH_DAMAGE+SHOCKWAVE_DAMAGE);assert.ok(enemy.hp>=enemy.maxHp*.5);
});
