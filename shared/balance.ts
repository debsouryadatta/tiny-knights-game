import type {Actor,HeroKind} from './types';

// Flat, inspectable prototype balance. No hidden level or random damage rolls.
export const REFERENCE_HP = 600;
export const HERO_HP: Record<HeroKind,number> = {knight:660,ranger:540,lancer:600};
export const BASIC_DPS = REFERENCE_HP / 10;
export const ATTACK_INTERVAL = {knight:.9,ranger:.9,lancer:.7};
export const CREEP_HP = 180;
export const CREEP_INTERVAL = 1.2;
export const CREEP_DAMAGE = 6;
export const TOWER_DAMAGE = REFERENCE_HP / 10;
export const CORE_DAMAGE = 30;
export const SPAWN_PROTECTION = 3;
export const ABILITY_COOLDOWNS = [8,12,16];
export const DASH_DAMAGE = REFERENCE_HP * .3;
export const DASH_DISTANCE = 3;
export const SPRINT_MULTIPLIER = 1.5;
export const SPRINT_DURATION = 3;
export const SHOCKWAVE_DAMAGE = REFERENCE_HP * .25;
export const SHOCKWAVE_RADIUS = 3;
export const SHOCKWAVE_PUSH = .7;
export function attackInterval(a:Actor) {return a.kind==='hero'?ATTACK_INTERVAL[a.hero]:CREEP_INTERVAL;}
export function attackDamage(a:Actor) {return a.kind==='creep'?CREEP_DAMAGE:a.kind==='companion'?12:BASIC_DPS*ATTACK_INTERVAL[a.hero];}
