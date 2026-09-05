import { ScheduleAt } from 'spacetimedb';
import { schema, table, t, SenderError } from 'spacetimedb/server';
import type { ReducerCtx } from 'spacetimedb/server';
import { createGame, addPlayer, applyCommand, stepGame } from '../../../../../shared/simulation';
import type { Command, Draft, GameState } from '../../../../../shared/types';

const match_state = table({ public: true }, { room: t.string().primaryKey(), snapshot: t.string(), revision: t.u32() });
const membership = table({}, { identity: t.identity().primaryKey(), room: t.string(), playerId: t.string(), lastCommandMicros: t.u64() });
const tick_timer = table({}, { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() });
const room_owner = table({}, { room: t.string().primaryKey(), identity: t.identity() });
const connection = table({}, { id: t.connectionId().primaryKey(), identity: t.identity() });
// Separate clocks keep a movement packet from suppressing the other thumb's action.
const control_clock = table({}, { key: t.string().primaryKey(), sentAt: t.u64() });
const room_lobby = table({ public: true }, { room: t.string().primaryKey(), publicMatch: t.bool(), started: t.bool(), hostPlayerId: t.string(), readyPlayers: t.string() });
const quick_queue = table({}, { room: t.string().primaryKey(), deadlineMicros: t.u64(), humanOnly: t.bool() });
const platform_stats = table({ public: true }, { id: t.u8().primaryKey(), gamesPlayed: t.u64() });
const stats_migration = table({}, { id: t.string().primaryKey() });
const db = schema({ match_state, membership, tick_timer, room_owner, connection, control_clock, room_lobby, quick_queue, platform_stats, stats_migration });
export default db;

// User-requested baseline, applied once in the same transaction as its marker.
function seedGameCount(ctx: ReducerCtx<typeof db.schemaType>) {
  if(ctx.db.stats_migration.id.find('baseline-100-v1'))return;
  const current=ctx.db.platform_stats.id.find(0);
  if(current)ctx.db.platform_stats.id.update({...current,gamesPlayed:current.gamesPlayed+100n});
  else ctx.db.platform_stats.insert({id:0,gamesPlayed:100n});
  ctx.db.stats_migration.insert({id:'baseline-100-v1'});
}
function recordGameStart(ctx: ReducerCtx<typeof db.schemaType>) {
  seedGameCount(ctx);
  const current = ctx.db.platform_stats.id.find(0);
  if (current) ctx.db.platform_stats.id.update({ ...current, gamesPlayed: current.gamesPlayed + 1n });
  else ctx.db.platform_stats.insert({ id: 0, gamesPlayed: 1n });
}

export const mySession = db.view({ public: true }, t.option(membership.rowType), ctx => ctx.db.membership.identity.find(ctx.sender) ?? undefined);
export const myQuickQueue = db.view({ public: true }, t.option(quick_queue.rowType), ctx => {
  const member = ctx.db.membership.identity.find(ctx.sender);
  return member ? ctx.db.quick_queue.room.find(member.room) ?? undefined : undefined;
});
export const quickMatchOffers = db.view({ public: true }, t.array(t.object('QuickMatchOffer', {
  room: t.string(), blueScore: t.u32(), redScore: t.u32(), elapsed: t.f64(), side: t.string(),
})), ctx => {
  const member = ctx.db.membership.identity.find(ctx.sender);
  if (!member || !ctx.db.quick_queue.room.find(member.room)) return [];
  const members = [...ctx.db.membership.iter()];
  const online = new Set([...ctx.db.connection.iter()].map(c => c.identity.toHexString()));
  const offers = [];
  for (const lobby of ctx.db.room_lobby.iter()) {
    if (!lobby.publicMatch || !lobby.started) continue;
    const occupants = members.filter(m => m.room === lobby.room);
    if (occupants.length !== 1 || !online.has(occupants[0].identity.toHexString())) continue;
    const row = ctx.db.match_state.room.find(lobby.room);
    if (!row) continue;
    const state: GameState = JSON.parse(row.snapshot);
    if (state.phase !== 'playing' || state.size !== 1) continue;
    const seat = state.actors.find(a => a.kind === 'hero' && a.bot && !occupants.some(m => m.playerId === a.id));
    if (seat) offers.push({ room: lobby.room, blueScore: state.heroScore?.blue ?? 0, redScore: state.heroScore?.red ?? 0, elapsed: state.elapsed, side: seat.team });
  }
  return offers;
});
export const lobbyRoster = db.view({public:true},t.array(t.object('LobbyMember',{playerId:t.string(),online:t.bool()})),ctx=>{
  const member=ctx.db.membership.identity.find(ctx.sender);
  if(!member)return [];
  return [...ctx.db.membership.iter()].filter(m=>m.room===member.room).map(m=>({playerId:m.playerId,online:[...ctx.db.connection.iter()].some(c=>c.identity.equals(m.identity))}));
});
export const init = db.init(ctx => {
  seedGameCount(ctx);
  ctx.db.tick_timer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(100_000n) });
});
const draftParams = { room: t.string(), name: t.string(), hero: t.string(), companion: t.string(), size: t.u8() };
function joinRoom(ctx: ReducerCtx<typeof db.schemaType>, args: {room:string;name:string;hero:string;companion:string;size:number}) {
  args.room = args.room.trim().toUpperCase();
  if (!/^[a-zA-Z0-9-]{1,32}$/.test(args.room)) throw new SenderError('Invalid room code.');
  if (!['knight', 'ranger', 'lancer'].includes(args.hero)) throw new SenderError('Invalid hero.');
  if (!['harvester', 'guardian', 'scout'].includes(args.companion)) throw new SenderError('Invalid companion.');
  if (args.size !== 1) throw new SenderError('Only 1v1 matches are supported.');
  const prior = ctx.db.membership.identity.find(ctx.sender);
  if (prior?.room === args.room) {
    const existing = ctx.db.match_state.room.find(prior.room);
    if (existing) {
      const state: GameState = JSON.parse(existing.snapshot);
      if (state.size !== 1) throw new SenderError('This room uses an old team size. Create a new 1v1 room.');
      const actor = state.actors.find(a => a.id === prior.playerId);
      if (actor) actor.bot = false;
      ctx.db.match_state.room.update({ ...existing, snapshot: JSON.stringify(state), revision: existing.revision + 1 });
    }
    return;
  }
  if (prior) throw new SenderError('Reconnect to your existing room with this identity.');
  args.name = args.name.trim();
  if (!args.name || args.name.length > 24) throw new SenderError('Enter a name between 1 and 24 characters.');
  const row = ctx.db.match_state.room.find(args.room);
  if (!row && [...ctx.db.match_state.iter()].length >= 100) throw new SenderError('Prototype room limit reached. Reuse an existing room.');
  const state: GameState = row ? JSON.parse(row.snapshot) : createGame(args.room, args.size);
  if (state.size !== args.size) throw new SenderError('Room team size differs.');
  if (state.phase !== 'playing') throw new SenderError('Match finished. Create a new room.');
  if ([...ctx.db.membership.iter()].filter(m => m.room === args.room).length >= 2) throw new SenderError('Match is full.');
  const draft: Draft = { ...args, hero: args.hero as Draft['hero'], companion: args.companion as Draft['companion'], size: args.size };
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
}
export const joinMatch = db.reducer(draftParams, (ctx,args) => {
  const room=args.room.trim().toUpperCase();
  if(ctx.db.room_lobby.room.find(room)?.publicMatch&&!ctx.db.membership.identity.find(ctx.sender))throw new SenderError('Use Quick Play to join a public match.');
  const createsMatch = !ctx.db.match_state.room.find(room);
  joinRoom(ctx,args);
  if (createsMatch) recordGameStart(ctx);
});
export const enterLobby = db.reducer({ ...draftParams, mode: t.string() }, (ctx, args) => {
  if (!['create','join','quick'].includes(args.mode)) throw new SenderError('Invalid lobby mode.');
  const prior=ctx.db.membership.identity.find(ctx.sender);
  if(prior){
    joinRoom(ctx,{...args,room:prior.room});
    if(ctx.db.quick_queue.room.find(prior.room)) {
      // A queued reconnect may find a human who arrived while it was offline.
      for(const queue of ctx.db.quick_queue.iter()) {
        if(queue.room===prior.room)continue;
        const lobby=ctx.db.room_lobby.room.find(queue.room);
        const occupants=[...ctx.db.membership.iter()].filter(m=>m.room===queue.room);
        if(!lobby?.publicMatch||lobby.started||occupants.length!==1||![...ctx.db.connection.iter()].some(c=>c.identity.equals(occupants[0].identity)))continue;
        moveQueuedPlayer(ctx,queue.room);
        ctx.db.room_lobby.room.update({...lobby,started:true});
        recordGameStart(ctx);
        ctx.db.quick_queue.room.delete(queue.room);
        break;
      }
    }
    return;
  }
  let room=args.room.trim().toUpperCase();
  if(args.mode==='quick') {
    room='';
    for(const lobby of ctx.db.room_lobby.iter()) {
      if(!lobby.publicMatch||lobby.started||!ctx.db.quick_queue.room.find(lobby.room))continue;
      const row=ctx.db.match_state.room.find(lobby.room);
      if(!row)continue;
      const state:GameState=JSON.parse(row.snapshot);
      const occupants=[...ctx.db.membership.iter()].filter(m=>m.room===lobby.room);
      if(state.size===1&&state.phase==='playing'&&occupants.length===1&&[...ctx.db.connection.iter()].some(c=>c.identity.equals(occupants[0].identity))){room=lobby.room;break;}
    }
    if(!room)room=`Q${ctx.timestamp.microsSinceUnixEpoch.toString(36).toUpperCase()}${ctx.sender.toHexString().slice(-4).toUpperCase()}`;
  }
  const existing=ctx.db.match_state.room.find(room);
  if(args.mode==='create'&&existing)throw new SenderError('Room code is already in use. Try again.');
  if(args.mode==='join'&&!existing)throw new SenderError('Room not found. Check the code with your friend.');
  if(args.mode==='join'&&ctx.db.room_lobby.room.find(room)?.publicMatch)throw new SenderError('Use Quick Play to join a public match.');
  joinRoom(ctx,{...args,room});
  if(!ctx.db.room_lobby.room.find(room)) {
    const member=ctx.db.membership.identity.find(ctx.sender)!;
    ctx.db.room_lobby.insert({room,publicMatch:args.mode==='quick',started:args.mode==='join',hostPlayerId:member.playerId,readyPlayers:'[]'});
    if(args.mode==='quick')ctx.db.quick_queue.insert({room,deadlineMicros:ctx.timestamp.microsSinceUnixEpoch+15_000_000n,humanOnly:false});
  } else if(args.mode==='quick') {
    const lobby=ctx.db.room_lobby.room.find(room)!;
    ctx.db.room_lobby.room.update({...lobby,started:true});
    recordGameStart(ctx);
    ctx.db.quick_queue.room.delete(room);
  }
});
export const quickPreference = db.reducer({ humanOnly: t.bool() }, (ctx, args) => {
  const member=ctx.db.membership.identity.find(ctx.sender);
  const queue=member&&ctx.db.quick_queue.room.find(member.room);
  if(!queue)throw new SenderError('No active Quick Play search.');
  ctx.db.quick_queue.room.update({...queue,humanOnly:args.humanOnly,deadlineMicros:args.humanOnly?queue.deadlineMicros:ctx.timestamp.microsSinceUnixEpoch+15_000_000n});
});
export const playQuickBot = db.reducer(ctx => {
  const member=ctx.db.membership.identity.find(ctx.sender);
  const queue=member&&ctx.db.quick_queue.room.find(member.room);
  const lobby=member&&ctx.db.room_lobby.room.find(member.room);
  if(!queue||!lobby||lobby.started)throw new SenderError('No active Quick Play search.');
  ctx.db.room_lobby.room.update({...lobby,started:true});
  recordGameStart(ctx);
  ctx.db.quick_queue.room.delete(queue.room);
});
function moveQueuedPlayer(ctx:ReducerCtx<typeof db.schemaType>,room:string) {
  const member=ctx.db.membership.identity.find(ctx.sender)!;
  const source:GameState=JSON.parse(ctx.db.match_state.room.find(member.room)!.snapshot);
  const hero=source.actors.find(a=>a.id===member.playerId)!;
  const companion=source.actors.find(a=>a.kind==='companion'&&a.ownerId===hero.id);
  ctx.db.membership.identity.delete(ctx.sender);
  ctx.db.quick_queue.room.delete(member.room);
  ctx.db.room_lobby.room.delete(member.room);
  ctx.db.match_state.room.delete(member.room);
  ctx.db.room_owner.room.delete(member.room);
  joinRoom(ctx,{room,name:hero.name,hero:hero.hero,companion:companion?.companion??'harvester',size:1});
}
export const joinRunningMatch = db.reducer({ room:t.string() }, (ctx,args) => {
  const member=ctx.db.membership.identity.find(ctx.sender);
  if(!member||!ctx.db.quick_queue.room.find(member.room))throw new SenderError('Start a Quick Play search first.');
  const room=args.room.trim().toUpperCase();
  const lobby=ctx.db.room_lobby.room.find(room);
  const row=ctx.db.match_state.room.find(room);
  const occupants=[...ctx.db.membership.iter()].filter(m=>m.room===room);
  if(!lobby?.publicMatch||!lobby.started||!row||occupants.length!==1||![...ctx.db.connection.iter()].some(c=>c.identity.equals(occupants[0].identity)))throw new SenderError('This game is no longer available. Keep searching.');
  const target:GameState=JSON.parse(row.snapshot);
  if(target.phase!=='playing'||target.size!==1)throw new SenderError('This game has ended. Keep searching.');
  // Reducers commit atomically: a stale/full offer leaves the source search intact.
  moveQueuedPlayer(ctx,room);
});
export const lobbyReady = db.reducer({ ready:t.bool() },(ctx,args)=>{
  const member=ctx.db.membership.identity.find(ctx.sender);
  const lobby=member&&ctx.db.room_lobby.room.find(member.room);
  if(!member||!lobby||lobby.started)throw new SenderError('No waiting lobby.');
  if(lobby.publicMatch)throw new SenderError('Quick Play starts automatically.');
  const ready=new Set<string>(JSON.parse(lobby.readyPlayers));
  if(args.ready)ready.add(member.playerId);else ready.delete(member.playerId);
  ctx.db.room_lobby.room.update({...lobby,readyPlayers:JSON.stringify([...ready])});
});
export const startLobby = db.reducer(ctx=>{
  const member=ctx.db.membership.identity.find(ctx.sender);
  const lobby=member&&ctx.db.room_lobby.room.find(member.room);
  if(!member||!lobby||lobby.started)throw new SenderError('No waiting lobby.');
  if(lobby.publicMatch)throw new SenderError('Use Quick Play controls to start.');
  if(lobby.hostPlayerId!==member.playerId)throw new SenderError('Only the host can start.');
  const ready:string[]=JSON.parse(lobby.readyPlayers);
  const guests=[...ctx.db.membership.iter()].filter(m=>m.room===member.room&&m.playerId!==member.playerId);
  if(guests.some(m=>!ready.includes(m.playerId)))throw new SenderError('Wait for your friend to be ready.');
  ctx.db.room_lobby.room.update({...lobby,started:true});
  recordGameStart(ctx);
});
export const leaveLobby = db.reducer(ctx=>{
  const member=ctx.db.membership.identity.find(ctx.sender);
  const lobby=member&&ctx.db.room_lobby.room.find(member.room);
  if(!member||!lobby||lobby.started)return;
  ctx.db.membership.identity.delete(ctx.sender);
  const row=ctx.db.match_state.room.find(member.room);
  if(row){const state:GameState=JSON.parse(row.snapshot);const actor=state.actors.find(a=>a.id===member.playerId);if(actor)actor.bot=true;ctx.db.match_state.room.update({...row,snapshot:JSON.stringify(state),revision:row.revision+1});}
  const remaining=[...ctx.db.membership.iter()].filter(m=>m.room===member.room);
  if(!remaining.length){ctx.db.quick_queue.room.delete(member.room);ctx.db.room_lobby.room.delete(member.room);ctx.db.match_state.room.delete(member.room);ctx.db.room_owner.room.delete(member.room);return;}
  if(lobby.hostPlayerId===member.playerId){ctx.db.room_lobby.room.update({...lobby,hostPlayerId:remaining[0].playerId,readyPlayers:'[]'});ctx.db.room_owner.room.update({room:member.room,identity:remaining[0].identity});}
  else ctx.db.room_lobby.room.update({...lobby,readyPlayers:JSON.stringify((JSON.parse(lobby.readyPlayers) as string[]).filter(id=>id!==member.playerId))});
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
  if (actor) {actor.bot = true;actor.attackHeld=false;actor.attackUntil=undefined;actor.attackTargetId=undefined;actor.steer=undefined;actor.target=undefined;}
  ctx.db.match_state.room.update({ ...row, snapshot: JSON.stringify(state), revision: row.revision + 1 });
});
export const restartMatch = db.reducer(ctx => {
  const member = ctx.db.membership.identity.find(ctx.sender);
  if (!member || !ctx.db.room_owner.room.find(member.room)?.identity.equals(ctx.sender)) throw new SenderError('Only the room host can restart.');
  const row = ctx.db.match_state.room.find(member.room);
  if (!row) throw new SenderError('Match unavailable.');
  const prior: GameState = JSON.parse(row.snapshot);
  if (prior.size !== 1) throw new SenderError('This room uses an old team size. Create a new 1v1 room.');
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
  if (ctx.db.room_lobby.room.find(member.room)?.started !== false) recordGameStart(ctx);
});
export const issueCommand = db.reducer({ type: t.string(), x: t.f64(), y: t.f64(), order: t.string() }, (ctx, args) => {
  const member = ctx.db.membership.identity.find(ctx.sender);
  if (!member) throw new SenderError('Join a match first.');
  if(ctx.db.room_lobby.room.find(member.room)?.started===false)throw new SenderError('The host has not started the match.');
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
  if(ctx.db.room_lobby.room.find(member.room)?.started===false)throw new SenderError('The host has not started the match.');
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
  seedGameCount(ctx);
  const online = new Set([...ctx.db.connection.iter()].map(c => c.identity.toHexString()));
  const activeRooms = new Set([...ctx.db.membership.iter()].filter(m => online.has(m.identity.toHexString())).map(m => m.room));
  for(const queue of ctx.db.quick_queue.iter()) {
    if(queue.humanOnly||queue.deadlineMicros>ctx.timestamp.microsSinceUnixEpoch||!activeRooms.has(queue.room))continue;
    const lobby=ctx.db.room_lobby.room.find(queue.room);
    if(lobby&&!lobby.started) {
      ctx.db.room_lobby.room.update({...lobby,started:true});
      recordGameStart(ctx);
    }
    ctx.db.quick_queue.room.delete(queue.room);
  }
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
    if (!activeRooms.has(row.room)||ctx.db.room_lobby.room.find(row.room)?.started===false) continue;
    const state: GameState = JSON.parse(row.snapshot);
    if (state.phase === 'finished') continue;
    stepGame(state, 0.1);
    ctx.db.match_state.room.update({ ...row, snapshot: JSON.stringify(state), revision: row.revision + 1 });
  }
});
