import { DbConnection } from '../backend/spacetime/bindings';
import { databaseName, databaseUri, sessionKey } from './connection-config';
import { createPingMonitor } from './ping-monitor.js';
import type { Command, Draft, GameState, Session } from '../shared/types';

/** Same public contract as GameClient. Real SpacetimeDB subscription transport. */
export class SpacetimeGameClient {
  state: GameState | null = null;
  session: Session | null = null;
  status = 'disconnected';
  error: string | null = null;
  latency = 0;
  ping: {state:string;ms:number|null} = {state:'measuring',ms:null};
  pingSamples = 0;
  lobby: {room:string;publicMatch:boolean;started:boolean;hostPlayerId:string;readyPlayers:string} | null = null;
  roster: {playerId:string;online:boolean}[]=[];
  quickQueue: {room:string;deadlineMicros:bigint;humanOnly:boolean}|null=null;
  quickOffers: {room:string;blueScore:number;redScore:number;elapsed:number;side:string}[]=[];
  private stopPing: (() => void) | null = null;
  private connection: DbConnection | null = null;
  private listeners = new Set<() => void>();
  private draft: Draft | null = null;
  private token: string | undefined;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit() { for (const listener of this.listeners) listener(); }
  join(draft: Draft) {
    this.disconnect();
    let resumeRoom:string|undefined;
    try { if(draft.mode==='quick')resumeRoom=sessionStorage.getItem(sessionKey('quick-room'))||undefined; } catch {}
    this.draft = { ...draft, room: (draft.room || resumeRoom || Array.from(crypto.getRandomValues(new Uint8Array(3)),b=>b.toString(16).padStart(2,'0')).join('')).trim().toUpperCase() };
    try { this.token = sessionStorage.getItem(sessionKey(this.draft.room)) ?? undefined; } catch { this.token = undefined; }
    this.state = null; this.session = null; this.lobby=null;this.roster=[];this.quickQueue=null;this.quickOffers=[]; this.error = null; this.stopped = false;
    this.connect();
  }
  private connect() {
    if (this.stopped || !this.draft) return;
    this.status = this.token ? 'reconnecting' : 'connecting'; this.emit();
    const draft = this.draft;
    const connection = DbConnection.builder().withUri(databaseUri).withDatabaseName(databaseName).withToken(this.token)
      .onConnect((conn, _identity, token) => {
        if(this.stopped || this.connection !== conn){conn.disconnect();return;}
        this.token = token;
        let subscribedRoom='';
        let roomSubscription: {unsubscribe:()=>void}|undefined;
        const subscribeRoom=(room:string)=>{
          if(subscribedRoom===room)return;subscribedRoom=room;
          roomSubscription?.unsubscribe();this.state=null;this.lobby=null;
          roomSubscription=conn.subscriptionBuilder().onApplied(read).onError(ctx=>{if(this.stopped||this.connection!==conn)return;this.error=String(ctx.event);this.status='error';this.emit();}).subscribe([`SELECT * FROM match_state WHERE room = '${room.replace(/'/g,'')}'`,`SELECT * FROM room_lobby WHERE room = '${room.replace(/'/g,'')}'`]);
        };
        const read = () => {
          if(this.stopped||this.connection!==conn)return;
          const member = [...conn.db.mySession.iter()][0];
          if (member) { this.session = { playerId: member.playerId, room: member.room, token }; this.status = 'connected';draft.room=member.room;subscribeRoom(member.room);
            try{sessionStorage.setItem(sessionKey(member.room),token);if(draft.mode==='quick')sessionStorage.setItem(sessionKey('quick-room'),member.room);}catch{}
          }
          this.lobby=conn.db.roomLobby.room.find(draft.room!)??null;
          this.roster=[...conn.db.lobbyRoster.iter()];
          this.quickQueue=[...conn.db.myQuickQueue.iter()][0]??null;
          this.quickOffers=[...conn.db.quickMatchOffers.iter()];
          const row = conn.db.matchState.room.find(draft.room!);
          if (row) this.state = JSON.parse(row.snapshot) as GameState;
          this.emit();
        };
        conn.db.mySession.onInsert(read); conn.db.mySession.onUpdate(read);
        conn.db.matchState.onInsert(read); conn.db.matchState.onUpdate(read);
        conn.db.roomLobby.onInsert(read);conn.db.roomLobby.onUpdate(read);conn.db.roomLobby.onDelete(read);
        conn.db.lobbyRoster.onInsert(read);conn.db.lobbyRoster.onDelete(read);
        conn.db.myQuickQueue.onInsert(read);conn.db.myQuickQueue.onUpdate(read);conn.db.myQuickQueue.onDelete(read);
        conn.db.quickMatchOffers.onInsert(read);conn.db.quickMatchOffers.onDelete(read);
        conn.subscriptionBuilder().onApplied(() => {
          const args={room:draft.room!,name:draft.name,hero:draft.hero,companion:draft.companion,size:draft.size};
          (draft.mode?conn.reducers.enterLobby({...args,mode:draft.mode}):conn.reducers.joinMatch(args)).then(() => {
            if(this.stopped||this.connection!==conn)return;
            this.error = null; read();
            this.stopPing?.();
            this.stopPing=createPingMonitor({
              probe:(done:()=>void,failed:()=>void)=>{
                const handle=conn.subscriptionBuilder().onApplied(done).onError(failed).subscribe('SELECT * FROM my_session');
                return ()=>{try{handle.unsubscribe();}catch{/* Connection may already be closed. */}};
              },
              onUpdate:(ping:{state:string;ms:number|null})=>{
                if(this.stopped||this.connection!==conn)return;
                this.ping=ping;if(ping.state==='ready')this.pingSamples++;this.emit();
              },
            });
          }).catch(error => { if(this.stopped||this.connection!==conn)return;this.error = String(error); this.status = 'error'; this.emit(); });
        }).onError(ctx => { if(this.stopped||this.connection!==conn)return;this.error = String(ctx.event); this.status='error';this.emit(); })
          .subscribe(['SELECT * FROM my_session','SELECT * FROM lobby_roster','SELECT * FROM my_quick_queue','SELECT * FROM quick_match_offers']);
      })
      .onConnectError((_ctx, error) => { if(this.stopped||this.connection!==connection)return;this.error = String(error); this.emit(); this.retry(); })
      .onDisconnect(() => { if (this.connection === connection) this.retry(); })
      .build();
    this.connection = connection;
  }
  private retry() {
    if (this.stopped || this.reconnectTimer) return;
    this.stopPing?.();this.stopPing=null;this.ping={state:'measuring',ms:null};
    this.status = 'reconnecting'; this.emit();
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, 1500);
  }
  command(command: Command) {
    if (!this.connection || this.status !== 'connected'||this.lobby?.started===false) return;
    const started = performance.now();
    this.connection.reducers.controlCommand({ payload: JSON.stringify(command) })
      .then(() => { this.latency = Math.round(performance.now() - started); if(command.type !== 'steer' && command.type !== 'move') this.error = null; this.emit(); })
      .catch(error => { this.error = String(error); this.emit(); });
  }
  restart() {
    this.connection?.reducers.restartMatch({}).then(() => { this.error = null; this.emit(); }).catch(error => { this.error = String(error); this.emit(); });
  }
  ready(ready:boolean){return this.connection?.reducers.lobbyReady({ready}).catch(error=>{this.error=String(error);this.emit();});}
  start(){return this.connection?.reducers.startLobby({}).catch(error=>{this.error=String(error);this.emit();});}
  private async quickAction(action:()=>Promise<unknown>|undefined){try{await action();this.error=null;}catch(error){this.error=String(error);}this.emit();}
  waitForHuman(){return this.quickAction(()=>this.connection?.reducers.quickPreference({humanOnly:true}));}
  playBot(){return this.quickAction(()=>this.connection?.reducers.playQuickBot({}));}
  joinRunning(room:string){return this.quickAction(()=>this.connection?.reducers.joinRunningMatch({room}));}
  async leave(){if(this.lobby&&!this.lobby.started)await this.connection?.reducers.leaveLobby({});try{if(this.draft?.mode==='quick')sessionStorage.removeItem(sessionKey('quick-room'));}catch{}this.disconnect();}
  disconnect() {
    this.stopped = true;
    this.stopPing?.();this.stopPing=null;this.ping={state:'measuring',ms:null};this.pingSamples=0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const old = this.connection; this.connection = null; old?.disconnect();
    this.status = 'disconnected'; this.emit();
  }
}
