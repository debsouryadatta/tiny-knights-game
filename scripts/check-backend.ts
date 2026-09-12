import {loadEnv} from 'vite';
import {DbConnection} from '../backend/spacetime/bindings';
import {GAME_PROTOCOL_VERSION} from '../shared/protocol';

// Vercel must never ship a new prediction/map build before its matching server.
const required = process.env.VERCEL === '1' || process.argv.includes('--required');
if (required) {
  const env={...loadEnv('production',process.cwd(),'VITE_'),...process.env};
  const uri = env.VITE_SPACETIMEDB_URI || 'https://spacetime.tinkerers.space';
  const database = env.VITE_SPACETIMEDB_DB_NAME || 'tiny-knights-teams-v3';
  let conn: DbConnection | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve,reject)=>{
      timer=setTimeout(()=>reject(new Error('Backend compatibility check timed out')),15000);
      conn=DbConnection.builder().withUri(uri).withDatabaseName(database)
        .onConnect(c=>{c.reducers.checkClientVersion({version:GAME_PROTOCOL_VERSION}).then(()=>resolve(),reject);})
        .onConnectError((_c,error)=>reject(error)).build();
    });
    console.log(`Backend compatibility verified: ${database}, protocol ${GAME_PROTOCOL_VERSION}`);
  } catch(error) {
    console.error(`Deployment blocked: publish the matching SpacetimeDB module to ${database} before building the frontend.`,String(error));
    process.exitCode=1;
  } finally {clearTimeout(timer);conn?.disconnect();}
}
