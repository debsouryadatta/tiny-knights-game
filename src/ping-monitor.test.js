import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPingMonitor} from './ping-monitor.js';

test('idle probes measure replies, repeat, and clean up on stop',async()=>{
  let done,calls=0,cleanups=0;const updates=[];
  const stop=createPingMonitor({intervalMs:10,timeoutMs:1000,probe:reply=>{calls++;done=reply;return()=>cleanups++;},onUpdate:x=>updates.push(x)});
  assert.equal(updates[0].state,'measuring');done();
  assert.equal(updates.at(-1).state,'ready');assert.ok(updates.at(-1).ms>=1);
  await new Promise(r=>setTimeout(r,25));assert.equal(calls,2);assert.equal(cleanups,1);
  stop();assert.equal(cleanups,2);const count=updates.length;done();
  await new Promise(r=>setTimeout(r,25));assert.equal(updates.length,count);assert.equal(calls,2);
});
test('timeout cleans up a probe and ignores its late response',async()=>{
  let done,cleanups=0;const updates=[];
  const stop=createPingMonitor({timeoutMs:10,intervalMs:1000,probe:reply=>{done=reply;return()=>cleanups++;},onUpdate:x=>updates.push(x)});
  await new Promise(r=>setTimeout(r,30));assert.equal(updates.at(-1).state,'timeout');assert.equal(cleanups,1);
  done();assert.equal(updates.at(-1).state,'timeout');stop();
});
test('synchronous failures report unavailable and cancellation clears timers',()=>{
  const updates=[];const stop=createPingMonitor({probe:()=>{throw new Error('closed');},onUpdate:x=>updates.push(x)});
  assert.deepEqual(updates.at(-1),{state:'unavailable',ms:null});stop();
});
