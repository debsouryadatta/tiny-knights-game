import { companionOrderFromSpeech } from './companion-order.js';

function parseLine(query, fallback) {
  const spoken = companionOrderFromSpeech(query);
  if (spoken.ok) return Promise.resolve(spoken);
  return fallback(query);
}

export function createCompanionNeedle(options = {}) {
  const listeners = new Set();
  let status = 'idle';
  let error = '';
  const emit = () => {
    for (const fn of listeners) fn({ status, error });
  };
  const parseOverride = options.parse ?? globalThis.__companionNeedleParse;

  if (typeof parseOverride === 'function') {
    status = 'ready';
    return {
      getStatus: () => status,
      getError: () => error,
      subscribe(fn) {
        listeners.add(fn);
        fn({ status, error });
        return () => listeners.delete(fn);
      },
      parse(query) {
        return parseLine(query, (text) => Promise.resolve(parseOverride(text)));
      },
      destroy() {},
    };
  }

  if (typeof Worker === 'undefined') {
    status = 'unsupported';
    error = 'Web Workers are unavailable.';
    return {
      getStatus: () => status,
      getError: () => error,
      subscribe(fn) {
        listeners.add(fn);
        fn({ status, error });
        return () => listeners.delete(fn);
      },
      parse(query) {
        return parseLine(query, () => Promise.resolve({ ok: false, reason: 'unsupported' }));
      },
      destroy() {},
    };
  }

  const worker = new Worker(new URL('./companion-needle.worker.js', import.meta.url), { type: 'module' });
  let nextId = 1;
  const pending = new Map();
  worker.onmessage = (event) => {
    const message = event.data || {};
    if (message.type === 'status') {
      status = message.status;
      error = message.error || '';
      emit();
      return;
    }
    if (message.type === 'result' && pending.has(message.id)) {
      const { resolve } = pending.get(message.id);
      pending.delete(message.id);
      resolve(message.result);
    }
  };
  worker.onerror = (event) => {
    status = 'error';
    error = event.message || 'Needle worker failed.';
    emit();
  };
  status = 'loading';
  worker.postMessage({ type: 'init' });

  return {
    getStatus: () => status,
    getError: () => error,
    subscribe(fn) {
      listeners.add(fn);
      fn({ status, error });
      return () => listeners.delete(fn);
    },
    parse(query) {
      return parseLine(query, (text) => {
        const send = () =>
          new Promise((resolve) => {
            const id = nextId++;
            pending.set(id, { resolve });
            worker.postMessage({ id, type: 'parse', query: text });
          });
        if (status === 'ready') return send();
        if (status === 'missing' || status === 'error' || status === 'unsupported') {
          return Promise.resolve({ ok: false, reason: status === 'missing' ? 'missing' : 'not_ready' });
        }
        return new Promise((resolve) => {
          const fn = ({ status: next }) => {
            if (next === 'ready') {
              listeners.delete(fn);
              resolve(send());
            } else if (next === 'missing' || next === 'error') {
              listeners.delete(fn);
              resolve({ ok: false, reason: next === 'missing' ? 'missing' : 'not_ready' });
            }
          };
          listeners.add(fn);
        });
      });
    },
    destroy() {
      status = 'error';
      emit();
      for (const { resolve } of pending.values()) resolve({ ok: false, reason: 'not_ready' });
      pending.clear();
      worker.terminate();
    },
  };
}
