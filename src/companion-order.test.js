import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  companionCommandFromNeedle,
  companionOrderFromSpeech,
  COMPANION_TOOLS,
  parseCompanionLine,
} from './companion-order.js';

test('schema exposes follow/wood/gold/gather/push/defend tools plus set_order', () => {
  assert.deepEqual(
    COMPANION_TOOLS.map((tool) => tool.name),
    ['follow_hero', 'gather_wood', 'gather_gold', 'gather_resources', 'push_lane', 'defend_base', 'set_order'],
  );
});

test('come to me and come back map to escort without Needle', () => {
  for (const line of ['come to me', 'come back to me', 'come back', 'Come back to me!', 'follow me']) {
    assert.deepEqual(companionOrderFromSpeech(line), { ok: true, command: { type: 'order', order: 'escort' } }, line);
  }
});

test('need-help lines escort instead of gather', () => {
  for (const line of ['I need help rn', 'need help', 'help me', 'help']) {
    assert.deepEqual(companionOrderFromSpeech(line), { ok: true, command: { type: 'order', order: 'escort' } }, line);
  }
});

test('come back is escort, not defend', () => {
  assert.equal(companionOrderFromSpeech('come back').command.order, 'escort');
  assert.equal(companionOrderFromSpeech('go home').command.order, 'defend');
});

test('welcome does not match come', () => {
  assert.deepEqual(companionOrderFromSpeech('welcome'), { ok: false, reason: 'empty' });
});

test('chop trees is wood, get gold is gold, go farm stays generic gather', () => {
  assert.equal(companionOrderFromSpeech('chop trees').command.order, 'gather_wood');
  assert.equal(companionOrderFromSpeech('get wood').command.order, 'gather_wood');
  assert.equal(companionOrderFromSpeech('get gold').command.order, 'gather_gold');
  assert.equal(companionOrderFromSpeech('mine gold').command.order, 'gather_gold');
  assert.equal(companionOrderFromSpeech('go farm').command.order, 'gather');
});

test('maps follow_hero and set_order payloads', () => {
  assert.deepEqual(companionCommandFromNeedle([{ name: 'follow_hero', arguments: {} }]), {
    ok: true,
    command: { type: 'order', order: 'escort' },
  });
  assert.deepEqual(companionCommandFromNeedle([{ name: 'gather_wood', arguments: {} }]), {
    ok: true,
    command: { type: 'order', order: 'gather_wood' },
  });
  assert.deepEqual(companionCommandFromNeedle([{ name: 'gather_gold', arguments: {} }]), {
    ok: true,
    command: { type: 'order', order: 'gather_gold' },
  });
  assert.deepEqual(companionCommandFromNeedle('[{"name":"set_order","arguments":{"order":"gather_wood"}}]'), {
    ok: true,
    command: { type: 'order', order: 'gather_wood' },
  });
});

test('speech wins over an empty Needle call', () => {
  assert.deepEqual(parseCompanionLine('come to me', '[]'), { ok: true, command: { type: 'order', order: 'escort' } });
});

test('Needle is used when speech does not match', () => {
  assert.deepEqual(parseCompanionLine('protect the fountain', '[{"name":"defend_base","arguments":{}}]'), {
    ok: true,
    command: { type: 'order', order: 'defend' },
  });
});

test('empty Needle abstention does not issue a command', () => {
  assert.deepEqual(companionCommandFromNeedle('[]'), { ok: false, reason: 'empty' });
  assert.deepEqual(parseCompanionLine("what's the meta", '[]'), { ok: false, reason: 'empty' });
});

test('rejects malformed and unknown payloads', () => {
  assert.deepEqual(companionCommandFromNeedle(''), { ok: false, reason: 'malformed' });
  assert.deepEqual(companionCommandFromNeedle([{ name: 'set_lights', arguments: {} }]), {
    ok: false,
    reason: 'unknown_tool',
  });
  assert.deepEqual(companionCommandFromNeedle([{ name: 'set_order', arguments: { order: 'dance' } }]), {
    ok: false,
    reason: 'unknown_order',
  });
});
