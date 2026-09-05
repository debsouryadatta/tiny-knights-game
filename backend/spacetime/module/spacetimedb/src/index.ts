import { ScheduleAt } from 'spacetimedb';
import { schema, table, t, SenderError } from 'spacetimedb/server';
import { createGame, addPlayer, applyCommand, stepGame } from '../../../../../shared/simulation';
import type { Command, Draft, GameState } from '../../../../../shared/types';

const match_state = table({ public: true }, { room: t.string().primaryKey(), snapshot: t.string(), revision: t.u32() });
const membership = table({}, { identity: t.identity().primaryKey(), room: t.string(), playerId: t.string(), lastCommandMicros: t.u64() });
const tick_timer = table({}, { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() });
const room_owner = table({}, { room: t.string().primaryKey(), identity: t.identity() });
const connection = table({}, { id: t.connectionId().primaryKey(), identity: t.identity() });
// Separate clocks keep a movement packet from suppressing the other thumb's action.
const control_clock = table({}, { key: t.string().primaryKey(), sentAt: t.u64() });
const db = schema({ match_state, membership, tick_timer, room_owner, connection, control_clock });
export default db;

export const mySession = db.view({ public: true }, t.option(membership.rowType), ctx => ctx.db.membership.identity.find(ctx.sender) ?? undefined);
export const init = db.init(ctx => {
  ctx.db.tick_timer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(100_000n) });
});
export const joinMatch = db.reducer({ room: t.string(), name: t.string(), hero: t.string(), companion: t.string(), size: t.u8() }, (ctx, args) => {
  args.room = args.room.trim().toUpperCase();
  if (!/^[a-zA-Z0-9-]{1,32}$/.test(args.room)) throw new SenderError('Invalid room code.');
  if (!['knight', 'ranger', 'lancer'].includes(args.hero)) throw new SenderError('Invalid hero.');
  if (!['harvester', 'guardian', 'scout'].includes(args.companion)) throw new SenderError('Invalid companion.');
  if (args.size !== 2 && args.size !== 3) throw new SenderError('Invalid team size.');
  const prior = ctx.db.membership.identity.find(ctx.sender);
  if (prior?.room === args.room) {
    const existing = ctx.db.match_state.room.find(prior.room);
    if (existing) {
      const state: GameState = JSON.parse(existing.snapshot);
      const actor = state.actors.find(a => a.id === prior.playerId);
      if (actor) actor.bot = false;
      ctx.db.match_state.room.update({ ...existing, snapshot: JSON.stringify(state), revision: existing.revision + 1 });
    }
    return;
  }
  if (prior) throw new SenderError('Reconnect to your existing room with this identity.');
  const row = ctx.db.match_state.room.find(args.room);
  if (!row && [...ctx.db.match_state.iter()].length >= 100) throw new SenderError('Prototype room limit reached. Reuse an existing room.');
  const state: GameState = row ? JSON.parse(row.snapshot) : createGame(args.room, args.size);
  if (state.size !== args.size) throw new SenderError('Room team size differs.');
  if (state.phase !== 'playing') throw new SenderError('Match finished. Create a new room.');
  if ([...ctx.db.membership.iter()].filter(m => m.room === args.room).length >= args.size * 2) throw new SenderError('Match is full.');
  const draft: Draft = { ...args, name: args.name.trim().slice(0, 24) || 'Commander', hero: args.hero as Draft['hero'], companion: args.companion as Draft['companion'], size: args.size };
  const reserved = new Map<string, boolean>();
  for (const current of ctx.db.membership.iter()) {
    if (current.room !== args.room) continue;
    const hero = state.actors.find(a => a.id === current.playerId);
    if (hero) { reserved.set(hero.id, hero.bot); hero.bot = false; }
  }
  const playerId = addPlayer(state, draft);
  for (const actor of state.actors) if (reserved.has(actor.id)) actor.bot = reserved.get(actor.id)!;
  const next = { room: args.room, snapshot: JSON.stringify(state), revision: (row?.revision ?? 0) + 1 };
  if (row) ctx.db.match_state.room.update(next); else ctx.db.match_state.insert(next);
  if (!ctx.db.room_owner.room.find(args.room)) ctx.db.room_owner.insert({ room: args.room, identity: ctx.sender });
  ctx.db.membership.insert({ identity: ctx.sender, room: args.room, playerId, lastCommandMicros: 0n });
});
export const onConnect = db.clientConnected(ctx => {
  if (ctx.connectionId) ctx.db.connection.insert({ id: ctx.connectionId, identity: ctx.sender });
});
export const onDisconnect = db.clientDisconnected(ctx => {
  if (ctx.connectionId) ctx.db.connection.id.delete(ctx.connectionId);
  if ([...ctx.db.connection.iter()].some(c => c.identity.equals(ctx.sender))) return;
  const member = ctx.db.membership.identity.find(ctx.sender);
  const row = member && ctx.db.match_state.room.find(member.room);
  if (!member || !row) return;
  const state: GameState = JSON.parse(row.snapshot);
  const actor = state.actors.find(a => a.id === member.playerId);
  if (actor) actor.bot = true;
  ctx.db.match_state.room.update({ ...row, snapshot: JSON.stringify(state), revision: row.revision + 1 });
});
export const restartMatch = db.reducer(ctx => {
  const member = ctx.db.membership.identity.find(ctx.sender);
  if (!member || !ctx.db.room_owner.room.find(member.room)?.identity.equals(ctx.sender)) throw new SenderError('Only the room host can restart.');
  const row = ctx.db.match_state.room.find(member.room);
  if (!row) throw new SenderError('Match unavailable.');
  const prior: GameState = JSON.parse(row.snapshot);
  const state = createGame(member.room, prior.size);
  for (const current of ctx.db.membership.iter()) {
    if (current.room !== member.room) continue;
    const hero = prior.actors.find(a => a.id === current.playerId);
    if (!hero) continue;
    const companion = prior.actors.find(a => a.ownerId === hero.id && a.kind === 'companion');
    const playerId = addPlayer(state, { name: hero.name, hero: hero.hero, companion: companion?.companion ?? 'harvester', size: prior.size, room: member.room });
    ctx.db.membership.identity.update({ ...current, playerId, lastCommandMicros: 0n });
  }
  for (const current of ctx.db.membership.iter()) {
    if (current.room !== member.room) continue;
    const actor = state.actors.find(a => a.id === current.playerId);
    if (actor) actor.bot = ![...ctx.db.connection.iter()].some(c => c.identity.equals(current.identity));
  }
  ctx.db.match_state.room.update({ ...row, snapshot: JSON.stringify(state), revision: row.revision + 1 });
});
export const issueCommand = db.reducer({ type: t.string(), x: t.f64(), y: t.f64(), order: t.string() }, (ctx, args) => {
  const member = ctx.db.membership.identity.find(ctx.sender);
  if (!member) throw new SenderError('Join a match first.');
  if (ctx.timestamp.microsSinceUnixEpoch - member.lastCommandMicros < 30_000n) throw new SenderError('Commands sent too quickly.');
  if (!['move', 'gather', 'attack', 'ability', 'build', 'order', 'recall'].includes(args.type)) throw new SenderError('Invalid command.');
  if (!Number.isFinite(args.x) || !Number.isFinite(args.y)) throw new SenderError('Invalid coordinates.');
  if (args.type === 'order' && !['gather', 'escort', 'attack', 'defend'].includes(args.order)) throw new SenderError('Invalid order.');
  const row = ctx.db.match_state.room.find(member.room);
  if (!row) throw new SenderError('Match unavailable.');
  const state: GameState = JSON.parse(row.snapshot);
  const result = applyCommand(state, member.playerId, args as Command);
  if (!result.ok) throw new SenderError(result.error ?? 'Command rejected.');
  ctx.db.match_state.room.update({ ...row, snapshot: JSON.stringify(state), revision: row.revision + 1 });
  ctx.db.membership.identity.update({ ...member, lastCommandMicros: ctx.timestamp.microsSinceUnixEpoch });
});
/** JSON envelope preserves optional aiming/target fields without changing the legacy reducer. */
export const controlCommand = db.reducer({ payload: t.string() }, (ctx, args) => {
  const member = ctx.db.membership.identity.find(ctx.sender);
  if (!member) throw new SenderError('Join a match first.');
  if (args.payload.length > 600) throw new SenderError('Control packet is too large.');
  let command: Command;
  try { command = JSON.parse(args.payload); } catch { throw new SenderError('Invalid control packet.'); }
  if (!command || typeof command !== 'object' || !['steer', 'move', 'gather', 'attack', 'ability', 'build', 'order', 'recall', 'regen'].includes(command.type)) throw new SenderError('Invalid command.');
  if ('x' in command && !Number.isFinite(command.x)) throw new SenderError('Invalid coordinates.');
  if ('y' in command && !Number.isFinite(command.y)) throw new SenderError('Invalid coordinates.');
  if (command.type === 'steer' && (!Number.isFinite(command.x) || !Number.isFinite(command.y) || Math.hypot(command.x, command.y) > 1.001)) throw new SenderError('Steering must be a normalized vector.');
  if (command.type === 'steer' && command.seq !== undefined && (!Number.isSafeInteger(command.seq) || command.seq < 0)) throw new SenderError('Invalid steering sequence.');
  if (command.type === 'attack' && command.held !== undefined && typeof command.held !== 'boolean') throw new SenderError('Invalid attack state.');
  if (command.type === 'attack' && command.targetId !== undefined && (typeof command.targetId !== 'string' || command.targetId.length > 100)) throw new SenderError('Invalid target.');
  if (command.type === 'ability' && command.slot !== undefined && ![1, 2, 3].includes(command.slot)) throw new SenderError('Invalid skill slot.');
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const steering = command.type === 'steer' || command.type === 'move';
  const bucket = steering ? 'movement' : command.type === 'ability' ? `ability-${command.slot ?? 1}` : command.type;
  const key = `${ctx.sender.toHexString()}:${bucket}`;
  const previous = ctx.db.control_clock.key.find(key);
  // Stop/release packets are safety signals, never dropped by a rate limit.
  const release = (command.type === 'steer' && command.x === 0 && command.y === 0) || (command.type === 'attack' && command.held === false);
  // Direction changes can arrive together, for example pressing W+D. Allow a
  // short burst while retaining a bounded sustained movement packet rate.
  // Mobile networks may deliver a second of valid input in one burst. Preserve
  // sustained limits, but tolerate batching; stale movement can be dropped quietly.
  const interval=steering?15_000n:20_000n;
  if(!release&&previous&&previous.sentAt>now+(steering?500_000n:100_000n)){
    if(steering||(command.type==='attack'&&command.held===true))return;
    throw new SenderError('Commands sent too quickly.');
  }
  const row = ctx.db.match_state.room.find(member.room);
  if (!row) throw new SenderError('Match unavailable.');
  const state: GameState = JSON.parse(row.snapshot);
  const result = applyCommand(state, member.playerId, command);
  if (!result.ok) throw new SenderError(result.error ?? 'Command rejected.');
  ctx.db.match_state.room.update({ ...row, snapshot: JSON.stringify(state), revision: row.revision + 1 });
  const next = { key, sentAt: !release ? (previous && previous.sentAt > now ? previous.sentAt : now) + interval : now };
  if (previous) ctx.db.control_clock.key.update(next); else ctx.db.control_clock.insert(next);
});
export const tick = db.reducer({ onSchedule: tick_timer }, { timer: tick_timer.rowType }, (ctx) => {
  if (!ctx.sender.equals(ctx.identity)) throw new SenderError('Only server scheduler can advance time.');
  const online = new Set([...ctx.db.connection.iter()].map(c => c.identity.toHexString()));
  const activeRooms = new Set([...ctx.db.membership.iter()].filter(m => online.has(m.identity.toHexString())).map(m => m.room));
  for (const row of ctx.db.match_state.iter()) {
    // Disposable automated-test rooms must not exhaust the public prototype.
    // Never remove connected rooms or ordinary player-generated room codes.
    const testCode=row.room.match(/^(QA|MO|MEM|HUD|TUN)([A-Z0-9]{8,14})$/);
    const testCreated=testCode?parseInt(testCode[2],36):/^INTEGRATION-[0-9]{13}$/.test(row.room)?Number(row.room.slice(12)):NaN;
    if(!activeRooms.has(row.room)&&Number.isFinite(testCreated)&&Number(ctx.timestamp.microsSinceUnixEpoch/1000n)-testCreated>120_000){
      for(const member of ctx.db.membership.iter())if(member.room===row.room){
        const prefix=member.identity.toHexString()+':';
        for(const clock of ctx.db.control_clock.iter())if(clock.key.startsWith(prefix))ctx.db.control_clock.key.delete(clock.key);
        ctx.db.membership.identity.delete(member.identity);
      }
      ctx.db.room_owner.room.delete(row.room);ctx.db.match_state.room.delete(row.room);continue;
    }
    if (!activeRooms.has(row.room)) continue;
    const state: GameState = JSON.parse(row.snapshot);
    if (state.phase === 'finished') continue;
    stepGame(state, 0.1);
    ctx.db.match_state.room.update({ ...row, snapshot: JSON.stringify(state), revision: row.revision + 1 });
  }
});
