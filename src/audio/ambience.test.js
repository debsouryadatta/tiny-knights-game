import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ambienceGains,synthesize} from './ambience.js';
import {riverX,baseFor} from '../../shared/map.ts';
test('river and bases follow map geometry with silence outside radius',()=>{
 const near=ambienceGains({x:riverX(32),y:32});
 assert.equal(near.river,.16);assert.equal(ambienceGains({x:-100,y:-100}).river,0);
 assert.equal(ambienceGains(baseFor('blue')).base,.09);
 assert.equal(ambienceGains(baseFor('red')).base,.09);
 assert.ok(ambienceGains({x:riverX(32)-6,y:32}).river<near.river);
 for(let x=0;x<64;x++)for(let y=0;y<64;y++){
  const gains=ambienceGains({x,y});
  assert.ok(gains.river<=.16&&gains.forest<=.09&&gains.base<=.09);
 }
});
test('synthesized loops are deterministic, bounded and have zero seams',()=>{
 const context={sampleRate:8000,createBuffer:(channels,length)=>{const data=new Float32Array(length);return {getChannelData:()=>data};}};
 for(const kind of ['river','forest','base']){
  const a=synthesize(context,kind).getChannelData(0),b=synthesize(context,kind).getChannelData(0);
  assert.deepEqual(a,b);assert.equal(a[0],0);assert.ok(Math.abs(a.at(-1))===0);
  assert.ok(a.some(v=>Math.abs(v)>.01));assert.ok(a.every(v=>Math.abs(v)<1));
 }
});
