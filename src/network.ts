import type { Command, Draft, GameState, ServerMessage, Session } from '../shared/types';
import { SpacetimeGameClient } from './spacetime-client';
export interface GameConnection {
 state:GameState|null;session:Session|null;status:string;error:string|null;latency:number;
 plannerMode?:'deterministic'|'llm';
 subscribe(fn:()=>void):()=>void;join(draft:Draft):void;command(command:Command):void;restart():void;disconnect():void;
}
export class GameClient extends SpacetimeGameClient {
 plannerMode:'deterministic'|'llm'='deterministic';
 private plannerTimer:ReturnType<typeof setInterval>|null=null;
 private plannerRequest:AbortController|null=null;
 private manualOrderAt=0;
 private plannerEnabled=false;
 private roundGeneration=0;
 override join(draft:Draft){
  super.join(draft);
  this.roundGeneration++;
  this.manualOrderAt=0;this.plannerMode='deterministic';
  fetch('/api/health').then(r=>r.json()).then(data=>{this.plannerEnabled=data.companionMode==='llm';}).catch(()=>{this.plannerEnabled=false;});
  this.plannerTimer=setInterval(()=>void this.plan(),30000);
 }
 override command(command:Command){if(command.type==='order')this.manualOrderAt=Date.now();super.command(command);}
 private async plan(){
  if(!this.plannerEnabled||this.plannerRequest||this.status!=='connected'||this.state?.phase!=='playing'||!this.session||Date.now()-this.manualOrderAt<60000)return;
  const state=this.state,session=this.session,generation=this.roundGeneration;
  const hero=state.actors.find(a=>a.id===session.playerId),companion=state.actors.find(a=>a.ownerId===session.playerId&&a.kind==='companion');
  if(!hero||!companion||hero.hp<=0||companion.hp<=0)return;
  const controller=new AbortController();this.plannerRequest=controller;
  const timeout=setTimeout(()=>controller.abort(),5000);
  try{
   const response=await fetch('/api/companion-plan',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({seconds:Math.floor(state.elapsed),heroHealth:hero.hp/hero.maxHp,companionHealth:companion.hp/companion.maxHp,bank:state.bank[hero.team],nearbyEnemies:state.actors.filter(a=>a.team!==hero.team&&a.hp>0&&Math.hypot(a.x-hero.x,a.y-hero.y)<8).length,currentOrder:companion.order})});
   if(!response.ok)throw new Error('Planner unavailable');
   const result=await response.json();
   if(this.session?.token!==session.token||this.session?.room!==session.room||this.session?.playerId!==session.playerId||Date.now()-this.manualOrderAt<60000)return;
   if(generation!==this.roundGeneration||this.state?.phase!=='playing'||this.state.elapsed<state.elapsed||!this.state.actors.some(a=>a.id===session.playerId&&a.hp>0))return;
   if(result.mode==='llm'&&['gather','escort','attack','defend'].includes(result.order)){this.plannerMode='llm';super.command({type:'order',order:result.order});}
   else this.plannerMode='deterministic';
  }catch{this.plannerMode='deterministic';}
  finally{clearTimeout(timeout);if(this.plannerRequest===controller)this.plannerRequest=null;}
 }
 override restart(){this.roundGeneration++;this.plannerRequest?.abort();super.restart();}
 override disconnect(){if(this.plannerTimer)clearInterval(this.plannerTimer);this.plannerTimer=null;this.plannerRequest?.abort();this.plannerRequest=null;super.disconnect();}
}
export class WebSocketGameClient {
  state:GameState|null=null;
  session:Session|null=null;
  status='disconnected';
  error:string|null=null;
  latency=0;
  private ws:WebSocket|null=null;
  private listeners=new Set<()=>void>();
  private draft:Draft|null=null;
  private stopped=true;
  private reconnectTimer:ReturnType<typeof setTimeout>|null=null;
  private pingTimer:ReturnType<typeof setInterval>|null=null;
  private attempts=0;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  private emit(){for(const listener of this.listeners)listener();}
  join(draft:Draft){this.disconnect();this.draft=draft;this.state=null;this.session=null;this.error=null;this.stopped=false;this.attempts=0;this.connect();}
  private connect(){
    if(this.stopped||!this.draft)return;
    this.status=this.attempts?'reconnecting':'connecting';this.emit();
    const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);this.ws=ws;
    ws.onopen=()=>{ws.send(JSON.stringify({type:'join',draft:{...this.draft,room:this.session?.room||this.draft?.room},token:this.session?.token}));this.pingTimer=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ping',at:Date.now()}));},3000);};
    ws.onmessage=(event)=>{try{const msg=JSON.parse(event.data) as ServerMessage;
      if(msg.type==='welcome'){this.session=msg.session;this.status='connected';this.attempts=0;this.error=null;}
      else if(msg.type==='state'){this.state=msg.state;}
      else if(msg.type==='error'){this.error=msg.message;}
      else if(msg.type==='pong'){this.latency=Date.now()-msg.at;}
      this.emit();
    }catch{this.error='The server sent an unreadable update.';this.emit();}};
    ws.onclose=()=>{if(this.ws!==ws)return;if(this.pingTimer)clearInterval(this.pingTimer);this.pingTimer=null;if(!this.stopped){this.status='reconnecting';this.error='Connection interrupted. Reconnecting…';this.emit();this.attempts++;this.reconnectTimer=setTimeout(()=>this.connect(),Math.min(1000*this.attempts,6000));}};
    ws.onerror=()=>{this.error='Cannot reach the match server. Retrying…';this.emit();};
  }
  command(command:Command){if(this.ws?.readyState===WebSocket.OPEN&&this.session){this.error=null;this.ws.send(JSON.stringify({type:'command',command}));}else{this.error='Reconnect before sending an order.';this.emit();}}
  restart(){if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type:'restart'}));}
  disconnect(){this.stopped=true;if(this.reconnectTimer)clearTimeout(this.reconnectTimer);if(this.pingTimer)clearInterval(this.pingTimer);this.reconnectTimer=null;this.pingTimer=null;const old=this.ws;this.ws=null;old?.close();this.status='disconnected';this.emit();}
}
