import { DbConnection } from '../backend/spacetime/bindings';
import type { Command, Draft, GameState, Session } from '../shared/types';

/** Same public contract as GameClient. Real SpacetimeDB subscription transport. */
export class SpacetimeGameClient {
  state: GameState | null = null;
  session: Session | null = null;
  status = 'disconnected';
  error: string | null = null;
  latency = 0;
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
    this.draft = { ...draft, room: (draft.room || Array.from(crypto.getRandomValues(new Uint8Array(3)),b=>b.toString(16).padStart(2,'0')).join('')).trim().toUpperCase() };
    try { this.token = sessionStorage.getItem(`tiny-knights-session:${this.draft.room}`) ?? undefined; } catch { this.token = undefined; }
    this.state = null; this.session = null; this.error = null; this.stopped = false;
    this.connect();
  }
  private connect() {
    if (this.stopped || !this.draft) return;
    this.status = this.token ? 'reconnecting' : 'connecting'; this.emit();
    const draft = this.draft;
    const uri = import.meta.env.VITE_SPACETIME_URI || location.origin;
    const connection = DbConnection.builder().withUri(uri).withDatabaseName('tiny-knights-prototype').withToken(this.token)
      .onConnect((conn, _identity, token) => {
        if(this.stopped || this.connection !== conn){conn.disconnect();return;}
        this.token = token;
        try { sessionStorage.setItem(`tiny-knights-session:${draft.room}`,token); } catch { /* Private browsing may disable storage. */ }
        const read = () => {
          const member = [...conn.db.mySession.iter()][0];
          if (member) { this.session = { playerId: member.playerId, room: member.room, token }; this.status = 'connected'; }
          const row = conn.db.matchState.room.find(draft.room!);
          if (row) this.state = JSON.parse(row.snapshot) as GameState;
          this.emit();
        };
        conn.db.mySession.onInsert(read); conn.db.mySession.onUpdate(read);
        conn.db.matchState.onInsert(read); conn.db.matchState.onUpdate(read);
        conn.subscriptionBuilder().onApplied(() => {
          conn.reducers.joinMatch({ ...draft, room: draft.room! }).then(() => { this.error = null; read(); }).catch(error => { this.error = String(error); this.status = 'error'; this.emit(); });
        }).onError(ctx => { this.error = String(ctx.event); this.emit(); })
          .subscribe([`SELECT * FROM match_state WHERE room = '${draft.room!.replace(/'/g, '')}'`, 'SELECT * FROM my_session']);
      })
      .onConnectError((_ctx, error) => { this.error = String(error); this.emit(); this.retry(); })
      .onDisconnect(() => { if (this.connection === connection) this.retry(); })
      .build();
    this.connection = connection;
  }
  private retry() {
    if (this.stopped || this.reconnectTimer) return;
    this.status = 'reconnecting'; this.emit();
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, 1500);
  }
  command(command: Command) {
    if (!this.connection || this.status !== 'connected') return;
    const started = performance.now();
    this.connection.reducers.controlCommand({ payload: JSON.stringify(command) })
      .then(() => { this.latency = Math.round(performance.now() - started); if(command.type !== 'steer' && command.type !== 'move') this.error = null; this.emit(); })
      .catch(error => { this.error = String(error); this.emit(); });
  }
  restart() {
    this.connection?.reducers.restartMatch({}).then(() => { this.error = null; this.emit(); }).catch(error => { this.error = String(error); this.emit(); });
  }
  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const old = this.connection; this.connection = null; old?.disconnect();
    this.status = 'disconnected'; this.emit();
  }
}
