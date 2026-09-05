import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, addPlayer, applyCommand, stepGame} from './simulation';
import {heroMaxHp, HERO_KILL_TARGET} from './balance';
import type {Actor, GameState} from './types';

function duel() {
  const s = createGame('victory');
  const blue = s.actors.find(a => a.id === 'blue-hero-0')!;
  const red = s.actors.find(a => a.id === 'red-hero-0')!;
  s.actors = [blue, red]; s.structures = []; s.resources = [];
  Object.assign(blue, {x:20,y:39,bot:false,protectedUntil:0});
  Object.assign(red, {x:21,y:39,bot:false,protectedUntil:0});
  return {s, blue, red};
}
function kill(s:GameState, source:Actor, target:Actor) {
  target.hp=1; target.protectedUntil=0; source.cooldown=0;
  assert.equal(applyCommand(s,source.id,{type:'attack',targetId:target.id}).ok,true);
  assert.equal(target.hp,0);
}

test('21 enemy hero kills wins, 20 does not, and finished games are immutable', () => {
  const {s,blue,red}=duel();
  for(let i=0;i<HERO_KILL_TARGET;i++) {
    kill(s,blue,red);
    assert.deepEqual(s.heroScore,{blue:i+1,red:0});
    assert.equal(s.phase,i===20?'finished':'playing');
  }
  assert.equal(s.winner,'blue');assert.equal(s.winnerReason,'hero-kills');
  const before=JSON.stringify(s);
  stepGame(s,.1);
  assert.equal(applyCommand(s,blue.id,{type:'attack'}).ok,false);
  assert.equal(JSON.stringify(s),before);
});
test('minion and companion kills retain XP and stats without increasing hero score', () => {
  const {s,blue,red}=duel();
  for(const kind of ['creep','companion'] as const) {red.kind=kind;kill(s,blue,red);}
  assert.deepEqual(s.heroScore,{blue:0,red:0});
  assert.equal(blue.kills,2);assert.equal(blue.xp,50);assert.equal(s.phase,'playing');
});
test('companion and minion last hits credit their team for enemy hero kills', () => {
  for(const kind of ['companion','creep'] as const) {
    const {s,blue,red}=duel();blue.kind=kind;blue.order='defend';blue.cooldown=0;red.hp=1;
    stepGame(s,.1);
    assert.equal(red.hp,0,kind);assert.deepEqual(s.heroScore,{blue:1,red:0});
  }
});
test('tower and core last hits credit their team and the 21st wins', () => {
  for(const kind of ['tower','core'] as const) {
    const {s,blue,red}=duel();s.actors=[red];red.hp=1;
    s.heroScore={blue:20,red:0};
    s.structures=[{id:'defender',kind,team:'blue',hp:500,maxHp:500,cooldown:0,x:blue.x,y:blue.y}];
    stepGame(s,.1);
    assert.deepEqual(s.heroScore,{blue:21,red:0});assert.equal(s.winner,'blue');
    assert.equal(s.winnerReason,'hero-kills');
  }
});
test('destroying the core still wins below the hero kill target; towers do not', () => {
  for(const kind of ['tower','core'] as const) {
    const {s,blue,red}=duel();s.actors=[blue];
    s.structures=[{id:'target',kind,team:'red',hp:1,maxHp:500,cooldown:0,x:red.x,y:red.y}];
    applyCommand(s,blue.id,{type:'attack',targetId:'target'});
    assert.equal(s.phase,kind==='core'?'finished':'playing');
    assert.equal(s.winnerReason,kind==='core'?'core':undefined);
    assert.deepEqual(s.heroScore,{blue:0,red:0});
  }
});
test('one shockwave cannot change the winning reason or score after its winning hit', () => {
  const {s,blue,red}=duel();s.heroScore={blue:20,red:0};red.hp=1;
  s.structures=[{id:'red-core',kind:'core',team:'red',hp:1,maxHp:2200,cooldown:0,x:22,y:39}];
  assert.equal(applyCommand(s,blue.id,{type:'ability',slot:3}).ok,true);
  assert.equal(s.winner,'blue');assert.equal(s.winnerReason,'hero-kills');
  assert.equal(s.structures[0].hp,1);assert.deepEqual(s.heroScore,{blue:21,red:0});
});
test('opposing lethal attacks in the same tick cannot overwrite the first victory', () => {
  const {s,blue,red}=duel();s.heroScore={blue:20,red:20};blue.hp=red.hp=1;
  Object.assign(blue,{xp:2340,level:10,maxHp:heroMaxHp('knight',10)});
  blue.attackHeld=red.attackHeld=true;
  s.structures=[{id:'revenge',team:'red',kind:'tower',hp:500,maxHp:500,cooldown:0,x:20,y:40}];
  stepGame(s,.1);
  assert.equal(s.winner,'blue');assert.equal(blue.hp,1);assert.deepEqual(s.heroScore,{blue:21,red:20});
});
test('score survives JSON snapshots and takeover, new games reset and legacy kills are not reconstructed', () => {
  const s=createGame('takeover');const old=s.actors.find(a=>a.id==='blue-hero-0')!;
  Object.assign(old,{xp:420,level:4,kills:12,gathered:7,steer:{x:1,y:0,expiresAt:99},attackHeld:true,abilityCooldown:8});
  s.heroScore={blue:8,red:6};
  const copy:GameState=JSON.parse(JSON.stringify(s));
  const id=addPlayer(copy,{name:'Guest',hero:'ranger',companion:'scout',size:1});
  const joined=copy.actors.find(a=>a.id===id)!;
  assert.equal(joined.xp,420);assert.equal(joined.level,4);assert.equal(joined.kills,12);
  assert.equal(joined.maxHp,heroMaxHp('ranger',4));assert.equal(joined.hp,joined.maxHp);
  assert.equal(joined.steer,undefined);assert.equal(joined.attackHeld,undefined);assert.equal(joined.abilityCooldown,0);
  assert.deepEqual(copy.heroScore,{blue:8,red:6});
  delete copy.heroScore;stepGame(copy,.1);assert.deepEqual(copy.heroScore,{blue:0,red:0});
  assert.deepEqual(createGame('new').heroScore,{blue:0,red:0});
});
