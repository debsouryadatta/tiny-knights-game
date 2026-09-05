import init, { NeedleV2Wasm } from 'needle-rs';
import { COMPANION_TOOLS, parseCompanionLine } from './companion-order.js';

const TOOLS_JSON = JSON.stringify(COMPANION_TOOLS);
const MODEL_URL = '/needle2.cact';
const CACHE_NAME = 'needle2-cact';

let engine = null;
let status = 'idle';

function postStatus(extra = {}) {
  self.postMessage({ type: 'status', status, ...extra });
}

async function loadBytes() {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(MODEL_URL);
  if (cached?.ok) return new Uint8Array(await cached.arrayBuffer());
  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    const error = new Error('missing');
    error.code = 'missing';
    throw error;
  }
  const clone = response.clone();
  const bytes = new Uint8Array(await response.arrayBuffer());
  await cache.put(MODEL_URL, clone).catch(() => {});
  return bytes;
}

async function loadModel() {
  if (status === 'loading' || status === 'ready') return;
  status = 'loading';
  postStatus();
  try {
    await init();
    const bytes = await loadBytes();
    engine = NeedleV2Wasm.load(bytes);
    if (!engine) {
      status = 'error';
      postStatus({ error: 'Needle failed to load the .cact image.' });
      return;
    }
    status = 'ready';
    postStatus();
  } catch (error) {
    status = error?.code === 'missing' ? 'missing' : 'error';
    postStatus({
      error:
        status === 'missing'
          ? 'Needle model not found. Run npm run fetch-needle.'
          : String(error?.message || error),
    });
  }
}

self.onmessage = async (event) => {
  const { id, type, query } = event.data || {};
  if (type === 'init') {
    await loadModel();
    return;
  }
  if (type !== 'parse') return;
  if (status !== 'ready' || !engine) {
    self.postMessage({
      id,
      type: 'result',
      result: { ok: false, reason: status === 'missing' ? 'missing' : 'not_ready' },
    });
    return;
  }
  try {
    const text = String(query || '');
    const spoken = parseCompanionLine(text);
    const result = spoken.ok ? spoken : parseCompanionLine(text, engine.run_json(text, TOOLS_JSON));
    self.postMessage({ id, type: 'result', result });
  } catch (error) {
    self.postMessage({
      id,
      type: 'result',
      result: { ok: false, reason: 'malformed' },
      error: String(error?.message || error),
    });
  }
};
