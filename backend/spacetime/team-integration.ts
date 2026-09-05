import assert from 'node:assert/strict';
import {DbConnection} from './bindings';
import type {GameState} from '../../shared/types';
const uri=process.env.SPACETIME_TEST_URI||'http://127.0.0.1:3024';
const database=process.env.SPACETIME_TEST_DATABASE||'tiny-knights-teams-dev';
const active:DbConnection[]=[];
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function wait(check:()=>unknown,label:string){for(let i=0;i<160;i++){if(check())return;await delay(50);}throw Error(`Timed out: ${label}`);}
async function connect(token?:string){return new Promise<{conn:DbConnection;token:string}>((resolve,reject)=>{
  const conn=DbConnection.builder().withUri(uri).withDatabaseName(database).withToken(token).onConnect((c,_i,t)=>{
    c.subscriptionBuilder().onApplied(()=>resolve({conn:c,token:t})).onError(ctx=>reject(ctx.event)).subscribe(['SELECT * FROM my_session','SELECT * FROM match_state','SELECT * FROM room_lobby','SELECT * FROM lobby_roster','SELECT * FROM my_quick_queue','SELECT * FROM quick_match_offers']);
  }).onConnectError((_c,e)=>reject(e)).build();active.push(conn);
});}
const session=(c:DbConnection)=>[...c.db.mySession.iter()][0];
const state=(c:DbConnection,room=session(c)?.room):GameState=>JSON.parse(c.db.matchState.room.find(room)?.snapshot||'null');
const lobby=(c:DbConnection,room=session(c)?.room)=>c.db.roomLobby.room.find(room)!;
const draft=(room:string,mode:string,size:number,name='Team QA')=>({room,mode,size,name,hero:'knight',companion:'guardian'});
async function enter(c:DbConnection,room:string,mode:string,size:number,name?:string){await c.reducers.enterLobby(draft(room,mode,size,name));await wait(()=>session(c)&&state(c),'joined');return session(c);}
const code=(label:string)=>`TEAM-${Date.now().toString(36)}-${label}`.toUpperCase();
try{
  for(const size of [1,2,3]){
    const host=await connect(),room=code(String(size)),players=[host];
    await enter(host.conn,room,'create',size,'Host');
    for(let i=1;i<size*2;i++){const p=await connect();await enter(p.conn,room,'join',1,`Player ${i}`);players.push(p);}
    await wait(()=>[...host.conn.db.lobbyRoster.iter()].length===size*2,'all seats');
    assert.equal(state(host.conn).size,size,'code join inherits size even when UI selects 1');
    const ids=players.map(p=>session(p.conn).playerId);
    assert.equal(new Set(ids).size,size*2);
    assert.equal(state(host.conn).actors.filter(a=>a.kind==='hero'&&!a.bot&&a.team==='blue').length,size);
    assert.equal(state(host.conn).actors.filter(a=>a.kind==='hero'&&!a.bot&&a.team==='red').length,size);
    const extra=await connect();await assert.rejects(extra.conn.reducers.enterLobby(draft(room,'join',size)),/full/i);
    const tick=state(host.conn).tick;await delay(250);assert.equal(state(host.conn).tick,tick,'frozen before start');
    await assert.rejects(host.conn.reducers.startLobby({}),/ready/i);
    await assert.rejects(players[1].conn.reducers.startLobby({}),/host/i);
    await Promise.all(players.slice(1).map(p=>p.conn.reducers.lobbyReady({ready:true})));
    await wait(()=>ids.slice(1).every(id=>JSON.parse(lobby(host.conn).readyPlayers).includes(id)),'all readiness replicated before disconnect');
    // A ready guest must explicitly ready again after disconnect/reconnect.
    const last=players.length-1,oldId=ids[last];players[last].conn.disconnect();
    await wait(()=>!JSON.parse(lobby(host.conn).readyPlayers).includes(oldId),'disconnect clears readiness');
    await assert.rejects(host.conn.reducers.startLobby({}),/ready/i);
    players[last]=await connect(players[last].token);await enter(players[last].conn,room,'join',1);
    assert.equal(session(players[last].conn).playerId,oldId);
    await players[last].conn.reducers.lobbyReady({ready:true});
    await host.conn.reducers.startLobby({});await wait(()=>state(host.conn).tick>tick+1,'live tick');
    const before=ids.map(id=>state(host.conn).actors.find(a=>a.id===id)!.x);
    await Promise.all(players.map(p=>p.conn.reducers.controlCommand({payload:JSON.stringify({type:'steer',x:1,y:0,seq:1})})));
    await wait(()=>ids.every((id,i)=>state(host.conn).actors.find(a=>a.id===id)!.x>before[i]),'all players move');
    await Promise.all(players.map(p=>p.conn.reducers.controlCommand({payload:JSON.stringify({type:'steer',x:0,y:0,seq:2})})));
    await wait(()=>players.every(p=>state(p.conn).actors.filter(a=>a.kind==='hero').every(a=>a.inputSeq===2)),'stop replicated to every client');
    await host.conn.reducers.restartMatch({});
    await wait(()=>state(host.conn).actors.filter(a=>a.kind==='hero').every(a=>a.inputSeq===undefined),'restart');
    assert.deepEqual(players.map(p=>session(p.conn).playerId),ids,'rematch keeps exact seats');
    players.forEach(p=>p.conn.disconnect());extra.conn.disconnect();
    console.log(`PASS ${size}v${size}: capacity, balanced teams, authoritative code join, ready/disconnect, all-player movement and rematch`);
  }
  const q2=await connect(),q3=await connect();await enter(q2.conn,'','quick',2);await enter(q3.conn,'','quick',3);
  const room2=session(q2.conn).room,room3=session(q3.conn).room;assert.notEqual(room2,room3);
  await q2.conn.reducers.quickPreference({humanOnly:true});await q3.conn.reducers.quickPreference({humanOnly:true});
  const group=[q3];
  for(let i=1;i<6;i++){const p=await connect();await enter(p.conn,'','quick',3);assert.equal(session(p.conn).room,room3);group.push(p);if(i<5)assert.equal(lobby(q3.conn).started,false);}
  await wait(()=>lobby(q3.conn).started,'full six-player queue auto starts');
  assert.equal(lobby(q2.conn).started,false,'2v2 queue remains separate');
  // Put two players in a team queue, then move one into an ongoing game.
  await q2.conn.reducers.playQuickBot({});
  const source=await connect();await enter(source.conn,'','quick',2);await source.conn.reducers.quickPreference({humanOnly:true});
  const mate=await connect();await enter(mate.conn,'','quick',2);const sourceRoom=session(source.conn).room;
  assert.equal(session(mate.conn).room,sourceRoom);
  await assert.rejects(mate.conn.reducers.playQuickBot({}),/host/i);
  await assert.rejects(mate.conn.reducers.quickPreference({humanOnly:false}),/host/i);
  await wait(()=>[...source.conn.db.quickMatchOffers.iter()].some(o=>o.room===room2),'matching running offer');
  assert.ok(![...source.conn.db.quickMatchOffers.iter()].some(o=>o.room===room3),'no cross-size offer');
  await assert.rejects(source.conn.reducers.joinRunningMatch({room:room3}),/available/i);
  const offeredSide=[...source.conn.db.quickMatchOffers.iter()].find(o=>o.room===room2)!.side;
  await source.conn.reducers.joinRunningMatch({room:room2});
  await wait(()=>session(source.conn).room===room2,'accepted running game');
  assert.equal(state(source.conn).actors.find(a=>a.id===session(source.conn).playerId)!.team,offeredSide,'advertised team matches allocated seat');
  assert.equal(session(mate.conn).room,sourceRoom,'teammate retains source room');
  await wait(()=>lobby(mate.conn).hostPlayerId===session(mate.conn).playerId,'source host transferred');
  assert.ok(state(mate.conn));assert.equal(lobby(mate.conn).started,false);
  await mate.conn.reducers.leaveLobby({});await wait(()=>!session(mate.conn),'last departure clears membership');
  console.log('PASS team queues: size isolation, full roster start, host-only preferences, safe running-game transfer and cleanup');
  const duoQueue=[];
  for(let i=0;i<3;i++){const p=await connect();await enter(p.conn,'','quick',2);duoQueue.push(p);}
  const duoRoom=session(duoQueue[0].conn).room;
  await duoQueue[0].conn.reducers.quickPreference({humanOnly:true});
  const reservedId=session(duoQueue[1].conn).playerId;
  duoQueue[1].conn.disconnect();
  await wait(()=>[...duoQueue[0].conn.db.lobbyRoster.iter()].some(m=>m.playerId===reservedId&&!m.online),'queued disconnect');
  const fourth=await connect();await enter(fourth.conn,'','quick',2);
  assert.equal(session(fourth.conn).room,duoRoom);
  assert.equal(lobby(duoQueue[0].conn).started,false,'full reserved queue waits for offline member');
  duoQueue[1]=await connect(duoQueue[1].token);await enter(duoQueue[1].conn,'','quick',2);
  assert.equal(session(duoQueue[1].conn).playerId,reservedId);
  await wait(()=>lobby(fourth.conn).started,'2v2 full queue starts on reconnect');
  console.log('PASS 2v2 queue: four-player fill, offline seat reservation and automatic start on reconnect');
  // Host transfer followed by exact-seat restart, despite non-original membership order.
  const h=await connect(),g=await connect(),room=code('TRANSFER');await enter(h.conn,room,'create',3);await enter(g.conn,room,'join',1);
  const guestId=session(g.conn).playerId;await h.conn.reducers.leaveLobby({});await wait(()=>lobby(g.conn).hostPlayerId===guestId,'private host transfer');
  await g.conn.reducers.startLobby({});await g.conn.reducers.restartMatch({});assert.equal(session(g.conn).playerId,guestId);assert.equal(lobby(g.conn).hostPlayerId,guestId);
  console.log('PASS transferred host retains team and authority after rematch');
}finally{active.forEach(c=>c.disconnect());}
