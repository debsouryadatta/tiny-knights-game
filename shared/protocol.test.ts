import test from 'node:test';
import assert from 'node:assert/strict';
import {isCompatibleSnapshot,GAME_PROTOCOL_VERSION} from './protocol';
import {createGame} from './simulation';
test('client refuses legacy or future maps rather than predicting different collision',()=>{
  assert.equal(isCompatibleSnapshot({}),false);
  assert.equal(isCompatibleSnapshot({mapVersion:1}),false);
  assert.equal(isCompatibleSnapshot({mapVersion:GAME_PROTOCOL_VERSION+1}),false);
  for(const size of [1,2,3] as const)assert.equal(isCompatibleSnapshot(createGame('compatible',size)),true);
});
