import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAudioEngine,attenuation} from './engine.js';
export function fixture(options={}){
 const param=()=>({value:0,cancelScheduledValues(){},setTargetAtTime(v){this.value=v;}});
 const context={state:'suspended',currentTime:0,destination:{},createGain:()=>({gain:param(),connect(){},disconnect(){}}),
 createBufferSource:()=>({playbackRate:param(),connect(){},disconnect(){},start(){},stop(){this.onended?.();}}),
 decodeAudioData:async()=>({}),resume:async function(){this.state='running';},close:async function(){this.state='closed';}};
 const engine=createAudioEngine({contextFactory:()=>context,fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}),...options});
 return {engine,context};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('smooth attenuation is bounded and silent outside radius',()=>{
 assert.equal(attenuation(0),1);assert.equal(attenuation(2),1);assert.equal(attenuation(7),.5);assert.equal(attenuation(12),0);assert.equal(attenuation(20),0);assert.equal(attenuation(NaN),0);
 for(let d=2;d<12;d+=.1)assert.ok(attenuation(d)>=attenuation(d+.1));
});
test('gesture initialization, independent channels, mute, limits and disposal',async()=>{
 const {engine,context}=fixture({maxVoices:2});
 assert.equal(engine.getStats().initialized,false);assert.equal(engine.play('step'),false);
 await engine.toggle();await settle();assert.equal(engine.getStats().loaded,7);
 engine.setVolume('ambience',.1);assert.equal(engine.getStats().volumes.sfx,.65);
 assert.equal(engine.play('hit',{distance:13}),false);
 assert.equal(engine.play('step'),true);assert.equal(engine.play('step'),false);
 assert.equal(engine.play('hit'),true);assert.equal(engine.play('dash'),false);
 await engine.toggle();assert.equal(engine.getStats().voices,0);assert.equal(engine.getStats().volumes.ambience,.1);
 engine.destroy();assert.equal(context.state,'closed');await engine.toggle();assert.equal(engine.getStats().enabled,false);
});
test('unavailable audio and asset failures never escape',async()=>{
 const unavailable=fixture({contextFactory:()=>{throw Error('no audio');}}).engine;
 await unavailable.toggle();assert.equal(unavailable.getStats().enabled,false);assert.ok(unavailable.getStats().error);
 const {engine}=fixture({fetcher:async()=>{throw Error('offline');}});
 await engine.toggle();await settle();assert.equal(engine.getStats().loaded,0);assert.equal(engine.play('hit'),false);engine.destroy();
 const rejected=fixture();rejected.context.resume=async()=>{throw Error('blocked');};
 await rejected.engine.toggle();assert.equal(rejected.engine.getStats().enabled,false);rejected.engine.destroy();
});
test('deactivation removes loops and transient voices',async()=>{
 const {engine}=fixture();await engine.toggle();await settle();
 engine.setLoop('river',()=>({}),.1);engine.play('hit');assert.equal(engine.getStats().voices,2);
 engine.setActive(false);assert.equal(engine.getStats().voices,0);assert.equal(engine.play('step'),false);
 engine.setActive(true);assert.equal(engine.getStats().voices,0);engine.destroy();
});
