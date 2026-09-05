import { WIDTH, HEIGHT, TILE, isLand, isRiver, isLane, isWall, isForest, riverX, biomeAt, camps, laneWaypoints } from '../shared/map';

export const WORLD={W:WIDTH*TILE,H:HEIGHT*TILE,T:TILE};
export const files={grass:'Terrain/Tileset/Tilemap_color2.png',deepgrass:'Terrain/Tileset/Tilemap_color3.png',rock:'Terrain/Decorations/Rocks/Rock1.png',rock2:'Terrain/Decorations/Rocks/Rock3.png',gold:'Terrain/Resources/Gold/Gold Stones/Gold Stone 1.png',sheep:'Terrain/Resources/Meat/Sheep/Sheep_Idle.png',House1:'Buildings/Blue Buildings/House1.png',redHouse1:'Buildings/Red Buildings/House1.png'};
for(let i=1;i<=4;i++){files[`tree${i}`]=`Terrain/Resources/Wood/Trees/Tree${i}.png`;files[`bush${i}`]=`Terrain/Decorations/Bushes/Bushe${i}.png`;}
export const objects=[];
let seed=80319;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const hash=(x,y)=>{let n=Math.imul(x+119,374761393)^Math.imul(y+217,668265263);n=Math.imul(n^(n>>>13),1274126177);return(n>>>0)/4294967296;};
const px=n=>(n+.5)*TILE;
function add(type,x,y,scale=1){objects.push({type,x:px(x),y:px(y),scale,phase:random()*8,team:biomeAt(x,y)});}
function inBase(x,y){return(x<14&&y>49)||(x>49&&y<14);}
// Dense borders and irregular groves frame cleared, collision-safe lane corridors.
for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
  if(isRiver(x,y)||isLane(x,y)||inBase(x,y))continue;
  const wall=isWall(x,y),border=x<3||x>60||y<3||y>60;
  if(wall){add('rock2',x,y,.9);continue;}
  const camp=camps.some(c=>Math.hypot(x-c.x,y-c.y)<c.r+.6);
  if(camp)continue;
  if(border&&!isLand(x,y)||isForest(x,y)){add(`tree${1+Math.floor(random()*4)}`,x+(random()-.5)*.3,y+(random()-.5)*.25,.57+random()*.13);}
  else if(hash(x+91,y)>.7)add(`bush${1+Math.floor(random()*4)}`,x,y,.65);
  else if(hash(x+54,y)>.95)add('rock',x,y,.7);
}
// Decoration stays away from resource interaction cells and enclosure openings.
for(const c of camps)add(biomeAt(c.x,c.y)==='red'?'redHouse1':'House1',c.x,c.y-1.8,.58);

const buckets=new Map();
for(const o of objects){const key=`${Math.floor(o.x/384)},${Math.floor(o.y/384)}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(o);}
export function getVisibleObjects(bounds){const result=[];for(let y=Math.floor((bounds.top-260)/384);y<=Math.floor((bounds.bottom+260)/384);y++)for(let x=Math.floor((bounds.left-260)/384);x<=Math.floor((bounds.right+260)/384);x++){const bucket=buckets.get(`${x},${y}`);if(bucket)result.push(...bucket);}return result;}
const tintCache=new WeakMap();
function tint(img){if(tintCache.has(img))return tintCache.get(img);const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const data=g.getImageData(0,0,c.width,c.height);for(let i=0;i<data.data.length;i+=4){const r=data.data[i],gr=data.data[i+1],b=data.data[i+2],l=(r+gr+b)/3;data.data[i]=Math.min(255,l*.97+21);data.data[i+1]=l*.63;data.data[i+2]=l*.66;}g.putImageData(data,0,0);tintCache.set(img,c);return c;}
export function drawObject(ctx,imgs,o,time){let img=imgs[o.type]||(/^tree/.test(o.type)?imgs.tree1:undefined);if(!img)return;if(o.team==='red'&&/tree|bush/.test(o.type))img=tint(img);let sw=img.width,sh=img.height,frame=0;if(/tree|bush/.test(o.type)){sw=img.width/8;frame=Math.floor(time*5+o.phase)%8;}if(o.type==='sheep'){sw=128;frame=Math.floor(time*5+o.phase)%6;}const w=sw*o.scale,h=sh*o.scale;ctx.drawImage(img,frame*sw,0,sw,sh,Math.round(o.x-w/2),Math.round(o.y-h+20*o.scale),w,h);}

function stone(g,x,y,w,h,red=false){g.fillStyle='#273b40';g.fillRect(x,y+8,w,h);g.fillStyle=red?'#777078':'#809398';g.fillRect(x,y,w,h-5);g.fillStyle=red?'#aaa0a0':'#afc2be';g.fillRect(x,y,w,5);g.strokeStyle='#48565b';g.lineWidth=2;g.strokeRect(x,y,w,h-5);g.beginPath();g.moveTo(x+w/2,y);g.lineTo(x+w/2,y+h-5);g.stroke();}
function flag(g,x,y,red){g.fillStyle='#343b40';g.fillRect(x-3,y-64,6,76);g.fillStyle='#c0b591';g.fillRect(x-2,y-66,4,5);g.fillStyle=red?'#c54c56':'#499cdb';g.beginPath();g.moveTo(x+3,y-62);g.lineTo(x+27,y-62);g.lineTo(x+20,y-33);g.lineTo(x+3,y-37);g.fill();g.fillStyle='#e6e1cb';g.fillRect(x+10,y-55,4,11);}
function fortress(g,red){const left=red?50:3,top=red?3:50,edge=10;g.fillStyle=red?'#636066':'#637d76';g.fillRect(left*TILE,top*TILE,edge*TILE,edge*TILE);for(let yy=0;yy<edge;yy++)for(let xx=0;xx<edge;xx++){g.strokeStyle=red?'#514d55':'#536b63';g.strokeRect((left+xx)*TILE,(top+yy)*TILE,TILE,TILE);}
  // Three-tile-wide gateways align with the perimeter and diagonal approaches.
  for(let i=0;i<edge;i++){if(i<3||i>6){stone(g,(left+i)*TILE,top*TILE,TILE,32,red);stone(g,(left+i)*TILE,(top+edge)*TILE,TILE,32,red);stone(g,left*TILE,(top+i)*TILE,32,TILE,red);stone(g,(left+edge)*TILE,(top+i)*TILE,32,TILE,red);}}
  for(const [x,y]of [[left,top],[left+edge,top],[left,top+edge],[left+edge,top+edge]]){stone(g,x*TILE-12,y*TILE-12,60,58,red);flag(g,x*TILE+12,y*TILE-12,red);}
  const cx=red?55:8,cy=red?7:56;g.strokeStyle=red?'#d65d65':'#77bced';g.lineWidth=5;g.beginPath();g.arc(px(cx),px(cy),100,0,Math.PI*2);g.stroke();
}
function paintTerrain(g,imgs,bounds={left:0,top:0,right:WORLD.W,bottom:WORLD.H}){g.imageSmoothingEnabled=false;g.fillStyle='#284754';g.fillRect(0,0,WORLD.W,WORLD.H);
  const x0=Math.max(0,Math.floor(bounds.left/TILE)-2),x1=Math.min(WIDTH,Math.ceil(bounds.right/TILE)+2),y0=Math.max(0,Math.floor(bounds.top/TILE)-2),y1=Math.min(HEIGHT,Math.ceil(bounds.bottom/TILE)+2);
  const redgrass=tint(imgs.grass);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    if(!isLand(x,y)||isRiver(x,y))continue;
    const red=biomeAt(x,y)==='red',im=red?redgrass:imgs.grass;
    const n=isLand(x,y-1)&&!isRiver(x,y-1),s=isLand(x,y+1)&&!isRiver(x,y+1),w=isLand(x-1,y)&&!isRiver(x-1,y),e=isLand(x+1,y)&&!isRiver(x+1,y);
    const tx=!w?0:!e?2:1,ty=!n?0:!s?2:1;
    g.drawImage(im,tx*TILE,ty*TILE,TILE,TILE,x*TILE,y*TILE,TILE,TILE);
    if(red){g.fillStyle='#4b3f4824';g.fillRect(x*TILE,y*TILE,TILE,TILE);}
  }
  // The same authoritative lane query clips dirt and determines passable bridges.
  g.save();g.beginPath();for(let y=Math.max(2,y0);y<Math.min(62,y1);y++)for(let x=Math.max(2,x0);x<Math.min(62,x1);x++)if(!isRiver(x,y))g.rect(x*TILE,y*TILE,TILE,TILE);g.clip();
  g.lineJoin='round';g.lineCap='round';for(const [width,color]of [[3.9,'#8b9569'],[3.5,'#b8a777'],[3.15,'#c9b687']]){g.lineWidth=width*TILE;g.strokeStyle=color;for(let lane=0;lane<3;lane++){g.beginPath();laneWaypoints('blue',lane).forEach((p,i)=>i?g.lineTo(px(p.x),px(p.y)):g.moveTo(px(p.x),px(p.y)));g.stroke();}}
  for(let y=Math.max(2,y0);y<Math.min(62,y1);y++)for(let x=Math.max(2,x0);x<Math.min(62,x1);x++)if(isLane(x,y)){for(let i=0;i<12;i++){g.fillStyle=i%2?'#766b512c':'#eed5a22b';g.fillRect(x*TILE+hash(x+i*9,y)*62,y*TILE+hash(x,y+i*7)*62,3,2);}}
  g.restore();
  // Small river stones and luminous shoals, deterministic and inexpensive.
  for(let y=3;y<61;y++){const rx=riverX(y);for(const sign of [-1,1]){const x=(rx+sign*2.1)*TILE;g.fillStyle='#597b70';g.fillRect(x,px(y),13,9);g.fillStyle='#8b9f80';g.fillRect(x+3,px(y)-3,7,4);}g.fillStyle='#78b8bd35';g.fillRect((rx-1)*TILE,px(y),TILE*.8,3);}
  for(const y of [7,31.5,56]){const x=(riverX(y)-3.6)*TILE,w=7.2*TILE,h=y===31.5?3.5*TILE:3.8*TILE,top=px(y)-h/2;g.fillStyle='#344c54';g.fillRect(x,top+15,w,h);for(let yy=top;yy<top+h;yy+=32)for(let xx=x;xx<x+w;xx+=64)stone(g,xx,yy,64,32,true);for(const yy of [top-12,top+h-2])for(let xx=x;xx<x+w;xx+=64)stone(g,xx,yy,64,18);}
  // Worn earth makes camp interiors readable through the forest canopy.
  for(const camp of camps){g.fillStyle=biomeAt(camp.x,camp.y)==='red'?'#8d776654':'#c4ae7360';g.beginPath();g.arc(px(camp.x),px(camp.y),camp.r*TILE*.77,0,Math.PI*2);g.fill();}
  fortress(g,false);fortress(g,true);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(isWall(x,y)){stone(g,x*TILE+5,y*TILE+20,54,28,biomeAt(x,y)==='red');}
  // Lane standards sit outside the collision corridors.
  for(const y of [7,56])for(const x of [15,46])flag(g,px(x),px(y-2.6),biomeAt(x,y)==='red');
}

// No full-world bitmap: at most 12 small terrain chunks are retained (12 MiB).
// The overview is painted independently, so a lost terrain cache cannot blank it.
export function bakeTerrain(imgs){
  const size=512,limit=12,cache=new Map();
  const overview=document.createElement('canvas');overview.width=overview.height=512;
  function paintOverview(){
    const g=overview.getContext('2d',{alpha:false});if(!g)throw new Error('Map canvas unavailable');
    // A schematic costs one small fill per tile: no full-world texture bake.
    for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
      const red=biomeAt(x,y)==='red',land=isLand(x,y),river=isRiver(x,y),lane=isLane(x,y);
      g.fillStyle=!land||river&&!lane?'#284754':lane?'#c9b687':isWall(x,y)?'#809398':red?'#79656c':'#8fab59';
      g.fillRect(x*8,y*8,8,8);
    }
    g.save();g.scale(512/WORLD.W,512/WORLD.H);fortress(g,false);fortress(g,true);g.restore();
  }
  paintOverview();
  overview.addEventListener('contextrestored',paintOverview);
  return {
    overview,
    clear(){for(const c of cache.values()){c.width=1;c.height=1;}cache.clear();},
    get count(){return cache.size;},
    draw(g,bounds,small=false){
      if(small){g.drawImage(overview,0,0,WORLD.W,WORLD.H);return;}
      const left=Math.max(0,Math.floor(bounds.left/size)),right=Math.min(7,Math.floor(bounds.right/size));
      const top=Math.max(0,Math.floor(bounds.top/size)),bottom=Math.min(7,Math.floor(bounds.bottom/size));
      let prepared=0;
      for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
        const key=`${x},${y}`;let c=cache.get(key);
        if(!c){
          // Missing regions stay visible while texture work is spread over frames.
          if(prepared>=1){g.drawImage(overview,x*64,y*64,64,64,x*size,y*size,size,size);continue;}
          prepared++;
          while(cache.size>=limit){const oldest=cache.keys().next().value,old=cache.get(oldest);cache.delete(oldest);old.width=old.height=1;}
          c=document.createElement('canvas');c.width=c.height=size;
          const cg=c.getContext('2d',{alpha:false});
          if(!cg){g.drawImage(overview,x*64,y*64,64,64,x*size,y*size,size,size);continue;}
          cg.translate(-x*size,-y*size);paintTerrain(cg,imgs,{left:x*size,top:y*size,right:(x+1)*size,bottom:(y+1)*size});
          c.addEventListener('contextlost',()=>{if(cache.get(key)===c)cache.delete(key);});
        }
        cache.delete(key);cache.set(key,c);g.drawImage(c,x*size,y*size);
      }
    }
  };
}
