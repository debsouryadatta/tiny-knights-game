import type { Team, Vec, ResourceKind } from './types';
export const WIDTH=64, HEIGHT=64, TILE=64;
export const baseFor=(team:Team):Vec=>team==='blue'?{x:8,y:56}:{x:55,y:7};
export function spawnFor(team:Team,slot:number):Vec {const p={x:10+slot%3,y:53+Math.floor(slot/3)};return team==='blue'?p:{x:63-p.x,y:63-p.y};}
export function laneWaypoints(team:Team,lane:number):Vec[]{const a=baseFor('blue'),b=baseFor('red');const paths=[[a,{x:6,y:45},{x:6,y:7},{x:44,y:7},b],[a,{x:14,y:43},{x:22,y:36},{x:31,y:32},{x:32,y:31},{x:41,y:27},{x:49,y:20},b],[a,{x:19,y:56},{x:57,y:56},{x:57,y:18},b]];const p=paths[Math.max(0,Math.min(2,lane))];return (team==='blue'?p:[...p].reverse()).map(v=>({...v}));}
function distance(x:number,y:number,a:Vec,b:Vec){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);}
const paths=[0,1,2].map(i=>laneWaypoints('blue',i));
// Keep the old clearing geometry for roaming, but only the central lane is a
// road or a river crossing. Lane 1 matches the renderer and every spawned wave.
export function laneAt(x:number,y:number):number {const p=paths[1];let best=Infinity;for(let j=1;j<p.length;j++)best=Math.min(best,distance(x,y,p[j-1],p[j]));return best<=1.9?1:-1;}
export const isLane=(x:number,y:number)=>laneAt(x,y)>=0;
export const riverX=(y:number)=>31.5+Math.sin((y-31.5)/8)*2.4;
export const isLand=(x:number,y:number)=>x>=2&&x<62&&y>=2&&y<62;
export const isRiver=(x:number,y:number)=>Math.abs(x-riverX(y))<2.15;
export const biomeAt=(x:number,y:number)=>x>riverX(y)?'red':'blue';
export const camps=[{x:16,y:15,r:4},{x:23,y:25,r:3.5},{x:16,y:43,r:3.5},{x:25,y:49,r:3}].flatMap(c=>[c,{x:63-c.x,y:63-c.y,r:c.r}]);
export function isWall(x:number,y:number){if(isLane(x,y))return false;for(const c of camps){const dx=x-c.x,dy=y-c.y,d=Math.hypot(dx,dy);if(Math.abs(d-c.r)<.62&&!(Math.abs(dy)<1.35))return true;}return false;}
export function resourceSeeds():{x:number;y:number;kind:ResourceKind}[]{return [[15,15,'wood'],[17,15,'gold'],[23,25,'gold'],[16,43,'wood'],[25,49,'gold'],[12,49,'wood'],[20,39,'wood'],[12,26,'wood'],[24,12,'gold']].flatMap(([x,y,kind])=>[{x:Number(x),y:Number(y),kind:kind as ResourceKind},{x:63-Number(x),y:63-Number(y),kind:kind as ResourceKind}]);}
const forest=new Uint8Array(WIDTH*HEIGHT);
const resources=resourceSeeds();
// Canonical coordinates keep both teams' groves exactly rotationally mirrored.
for(let y=2;y<62;y++)for(let x=2;x<62;x++){
  if(isRiver(x,y)||isWall(x,y)||(x<15&&y>48)||(x>48&&y<15))continue;
  if(paths.some(path=>path.some((p,i)=>i>0&&distance(x,y,path[i-1],p)<3)))continue;
  if(camps.some(c=>Math.hypot(x-c.x,y-c.y)<c.r+1.5))continue;
  if(resources.some(c=>Math.hypot(x-c.x,y-c.y)<2))continue;
  const cx=x<32?x:63-x,cy=x<32?y:63-y;
  if(Math.sin(cx*.52)+Math.cos(cy*.63)+Math.sin((cx+cy)*.33)>.15)forest[y*WIDTH+x]=1;
}
export function isForest(x:number,y:number):boolean{return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<WIDTH&&y>=0&&y<HEIGHT&&forest[y*WIDTH+x]===1;}
export function isWalkable(x:number,y:number):boolean{return Number.isInteger(x)&&Number.isInteger(y)&&isLand(x,y)&&(!isRiver(x,y)||isLane(x,y))&&!isWall(x,y)&&!isForest(x,y);}
// Thin the edge of any sealed pocket. This leaves one connected movement graph,
// without placing new trees in camp clearings or removing authoritative rocks.
for(let pass=0;pass<WIDTH;pass++){
  const seen=new Uint8Array(WIDTH*HEIGHT),queue=[baseFor('blue')];seen[56*WIDTH+8]=1;
  for(let i=0;i<queue.length;i++){const p=queue[i];for(const [dx,dy]of [[0,1],[0,-1],[1,0],[-1,0]]){const x=p.x+dx,y=p.y+dy;if(isWalkable(x,y)&&!seen[y*WIDTH+x]){seen[y*WIDTH+x]=1;queue.push({x,y});}}}
  const clear=new Set<number>();
  for(let y=2;y<62;y++)for(let x=2;x<62;x++)if(isWalkable(x,y)&&!seen[y*WIDTH+x])for(const [dx,dy]of [[0,1],[0,-1],[1,0],[-1,0]]){const nx=x+dx,ny=y+dy;if(isForest(nx,ny)){clear.add(ny*WIDTH+nx);clear.add((63-ny)*WIDTH+63-nx);}}
  if(!clear.size)break;for(const cell of clear)forest[cell]=0;
}
