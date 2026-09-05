import {DbConnection} from '../backend/spacetime/bindings';
import {databaseName,databaseUri} from './connection-config';

/** Read-only landing subscription. Never joins a room or contributes a game. */
export function watchGamesPlayed(update:(count:bigint|null)=>void) {
  let stopped=false,connection:DbConnection|undefined,retry:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{if(stopped||retry)return;update(null);retry=setTimeout(()=>{retry=undefined;connect();},5000);};
  const connect=()=>{
    if(stopped)return;
    connection=DbConnection.builder().withUri(databaseUri).withDatabaseName(databaseName)
      .onConnect(conn=>{
        if(stopped||connection!==conn){conn.disconnect();return;}
        const read=()=>{if(!stopped&&connection===conn)update(conn.db.platformStats.id.find(0)?.gamesPlayed??0n);};
        conn.db.platformStats.onInsert(read);conn.db.platformStats.onUpdate(read);
        conn.subscriptionBuilder().onApplied(read).onError(()=>{conn.disconnect();schedule();}).subscribe('SELECT * FROM platform_stats');
      }).onConnectError(schedule).onDisconnect(schedule).build();
  };
  connect();
  return ()=>{stopped=true;if(retry)clearTimeout(retry);connection?.disconnect();};
}
