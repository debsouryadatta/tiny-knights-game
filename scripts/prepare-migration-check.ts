// Local-only QA fixture: create a waiting room on the isolated old module.
import {writeFileSync} from 'node:fs';
import {DbConnection} from '../backend/spacetime/bindings';
const uri='http://127.0.0.1:3024',database='tiny-knights-legacy-check',room=`MIGRATE-${Date.now()}`;
let conn:DbConnection;
await new Promise<void>((resolve,reject)=>{
 conn=DbConnection.builder().withUri(uri).withDatabaseName(database).onConnect(async(c,_i,token)=>{
  try{await c.reducers.enterLobby({room,name:'Saved player',hero:'knight',companion:'guardian',size:1,mode:'create'});
   writeFileSync('/tmp/tiny-knights-migration-session.json',JSON.stringify({token,room,uri,database}));resolve();
  }catch(e){reject(e);}
 }).onConnectError((_c,e)=>reject(e)).build();
});
conn!.disconnect();
