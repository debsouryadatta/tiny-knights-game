import type {
  Actor,
  Command,
  Draft,
  GameState,
  Order,
  Structure,
  Team,
  Vec,
} from "./types";
import {canOccupy,moveContinuous,getMoveSpeed} from './movement';
import {HERO_HP,CREEP_HP,TOWER_DAMAGE,CORE_DAMAGE,SPAWN_PROTECTION,ABILITY_COOLDOWNS,DASH_DAMAGE,DASH_DISTANCE,SPRINT_DURATION,SHOCKWAVE_DAMAGE,SHOCKWAVE_RADIUS,SHOCKWAVE_PUSH,attackDamage,attackInterval} from './balance';
import {
  WIDTH,
  HEIGHT,
  isWalkable,
  baseFor,
  spawnFor,
  resourceSeeds,
  laneWaypoints,
} from "./map";

const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const key = (p: Vec) => Math.round(p.y) * WIDTH + Math.round(p.x);
const opposite = (team: Team): Team => (team === "blue" ? "red" : "blue");
export const TOWER_COST = { wood: 80, gold: 40 } as const;
type Memory = {
  move: number;
  gather: number;
  ai: number;
  modes: Record<string, "move" | "gather" | "attack" | "idle">;
  routes: Record<string, { goal: number; path: Vec[] }>;
  waypoints?: Record<string, number>;
};
function memory(s: GameState & { simulation?: Memory }) {
  let m = s.simulation;
  if (!m) {
    m = { move: 0, gather: 0, ai: 0, modes: {}, routes: {} };
    s.simulation = m;
  }
  return m;
}
function log(s: GameState, message: string) {
  s.log.push(message);
  s.log = s.log.slice(-12);
}
function effect(
  s: GameState,
  p: Vec,
  kind: GameState["effects"][number]["kind"],
  team: Team,
  target?: Vec,
) {
  s.effects.push({
    ...p,
    id: `e${s.tick}-${s.effects.length}`,
    kind,
    team,
    ttl: 0.7,
    target,
  });
  s.effects = s.effects.slice(-60);
}
function occupied(s: GameState, p: Vec, except?: string) {
  return (
    s.actors.some(
      (a) => a.id !== except && a.hp > 0 && distance(a,p)<.56,
    ) || s.structures.some((a) => a.hp > 0 && distance(a,p)<.73)
  );
}
function free(s: GameState, p: Vec, except?: string) {
  return canOccupy(s,p,except);
}
function nearestFree(s: GameState, p: Vec, except?: string): Vec {
  for (let r = 0; r < 15; r++)
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const q = { x: Math.round(p.x) + x, y: Math.round(p.y) + y };
        if (free(s, q, except)) return q;
      }
  return p;
}
function actor(
  id: string,
  team: Team,
  p: Vec,
  hero: Actor["hero"],
  companion?: Actor["companion"],
  ownerId?: string,
): Actor {
  const hp = companion
    ? companion === "guardian"
      ? 200
      : 120
    : HERO_HP[hero];
  return {
    ...p,
    id,
    team,
    hero,
    companion,
    ownerId,
    kind: companion ? "companion" : "hero",
    name: companion ? `${companion} agent` : `${team} ${hero}`,
    hp,
    maxHp: hp,
    bot: true,
    order: companion ? "gather" : "attack",
    cooldown: 0,
    abilityCooldown: 0,
    respawnAt: 0,
    kills: 0,
    gathered: 0,
    lastAction: "Ready",
    lane: 0,
  };
}
export function createGame(room: string, size: 2 | 3): GameState {
  const s: GameState = {
    room,
    size,
    tick: 0,
    elapsed: 0,
    phase: "playing",
    actors: [],
    structures: [],
    resources: resourceSeeds().map((r, i) => ({
      ...r,
      id: `resource-${i}`,
      amount: 300,
      maxAmount: 300,
    })),
    bank: { blue: { wood: 0, gold: 0 }, red: { wood: 0, gold: 0 } },
    effects: [],
    log: ["Gather wood and gold. Build towers. Destroy the enemy core."],
  };
  for (const team of ["blue", "red"] as Team[]) {
    s.structures.push({
      ...baseFor(team),
      id: `core-${team}`,
      team,
      kind: "core",
      hp: 2200,
      maxHp: 2200,
      cooldown: 0,
    });
    for (let i = 0; i < size; i++) {
      const id = `${team}-hero-${i}`;
      const a = actor(
        id,
        team,
        nearestFree(s, spawnFor(team, i * 2)),
        (["knight", "ranger", "lancer"] as const)[i],
      );
      a.lane = i;
      s.actors.push(a);
      const c = actor(
        `${id}-agent`,
        team,
        nearestFree(s, spawnFor(team, i * 2 + 1)),
        a.hero,
        (["harvester", "guardian", "scout"] as const)[i],
        id,
      );
      c.lane = i;
      s.actors.push(c);
    }
  }
  memory(s);
  return s;
}
export function addPlayer(s: GameState, draft: Draft): string {
  if (s.phase !== "playing") throw new Error("This match has ended.");
  const a = s.actors.find((a) => a.kind === "hero" && a.bot);
  if (!a) throw new Error("Match is full.");
  a.bot = false;
  a.name = (draft.name.trim() || "Commander").slice(0, 24);
  a.hero = draft.hero;
  a.maxHp = HERO_HP[draft.hero];
  a.hp = a.maxHp;
  a.protectedUntil=s.elapsed+SPAWN_PROTECTION;
  a.order = "escort";
  a.lastAction = "Awaiting your command";
  memory(s).modes[a.id] = "idle";
  const c = s.actors.find((c) => c.ownerId === a.id)!;
  c.companion = draft.companion;
  c.name = `${draft.companion} agent`;
  c.maxHp = draft.companion === "guardian" ? 200 : 120;
  c.hp = c.maxHp;
  return a.id;
}
function damage(
  s: GameState,
  source: Actor | Structure,
  target: Actor | Structure,
  amount: number,
) {
  if (target.hp <= 0) return;
  if ('respawnAt' in source) source.protectedUntil=0;
  if ('respawnAt' in target && (target.protectedUntil??0)>s.elapsed) return;
  if('recallUntil' in target)target.recallUntil=undefined;
  if('shieldUntil' in target && (target.shieldUntil??0)>s.elapsed)amount*=.45;
  if ("kind" in source && source.kind === "creep" && !("respawnAt" in target))
    amount *= 2.5;
  if (s.elapsed >= 480 && !("respawnAt" in target))
    amount *= 2 + Math.floor((s.elapsed - 480) / 120);
  target.hp = Math.max(0, target.hp - amount);
  if('respawnAt' in target)target.lastDamage={sourceId:source.id,sourceName:'name' in source?source.name:`${source.team} ${source.kind}`,sourceKind:source.kind,amount:Math.round(amount),at:s.elapsed};
  effect(s, source, "hit", source.team, { x: target.x, y: target.y });
  if (target.hp === 0) {
    if ("respawnAt" in target) {
      target.respawnAt = s.elapsed + (target.kind === "hero" ? 10 : 7);
      target.target = undefined;
      if ("kills" in source) source.kills++;
      s.bank[source.team].gold += target.kind === "hero" ? 15 : 5;
      if (target.kind !== "creep")
        log(s, `${target.name} defeated · respawning`);
    } else {
      log(s, `${target.team} ${target.kind} destroyed`);
      if (target.kind === "core") {
        s.phase = "finished";
        s.winner = source.team;
        log(s, `${source.team.toUpperCase()} empire wins!`);
      }
    }
  }
}
function enemies(s: GameState, a: Actor | Structure): (Actor | Structure)[] {
  return [
    ...s.actors.filter((b) => b.hp > 0 && b.team !== a.team),
    ...s.structures.filter((b) => b.hp > 0 && b.team !== a.team),
  ].sort((b, c) => distance(a, b) - distance(a, c));
}
function build(
  s: GameState,
  a: Actor,
  p: Vec,
): { ok: boolean; error?: string } {
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || !isWalkable(p.x, p.y))
    return { ok: false, error: "Choose a land tile." };
  if (distance(a, p) > 5)
    return { ok: false, error: "Move within 5 tiles to build." };
  if (
    !free(s, p) ||
    s.resources.some((r) => distance(r, p) < 2) ||
    s.structures.some((t) => t.hp > 0 && distance(t, p) < 4)
  )
    return {
      ok: false,
      error: "Keep 4 tiles from structures and 2 from resources.",
    };
  if (
    s.structures.filter(
      (t) => t.team === a.team && t.kind === "tower" && t.hp > 0,
    ).length >= 6
  )
    return { ok: false, error: "Your team has reached its 6 tower limit." };
  const b = s.bank[a.team];
  if (b.wood < TOWER_COST.wood || b.gold < TOWER_COST.gold)
    return { ok: false, error: "Tower costs 80 wood + 40 gold." };
  b.wood -= TOWER_COST.wood;
  b.gold -= TOWER_COST.gold;
  s.structures.push({
    ...p,
    id: `tower-${s.tick}-${s.structures.length}`,
    team: a.team,
    kind: "tower",
    hp: 500,
    maxHp: 500,
    cooldown: 0.8,
  });
  effect(s, p, "build", a.team);
  log(s, `${a.name} built a tower`);
  return { ok: true };
}
export function applyCommand(
  s: GameState,
  id: string,
  c: Command,
): { ok: boolean; error?: string } {
  const a = s.actors.find((a) => a.id === id && a.kind === "hero" && !a.bot);
  if (!a) return { ok: false, error: "Player not found." };
  if (s.phase !== "playing") return { ok: false, error: "Match finished." };
  if (a.hp <= 0) return { ok: false, error: "Wait for respawn." };
  const m = memory(s);
  switch (c.type) {
    case 'steer': {
      if(!Number.isFinite(c.x)||!Number.isFinite(c.y)|| (c.seq!==undefined&&(!Number.isSafeInteger(c.seq)||c.seq<0)))return {ok:false,error:'Invalid movement input.'};
      if(c.seq!==undefined&&c.seq<=(a.inputSeq??-1))return {ok:true};
      if(c.seq!==undefined)a.inputSeq=c.seq;
      const length=Math.hypot(c.x,c.y),scale=1/Math.max(1,length);
      a.steer={x:c.x*scale,y:c.y*scale,expiresAt:s.elapsed+.35};
      a.target=undefined;delete m.routes[id];m.modes[id]='idle';
      if(length>.01){a.recallUntil=undefined;a.lastAction='Moving';}
      break;
    }
    case "move": {
      if (
        !Number.isInteger(c.x) ||
        !Number.isInteger(c.y) ||
        !isWalkable(c.x, c.y)
      )
        return { ok: false, error: "That tile is not reachable land." };
      a.target = { x: c.x, y: c.y };
      a.steer=undefined;a.recallUntil=undefined;
      m.modes[id] = "move";
      delete m.routes[id];
      a.lastAction = "Moving";
      break;
    }
    case "gather":
      a.steer=undefined;a.recallUntil=undefined;
      m.modes[id] = "gather";
      a.target = undefined;
      a.lastAction = "Gathering resources";
      break;
    case "attack":
      if((c.held!==undefined&&typeof c.held!=='boolean')||(c.targetId!==undefined&&typeof c.targetId!=='string'))return {ok:false,error:'Invalid attack input.'};
      a.attackHeld=c.held===true;a.attackUntil=c.held===false?0:s.elapsed+1.2;
      if(c.held!==false)a.protectedUntil=0;
      a.attackTargetId=c.targetId;a.recallUntil=undefined;
      if(c.held===false&&m.modes[id]==='idle')a.target=undefined;
      // Keep the hit/no-target result visible after a quick tap ends.
      if(c.held!==false)a.lastAction='Seeking attack target';
      // A quick press/release must still swing even when both arrive between ticks.
      if(c.held!==false&&a.cooldown<=0){
        const range=a.hero==='ranger'?5:1.6,candidates=enemies(s,a),foe=candidates.find(e=>e.id===c.targetId&&distance(a,e)<=range)??candidates.find(e=>distance(a,e)<=range);
        if(foe){damage(s,a,foe,attackDamage(a));a.cooldown=attackInterval(a);a.lastAction='In combat';if(!a.attackHeld)a.attackUntil=0;}
        else a.lastAction='No target in range';
      }
      break;
    case "build":
      return build(s, a, c);
    case "order": {
      if (
        !(["gather", "escort", "attack", "defend"] as Order[]).includes(c.order)
      )
        return { ok: false, error: "Unknown order." };
      const agent = s.actors.find((x) => x.ownerId === id);
      if (agent) {
        agent.order = c.order;
        agent.target = undefined;
        delete m.routes[agent.id];
        agent.lastAction = `Order: ${c.order}`;
      }
      break;
    }
    case "recall": {
      a.recallUntil=s.elapsed+3;a.target=undefined;a.steer=undefined;a.attackHeld=false;a.attackUntil=0;m.modes[id]='idle';delete m.routes[id];a.lastAction='Recalling · 3 seconds';
      break;
    }
    case 'regen': {
      if((a.regenCooldown??0)>0)return {ok:false,error:'Regen is cooling down.'};
      a.recallUntil=undefined;a.regenCooldown=30;a.hp=Math.min(a.maxHp,a.hp+a.maxHp*.3);effect(s,a,'heal',a.team);a.lastAction='Regenerated';break;
    }
    case "ability": {
      const slot=c.slot??1;if(![1,2,3].includes(slot))return {ok:false,error:'Unknown ability.'};
      if((c.x!==undefined&&!Number.isFinite(c.x))||(c.y!==undefined&&!Number.isFinite(c.y)))return {ok:false,error:'Invalid aim.'};
      a.abilityCooldowns??=[a.abilityCooldown,0,0];
      if (a.abilityCooldowns[slot-1] > 0)
        return { ok: false, error: "Ability is cooling down." };
      a.recallUntil=undefined;a.protectedUntil=0;a.abilityCooldowns[slot-1]=ABILITY_COOLDOWNS[slot-1];a.abilityCooldown=a.abilityCooldowns[0];
      const nearest=enemies(s,a)[0],aim={x:c.x??nearest?.x??a.x+(a.team==='blue'?1:-1),y:c.y??nearest?.y??a.y};
      const dx=aim.x-a.x,dy=aim.y-a.y,length=Math.hypot(dx,dy)||1,dir={x:dx/length,y:dy/length};
      const origin={x:a.x,y:a.y};
      if(slot===1){
        const hit=new Set<string>();
        const strike=()=>enemies(s,a).filter(e=>!hit.has(e.id)&&distance(a,e)<=.9).forEach(e=>{hit.add(e.id);damage(s,a,e,DASH_DAMAGE);});
        strike();
        // Check every tenth tile: never teleport through a wall, unit or tower.
        for(let travelled=0;travelled<DASH_DISTANCE-1e-6;travelled+=.1){
          const next={x:a.x+dir.x*.1,y:a.y+dir.y*.1};
          if(!canOccupy(s,next,a.id))break;
          Object.assign(a,next);strike();
        }
        a.target=undefined;delete memory(s).routes[a.id];a.lastAction='Dash';
      }else if(slot===2){a.sprintUntil=s.elapsed+SPRINT_DURATION;a.lastAction='Sprint';}
      else {
        for(const e of enemies(s,a).filter(e=>distance(a,e)<=SHOCKWAVE_RADIUS)){
          const ex=e.x-a.x,ey=e.y-a.y,d=Math.hypot(ex,ey)||1;
          damage(s,a,e,SHOCKWAVE_DAMAGE);
          if('respawnAt' in e&&e.hp>0){moveContinuous(s,e,ex/d*SHOCKWAVE_PUSH,ey/d*SHOCKWAVE_PUSH);delete memory(s).routes[e.id];}
        }
        a.lastAction='Shockwave';
      }
      effect(s,origin,'ability',a.team,{x:a.x,y:a.y});s.effects[s.effects.length-1].abilitySlot=slot;
      break;
    }
    default:
      return { ok: false, error: "Unknown command." };
  }
  return { ok: true };
}
function nextStep(s: GameState, a: Actor, goal: Vec): Vec | undefined {
  const m = memory(s);
  const dest = key(goal);
  const cached = m.routes[a.id];
  if (
    cached?.goal === dest &&
    cached.path.length &&
    free(s, cached.path[0], a.id)
  )
    return cached.path[0];
  const start={x:Math.round(a.x),y:Math.round(a.y)};
  const queue: Vec[] = [start];
  const previous = new Map<number, Vec>();
  previous.set(key(a), a);
  let end: Vec | undefined;
  const approach = occupied(s, goal, a.id) ? 1.5 : 0;
  for (let i = 0; i < queue.length && i < WIDTH * HEIGHT; i++) {
    const p = queue[i];
    if (distance(p, goal) <= approach) {
      end = p;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const q = { x: p.x + dx, y: p.y + dy };
      const k = key(q);
      if (
        q.x < 0 ||
        q.x >= WIDTH ||
        q.y < 0 ||
        q.y >= HEIGHT ||
        previous.has(k) ||
        !free(s, q, a.id)
      )
        continue;
      previous.set(k, p);
      queue.push(q);
    }
  }
  if (!end) return;
  const path: Vec[] = [];
  while (key(end) !== key(a)) {
    path.push(end);
    end = previous.get(key(end))!;
  }
  path.reverse();
  m.routes[a.id] = { goal: dest, path };
  return path[0];
}
function pushTarget(s: GameState, a: Actor): Vec {
  const local = enemies(s, a).find((e) => distance(a, e) < 9);
  if (local) return local;
  const points = laneWaypoints(a.team, a.lane);
  const m = memory(s);
  m.waypoints ??= {};
  let index = m.waypoints[a.id];
  if (index === undefined) {
    index = 0;
    for (let i = 1; i < points.length; i++)
      if (distance(a, points[i]) < distance(a, points[index])) index = i;
  }
  if (distance(a, points[index]) < 3 && index < points.length - 1) index++;
  m.waypoints[a.id] = index;
  return points[index] ?? baseFor(opposite(a.team));
}
export function stepGame(s: GameState, dt: number): void {
  if (s.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.5);
  const m = memory(s);
  // Old persisted rooms keep their health fraction, including dead actors.
  for(const a of s.actors)if(a.kind==='hero'&&a.maxHp!==HERO_HP[a.hero]){a.hp=a.hp/a.maxHp*HERO_HP[a.hero];a.maxHp=HERO_HP[a.hero];}
  s.elapsed += dt;
  s.tick++;
  m.move += dt;
  m.gather += dt;
  m.ai += dt;
  const move = m.move >= 0.2,
    gather = m.gather >= 1,
    ai = m.ai >= 4;
  if (move) m.move = 0;
  if (gather) m.gather = 0;
  if (ai) m.ai = 0;
  s.effects = s.effects
    .map((e) => ({ ...e, ttl: e.ttl - dt }))
    .filter((e) => e.ttl > 0);
  for (const a of s.actors.filter((a) => a.kind === "creep" && a.hp <= 0)) {
    delete m.routes[a.id];
    delete m.modes[a.id];
    if (m.waypoints) delete m.waypoints[a.id];
  }
  s.actors = s.actors.filter((a) => a.kind !== "creep" || a.hp > 0);
  if (
    s.elapsed >= 45 &&
    Math.floor((s.elapsed - 45) / 30) > Math.floor((s.elapsed - dt - 45) / 30)
  ) {
    for (const team of ["blue", "red"] as Team[])
      for (let lane = 0; lane < 3; lane++) {
        if (
          s.actors.filter((a) => a.kind === "creep" && a.team === team)
            .length >= 24
        )
          continue;
        const c = actor(
          `creep-${team}-${lane}-${s.tick}`,
          team,
          nearestFree(s, spawnFor(team, lane * 2)),
          "knight",
        );
        c.kind = "creep";
        c.name = "Lane soldier";
        c.hp = c.maxHp = CREEP_HP;
        c.lane = lane;
        c.order = "attack";
        s.actors.push(c);
      }
  }
  if (s.elapsed >= 480 && s.elapsed - dt < 480)
    log(
      s,
      "OVERTIME · structures take double damage, increasing every 2 minutes",
    );
  for (const a of s.actors) {
    a.cooldown = Math.max(0, a.cooldown - dt - 1e-9);
    a.abilityCooldowns=(a.abilityCooldowns??[a.abilityCooldown,0,0]).map(v=>Math.max(0,v-dt));a.abilityCooldown=a.abilityCooldowns[0];
    a.regenCooldown=Math.max(0,(a.regenCooldown??0)-dt);
    if (a.hp <= 0) {
      if (s.elapsed >= a.respawnAt) {
        Object.assign(a, nearestFree(s, spawnFor(a.team, a.lane * 2), a.id));
        a.hp = a.maxHp;
        a.protectedUntil=s.elapsed+SPAWN_PROTECTION;
        a.lastAction = "Respawned";
        a.steer=undefined;a.recallUntil=undefined;a.attackHeld=false;a.attackUntil=0;a.target=undefined;a.sprintUntil=0;a.shieldUntil=0;
        delete m.routes[a.id];
        if (m.waypoints) delete m.waypoints[a.id];
      }
      continue;
    }
    if (distance(a, baseFor(a.team)) < 5)
      a.hp = Math.min(a.maxHp, a.hp + dt * 10);
    if(a.recallUntil){
      if(s.elapsed>=a.recallUntil){Object.assign(a,nearestFree(s,spawnFor(a.team,0),a.id));a.hp=a.maxHp;a.recallUntil=undefined;a.lastAction='Recalled to base';}
      else continue;
    }
    const steering=a.steer&&a.steer.expiresAt>s.elapsed&&Math.hypot(a.steer.x,a.steer.y)>.01;
    if(a.steer&&a.steer.expiresAt<=s.elapsed)a.steer=undefined;
    let mode = m.modes[a.id] ?? (a.bot ? "gather" : "idle");
    if (a.kind === "companion") {
      mode =
        a.order === "gather"
          ? "gather"
          : a.order === "attack"
            ? "attack"
            : "idle";
      const owner = s.actors.find((x) => x.id === a.ownerId);
      if (a.order === "escort" && owner && owner.hp > 0)
        a.target =
          distance(a, owner) > 2 ? { x: owner.x, y: owner.y } : undefined;
      if (a.order === "defend")
        a.target =
          distance(a, baseFor(a.team)) > 5
            ? spawnFor(a.team, a.lane * 2 + 1)
            : undefined;
    } else if (a.kind === "creep") {
      mode = "attack";
    } else if (a.bot) {
      mode =
        s.elapsed < 24 ||
        s.bank[a.team].wood < TOWER_COST.wood ||
        s.bank[a.team].gold < TOWER_COST.gold
          ? "gather"
          : "attack";
      if (
        ai &&
        s.bank[a.team].wood >= TOWER_COST.wood &&
        s.bank[a.team].gold >= TOWER_COST.gold
      ) {
        for (const p of [
          { x: Math.round(a.x) + 3, y: Math.round(a.y) },
          { x: Math.round(a.x), y: Math.round(a.y) + 3 },
          { x: Math.round(a.x) - 3, y: Math.round(a.y) },
          { x: Math.round(a.x), y: Math.round(a.y) - 3 },
        ])
          if (build(s, a, p).ok) break;
      }
      if (s.elapsed > 55 && s.elapsed % 45 > 15) mode = "attack";
    }
    if (mode === "gather") {
      const bank = s.bank[a.team];
      const preferred =
        bank.wood < TOWER_COST.wood
          ? "wood"
          : bank.gold < TOWER_COST.gold
            ? "gold"
            : bank.wood < bank.gold * 2
              ? "wood"
              : "gold";
      const nodes = s.resources.filter((r) => r.amount > 0);
      const node =
        nodes
          .filter((r) => r.kind === preferred)
          .sort((b, c) => distance(a, b) - distance(a, c))[0] ??
        nodes.sort((b, c) => distance(a, b) - distance(a, c))[0];
      if (node) {
        a.target =
          distance(a, node) > 1.5 ? { x: node.x, y: node.y } : undefined;
        if (gather && distance(a, node) <= 1.5) {
          const amount = Math.min(
            node.amount,
            a.companion === "harvester" ? 9 : 6,
          );
          node.amount -= amount;
          bank[node.kind] += amount;
          a.gathered += amount;
          a.lastAction = `Gathering ${node.kind} · shared bank`;
          effect(s, a, "gather", a.team);
        }
      }
    } else if (mode === "attack") {
      const target = pushTarget(s, a);
      a.target = { x: target.x, y: target.y };
    }
    const range =
      a.hero === "ranger"
        ? 5
        : a.kind === "companion" && a.companion === "scout"
          ? 4
          : 1.6;
    const attacking=a.bot||a.kind!=='hero'||a.attackHeld||(a.attackUntil??0)>s.elapsed;
    if(!attacking&&!a.bot&&mode==='idle')a.target=undefined;
    const candidates=enemies(s,a);
    const selected=candidates.find(e=>e.id===a.attackTargetId&&distance(a,e)<=8)??candidates.find(e=>distance(a,e)<=8);
    const foe=attacking&&selected&&distance(a,selected)<=range?selected:undefined;
    if(attacking&&!a.bot&&a.kind==='hero'&&!steering&&selected&&!foe){a.target={x:Math.round(selected.x),y:Math.round(selected.y)};}
    if(attacking&&!selected&&!a.bot)a.lastAction='No target in range';
    if (foe && a.cooldown <= 0) {
      damage(
        s,
        a,
        foe,
        attackDamage(a),
      );
      a.cooldown = attackInterval(a);
      a.lastAction = "In combat";
      if(!a.attackHeld)a.attackUntil=0;
    }
    if(steering&&a.steer){const speed=getMoveSpeed(a,s.elapsed);moveContinuous(s,a,a.steer.x*speed*dt,a.steer.y*speed*dt);}
    else if (a.target && (!foe || mode === "move")) {
      const step = nextStep(s, a, {x:Math.round(a.target.x),y:Math.round(a.target.y)});
      if (step){const dx=step.x-a.x,dy=step.y-a.y,d=Math.hypot(dx,dy),amount=Math.min(d,getMoveSpeed(a,s.elapsed)*dt);if(d>.001)moveContinuous(s,a,dx/d*amount,dy/d*amount);if(distance(a,step)<.02)m.routes[a.id]?.path.shift();}
      if (distance(a, a.target) < 0.05) {
        a.target = undefined;
        if (mode === "move") m.modes[a.id] = "idle";
      }
    }
  }
  for (const t of s.structures) {
    if (t.hp <= 0) continue;
    t.cooldown = Math.max(0, t.cooldown - dt - 1e-9);
    const foe = s.actors
      .filter((a) => a.hp > 0 && a.team !== t.team && (a.protectedUntil??0)<=s.elapsed && distance(t, a) <= 7)
      .sort((a, b) => ({creep:0,companion:1,hero:2}[a.kind]-{creep:0,companion:1,hero:2}[b.kind]) || distance(t, a) - distance(t, b))[0];
    if (foe && t.cooldown <= 0) {
      damage(s, t, foe, t.kind === "core" ? CORE_DAMAGE : TOWER_DAMAGE);
      t.cooldown = 1;
    }
  }
  if (gather)
    for (const r of s.resources)
      if (r.amount < r.maxAmount)
        r.amount = Math.min(r.maxAmount, r.amount + 1);
}
