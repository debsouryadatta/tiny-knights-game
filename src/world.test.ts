import test from 'node:test';
import assert from 'node:assert/strict';
import { objects,drawRiver,objectIntersects,getVisibleObjects } from './world.js';
import { TILE, isWalkable } from '../shared/map';

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
  const bounds={left:25*TILE,top:20*TILE,right:37*TILE,bottom:28*TILE};
  drawRiver(ctx,images,bounds,0);
  const first=calls.filter(c=>c[0]===images.waterFoam).map(c=>c[1]);
  assert.ok(first.length>0);assert.ok(first.every(x=>x===0));
  calls.length=0;
  drawRiver(ctx,images,bounds,1);
  assert.ok(calls.filter(c=>c[0]===images.waterFoam).every(c=>c[1]===7*192));
  assert.ok(rectangles.length>0);
  assert.ok(rectangles.every(r=>r[2]===TILE&&r[3]===TILE));
});
