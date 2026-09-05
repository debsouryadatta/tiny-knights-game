import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyCommand, stepGame } from './simulation';
import { attackDamage, attackInterval, HERO_HP } from './balance';
import type { Effect, HeroKind } from './types';

function arena(heroKind: HeroKind = 'knight') {
  const s = createGame('feedback');
  const id = addPlayer(s, { name: 'Attacker', hero: heroKind, companion: 'guardian', size: 1 });
  const hero = s.actors.find(a => a.id === id)!;
  const enemy = s.actors.find(a => a.team === 'red' && a.kind === 'hero')!;
  Object.assign(hero, { x: 6, y: 20, protectedUntil: 0 });
  Object.assign(enemy, { x: 7, y: 20, bot: false, protectedUntil: 0 });
  s.actors = [hero, enemy];
  s.structures = [];
  s.resources = [];
  const attack = () => applyCommand(s, hero.id, { type: 'attack', targetId: enemy.id });
  const events = (kind: Effect['kind']) => s.effects.filter(e => e.kind === kind);
  return { s, hero, enemy, attack, events };
}

test('protected hits do not damage, cancel recall, emit a hit, or push', () => {
  const { s, hero, enemy, attack, events } = arena();
  enemy.protectedUntil = 10;
  enemy.recallUntil = 3;
  attack();
  applyCommand(s, hero.id, { type: 'ability', slot: 3 });
  assert.equal(enemy.hp, enemy.maxHp);
  assert.equal(enemy.recallUntil, 3);
  assert.equal(enemy.lastDamage, undefined);
  assert.deepEqual({ x: enemy.x, y: enemy.y }, { x: 7, y: 20 });
  assert.equal(events('hit').length, 0);
  assert.equal(events('death').length, 0);
});

test('shield mitigation reports exact applied damage with source and impact metadata', () => {
  const { s, hero, enemy, attack, events } = arena();
  enemy.shieldUntil = 5;
  const before = enemy.hp;
  attack();
  const [hit] = events('hit');
  assert.ok(Math.abs(hit.amount! - attackDamage(hero) * .45) < 1e-9);
  assert.equal(hit.amount, before - enemy.hp);
  assert.equal(enemy.lastDamage?.amount, hit.amount);
  assert.equal(hit.sourceId, hero.id);
  assert.equal(hit.targetId, enemy.id);
  assert.deepEqual(hit.target, { x: enemy.x, y: enemy.y });
  assert.equal(hit.x, hero.x);
  assert.equal(hit.at, s.elapsed);
  assert.equal(hit.duration, hit.ttl);
  assert.equal(hit.style, 'melee');
  assert.equal('hp' in hit, false);
});

test('killing blow clamps damage and emits one hit and one death with one reward', () => {
  const { s, hero, enemy, attack, events } = arena();
  enemy.hp = 7.25;
  attack();
  hero.cooldown = 0;
  attack();
  applyCommand(s, hero.id, { type: 'ability', slot: 3 });
  assert.equal(enemy.hp, 0);
  assert.equal(events('hit').length, 1);
  assert.equal(events('hit')[0].amount, 7.25);
  assert.equal(enemy.lastDamage?.amount, 7.25);
  assert.equal(events('death').length, 1);
  assert.equal(events('death')[0].targetId, enemy.id);
  assert.equal(events('death')[0].sourceId, hero.id);
  assert.equal(events('death')[0].team, enemy.team);
  assert.equal(hero.kills, 1);
  assert.equal(s.bank.blue.gold, 15);
});

test('tap press and release produce one immediate hit without a delayed duplicate', () => {
  const { s, hero, enemy, events } = arena();
  applyCommand(s, hero.id, { type: 'attack', held: true });
  applyCommand(s, hero.id, { type: 'attack', held: false });
  stepGame(s, .1);
  assert.equal(events('hit').length, 1);
  assert.equal(enemy.hp, enemy.maxHp - attackDamage(hero));
  assert.ok(Math.abs(hero.cooldown - (attackInterval(hero) - .1)) < 1e-8);
});

test('held attacks fall back to an enemy in actual range when the locked target is outside it', () => {
  const { s, hero, enemy } = arena();
  enemy.x = 8;
  const nearby = { ...enemy, id: 'nearby', x: 7, y: 20 };
  s.actors.push(nearby);
  hero.attackHeld = true;
  hero.attackTargetId = enemy.id;
  stepGame(s, .01);
  assert.equal(enemy.hp, enemy.maxHp);
  assert.equal(nearby.hp, nearby.maxHp - attackDamage(hero));
});

test('ranger and structure hits identify projectiles and shockwave identifies magic', () => {
  const { s, hero, enemy, attack, events } = arena('ranger');
  attack();
  applyCommand(s, hero.id, { type: 'ability', slot: 3 });
  s.structures.push({ id: 'tower', kind: 'tower', team: 'blue', x: 10, y: 20, hp: 500, maxHp: 500, cooldown: 0 });
  stepGame(s, .01);
  assert.deepEqual(events('hit').map(e => e.style), ['projectile', 'magic', 'projectile']);
  assert.equal(events('hit').at(-1)?.sourceId, 'tower');
  assert.equal(events('hit').at(-1)?.targetId, enemy.id);
});

test('structure damage applies creep and overtime multipliers before clamping', () => {
  const { s, hero, enemy, events } = arena();
  s.elapsed = 480;
  hero.kind = 'creep';
  hero.bot = true;
  hero.attackHeld = true;
  s.actors = [hero];
  s.structures = [{ id: 'tower', kind: 'tower', team: enemy.team, x: 7, y: 20, hp: 500, maxHp: 500, cooldown: 100 }];
  stepGame(s, .01);
  assert.equal(events('hit')[0].amount, attackDamage(hero) * 2.5 * 2);
  hero.cooldown = 0;
  s.structures[0].hp = 4;
  stepGame(s, .01);
  assert.equal(events('hit').at(-1)?.amount, 4);
  assert.equal(events('death').length, 1);
  assert.equal(events('death')[0].targetId, 'tower');
});

test('death and respawn clear controls and cached paths without losing input ordering', () => {
  const { s, hero, enemy, attack, events } = arena();
  enemy.hp = 1;
  enemy.inputSeq = 12;
  enemy.steer = { x: 1, y: 0, expiresAt: 100 };
  enemy.target = { x: 20, y: 20 };
  enemy.attackHeld = true;
  enemy.attackUntil = 100;
  enemy.attackTargetId = hero.id;
  enemy.recallUntil = 100;
  enemy.sprintUntil = 100;
  s.simulation!.modes[enemy.id] = 'gather';
  s.simulation!.routes[enemy.id] = { goal: 20, path: [{ x: 20, y: 20 }] };
  attack();
  const assertCleared = () => {
    assert.equal(enemy.steer, undefined);
    assert.equal(enemy.target, undefined);
    assert.equal(enemy.attackHeld, false);
    assert.equal(enemy.attackUntil, 0);
    assert.equal(enemy.attackTargetId, undefined);
    assert.equal(enemy.recallUntil, undefined);
    assert.equal(enemy.sprintUntil, 0);
    assert.equal(s.simulation!.modes[enemy.id], 'idle');
    assert.equal(s.simulation!.routes[enemy.id], undefined);
    assert.equal(enemy.inputSeq, 12);
  };
  assertCleared();
  const deathPosition = { x: enemy.x, y: enemy.y };
  stepGame(s, .5);
  assert.deepEqual({ x: enemy.x, y: enemy.y }, deathPosition);
  s.elapsed = enemy.respawnAt - .1;
  stepGame(s, .1);
  assertCleared();
  assert.equal(enemy.hp, enemy.maxHp);
  assert.equal(events('respawn').length, 1);
  assert.equal(events('respawn')[0].targetId, enemy.id);
  const spawn = { x: enemy.x, y: enemy.y };
  applyCommand(s, enemy.id, { type: 'steer', x: 1, y: 0, seq: 11 });
  stepGame(s, .1);
  assert.deepEqual({ x: enemy.x, y: enemy.y }, spawn);
  assert.equal(events('respawn').length, 1);
});

test('recall completes once and supplies both positions without phantom movement', () => {
  const { s, hero, events } = arena();
  hero.hp = 100;
  const origin = { x: hero.x, y: hero.y };
  applyCommand(s, hero.id, { type: 'recall' });
  for (let i = 0; i < 6; i++) stepGame(s, .5);
  const [recall] = events('recall');
  assert.equal(events('recall').length, 1);
  assert.deepEqual({ x: recall.x, y: recall.y }, origin);
  assert.deepEqual(recall.target, { x: hero.x, y: hero.y });
  assert.equal(recall.sourceId, hero.id);
  assert.equal(recall.targetId, hero.id);
  assert.equal(recall.at, 3);
  assert.equal(hero.hp, HERO_HP[hero.hero]);
  const destination = { x: hero.x, y: hero.y };
  stepGame(s, .1);
  assert.deepEqual({ x: hero.x, y: hero.y }, destination);
  assert.equal(events('recall').length, 1);
});

test('movement, attacks, abilities, and actual damage cancel recall without completion events', () => {
  for (const action of ['move', 'attack', 'ability', 'damage'] as const) {
    const { s, hero, enemy, events } = arena();
    applyCommand(s, hero.id, { type: 'recall' });
    if (action === 'move') applyCommand(s, hero.id, { type: 'steer', x: 0, y: 1, seq: 1 });
    if (action === 'attack') applyCommand(s, hero.id, { type: 'attack' });
    if (action === 'ability') applyCommand(s, hero.id, { type: 'ability', slot: 2 });
    if (action === 'damage') applyCommand(s, enemy.id, { type: 'attack' });
    assert.equal(hero.recallUntil, undefined, action);
    for (let i = 0; i < 7; i++) stepGame(s, .5);
    assert.equal(events('recall').length, 0, action);
  }
});

test('stale or duplicate steer packets cannot override newer movement or repeated stops', () => {
  const { s, hero } = arena();
  const steer = (x: number, seq: number) => applyCommand(s, hero.id, { type: 'steer', x, y: 0, seq });
  steer(1, 10);
  steer(0, 9);
  steer(0, 10);
  assert.equal(hero.steer?.x, 1);
  steer(0, 11);
  steer(0, 12);
  steer(1, 11);
  assert.equal(hero.steer?.x, 0);
  assert.equal(hero.inputSeq, 12);
  applyCommand(s, hero.id, { type: 'recall' });
  steer(1, 11);
  steer(0, 13);
  assert.equal(hero.recallUntil, 3);
  assert.equal(steer(1, NaN).ok, false);
  assert.equal(hero.inputSeq, 13);
});

test('event IDs stay unique across a capped same-tick burst', () => {
  const { s, hero, enemy, attack } = arena();
  const seen = new Set<string>();
  for (let i = 0; i < 90; i++) {
    hero.cooldown = 0;
    enemy.hp = enemy.maxHp;
    attack();
    const event = s.effects.at(-1)!;
    assert.equal(seen.has(event.id), false);
    seen.add(event.id);
  }
  assert.equal(s.effects.length, 60);
  assert.equal(seen.size, 90);
});
