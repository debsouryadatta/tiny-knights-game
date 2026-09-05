import assert from 'node:assert/strict';
import { DbConnection } from './bindings';

// Use an isolated local database: this suite creates several persistent matches.
const uri = process.env.SPACETIME_TEST_URI || 'http://127.0.0.1:3011';
const database = process.env.SPACETIME_TEST_DATABASE || 'little-realm-live';
const prefix = `LOBBY-${Date.now().toString(36).toUpperCase()}`;
const active: DbConnection[] = [];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check: () => boolean, label: string) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await delay(50);
  }
  throw new Error(`Timed out: ${label}`);
}
async function connect(token?: string) {
  return new Promise<{ conn: DbConnection; token: string }>((resolve, reject) => {
    const conn = DbConnection.builder().withUri(uri).withDatabaseName(database).withToken(token)
      .onConnect((c, _identity, nextToken) => {
        c.subscriptionBuilder().onApplied(() => resolve({ conn: c, token: nextToken }))
          .onError(ctx => reject(ctx.event))
          .subscribe(['SELECT * FROM match_state', 'SELECT * FROM room_lobby', 'SELECT * FROM my_session', 'SELECT * FROM lobby_roster']);
      }).onConnectError((_ctx, error) => reject(error)).build();
    active.push(conn);
  });
}
const session = (conn: DbConnection) => [...conn.db.mySession.iter()][0];
const lobby = (conn: DbConnection, room: string) => conn.db.roomLobby.room.find(room);
function state(conn: DbConnection, room: string) {
  const row = conn.db.matchState.room.find(room);
  return row ? JSON.parse(row.snapshot) : undefined;
}
const draft = (room: string, mode: string, name = 'Lobby QA') => ({ room, mode, name, hero: 'knight', companion: 'harvester', size: 1 });
async function enter(conn: DbConnection, room: string, mode: string, name?: string) {
  await conn.reducers.enterLobby(draft(room, mode, name));
  await waitFor(() => !!session(conn), 'session after entering lobby');
  return session(conn);
}

try {
  const host = await connect();
  const room = `${prefix}-WAIT`;
  await enter(host.conn, room, 'create', 'Host');
  await waitFor(() => !!lobby(host.conn, room), 'private lobby');
  assert.equal(lobby(host.conn, room).publicMatch, false);
  assert.equal(lobby(host.conn, room).started, false);
  assert.equal(lobby(host.conn, room).hostPlayerId, session(host.conn).playerId);
  const initial = state(host.conn, room);
  await delay(550);
  assert.equal(state(host.conn, room).tick, initial.tick, 'waiting lobby does not tick');
  assert.equal(state(host.conn, room).elapsed, initial.elapsed, 'waiting lobby clock is frozen');
  await assert.rejects(host.conn.reducers.controlCommand({ payload: JSON.stringify({ type: 'attack', held: true }) }), /not started/i);
  await assert.rejects(host.conn.reducers.issueCommand({ type: 'gather', x: 0, y: 0, order: '' }), /not started/i);

  const guest = await connect();
  await assert.rejects(guest.conn.reducers.enterLobby(draft(`${prefix}-MISSING`, 'join')), /not found/i);
  await enter(guest.conn, room.toLowerCase(), 'join', 'Guest');
  assert.equal(session(guest.conn).room, room, 'join code is case insensitive');
  await assert.rejects(guest.conn.reducers.startLobby({}), /host/i);
  await assert.rejects(host.conn.reducers.startLobby({}), /ready/i);
  const third = await connect();
  assert.equal([...third.conn.db.lobbyRoster.iter()].length, 0, 'unjoined identity sees no lobby membership');
  await assert.rejects(third.conn.reducers.enterLobby(draft(room, 'join')), /full/i);
  await waitFor(() => [...host.conn.db.lobbyRoster.iter()].length === 2, 'reserved player roster replicates');
  await guest.conn.reducers.lobbyReady({ ready: true });
  await waitFor(() => JSON.parse(lobby(host.conn, room).readyPlayers).includes(session(guest.conn).playerId), 'ready replicates');
  await guest.conn.reducers.lobbyReady({ ready: false });
  await waitFor(() => !JSON.parse(lobby(host.conn, room).readyPlayers).includes(session(guest.conn).playerId), 'unready replicates');
  await assert.rejects(host.conn.reducers.startLobby({}), /ready/i);
  await guest.conn.reducers.lobbyReady({ ready: true });
  await host.conn.reducers.startLobby({});
  await waitFor(() => lobby(guest.conn, room)?.started && state(host.conn, room).tick > initial.tick + 2, 'host starts scheduled simulation');
  await assert.rejects(guest.conn.reducers.lobbyReady({ ready: true }), /waiting lobby/i);
  console.log('PASS: private create, frozen lobby, waiting command guards, code join, capacity, readiness and host start');

  const guestId = session(guest.conn).playerId;
  await guest.conn.reducers.controlCommand({ payload: JSON.stringify({ type: 'attack', held: true }) });
  await waitFor(() => state(host.conn, room).actors.find(a => a.id === guestId)?.attackHeld === true, 'guest begins held attack');
  guest.conn.disconnect();
  await waitFor(() => state(host.conn, room).actors.find(a => a.id === guestId)?.bot === true, 'disconnected guest bot takeover');
  await waitFor(() => [...host.conn.db.lobbyRoster.iter()].some(m => m.playerId === guestId && !m.online), 'roster distinguishes disconnected reserved seat');
  const resumed = await connect(guest.token);
  await enter(resumed.conn, 'IGNORED', 'quick', 'Ignored resume name');
  assert.equal(session(resumed.conn).room, room, 'identity resume preserves room before matchmaking');
  assert.equal(session(resumed.conn).playerId, guestId, 'identity resume preserves player slot');
  await waitFor(() => state(host.conn, room).actors.find(a => a.id === guestId)?.bot === false, 'identity resume becomes human');
  assert.equal(state(host.conn, room).actors.find(a => a.id === guestId)?.attackHeld, false, 'reconnect must not resume an attack released while offline');
  await waitFor(() => [...host.conn.db.lobbyRoster.iter()].some(m => m.playerId === guestId && m.online), 'resumed roster becomes online');
  console.log('PASS: reconnect identity resumes existing match and slot');

  let quickOne = await connect();
  let quickTwo = await connect();
  let firstQuick = await enter(quickOne.conn, '', 'quick');
  assert.notEqual(firstQuick.room, room, 'quick match never selects started private room');
  await waitFor(() => !!lobby(quickOne.conn, firstQuick.room), 'public lobby');
  assert.equal(lobby(quickOne.conn, firstQuick.room).publicMatch, true);
  assert.equal(lobby(quickOne.conn, firstQuick.room).started, false);
  let secondQuick = await enter(quickTwo.conn, '', 'quick');
  // A prior run may leave one reserved slot in a public room. Fill it, then
  // check pairing in the newly allocated room without deleting database data.
  if (secondQuick.room !== firstQuick.room) {
    quickOne = quickTwo;
    firstQuick = secondQuick;
    quickTwo = await connect();
    secondQuick = await enter(quickTwo.conn, '', 'quick');
  }
  assert.equal(secondQuick.room, firstQuick.room, 'two quick players share a public match');
  await waitFor(() => lobby(quickOne.conn, firstQuick.room)?.started === true, 'paired humans start automatically');
  assert.notEqual(secondQuick.playerId, firstQuick.playerId);
  const quickThree = await connect();
  const thirdQuick = await enter(quickThree.conn, '', 'quick');
  assert.notEqual(thirdQuick.room, firstQuick.room, 'third quick player gets a new room when first is full');
  assert.notEqual(thirdQuick.room, room, 'private rooms remain excluded');
  await waitFor(() => state(quickOne.conn, firstQuick.room).tick > 2, 'quick match ticks automatically');
  console.log('PASS: public quick matchmaking, full-room rollover and private-room exclusion');

  const transferHost = await connect();
  const transferGuest = await connect();
  const transferRoom = `${prefix}-TRANSFER`;
  await enter(transferHost.conn, transferRoom, 'create');
  await enter(transferGuest.conn, transferRoom, 'join');
  const nextHostId = session(transferGuest.conn).playerId;
  await transferGuest.conn.reducers.lobbyReady({ ready: true });
  await transferGuest.conn.reducers.leaveLobby({});
  await waitFor(() => !session(transferGuest.conn), 'guest leaves waiting room');
  await waitFor(() => !JSON.parse(lobby(transferHost.conn, transferRoom).readyPlayers).includes(nextHostId), 'departing guest readiness cleared');
  await enter(transferGuest.conn, transferRoom, 'join');
  assert.equal(session(transferGuest.conn).playerId, nextHostId, 'vacated actor slot reused');
  await assert.rejects(transferHost.conn.reducers.startLobby({}), /ready/i, 'rejoined guest must explicitly ready again');
  await transferGuest.conn.reducers.lobbyReady({ ready: true });
  await transferHost.conn.reducers.leaveLobby({});
  await waitFor(() => !session(transferHost.conn) && lobby(transferGuest.conn, transferRoom)?.hostPlayerId === nextHostId, 'leave transfers host');
  assert.deepEqual(JSON.parse(lobby(transferGuest.conn, transferRoom).readyPlayers), [], 'host transfer resets readiness');
  await transferGuest.conn.reducers.startLobby({});
  await waitFor(() => state(transferGuest.conn, transferRoom).tick > 2, 'new host starts with bot opponent');
  await transferGuest.conn.reducers.restartMatch({});
  const emptyRoom = `${prefix}-EMPTY`;
  await enter(transferHost.conn, emptyRoom, 'create');
  await transferHost.conn.reducers.leaveLobby({});
  await waitFor(() => !session(transferHost.conn) && !lobby(transferHost.conn, emptyRoom) && !state(transferHost.conn, emptyRoom), 'last departure deletes waiting room');
  console.log('PASS: lobby departure transfers ownership, new host can start/restart, last departure removes lobby');
} finally {
  for (const conn of active) conn.disconnect();
}
