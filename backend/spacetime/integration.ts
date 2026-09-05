import assert from 'node:assert/strict';
import { DbConnection } from './bindings';
const room = `INTEGRATION-${Date.now()}`;
const active: DbConnection[] = [];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(test: () => boolean, label: string) {
  for (let i = 0; i < 80; i++) { if (test()) return; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
async function connect(token?: string) {
  return new Promise<{ conn: DbConnection; token: string }>((resolve, reject) => {
    const conn = DbConnection.builder().withUri(process.env.SPACETIME_TEST_URI || 'https://spacetime.tinkerers.space').withDatabaseName(process.env.SPACETIME_TEST_DATABASE || 'little-realm-live').withToken(token)
      .onConnect((c, _identity, nextToken) => {
        c.subscriptionBuilder().onApplied(() => resolve({ conn: c, token: nextToken }))
          .onError(ctx => reject(ctx.event)).subscribe([`SELECT * FROM match_state WHERE room = '${room}'`, 'SELECT * FROM my_session']);
      }).onConnectError((_ctx, error) => reject(error)).build();
    active.push(conn);
  });
}
function state(conn: DbConnection) { const row = conn.db.matchState.room.find(room); return row ? JSON.parse(row.snapshot) : undefined; }
const draft = { room, name: 'Host', hero: 'knight', companion: 'harvester', size: 1 };
try {
  const host = await connect();
  for (const size of [0, 2, 3]) await assert.rejects(host.conn.reducers.joinMatch({ ...draft, size }), /1v1/i);
  await host.conn.reducers.joinMatch(draft);
  await waitFor(() => state(host.conn)?.size === 1, '1v1 room');
  assert.equal(state(host.conn).actors.filter((a: {kind:string}) => a.kind === 'hero').length, 2);
  assert.equal(state(host.conn).actors.filter((a: {kind:string}) => a.kind === 'companion').length, 2);
  assert.equal(state(host.conn).actors.filter((a: {kind:string;bot:boolean}) => a.kind === 'hero' && a.bot).length, 1);
  const guest = await connect();
  await guest.conn.reducers.joinMatch({ ...draft, name: 'Guest' });
  await waitFor(() => state(host.conn)?.actors.filter((a: { kind: string; bot: boolean }) => a.kind === 'hero' && !a.bot).length === 2, 'two players');
  await waitFor(() => state(host.conn).tick > 3, 'scheduled ticks');
  assert.ok(state(host.conn).simulation);
  assert.ok(state(host.conn).structures.some((s: {kind:string;x:number;y:number}) => s.kind === 'core' && s.x === 8 && s.y === 56), 'New 64x64 map is deployed');
  const hostId = [...host.conn.db.mySession.iter()][0].playerId;
  const hero = state(host.conn).actors.find((a: {id:string})=>a.id===hostId);
  const guestId = [...guest.conn.db.mySession.iter()][0].playerId;
  assert.notEqual(hero.team, state(host.conn).actors.find((a: {id:string}) => a.id === guestId).team, 'Friends are opponents');
  const third = await connect();
  await assert.rejects(third.conn.reducers.joinMatch({ ...draft, name: 'Third' }), /full/i);
  await host.conn.reducers.issueCommand({type:'move',x:hero.x-1,y:hero.y,order:''});
  await waitFor(()=>state(guest.conn).actors.find((a: {id:string})=>a.id===hostId).x === hero.x-1,'movement replicated to guest');
  const control = (command: object) => host.conn.reducers.controlCommand({ payload: JSON.stringify(command) });
  const currentHero = () => state(host.conn).actors.find((a: {id:string})=>a.id===hostId);
  const beforeSteer = currentHero().x;
  // Both thumbs, plus a skill, in the same event turn must not throttle each other.
  await Promise.all([
    control({type:'steer',x:0.5,y:0,seq:1}),
    control({type:'attack',held:true}),
    control({type:'ability',slot:2}),
  ]);
  await waitFor(()=>currentHero().x > beforeSteer && currentHero().abilityCooldowns?.[1]>0 && currentHero().attackHeld,'simultaneous controls');
  assert.notEqual(currentHero().x % 1, 0, 'Steering moves continuously, not tile by tile');
  await Promise.all([control({type:'steer',x:0,y:0,seq:2}),control({type:'attack',held:false})]);
  await waitFor(()=>currentHero().inputSeq===2 && !currentHero().attackHeld,'release controls');
  const stoppedX=currentHero().x;
  await delay(450);
  assert.ok(Math.abs(currentHero().x-stoppedX)<0.001,'Joystick release stops immediately');
  await assert.rejects(control({type:'steer',x:2,y:0,seq:3}),/normalized/i);
  await assert.rejects(host.conn.reducers.controlCommand({payload:'null'}),/invalid/i);
  await control({type:'recall'});
  await waitFor(()=>currentHero().recallUntil>state(host.conn).elapsed,'recall channel begins');
  await control({type:'steer',x:0.1,y:0,seq:4});
  await waitFor(()=>!currentHero().recallUntil,'movement cancels recall');
  await control({type:'steer',x:0,y:0,seq:5});
  // A mobile uplink can batch a second of direction samples together.
  await Promise.all(Array.from({length:20},(_,i)=>control({type:'steer',x:i%2?.2:-.2,y:0,seq:6+i})));
  await control({type:'steer',x:0,y:0,seq:26});
  await waitFor(()=>currentHero().inputSeq===26,'network burst ends with authoritative stop');
  const burstStop=currentHero().x;
  await delay(400);
  assert.ok(Math.abs(currentHero().x-burstStop)<.001,'Batched input does not leave movement running');
  await assert.rejects(guest.conn.reducers.restartMatch({}), /host/i);
  await host.conn.reducers.issueCommand({ type: 'order', x: 0, y: 0, order: 'escort' });
  guest.conn.disconnect();
  await waitFor(() => state(host.conn).actors.find((a: { id: string }) => a.id === guestId)?.bot === true, 'bot takeover');
  await assert.rejects(third.conn.reducers.joinMatch({ ...draft, name: 'Third' }), /full/i);
  await host.conn.reducers.restartMatch({});
  const resumed = await connect(guest.token);
  await resumed.conn.reducers.joinMatch({ ...draft, name: 'Ignored on resume' });
  const resumedId = [...resumed.conn.db.mySession.iter()][0].playerId;
  await waitFor(() => state(host.conn).actors.find((a: { id: string }) => a.id === resumedId)?.bot === false, 'resume');
  assert.notEqual(resumedId, [...host.conn.db.mySession.iter()][0].playerId, 'Restart preserves unique reserved slots');
  await assert.rejects(third.conn.reducers.joinMatch({ ...draft, name: 'Third' }), /full/i);
  await host.conn.reducers.restartMatch({});
  await waitFor(() => state(host.conn).elapsed < 1, 'host restart');
  console.log('PASS: real SpacetimeDB two clients, continuous movement, simultaneous steer/attack/skill, release, validation, recall cancellation, scheduled ticks, non-host restart rejection, disconnect takeover, identity resume, host restart');
} finally { for (const conn of active) conn.disconnect(); }
