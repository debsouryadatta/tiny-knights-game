import assert from 'node:assert/strict';
import { DbConnection } from './bindings';

// Run on a fresh isolated database. This suite never modifies production data.
const uri=process.env.SPACETIME_TEST_URI||'http://127.0.0.1:3013';
const database=process.env.SPACETIME_TEST_DATABASE||'realm-queue-integration';
const active:DbConnection[]=[];
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean,label:string,timeout=5000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(check())return;await delay(50);}
  throw new Error(`Timed out: ${label}`);
}
async function connect(token?:string){
  return new Promise<{conn:DbConnection;token:string}>((resolve,reject)=>{
    const conn=DbConnection.builder().withUri(uri).withDatabaseName(database).withToken(token)
      .onConnect((c,_id,nextToken)=>c.subscriptionBuilder().onApplied(()=>resolve({conn:c,token:nextToken}))
        .onError(ctx=>reject(ctx.event)).subscribe(['SELECT * FROM match_state','SELECT * FROM room_lobby','SELECT * FROM my_session','SELECT * FROM my_quick_queue','SELECT * FROM quick_match_offers']))
      .onConnectError((_ctx,error)=>reject(error)).build();
    active.push(conn);
  });
}
const session=(c:DbConnection)=>[...c.db.mySession.iter()][0];
const queue=(c:DbConnection)=>[...c.db.myQuickQueue.iter()][0];
const offers=(c:DbConnection)=>[...c.db.quickMatchOffers.iter()];
const lobby=(c:DbConnection,room=session(c)?.room)=>c.db.roomLobby.room.find(room);
const state=(c:DbConnection,room=session(c)?.room)=>JSON.parse(c.db.matchState.room.find(room)!.snapshot);
async function enter(c:DbConnection){
  await c.reducers.enterLobby({mode:'quick',room:'',name:'Queue QA',hero:'knight',companion:'guardian',size:1});
  await until(()=>!!session(c),'queue membership');
}
try {
  const a=await connect();await enter(a.conn);
  await until(()=>!!queue(a.conn),'server queue');
  assert.equal(lobby(a.conn)?.started,false);
  const startedAt=Date.now();
  const firstRoom=session(a.conn).room;
  const tick=state(a.conn).tick;
  await delay(500);
  assert.equal(state(a.conn).tick,tick,'queue simulation remains frozen');
  await assert.rejects(a.conn.reducers.startLobby({}),/Quick Play/i);
  const b=await connect();await enter(b.conn);
  await until(()=>lobby(a.conn)?.started===true,'two humans auto start');
  assert.equal(session(b.conn).room,firstRoom);
  assert.ok(Date.now()-startedAt<15000);
  assert.equal(queue(a.conn),undefined);
  console.log('PASS: frozen search, human pairing before deadline and no private-host bypass');

  const fallback=await connect();await enter(fallback.conn);
  await until(()=>!!queue(fallback.conn),'fallback queue');
  const deadline=Number(queue(fallback.conn).deadlineMicros/1000n);
  assert.ok(deadline-Date.now()>13000&&deadline-Date.now()<=15500,'15 second server deadline');
  await until(()=>lobby(fallback.conn)?.started===true,'15 second bot fallback',17000);
  assert.ok(Date.now()>=deadline-150,'not started before deadline');
  assert.equal(state(fallback.conn).actors.filter((a:any)=>a.kind==='hero'&&a.bot).length,1);
  console.log('PASS: server-owned 15 second timeout starts a bot opponent');

  const seeker=await connect();await enter(seeker.conn);
  await until(()=>offers(seeker.conn).some(o=>o.room===session(fallback.conn).room),'mid-game offer');
  assert.notEqual(session(seeker.conn).room,session(fallback.conn).room,'running matches are never silently joined');
  const offer=offers(seeker.conn).find(o=>o.room===session(fallback.conn).room)!;
  assert.equal(offer.side,'red');assert.ok(offer.elapsed>=0);
  assert.equal(offer.blueScore,state(seeker.conn,offer.room).heroScore.blue);
  await seeker.conn.reducers.quickPreference({humanOnly:true});
  await until(()=>queue(seeker.conn)?.humanOnly===true,'keep waiting preference');
  await delay(15500);
  assert.equal(lobby(seeker.conn)?.started,false,'human-only search does not fall back');
  assert.ok(offers(seeker.conn).some(o=>o.room===offer.room),'offer remains available');
  await seeker.conn.reducers.joinRunningMatch({room:offer.room});
  await until(()=>session(seeker.conn).room===offer.room,'explicit mid-game join');
  assert.equal(queue(seeker.conn),undefined);
  assert.equal(state(seeker.conn).actors.find((a:any)=>a.id===session(seeker.conn).playerId).team,'red');
  console.log('PASS: consent, score/elapsed/side offer, human-only wait and later acceptance');

  const stale=await connect();await enter(stale.conn);
  const oldRoom=session(stale.conn).room;
  await assert.rejects(stale.conn.reducers.joinRunningMatch({room:offer.room}),/no longer available/i);
  assert.equal(session(stale.conn).room,oldRoom,'stale offer preserves queue atomically');
  await stale.conn.reducers.playQuickBot({});
  await until(()=>lobby(stale.conn)?.started===true,'manual bot start');
  stale.conn.disconnect();
  const resumed=await connect(stale.token);await enter(resumed.conn);
  assert.equal(session(resumed.conn).room,oldRoom,'reconnect reserves own seat');
  const observer=await connect();
  assert.equal(queue(observer.conn),undefined);assert.equal(offers(observer.conn).length,0,'offers sender scoped');
  await assert.rejects(observer.conn.reducers.joinMatch({room:oldRoom,name:'Bypass',hero:'knight',companion:'guardian',size:1}),/Quick Play/i);
  console.log('PASS: stale offer atomicity, explicit bot start, identity reconnect, scoped views and bypass rejection');

  const offline=await connect();await enter(offline.conn);
  await offline.conn.reducers.quickPreference({humanOnly:true});
  const offlineRoom=session(offline.conn).room;
  offline.conn.disconnect();await delay(200);
  await enter(observer.conn);
  await observer.conn.reducers.quickPreference({humanOnly:true});
  const onlineRoom=session(observer.conn).room;
  assert.notEqual(onlineRoom,offlineRoom,'offline queued human is not an opponent');
  assert.equal(lobby(observer.conn)?.started,false);
  const back=await connect(offline.token);await enter(back.conn);
  await until(()=>lobby(observer.conn)?.started===true,'queued reconnect pairs with online waiting human');
  assert.equal(session(back.conn).room,onlineRoom);
  console.log('PASS: offline waiters excluded and reconnect pairs existing online queues');
} finally { for(const conn of active)conn.disconnect(); }
