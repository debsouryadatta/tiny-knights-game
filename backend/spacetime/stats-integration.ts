import assert from 'node:assert/strict';
import { DbConnection } from './bindings';

// Run on an isolated server: an automatic Quick Play start takes 60 seconds.
const uri = process.env.SPACETIME_TEST_URI || 'http://127.0.0.1:3013';
const database = process.env.SPACETIME_TEST_DATABASE || 'realm-stats-qa';
const active: DbConnection[] = [];
const prefix = `STATS-${Date.now().toString(36).toUpperCase()}`;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check: () => boolean, label: string, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (check()) return; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
async function connect(token?: string) {
  return new Promise<{ conn: DbConnection; token: string }>((resolve, reject) => {
    const conn = DbConnection.builder().withUri(uri).withDatabaseName(database).withToken(token)
      .onConnect((c, _identity, nextToken) => {
        c.subscriptionBuilder().onApplied(() => resolve({ conn: c, token: nextToken }))
          .onError(ctx => reject(ctx.event)).subscribe(['SELECT * FROM platform_stats', 'SELECT * FROM my_session', 'SELECT * FROM room_lobby']);
      }).onConnectError((_ctx, error) => reject(error)).build();
    active.push(conn);
  });
}
const draft = (room: string, mode = 'create', name = 'Stats QA') => ({ room, mode, name, hero: 'knight', companion: 'harvester', size: 1 });
const roomOf = (conn: DbConnection) => [...conn.db.mySession.iter()][0]?.room;

try {
  const observer = await connect();
  const count = () => observer.conn.db.platformStats.id.find(0)?.gamesPlayed ?? 0n;
  let expected = count();
  assert.ok(expected>=200n,'database contains the one-time 200-game baseline');
  const unchanged = async () => { await delay(200); assert.equal(count(), expected); };
  const incremented = async () => { expected++; await waitFor(() => count() === expected, 'exactly one new game'); };
  const host = await connect();
  for (const invalid of ['', '   ', 'x'.repeat(25)]) {
    await assert.rejects(host.conn.reducers.enterLobby(draft(`${prefix}-PRIVATE`, 'create', invalid)), /name/i);
  }
  await unchanged();
  await host.conn.reducers.enterLobby(draft(`${prefix}-PRIVATE`, 'create', '  Host  '));
  await host.conn.reducers.restartMatch({});
  await unchanged(); // Restarting a waiting lobby is not gameplay.
  const guest = await connect();
  await guest.conn.reducers.enterLobby(draft(`${prefix}-PRIVATE`, 'join'));
  await guest.conn.reducers.lobbyReady({ ready: true });
  await unchanged();
  await host.conn.reducers.startLobby({});
  await incremented();
  await assert.rejects(host.conn.reducers.startLobby({}), /waiting/i);
  await unchanged();
  host.conn.disconnect();
  const resumed = await connect(host.token);
  await resumed.conn.reducers.enterLobby(draft('', 'quick', ''));
  await unchanged();
  await resumed.conn.reducers.restartMatch({});
  await incremented();
  console.log('PASS: anonymous stats, name validation, private start, waiting restart, reconnect and rematch counting');

  const quick = await connect();
  await quick.conn.reducers.enterLobby(draft('', 'quick'));
  await unchanged();
  await quick.conn.reducers.playQuickBot({});
  await incremented();
  const joining = await connect();
  await joining.conn.reducers.enterLobby(draft('', 'quick'));
  await joining.conn.reducers.joinRunningMatch({ room: roomOf(quick.conn)! });
  await unchanged();
  const one = await connect();
  const two = await connect();
  await one.conn.reducers.enterLobby(draft('', 'quick'));
  await unchanged();
  await two.conn.reducers.enterLobby(draft('', 'quick'));
  await incremented();
  console.log('PASS: explicit bot start, mid-game join exclusion and paired human start');

  const timer = await connect();
  await timer.conn.reducers.enterLobby(draft('', 'quick'));
  await unchanged();
  expected++;
  await waitFor(() => count() === expected, '60 second automatic bot start', 65000);
  await unchanged();
  const legacy = await connect();
  await legacy.conn.reducers.joinMatch(draft(`${prefix}-LEGACY`));
  await incremented();
  await legacy.conn.reducers.joinMatch(draft(`${prefix}-LEGACY`, 'create', ''));
  await unchanged();
  console.log('PASS: scheduled bot starts once and legacy creation counts once');
  const offline = await connect();
  await offline.conn.reducers.enterLobby(draft('', 'quick'));
  await offline.conn.reducers.quickPreference({ humanOnly: true });
  offline.conn.disconnect();
  await delay(300);
  const waiting = await connect();
  await waiting.conn.reducers.enterLobby(draft('', 'quick'));
  await waiting.conn.reducers.quickPreference({ humanOnly: true });
  await unchanged();
  const queueResume = await connect(offline.token);
  await queueResume.conn.reducers.enterLobby(draft('', 'quick', ''));
  await incremented();
  assert.equal(roomOf(queueResume.conn), roomOf(waiting.conn));
  console.log('PASS: reconnect pairing of waiting humans counts exactly once');
  console.log(`Platform stats integration passed: ${expected} total games.`);
} finally {
  for (const conn of active) conn.disconnect();
}
