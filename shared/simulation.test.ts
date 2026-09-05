import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  addPlayer,
  applyCommand,
  stepGame,
  TOWER_COST,
} from "./simulation";
import { isWalkable } from "./map";
import {canOccupy,moveContinuous} from './movement';
import {ABILITY_COOLDOWNS,attackDamage,DASH_DAMAGE} from './balance';
import type { GameState } from "./types";
const draft = {
  name: "Tester",
  hero: "knight",
  companion: "harvester",
  size: 3,
} as const;
function run(s: GameState, seconds: number) {
  for (let t = 0; t < seconds * 5; t++) stepGame(s, 0.2);
}
test("3v3 starts with six heroes and six personal companions, unique walkable tiles", () => {
  const s = createGame("test", 3);
  assert.equal(s.actors.length, 12);
  assert.equal(new Set(s.actors.map((a) => `${a.x},${a.y}`)).size, 12);
  assert.ok(s.actors.every((a) => isWalkable(a.x, a.y)));
  assert.equal(s.actors.filter((a) => a.ownerId).length, 6);
  assert.deepEqual(s.bank.blue, { wood: 0, gold: 0 });
});
test("claim every slot, preserve companions and reject full match", () => {
  const s = createGame("test", 3);
  const ids = Array.from({ length: 6 }, () => addPlayer(s, draft));
  assert.equal(new Set(ids).size, 6);
  assert.throws(() => addPlayer(s, draft), /full/);
  assert.ok(ids.every((id) => s.actors.some((a) => a.ownerId === id)));
});
test("invalid destinations and unaffordable towers do not mutate resources", () => {
  const s = createGame("test", 3),
    id = addPlayer(s, draft),
    a = s.actors.find((a) => a.id === id)!;
  assert.equal(applyCommand(s, id, { type: "move", x: -1, y: 1 }).ok, false);
  assert.equal(applyCommand(s, id, { type: "move", x: NaN, y: 1 }).ok, false);
  assert.equal(
    applyCommand(s, id, { type: "build", x: a.x + 3, y: a.y }).ok,
    false,
  );
  assert.equal(s.structures.length, 2);
  assert.deepEqual(s.bank.blue, { wood: 0, gold: 0 });
});
test("gather command gathers into the shared bank; companions follow orders", () => {
  const s = createGame("test", 3),
    id = addPlayer(s, draft);
  assert.equal(applyCommand(s, id, { type: "gather" }).ok, true);
  run(s, 30);
  const a = s.actors.find((a) => a.id === id)!;
  assert.ok(a.gathered > 0);
  assert.equal(
    applyCommand(s, id, { type: "order", order: "escort" }).ok,
    true,
  );
  assert.equal(s.actors.find((a) => a.ownerId === id)!.order, "escort");
});
test("tower spend is atomic; overlap is rejected", () => {
  const s = createGame("test", 3),
    id = addPlayer(s, draft),
    a = s.actors.find((a) => a.id === id)!;
  s.bank.blue = { wood: 1000, gold: 1000 };
  let placed: { x: number; y: number } | undefined;
  for (let y = a.y - 5; y <= a.y + 5 && !placed; y++)
    for (let x = a.x - 5; x <= a.x + 5 && !placed; x++)
      if (applyCommand(s, id, { type: "build", x, y }).ok) placed = { x, y };
  assert.ok(placed);
  assert.equal(s.bank.blue.wood, 1000 - TOWER_COST.wood);
  assert.equal(s.bank.blue.gold, 1000 - TOWER_COST.gold);
  assert.equal(applyCommand(s, id, { type: "build", ...placed }).ok, false);
});
test("ability cooldown and respawn are authoritative", () => {
  const s = createGame("test", 3),
    id = addPlayer(s, draft),
    a = s.actors.find((a) => a.id === id)!;
  assert.equal(applyCommand(s, id, { type: "ability" }).ok, true);
  assert.equal(applyCommand(s, id, { type: "ability" }).ok, false);
  a.hp = 0;
  a.respawnAt = s.elapsed + 1;
  assert.equal(applyCommand(s, id, { type: "gather" }).ok, false);
  run(s, 2);
  assert.equal(a.hp, a.maxHp);
});
test("active simulation preserves physical separation and terrain bounds across a minute", () => {
  const s = createGame("test", 3);
  let fractional=false;
  for (let t = 0; t < 600; t++) {
    stepGame(s, 0.1);
    const alive = s.actors.filter((a) => a.hp > 0);
    fractional ||= alive.some(a=>Math.abs(a.x-Math.round(a.x))>.01||Math.abs(a.y-Math.round(a.y))>.01);
    assert.equal(new Set(alive.map((a) => `${a.x},${a.y}`)).size, alive.length);
    assert.ok(alive.every((a) => canOccupy(s,a,a.id)));
    assert.ok(s.effects.length <= 60);
  }
  assert.ok(s.actors.some((a) => a.gathered > 0));
  assert.ok(s.structures.length > 2);
  assert.ok(fractional);
});
test("JSON roundtrips preserve movement timers and player gather intent", () => {
  let s = createGame("persisted", 3);
  const id = addPlayer(s, draft),
    start = { ...s.actors.find((a) => a.id === id)! };
  applyCommand(s, id, { type: "gather" });
  for (let i = 0; i < 300; i++) {
    s = JSON.parse(JSON.stringify(s));
    stepGame(s, 0.1);
  }
  const a = s.actors.find((a) => a.id === id)!;
  assert.ok(a.gathered > 0);
  assert.ok(a.x !== start.x || a.y !== start.y);
  assert.ok(s.structures.length > 2);
});
test("three player heroes approach and destroy a full-health core through combat", () => {
  const s = createGame("siege", 3);
  const ids = ["knight", "ranger", "lancer"].map((hero) =>
    addPlayer(s, { ...draft, hero: hero as typeof draft.hero }),
  );
  s.actors = s.actors.filter((a) => ids.includes(a.id));
  const core = s.structures.find((t) => t.team === "red" && t.kind === "core")!;
  s.actors.forEach((a, i) => {
    a.x = core.x - 6;
    a.y = core.y + i - 1;
    assert.ok(isWalkable(a.x, a.y));
    applyCommand(s, a.id, { type: "attack",held:true });
  });
  for (let i = 0; i < 210; i++) {
    for (const id of ids) applyCommand(s, id, { type: "ability" });
    stepGame(s, 0.2);
  }
  assert.equal(core.hp, 0);
  assert.equal(s.phase, "finished");
  assert.equal(s.winner, "blue");
  const elapsed = s.elapsed;
  stepGame(s, 0.2);
  assert.equal(s.elapsed, elapsed);
});
test("combat targets stay JSON serializable and bot lane progress reaches combat", () => {
  let s = createGame("combat-roundtrip", 3);
  for (let i = 0; i < 900; i++) {
    s = JSON.parse(JSON.stringify(s));
    stepGame(s, 0.2);
  }
  assert.ok(s.actors.some((a) => a.kills > 0));
});
test("recall cannot be used as an instant heal during combat", () => {
  const s=createGame('recall',3),id=addPlayer(s,draft);
  const hero=s.actors.find(a=>a.id===id)!;
  const enemy=s.actors.find(a=>a.team!==hero.team)!;
  enemy.x=hero.x+2;enemy.y=hero.y;hero.hp=100;
  const before={x:hero.x,y:hero.y,hp:hero.hp};
  assert.equal(applyCommand(s,id,{type:'recall'}).ok,true);
  assert.deepEqual({x:hero.x,y:hero.y,hp:hero.hp},before);
  assert.equal(hero.recallUntil,3);
});
test("movement advances continuously on every 100ms tick and survives snapshots", () => {
  let s = createGame('movement-cadence', 3);
  const id = addPlayer(s, draft);
  s.actors = s.actors.filter(a => a.id === id);
  const start = { ...s.actors[0] };
  const destination = [{x:start.x+1,y:start.y},{x:start.x-1,y:start.y},{x:start.x,y:start.y+1}].find(p=>isWalkable(p.x,p.y))!;
  assert.ok(destination);
  assert.equal(applyCommand(s,id,{type:'move',...destination}).ok,true);
  stepGame(s,0.1);
  assert.ok(Math.abs(Math.hypot(s.actors[0].x-start.x,s.actors[0].y-start.y)-.5)<1e-8);
  s = JSON.parse(JSON.stringify(s));
  stepGame(s,0.1);
  assert.deepEqual({x:s.actors[0].x,y:s.actors[0].y},destination);
});
test('steer normalizes diagonals, acknowledges sequence, stops and times out',()=>{
 const s=createGame('steer',3),id=addPlayer(s,draft);s.actors=s.actors.filter(a=>a.id===id);const a=s.actors[0],start={...a};
 assert.equal(applyCommand(s,id,{type:'steer',x:1,y:1,seq:1}).ok,true);stepGame(s,.1);
 assert.ok(Math.abs(Math.hypot(a.x-start.x,a.y-start.y)-.5)<1e-8);assert.equal(a.inputSeq,1);
 applyCommand(s,id,{type:'steer',x:-1,y:0,seq:0});assert.ok(Math.abs(a.steer!.x-Math.SQRT1_2)<1e-12);
 applyCommand(s,id,{type:'steer',x:0,y:0,seq:2});const stopped={x:a.x,y:a.y};stepGame(s,.1);assert.deepEqual({x:a.x,y:a.y},stopped);
 applyCommand(s,id,{type:'steer',x:1,y:0,seq:3});for(let i=0;i<4;i++)stepGame(s,.1);const expired={x:a.x,y:a.y};stepGame(s,.1);assert.deepEqual({x:a.x,y:a.y},expired);
 assert.equal(applyCommand(s,id,{type:'steer',x:NaN,y:0,seq:4}).ok,false);
});
test('continuous sweep cannot tunnel across blocked terrain',()=>{
 const s=createGame('collision',3),id=addPlayer(s,draft);s.actors=s.actors.filter(a=>a.id===id);const a=s.actors[0];a.x=6;a.y=10;
 moveContinuous(s,a,-10,0);assert.ok(a.x>=1.78-1e-6);assert.ok(canOccupy(s,a,id));
});
test('three skill cooldowns are independent; recall cancels on steering and completes when safe',()=>{
 const s=createGame('skills',3),id=addPlayer(s,draft);s.actors=s.actors.filter(a=>a.id===id);const a=s.actors[0];
 for(const slot of [1,2,3] as const)assert.equal(applyCommand(s,id,{type:'ability',slot}).ok,true);
 assert.equal(applyCommand(s,id,{type:'ability',slot:2}).ok,false);assert.deepEqual(a.abilityCooldowns,ABILITY_COOLDOWNS);
 a.hp=100;applyCommand(s,id,{type:'recall'});applyCommand(s,id,{type:'steer',x:1,y:0,seq:1});assert.equal(a.recallUntil,undefined);
 applyCommand(s,id,{type:'recall'});run(s,3.2);assert.equal(a.recallUntil,undefined);assert.equal(a.hp,a.maxHp);
 a.hp=100;assert.equal(applyCommand(s,id,{type:'regen'}).ok,true);assert.equal(a.hp,100+a.maxHp*.3);assert.equal(applyCommand(s,id,{type:'regen'}).ok,false);
});
test('direct attack damages nearby target without auto-pushing lane and release stops attacks',()=>{
 const s=createGame('attack',3),id=addPlayer(s,draft),a=s.actors.find(a=>a.id===id)!,enemy=s.actors.find(e=>e.team!==a.team)!;
 s.structures=[];
 s.actors=[a,enemy];enemy.bot=false;enemy.x=a.x+1;enemy.y=a.y;const hp=enemy.hp;
 applyCommand(s,id,{type:'attack',held:true,targetId:enemy.id});stepGame(s,.1);assert.ok(enemy.hp<hp);
 applyCommand(s,id,{type:'attack',held:false});const after=enemy.hp;run(s,1);assert.equal(enemy.hp,after);
});
test('quick attack tap resolves before ticks; idle does not attack; attack and steer coexist',()=>{
 const s=createGame('quicktap',3),id=addPlayer(s,draft),a=s.actors.find(a=>a.id===id)!,enemy=s.actors.find(e=>e.team!==a.team)!;
 s.actors=[a,enemy];s.structures=[];enemy.bot=false;enemy.x=a.x+1;enemy.y=a.y;stepGame(s,.1);const hp=enemy.hp;
 assert.equal(hp,enemy.maxHp);applyCommand(s,id,{type:'attack',held:true});applyCommand(s,id,{type:'attack',held:false});assert.equal(enemy.hp,hp-attackDamage(a));
 applyCommand(s,id,{type:'steer',x:0,y:1,seq:1});applyCommand(s,id,{type:'attack',held:true});const y=a.y;stepGame(s,.1);assert.ok(a.y>y);assert.equal(a.attackHeld,true);
});
test('recall survives zero steer but damage interrupts it; aimed skills damage actual targets',()=>{
 const s=createGame('aim',3),id=addPlayer(s,{...draft,hero:'ranger'}),a=s.actors.find(a=>a.id===id)!,enemy=s.actors.find(e=>e.team!==a.team)!;
 s.actors=[a,enemy];enemy.bot=false;enemy.x=a.x+1;enemy.y=a.y;const hp=enemy.hp;
 applyCommand(s,id,{type:'ability',slot:1,x:enemy.x,y:enemy.y});assert.equal(enemy.hp,hp-DASH_DAMAGE);
 applyCommand(s,id,{type:'recall'});applyCommand(s,id,{type:'steer',x:0,y:0,seq:1});assert.equal(a.recallUntil,s.elapsed+3);
 applyCommand(s,enemy.id,{type:'attack'});assert.equal(a.recallUntil,undefined);
});
