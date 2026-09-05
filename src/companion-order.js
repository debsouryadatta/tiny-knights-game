export const COMPANION_ORDERS = ['gather', 'escort', 'attack', 'defend'];

function tool(name, description) {
  return { name, description, parameters: { type: 'object', properties: {} } };
}

export const FOLLOW_HERO_TOOL = tool(
  'follow_hero',
  'Walk to the player and stay beside them. Use when they say come to me, come back, follow me, stay with me, I need help, or help me. Not for gathering resources.',
);
export const GATHER_RESOURCES_TOOL = tool(
  'gather_resources',
  'Collect wood and gold. Use when they say gather, farm, chop trees, or get gold.',
);
export const PUSH_LANE_TOOL = tool(
  'push_lane',
  'Attack down the lane toward the enemy core. Use when they say attack, push, or fight.',
);
export const DEFEND_BASE_TOOL = tool(
  'defend_base',
  'Return to the team spawn and hold it. Use when they say defend, go home, or hold the base. Do not use this for come back to me.',
);
export const SET_ORDER_TOOL = {
  name: 'set_order',
  description: 'Set the companion standing order when the player names gather, escort, attack, or defend.',
  parameters: {
    type: 'object',
    properties: {
      order: {
        type: 'string',
        enum: COMPANION_ORDERS,
        description: 'Standing order for the companion',
      },
    },
    required: ['order'],
  },
};

export const COMPANION_TOOLS = [
  FOLLOW_HERO_TOOL,
  GATHER_RESOURCES_TOOL,
  PUSH_LANE_TOOL,
  DEFEND_BASE_TOOL,
  SET_ORDER_TOOL,
];

const TOOL_ORDERS = {
  follow_hero: 'escort',
  gather_resources: 'gather',
  push_lane: 'attack',
  defend_base: 'defend',
};

const SPEECH_PHRASES = [
  [
    'escort',
    [
      'come back to me',
      'come to me',
      'come back',
      'come here',
      'return to me',
      'get over here',
      'over here',
      'follow me',
      'stay with me',
      'i need help',
      'need help',
      'help me',
      'help rn',
      'save me',
      'assist me',
      'in trouble',
      'group up',
      'to me',
      'follow',
      'come',
      'help',
    ],
  ],
  ['gather', ['go farm', 'gather', 'chop trees', 'get wood', 'get gold', 'farm', 'harvest']],
  ['attack', ['push lane', 'attack', 'push', 'fight', 'gank']],
  ['defend', ['go home', 'hold the base', 'hold base', 'back to base', 'fountain', 'defend']],
];

function normalizeSpeech(query) {
  return String(query || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPhrase(text, phrase) {
  return new RegExp(`(?:^|\\s)${phrase.replace(/\s+/g, '\\s+')}(?:$|\\s)`).test(` ${text} `);
}

export function companionOrderFromSpeech(query) {
  const text = normalizeSpeech(query);
  if (!text) return { ok: false, reason: 'empty' };
  for (const [order, phrases] of SPEECH_PHRASES) {
    if (phrases.some((phrase) => hasPhrase(text, phrase))) {
      return { ok: true, command: { type: 'order', order } };
    }
  }
  return { ok: false, reason: 'empty' };
}

function callsFromPayload(payload) {
  if (payload == null || payload === '') return { calls: null, reason: 'malformed' };
  let value = payload;
  if (typeof payload === 'string') {
    const text = payload.trim();
    if (!text) return { calls: null, reason: 'malformed' };
    if (text === '[]') return { calls: [], reason: 'empty' };
    try {
      value = JSON.parse(text);
    } catch {
      return { calls: null, reason: 'malformed' };
    }
  }
  if (Array.isArray(value)) return { calls: value, reason: value.length ? null : 'empty' };
  if (value && typeof value === 'object' && Array.isArray(value.function_calls)) {
    return { calls: value.function_calls, reason: value.function_calls.length ? null : 'empty' };
  }
  return { calls: null, reason: 'malformed' };
}

export function companionCommandFromNeedle(payload) {
  const { calls, reason } = callsFromPayload(payload);
  if (!calls) return { ok: false, reason };
  if (!calls.length) return { ok: false, reason: 'empty' };
  const call = calls[0];
  if (!call || typeof call !== 'object' || typeof call.name !== 'string') {
    return { ok: false, reason: 'unknown_tool' };
  }
  if (call.name === SET_ORDER_TOOL.name) {
    const order = call.arguments?.order;
    if (!COMPANION_ORDERS.includes(order)) return { ok: false, reason: 'unknown_order' };
    return { ok: true, command: { type: 'order', order } };
  }
  const order = TOOL_ORDERS[call.name];
  if (!order) return { ok: false, reason: 'unknown_tool' };
  return { ok: true, command: { type: 'order', order } };
}

export function parseCompanionLine(query, needlePayload) {
  const spoken = companionOrderFromSpeech(query);
  if (spoken.ok) return spoken;
  if (needlePayload === undefined) return { ok: false, reason: 'empty' };
  return companionCommandFromNeedle(needlePayload);
}
