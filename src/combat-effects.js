// Draw in world-pixel space, inside the renderer's camera transform.
// update() must run every frame after track interpolation. Network at/duration
// use seconds; x/y and target use tiles; tracks use pixels at the actor's feet.
// drawGround/drawOverlay accept { bounds?: {left,top,right,bottom}, tactical? }.
const TAU = Math.PI * 2;
const TILE = 64;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const finite = Number.isFinite;
const valid = p => p && finite(p.x) && finite(p.y);
const pixel = p => valid(p) ? { x: (p.x + .5) * TILE, y: (p.y + .5) * TILE } : null;
const ease = p => 1 - (1 - p) ** 3;
const palette = { blue: '#9edfff', red: '#ffada0', heal: '#b5f4b1', gold: '#efcf86', white: '#fff3d5' };
const lifetimes = { hit: .42, heal: .85, dash: .48, shockwave: .65, ability: .65, death: .85, recall: 3, respawn: .8, build: .85, gather: .55, cancel: .3, complete: .65 };
function hash(value) {
  let h = 2166136261;
  for (const char of String(value)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}
// Stateless seeded sampling keeps repeated draws and replay captures identical.
const sample = (seed, i) => ((Math.imul(seed ^ Math.imul(i + 1, 374761393), 668265263) >>> 0) % 65536) / 65536;
function line(ctx, x, y, xx, yy, color, width, alpha) {
  ctx.globalAlpha = clamp(alpha); ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(xx, yy); ctx.stroke();
}
function ring(ctx, x, y, r, color, width, alpha, end = TAU, start = 0) {
  ctx.globalAlpha = clamp(alpha); ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, r), Math.max(.1, r * .66), 0, start, end); ctx.stroke();
}
function diamond(ctx, x, y, r, color, alpha) {
  ctx.globalAlpha = clamp(alpha); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .6, y);
  ctx.lineTo(x, y + r); ctx.lineTo(x - r * .6, y); ctx.closePath(); ctx.fill();
}

/** No assets, DOM nodes, timers, listeners, or camera mutation. */
export function createCombatEffects(options = {}) {
  const reducedMotion = options.reducedMotion ?? globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const maxEffects = finite(options.maxEffects) ? Math.round(clamp(options.maxEffects, 1, 256)) : 96;
  const seenLimit = Math.max(512, maxEffects * 16);
  const seen = new Set(), recalls = new Map();
  let active = [], now = 0, elapsed, room, received = 0, dropped = 0;
  let groundDrawn = 0, overlayDrawn = 0;

  function reset() {
    active = []; seen.clear(); recalls.clear(); now = 0; elapsed = undefined; room = undefined;
    received = 0; dropped = 0; groundDrawn = 0; overlayDrawn = 0;
  }
  function add(e) {
    if (active.length >= maxEffects) {
      const disposable = active.findIndex(item => item.kind !== 'recall');
      // Keep active channels readable when a crowded skirmish hits the cap.
      if (disposable < 0) { dropped++; return false; }
      active.splice(disposable, 1); dropped++;
    }
    active.push(e); received++; return true;
  }
  function make(kind, id, point, color, extra = {}) {
    return { kind, seed: hash(id), x: point.x, y: point.y, tx: point.x, ty: point.y,
      color, start: now, duration: lifetimes[kind] || .65, ...extra };
  }
  function finishRecall(e, completed) {
    active = active.filter(item => item !== e);
    add(make(completed ? 'complete' : 'cancel', e.seed, e, e.color));
  }
  function update(state, nowSeconds, tracks = new Map()) {
    if (!finite(nowSeconds)) return;
    if (state && ((room !== undefined && room !== state.room) || (finite(elapsed) && state.elapsed < elapsed))) reset();
    now = Math.max(now, nowSeconds);
    active = active.filter(e => now - e.start < e.duration);
    if (!state) return;
    room = state.room; elapsed = state.elapsed;
    const actors = new Map((state.actors || []).map(a => [a.id, a]));
    const locate = id => {
      const t = tracks.get(id);
      return valid(t) ? t : pixel(actors.get(id));
    };
    const events = (state.effects || []).slice(-seenLimit);
    for (const raw of events) {
      if (raw.id === undefined || raw.id === null || seen.has(raw.id)) continue;
      seen.add(raw.id);
      if (seen.size > seenLimit) seen.delete(seen.values().next().value);
      let kind = raw.kind;
      if (kind === 'ability' && raw.abilitySlot === 1) kind = 'dash';
      if (kind === 'ability' && raw.abilitySlot === 3) kind = 'shockwave';
      if (!(kind in lifetimes) || kind === 'cancel' || kind === 'complete') continue;
      // Recall events report completion, never channel start.
      const recallId = raw.sourceId ?? raw.targetId;
      if (kind === 'recall') kind = 'complete';
      const from = pixel(raw) || locate(raw.sourceId) || locate(raw.targetId);
      const to = locate(raw.targetId) || pixel(raw.target) || (kind === 'dash' ? locate(raw.sourceId) : null) || from;
      if (!from || !to) continue;
      let duration = finite(raw.duration) && raw.duration > 0 ? clamp(raw.duration, .12, 4) : lifetimes[kind];
      if (kind === 'heal') duration = Math.max(1.1, duration);
      const age = finite(raw.at) && finite(state.elapsed) ? Math.max(0, state.elapsed - raw.at) : 0;
      if (age > Math.max(duration, 1)) continue;
      if (kind === 'complete' && recalls.has(recallId)) {
        const channel = recalls.get(recallId);
        active = active.filter(item => item !== channel); recalls.delete(recallId);
      }
      const color = kind === 'heal' ? palette.heal : kind === 'gather' || kind === 'build' ? palette.gold : palette[raw.team] || palette.blue;
      const impact = kind === 'hit' || kind === 'heal' || kind === 'death' || kind === 'respawn';
      const source = locate(raw.sourceId) || from;
      const e = make(kind, raw.id, impact ? to : from, color, {
        sx: source.x, sy: source.y, tx: to.x, ty: to.y, duration,
        style: raw.style || 'melee', face: source.face || (raw.team === 'red' ? -1 : 1),
        strength: finite(raw.amount) ? clamp(Math.sqrt(Math.abs(raw.amount) / 25), .7, 1.5) : 1,
        amount: finite(raw.amount) ? Math.round(raw.amount) : undefined,
      });
      add(e);
      if (kind === 'complete' && Math.hypot(to.x - from.x, to.y - from.y) > TILE) {
        add(make('respawn', `${raw.id}:arrival`, to, color));
      }
    }
    for (const [id, e] of recalls) {
      const actor = actors.get(id);
      const changed = !actor || actor.hp <= 0 || actor.recallUntil !== e.until;
      if (changed) {
        const completed = !!actor && actor.hp > 0 && (state.elapsed >= e.until - .08 || /recalled/i.test(actor.lastAction || ''));
        finishRecall(e, completed); recalls.delete(id);
      }
    }
    for (const actor of actors.values()) {
      if (!(actor.hp > 0 && actor.recallUntil > state.elapsed) || recalls.has(actor.id) || recalls.size >= maxEffects) continue;
      const point = locate(actor.id);
      if (!point) continue;
      const remaining = clamp(actor.recallUntil - state.elapsed, 0, 3);
      const e = make('recall', `recall:${actor.id}:${actor.recallUntil}`, point, palette[actor.team] || palette.blue,
        { start: now - (3 - remaining), duration: 3.65, channelDuration: 3, until: actor.recallUntil });
      if (add(e)) recalls.set(actor.id, e);
    }
  }

  function visible(e, view) {
    if (view.tactical) return false;
    const b = view.bounds;
    return !b || (Math.max(e.x, e.tx, e.sx ?? e.x) + 220 >= b.left && Math.min(e.x, e.tx, e.sx ?? e.x) - 220 <= b.right
      && Math.max(e.y, e.ty, e.sy ?? e.y) + 150 >= b.top && Math.min(e.y, e.ty, e.sy ?? e.y) - 150 <= b.bottom);
  }
  function ground(ctx, e, p, age) {
    const fade = (1 - p) ** 1.5;
    if (e.kind === 'recall') {
      const progress = clamp(age / e.channelDuration);
      // A full ring waits quietly for authority; it never implies success.
      const alpha = Math.min(1, age / .16 + .15);
      ring(ctx, e.x, e.y + 2, 49, e.color, 2, .65 * alpha);
      ring(ctx, e.x, e.y + 2, 40, e.color, 1.5, .45 * alpha);
      ring(ctx, e.x, e.y + 2, 54, palette.white, 3, .95 * alpha, -Math.PI / 2 + Math.max(.001, progress * TAU), -Math.PI / 2);
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6;
        const x = e.x + Math.cos(a) * 44, y = e.y + 2 + Math.sin(a) * 29;
        line(ctx, x - Math.cos(a) * 3, y - Math.sin(a) * 2, x + Math.cos(a) * 3, y + Math.sin(a) * 2, e.color, 2, alpha * .6);
      }
    } else if (e.kind === 'shockwave') {
      const r = reducedMotion ? 112 : 16 + ease(p) * 176;
      ring(ctx, e.x, e.y, r, e.color, 2 + 6 * fade, .65 * fade);
      ring(ctx, e.x, e.y, r * .83, palette.white, 1.5, .55 * fade);
    } else if (['heal', 'respawn', 'complete', 'cancel', 'build', 'death'].includes(e.kind)) {
      const r = reducedMotion ? 29 : 21 + ease(p) * (e.kind === 'complete' ? 37 : 18);
      ring(ctx, e.x, e.y + 2, r, e.color, e.kind === 'cancel' ? 1 : 2, fade * .55);
      if (e.kind === 'heal') {
        const halo = Math.sin(Math.PI * clamp(p * 1.25));
        ring(ctx, e.x, e.y + 2, reducedMotion ? 32 : 25 + ease(p) * 10, palette.heal, 4, halo * .23);
        ring(ctx, e.x, e.y + 2, 23, palette.white, 1, halo * .4);
      }
      if (e.kind === 'build') ring(ctx, e.x, e.y, r * .7, palette.white, 1, fade * .35);
    } else if (e.kind === 'dash' && !reducedMotion) {
      line(ctx, e.x, e.y + 2, e.tx, e.ty + 2, e.color, 14 * fade + 1, .12 * fade);
    }
  }
  function particles(ctx, e, p, count, mode = 'burst') {
    const fade = (1 - p) ** 1.4;
    for (let i = 0; i < (reducedMotion ? Math.min(count, 3) : count); i++) {
      const a = sample(e.seed, i * 3) * TAU;
      const speed = 15 + sample(e.seed, i * 3 + 1) * 36;
      const travel = reducedMotion ? 8 : ease(p) * speed;
      const x = e.x + Math.cos(a) * (mode === 'rise' ? speed * .45 : travel);
      const y = e.y - 18 + (mode === 'rise' ? -travel : Math.sin(a) * travel * .65 + p * p * 14);
      const size = (1.5 + sample(e.seed, i * 3 + 2) * 2) * (1 - p * .5);
      if (mode === 'rise') diamond(ctx, x, y, size + 1, i % 3 ? e.color : palette.white, fade * .8);
      else line(ctx, x, y, x + Math.cos(a) * size * 2, y + Math.sin(a) * size * 2, i % 3 ? e.color : palette.white, 1.5, fade * .8);
    }
  }
  function overlay(ctx, e, p, age) {
    const fade = (1 - p) ** 1.5;
    if (e.kind === 'recall') {
      if (age >= e.channelDuration) {
        return;
      }
      // A soft vertical column distinguishes channeling from a selection ring.
      ctx.save();
      const beam=ctx.createLinearGradient(e.x,e.y-105,e.x,e.y+4);
      beam.addColorStop(0,'#8edfff00');beam.addColorStop(.65,'#8edfff20');beam.addColorStop(1,'#8edfff55');
      ctx.globalAlpha=Math.min(1,age/.2);ctx.fillStyle=beam;ctx.fillRect(e.x-36,e.y-105,72,108);
      ctx.restore();
      for (let i = 0; i < (reducedMotion ? 3 : 7); i++) {
        const t = (age * .55 + sample(e.seed, i)) % 1;
        const a = i * 2.4 + (reducedMotion ? 0 : age * .4);
        const x = e.x + Math.cos(a) * (24 - t * 8);
        const y = e.y - (reducedMotion ? 20 + i * 10 : 8 + t * 60) + Math.sin(a) * 7;
        diamond(ctx, x, y, 3.4, i % 3 ? e.color : palette.white, Math.sin(t * Math.PI) * .95);
      }
    } else if (e.kind === 'dash') {
      if (reducedMotion) { diamond(ctx, e.tx, e.ty - 22, 7, e.color, fade * .65); return; }
      const dx = e.tx - e.x, dy = e.ty - e.y, length = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / length, ny = dx / length;
      for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * 9, tail = clamp(p * 1.3 - i * .08);
        line(ctx, e.x + dx * tail + nx * offset, e.y - 20 + dy * tail + ny * offset,
          e.tx + nx * offset, e.ty - 20 + ny * offset, i === 1 ? palette.white : e.color, i === 1 ? 2 : 3, fade * .65);
      }
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        ctx.globalAlpha = fade * .13 * t; ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.ellipse(e.x + dx * t, e.y + dy * t - 20, 10, 18, Math.atan2(dy, dx) * .15, 0, TAU); ctx.fill();
      }
    } else if (e.kind === 'hit') {
      const projectile = e.style === 'projectile';
      const impactP = projectile ? clamp((p - .38) / .62) : p;
      if (projectile && p < .5 && !reducedMotion) {
        const t = clamp(p / .4), tail = Math.max(0, t - .24);
        line(ctx, e.sx + (e.x - e.sx) * tail, e.sy - 22 + (e.y - e.sy) * tail,
          e.sx + (e.x - e.sx) * t, e.sy - 22 + (e.y - e.sy) * t, e.color, 3, .75);
      } else if (!projectile && e.style !== 'magic' && p < .65) {
        const angle = Math.hypot(e.x - e.sx, e.y - e.sy) > 2 ? Math.atan2(e.y - e.sy, e.x - e.sx) : e.face < 0 ? Math.PI : 0;
        ctx.globalAlpha = (1 - p / .65) * .8; ctx.strokeStyle = palette.white; ctx.lineWidth = reducedMotion ? 2 : 4 * (1 - p) + 1;
        const sweep = reducedMotion ? 0 : p * .9;
        ctx.beginPath(); ctx.arc(e.x - Math.cos(angle) * 19, e.y - 21 - Math.sin(angle) * 19, 26, angle - 1.05 + sweep, angle + .75 + sweep); ctx.stroke();
      }
      if (!projectile || p >= .38) {
        const flash = clamp(1 - impactP * 4);
        diamond(ctx, e.x, e.y - 22, (5 + flash * 6) * e.strength, palette.white, flash * (reducedMotion ? .4 : .8));
        particles(ctx, e, impactP, e.style === 'magic' ? 8 : 5);
      }
    } else if (e.kind !== 'cancel') {
      const rise = ['heal', 'respawn', 'complete', 'build', 'ability'].includes(e.kind);
      if (e.kind === 'heal') {
        for (let i = 0; i < (reducedMotion ? 3 : 8); i++) {
          const t = clamp((p - i * .035) / .72);
          const x = e.x + (sample(e.seed, i) - .5) * 44;
          const y = e.y - 8 - (reducedMotion ? i * 5 : t * 52);
          diamond(ctx, x, y, 3 + sample(e.seed, i + 10), i % 3 ? palette.heal : palette.white, Math.sin(t * Math.PI) * .95);
        }
      } else particles(ctx, e, p, e.kind === 'death' ? 13 : e.kind === 'gather' ? 4 : 9, rise ? 'rise' : 'burst');
      if (e.kind === 'heal') {
        const y = e.y - 76 - (reducedMotion ? 0 : ease(p) * 18);
        const alpha = Math.min(1, p / .12) * (1 - p);
        line(ctx, e.x - 8, y, e.x + 8, y, palette.heal, 5, alpha);
        line(ctx, e.x, y - 8, e.x, y + 8, palette.heal, 5, alpha);
      }
      if (e.kind === 'shockwave') diamond(ctx, e.x, e.y - 16, 13 * (1 - p) + 2, palette.white, clamp(1 - p * 4) * .8);
    }
  }
  function draw(ctx, view, painter) {
    let count = 0;
    ctx.save();
    try {
      ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowBlur = 0; ctx.setLineDash([]);
      for (const e of active) {
        if (!visible(e, view)) continue;
        const age = Math.max(0, now - e.start), p = clamp(age / e.duration);
        if (p >= 1) continue;
        painter(ctx, e, p, age); count++;
        if(painter===overlay&&e.amount>0&&(e.kind==='hit'||e.kind==='heal')){
          ctx.save();ctx.globalAlpha=Math.min(1,p/.08)*(1-p);
          ctx.font='700 17px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#102030';
          ctx.fillStyle=e.kind==='heal'?palette.heal:palette.white;
          const label=`${e.kind==='heal'?'+':'−'}${e.amount}`,y=e.y-66-(reducedMotion?0:ease(p)*23);
          ctx.strokeText(label,e.x,y);ctx.fillText(label,e.x,y);ctx.restore();
        }
      }
    } finally { ctx.restore(); }
    return count;
  }
  return {
    update, reset,
    drawGround(ctx, view = {}) { groundDrawn = draw(ctx, view, ground); },
    drawOverlay(ctx, view = {}) { overlayDrawn = draw(ctx, view, overlay); },
    getStats: () => ({ active: active.length, recalls: recalls.size, seen: seen.size, received, dropped,
      maxEffects, reducedMotion, groundDrawn, overlayDrawn }),
  };
}
