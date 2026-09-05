import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, addPlayer, stepGame} from './simulation';
import {baseFor, spawnFor, WIDTH, HEIGHT, bridgeCenters, riverX} from './map';

for (const size of [1, 2, 3] as const) {
  test(`${size}v${size} preserves slot lanes through takeover, snapshots and respawn`, () => {
    let s = createGame('lanes', size);
    const lanes = size === 1 ? [1] : size === 2 ? [0, 2] : [0, 1, 2];
    for (const team of ['blue', 'red'] as const) {
      for (let slot = 0; slot < size; slot++) {
        const id = `${team}-hero-${slot}`;
        assert.equal(s.actors.find(a => a.id === id)!.lane, lanes[slot]);
        addPlayer(s, {name: 'Player', hero: 'ranger', companion: 'guardian', size}, id);
        for (const a of s.actors.filter(a => a.id === id || a.ownerId === id)) {
          assert.equal(a.lane, lanes[slot]);
          a.hp = 0;
          a.respawnAt = .1;
        }
      }
    }
    s = JSON.parse(JSON.stringify(s));
    stepGame(s, .1);
    for (const team of ['blue', 'red'] as const) {
      for (let slot = 0; slot < size; slot++) {
        const id = `${team}-hero-${slot}`;
        for (const a of s.actors.filter(a => a.id === id || a.ownerId === id)) {
          assert.equal(a.lane, lanes[slot]);
          assert.equal(a.hp, a.maxHp);
          const spawn = spawnFor(team, slot * 2 + (a.kind === 'companion' ? 1 : 0));
          assert.ok(Math.hypot(a.x - spawn.x, a.y - spawn.y) < 2);
        }
      }
    }
  });
}

test('first waves leave base for all three distinct routes after twelve seconds', () => {
  const s = createGame('routes', 3);
  s.actors = []; // Observe waves without heroes drawing them away into combat.
  s.elapsed = 11.9;
  stepGame(s, .1);
  assert.equal(s.actors.length, 18);
  assert.equal(new Set(s.actors.map(a => a.id)).size, 18);
  for (let i = 0; i < 100; i++) stepGame(s, .1);
  for (const team of ['blue', 'red'] as const) {
    for (const lane of [0, 1, 2]) {
      const wave = s.actors.filter(a => a.team === team && a.lane === lane);
      assert.equal(wave.length, 3);
      // Compare in blue's coordinate system to assert rotationally mirrored routes.
      const positions = wave.map(a => team === 'blue' ? a : {x: WIDTH - 1 - a.x, y: HEIGHT - 1 - a.y});
      assert.ok(positions.every(a => Math.hypot(a.x - baseFor('blue').x, a.y - baseFor('blue').y) > 8));
      const relativeLane = team === "blue" ? lane : 2 - lane;
      if (relativeLane === 0) assert.ok(positions.every(a => a.y < baseFor('blue').y - 15));
      if (relativeLane === 2) assert.ok(positions.every(a => a.x > baseFor('blue').x + 12 && a.y > baseFor('blue').y - 4));
      if (relativeLane === 1) assert.ok(positions.every(a => a.x > baseFor('blue').x + 4 && a.y < baseFor('blue').y - 4));
    }
  }
});

test('wave caps are independent per team and lane and dead wave memory is removed', () => {
  const s = createGame('caps');
  s.actors = [];
  for (let wave = 0; wave < 5; wave++) {
    s.elapsed = 11.9 + wave * 30;
    stepGame(s, .1);
  }
  assert.equal(s.actors.length, 72);
  for (const team of ['blue', 'red']) for (const lane of [0, 1, 2]) {
    assert.equal(s.actors.filter(a => a.team === team && a.lane === lane).length, 12);
  }
  const victim = s.actors[0];
  victim.hp = 0;
  stepGame(s, .1);
  assert.ok(!s.actors.some(a => a.id === victim.id));
  assert.equal(s.simulation!.waypoints?.[victim.id], undefined);
  assert.equal(s.simulation!.routes[victim.id], undefined);
});

 test('old room snapshots upgrade fixed slot lanes and discard stale waypoint caches', () => {
  const s = createGame('old-room', 3);
  for (const a of s.actors) {
    a.lane = 1;
    a.hp = 0;
    a.respawnAt = 100;
    s.simulation!.routes[a.id] = {goal: 32, path: [{x: 31, y: 32}]};
    s.simulation!.waypoints ??= {};
    s.simulation!.waypoints[a.id] = 3;
  }
  stepGame(s, .1);
  for (const a of s.actors) {
    const slot = Number((a.ownerId ?? a.id).split('-').at(-1));
    assert.equal(a.lane, slot);
    if (slot !== 1) {
      assert.equal(s.simulation!.routes[a.id], undefined);
      assert.equal(s.simulation!.waypoints![a.id], undefined);
    }
  }
});

test('each team crosses the river on its assigned lane without a middle-lane shortcut', () => {
  for (const team of ['blue', 'red'] as const) for (const lane of [0, 1, 2]) {
    const s = createGame('bridge-routing');
    s.elapsed = 11.9;
    stepGame(s, .1);
    const soldier = s.actors.find(a => a.kind === 'creep' && a.team === team && a.lane === lane)!;
    s.actors = [soldier];
    s.structures = [];
    // Stay before the next scheduled wave while advancing this isolated soldier.
    let crossed = false;
    for (let i = 0; i < 1000; i++) {
      s.elapsed = 20;
      stepGame(s, .1);
      if ((team === 'blue' && soldier.x >= riverX(soldier.y) + 1.5) || (team === 'red' && soldier.x <= riverX(soldier.y) - 1.5)) {
        assert.ok(Math.abs(soldier.y - bridgeCenters[lane].y) < (lane === 1 ? 5 : 3),
          `${team} lane ${lane} crossed at ${soldier.x},${soldier.y}`);
        crossed = true;
        break;
      }
    }
    assert.ok(crossed, `${team} lane ${lane} must cross the river`);
  }
});

test('square-map snapshots migrate once with match progress and valid rectangular positions', async () => {
  const {normalizePlayerLanes} = await import('./simulation');
  const {canOccupy} = await import('./movement');
  const s = createGame('legacy-rectangle', 3);
  delete s.mapVersion;
  s.elapsed = 83;
  s.heroScore = {blue: 7, red: 4};
  s.bank.blue = {wood: 125, gold: 90};
  s.resources[0].amount = 73;
  for (const a of s.actors) {
    a.x = a.team === 'blue' ? 10 : 53;
    a.y = a.team === 'blue' ? 53 : 10;
    a.hp = 70;
    a.target = {x:57,y:56};
    a.steer = {x:1,y:0,expiresAt:100};
    s.simulation!.routes[a.id] = {goal:3641,path:[{x:57,y:56}]};
  }
  s.structures[0].x=8; s.structures[0].y=56; s.structures[0].hp=800;
  s.structures[1].x=55; s.structures[1].y=7;
  normalizePlayerLanes(s);
  assert.equal(s.mapVersion,2);
  assert.equal(s.elapsed,83);
  assert.deepEqual(s.heroScore,{blue:7,red:4});
  assert.deepEqual(s.bank.blue,{wood:125,gold:90});
  assert.equal(s.resources[0].amount,73);
  for (const a of s.actors) {
    assert.equal(a.hp,70);
    assert.ok(canOccupy(s,a,a.id),`${a.id} must be movable after migration`);
    assert.equal(a.target,undefined);
    assert.equal(a.steer,undefined);
  }
  for (const core of s.structures) assert.deepEqual({x:core.x,y:core.y},baseFor(core.team));
  assert.equal(s.structures.find(t=>t.team==='blue')!.hp,800);
  assert.deepEqual(s.simulation!.routes,{});
  const serialized=JSON.stringify(s);
  normalizePlayerLanes(s);
  assert.equal(JSON.stringify(s),serialized,'reconnect must not project positions twice');
});
