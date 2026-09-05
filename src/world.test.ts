import test from 'node:test';
import assert from 'node:assert/strict';
import { objects,drawRiver,objectIntersects,getVisibleObjects,bakeTerrain,drawLaneLabels } from './world.js';
import { TILE, WIDTH, HEIGHT, isWalkable, isLane, riverX, laneWaypoints, bridgeCenters, LANES } from '../shared/map';

test('every tree frame clears neighboring walkable cell centers',()=>{
  for(const object of objects.filter(o=>o.type.startsWith('tree'))){
    const x=object.x/TILE-.5,y=object.y/TILE-.5;
    assert.equal(x,Math.round(x));assert.equal(y,Math.round(y));
    for(let ny=y-3;ny<=y+1;ny++)for(let nx=x-2;nx<=x+2;nx++){
      if(!isWalkable(nx,ny))continue;
      const dx=(nx-x)*TILE,dy=(ny-y)*TILE;
      assert.ok(!(Math.abs(dx)<96*object.scale+8&&dy>-236*object.scale-8&&dy<20*object.scale+8),`Tree ${x},${y} obscures ${nx},${ny}`);
    }
  }
});

test('sprite culling preserves frame overhangs at every viewport edge',()=>{
  const o={type:'tree1',x:100,y:100,scale:1},img={width:1536,height:256};
  assert.equal(objectIntersects(o,img,{left:4,top:-136,right:196,bottom:120}),true);
  assert.equal(objectIntersects(o,img,{left:196,top:90,right:210,bottom:120}),true);
  assert.equal(objectIntersects(o,img,{left:197,top:90,right:210,bottom:120}),false);
  assert.equal(objectIntersects(o,img,{left:90,top:-140,right:110,bottom:-136}),true);
  assert.equal(objectIntersects(o,img,{left:90,top:-140,right:110,bottom:-137}),false);
});
test('bucket culling matches exhaustive image bounds and reuses caller storage',()=>{
  const images=Object.fromEntries(objects.map(o=>[o.type,{width:/tree|bush/.test(o.type)?1536:192,height:256}]));
  const result:any[]=[];
  for(const x of [4,16,32,58]){
    const bounds={left:x*TILE-620,top:32*TILE-290,right:x*TILE+620,bottom:32*TILE+290};
    const expected=objects.filter(o=>objectIntersects(o,images[o.type],bounds));
    assert.equal(getVisibleObjects(bounds,images,result),result);
    assert.deepEqual(new Set(result),new Set(expected));
  }
});

test('river animation selects later pack frames and clips to water cells',()=>{
  const calls:unknown[][]=[],rectangles:number[][]=[];
  const ctx={save(){},restore(){},beginPath(){},clip(){},rect(...r:number[]){rectangles.push(r);},drawImage(...args:unknown[]){calls.push(args);},globalAlpha:1};
  const images={waterFoam:{},waterSplash:{}};
  const bounds={left:(WIDTH/2-7)*TILE,top:20*TILE,right:(WIDTH/2+7)*TILE,bottom:28*TILE};
  drawRiver(ctx,images,bounds,0);
  const first=calls.filter(c=>c[0]===images.waterFoam).map(c=>c[1]);
  assert.ok(first.length>0);assert.ok(first.every(x=>x===0));
  calls.length=0;
  drawRiver(ctx,images,bounds,1);
  assert.ok(calls.filter(c=>c[0]===images.waterFoam).every(c=>c[1]===7*192));
  assert.ok(rectangles.length>0);
  assert.ok(rectangles.every(r=>r[2]===TILE&&r[3]===TILE));
});


test('cached overview paints all three roads and their river crossings',()=>{
  const fills:{x:number;y:number;w:number;h:number;color:string}[]=[];
  const g:any=new Proxy({fillStyle:'',fillRect(x:number,y:number,w:number,h:number){fills.push({x,y,w,h,color:this.fillStyle});}},{get(target,key){return key in target?target[key]:()=>{};}});
  const previous=globalThis.document;
  globalThis.document={createElement(){return {getContext(){return g;},addEventListener(){}};}} as any;
  try{
    const terrain=bakeTerrain({});
    assert.equal(terrain.overview.width/terrain.overview.height,WIDTH/HEIGHT);
    const roadCells=[...LANES.flatMap(lane=>laneWaypoints('blue',lane).slice(1,-1)),...bridgeCenters];
    for(const p of roadCells){
      const x=Math.round(p.x),y=Math.round(p.y);
      const tile=fills.find(r=>r.x===x*8&&r.y===y*8&&r.w===8&&r.h===8);
      assert.equal(tile?.color,'#c2b28a',`Road absent at ${x},${y}`);
    }
    assert.equal(fills.find(r=>r.x===Math.round(riverX(20))*8&&r.y===20*8&&r.w===8&&r.h===8)?.color,'#284754');
  }finally{globalThis.document=previous;}
});

test('animated water never covers any of the three lane crossings',()=>{
  const rectangles:number[][]=[];
  const ctx={save(){},restore(){},beginPath(){},clip(){},rect(...r:number[]){rectangles.push(r);},drawImage(){},globalAlpha:1};
  drawRiver(ctx,{waterFoam:{},waterSplash:{}},{left:0,top:0,right:WIDTH*TILE,bottom:HEIGHT*TILE},1);
  assert.ok(rectangles.length>0);
  assert.ok(rectangles.every(([x,y])=>!isLane(x/TILE,y/TILE)));
});

test('lane labels identify three distinct routes on the scaled minimap',()=>{
  const labels:{text:string;x:number;y:number}[]=[];
  const ctx={save(){},restore(){},strokeText(){},fillText(text:string,x:number,y:number){labels.push({text,x,y});}};
  drawLaneLabels(ctx,320,224);
  assert.deepEqual(labels.map(l=>l.text),['TOP','MID','BOTTOM']);
  assert.ok(labels[0].y<labels[1].y&&labels[1].y<labels[2].y);
  assert.ok(labels.every(l=>l.x>0&&l.x<320&&l.y>0&&l.y<224));
});


test('terrain cache paints the eastern edge beyond the former square boundary',()=>{
  const drawn:unknown[][]=[];
  const g:any=new Proxy({getImageData(){return {data:new Uint8ClampedArray(0)};}},{get(target,key){return key in target?target[key]:()=>{};}});
  const previous=globalThis.document;
  globalThis.document={createElement(){return {getContext(){return g;},addEventListener(){}};}} as any;
  try{
    const terrain=bakeTerrain({grass:{width:1,height:1}});
    const target={drawImage(...args:unknown[]){drawn.push(args);}};
    const lastChunk=Math.floor((WIDTH*TILE-1)/512);
    terrain.draw(target,{left:lastChunk*512,top:1024,right:WIDTH*TILE-1,bottom:1535});
    assert.ok(drawn.length>0,'No terrain drawn at the eastern edge');
    assert.ok(drawn.some(args=>args[1]===lastChunk*512-2),'Eastern terrain chunk was omitted');
  }finally{globalThis.document=previous;}
});
