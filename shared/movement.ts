import {isWalkable} from './map';
import type {GameState,Vec} from './types';
import {SPRINT_MULTIPLIER} from './balance';
export const MOVE_SPEED=5;
export function getMoveSpeed(actor:{sprintUntil?:number},elapsed:number):number {return MOVE_SPEED*((actor.sprintUntil??0)>elapsed?SPRINT_MULTIPLIER:1);}
export const ACTOR_RADIUS=.28;
export function canOccupy(state:GameState,p:Vec,except?:string):boolean {
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;
  const r=ACTOR_RADIUS;
  const mover=state.actors.find(a=>a.id===except);
  for(let y=Math.round(p.y-r);y<=Math.round(p.y+r);y++)for(let x=Math.round(p.x-r);x<=Math.round(p.x+r);x++){
    if(isWalkable(x,y))continue;
    const nx=Math.max(x-.5,Math.min(x+.5,p.x)),ny=Math.max(y-.5,Math.min(y+.5,p.y));
    if(Math.hypot(p.x-nx,p.y-ny)<r-1e-6)return false;
  }
  return !state.actors.some(a=>a.id!==except&&a.hp>0&&a.team!==mover?.team&&Math.hypot(a.x-p.x,a.y-p.y)<r*2-1e-6)&&!state.structures.some(a=>a.hp>0&&Math.hypot(a.x-p.x,a.y-p.y)<r+.45-1e-6);
}
/** Shared by authoritative simulation and local prediction. Sweep in short steps, slide along walls. */
export function moveContinuous(state:GameState,actor:Vec & {id:string},dx:number,dy:number):void {
  const count=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.14));
  for(let i=0;i<count;i++){
    const sx=dx/count,sy=dy/count,p={x:actor.x+sx,y:actor.y+sy};
    if(canOccupy(state,p,actor.id)){actor.x=p.x;actor.y=p.y;continue;}
    if(canOccupy(state,{x:actor.x+sx,y:actor.y},actor.id))actor.x+=sx;
    if(canOccupy(state,{x:actor.x,y:actor.y+sy},actor.id))actor.y+=sy;
  }
}
