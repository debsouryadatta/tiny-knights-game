import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCompanionNeedle } from './companion-needle.js';

test('injected parse override skips the WASM worker', async () => {
  const needle = createCompanionNeedle({
    parse: async (query) =>
      /farm|gather/i.test(query)
        ? { ok: true, command: { type: 'order', order: 'gather' } }
        : { ok: false, reason: 'empty' },
  });
  assert.equal(needle.getStatus(), 'ready');
  assert.deepEqual(await needle.parse('go farm wood'), { ok: true, command: { type: 'order', order: 'gather_wood' } });
  assert.deepEqual(await needle.parse('get gold'), { ok: true, command: { type: 'order', order: 'gather_gold' } });
  assert.deepEqual(await needle.parse("what's the meta"), { ok: false, reason: 'empty' });
  assert.deepEqual(await needle.parse('come back to me'), { ok: true, command: { type: 'order', order: 'escort' } });
  needle.destroy();
});
