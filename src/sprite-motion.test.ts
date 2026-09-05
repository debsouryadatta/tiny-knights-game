import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceRunPhase} from './sprite-motion.js';

test('distance driven stride preserves full speed cadence and scales partial movement',()=>{
  assert.equal(advanceRunPhase(2,4*64*.05,4,.05),2.5);
  assert.equal(advanceRunPhase(2,4*64*.05*.25,4,.05),2.125);
  assert.equal(advanceRunPhase(2,0,4,.05),2);
});
test('stride stays continuous across stop/start and independent of presentation rate',()=>{
  const travel=(frames:number)=>{let phase=0;for(let i=0;i<frames;i++)phase=advanceRunPhase(phase,4*64/frames,4,1/frames);return phase;};
  assert.ok(Math.abs(travel(30)-travel(120))<1e-10);
  const stopped=advanceRunPhase(3.3,0,4,.1);
  assert.equal(advanceRunPhase(stopped,4*64*.02,4,.02),3.5);
  assert.equal(advanceRunPhase(0,10000,4,.02),.3);
});
