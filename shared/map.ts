import type { Team, Vec, ResourceKind } from './types';
export const WIDTH=80, HEIGHT=56, TILE=64;
export const LANES=[0,1,2] as const;
export const LANE_NAMES=['Top','Mid','Bottom'] as const;
export const LANE_HALF_WIDTH=1.9;
export const baseFor=(team:Team):Vec=>team==='blue'?{x:8,y:47}:{x:71,y:8};
export function spawnFor(team:Team,slot:number):Vec {const p={x:10+slot%3,y:44+Math.floor(slot/3)};return team==='blue'?p:{x:WIDTH-1-p.x,y:HEIGHT-1-p.y};}
export function laneWaypoints(team:Team,lane:number):Vec[]{const a=baseFor('blue'),b=baseFor('red');const paths=[[a,{x:8,y:18},{x:18,y:8},{x:61,y:8},b],[a,{x:24,y:37},{x:39.5,y:27.5},{x:55,y:18},b],[a,{x:18,y:47},{x:61,y:47},{x:71,y:37},b]];const p=paths[Math.max(0,Math.min(2,lane))];return (team==='blue'?p:[...p].reverse()).map(v=>({...v}));}
function distance(x:number,y:number,a:Vec,b:Vec){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);}
const paths=LANES.map(i=>laneWaypoints('blue',i));
// Prefer mid at shared base endpoints; elsewhere select the closest road.
export function laneAt(x:number,y:number):number {
  let closest=-1,best=LANE_HALF_WIDTH;
  for(const lane of [1,0,2]){
    const path=paths[lane];
    for(let j=1;j<path.length;j++){
      const d=distance(x,y,path[j-1],path[j]);
      if(d<=best&&(closest<0||d<best)){best=d;closest=lane;}
    }
  }
  return closest;
}
export const isLane=(x:number,y:number)=>laneAt(x,y)>=0;
export const riverX=(y:number)=>(WIDTH-1)/2+Math.sin((y-(HEIGHT-1)/2)/8)*2.4;
export const bridgeCenters:readonly Vec[]=[{x:riverX(8),y:8},{x:(WIDTH-1)/2,y:(HEIGHT-1)/2},{x:riverX(47),y:47}];
export const isLand=(x:number,y:number)=>x>=2&&x<WIDTH-2&&y>=2&&y<HEIGHT-2;
export const isRiver=(x:number,y:number)=>Math.abs(x-riverX(y))<2.15;
export const biomeAt=(x:number,y:number)=>x>riverX(y)?'red':'blue';
export const camps=[{x:20,y:20,r:4},{x:31,y:17,r:3.5},{x:19,y:36,r:3.5},{x:31,y:39,r:3}].flatMap(c=>[c,{x:WIDTH-1-c.x,y:HEIGHT-1-c.y,r:c.r}]);
export function isWall(x:number,y:number){if(isLane(x,y))return false;for(const c of camps){const dx=x-c.x,dy=y-c.y,d=Math.hypot(dx,dy);if(Math.abs(d-c.r)<.62&&!(Math.abs(dy)<1.35))return true;}return false;}
export function resourceSeeds():{x:number;y:number;kind:ResourceKind}[]{return [[19,20,'wood'],[21,20,'gold'],[31,17,'gold'],[19,36,'wood'],[31,39,'gold'],[14,41,'wood'],[26,29,'wood'],[14,26,'wood'],[32,12,'gold']].flatMap(([x,y,kind])=>[{x:Number(x),y:Number(y),kind:kind as ResourceKind},{x:WIDTH-1-Number(x),y:HEIGHT-1-Number(y),kind:kind as ResourceKind}]);}
const forest=new Uint8Array(WIDTH*HEIGHT);
const resources=resourceSeeds();
// Canonical coordinates keep both teams' groves exactly rotationally mirrored.
for(let y=2;y<HEIGHT-2;y++)for(let x=2;x<WIDTH-2;x++){
  if(isRiver(x,y)||isWall(x,y)||(x<15&&y>HEIGHT-16)||(x>WIDTH-16&&y<15))continue;
  if(paths.some(path=>path.some((p,i)=>i>0&&distance(x,y,path[i-1],p)<3)))continue;
  if(camps.some(c=>Math.hypot(x-c.x,y-c.y)<c.r+1.5))continue;
  if(resources.some(c=>Math.hypot(x-c.x,y-c.y)<2))continue;
  const cx=x<WIDTH/2?x:WIDTH-1-x,cy=x<WIDTH/2?y:HEIGHT-1-y;
  if(Math.sin(cx*.52)+Math.cos(cy*.63)+Math.sin((cx+cy)*.33)>.15)forest[y*WIDTH+x]=1;
}
export function isForest(x:number,y:number):boolean{return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<WIDTH&&y>=0&&y<HEIGHT&&forest[y*WIDTH+x]===1;}
export function isWalkable(x:number,y:number):boolean{return Number.isInteger(x)&&Number.isInteger(y)&&isLand(x,y)&&(!isRiver(x,y)||isLane(x,y))&&!isWall(x,y)&&!isForest(x,y);}
// Thin the edge of any sealed pocket. This leaves one connected movement graph,
// without placing new trees in camp clearings or removing authoritative rocks.
for(let pass=0;pass<WIDTH;pass++){
  const seen=new Uint8Array(WIDTH*HEIGHT),queue=[baseFor('blue')];seen[queue[0].y*WIDTH+queue[0].x]=1;
  for(let i=0;i<queue.length;i++){const p=queue[i];for(const [dx,dy]of [[0,1],[0,-1],[1,0],[-1,0]]){const x=p.x+dx,y=p.y+dy;if(isWalkable(x,y)&&!seen[y*WIDTH+x]){seen[y*WIDTH+x]=1;queue.push({x,y});}}}
  const clear=new Set<number>();
  for(let y=2;y<HEIGHT-2;y++)for(let x=2;x<WIDTH-2;x++)if(isWalkable(x,y)&&!seen[y*WIDTH+x])for(const [dx,dy]of [[0,1],[0,-1],[1,0],[-1,0]]){const nx=x+dx,ny=y+dy;if(isForest(nx,ny)){clear.add(ny*WIDTH+nx);clear.add((HEIGHT-1-ny)*WIDTH+WIDTH-1-nx);}}
  if(!clear.size)break;for(const cell of clear)forest[cell]=0;
}
