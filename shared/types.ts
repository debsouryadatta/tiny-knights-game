export type Team = 'blue' | 'red';
export type HeroKind = 'knight' | 'ranger' | 'lancer';
export type CompanionKind = 'harvester' | 'guardian' | 'scout';
export type Order = 'gather' | 'escort' | 'attack' | 'defend';
export type ResourceKind = 'wood' | 'gold';
export type Vec = { x: number; y: number };
export interface Actor { sprintUntil?:number; }
export interface Effect { abilitySlot?:1|2|3; }
export interface Actor { protectedUntil?:number; lastDamage?:{sourceId:string;sourceName:string;sourceKind:'hero'|'companion'|'creep'|'core'|'tower';amount:number;at:number}; }
export interface Actor extends Vec { id: string; name: string; team: Team; kind: 'hero' | 'companion' | 'creep'; hero: HeroKind; companion?: CompanionKind; ownerId?: string; hp: number; maxHp: number; bot: boolean; target?: Vec; order: Order; cooldown: number; abilityCooldown: number; respawnAt: number; kills: number; gathered: number; lastAction: string; lane: number; inputSeq?:number; steer?:Vec & {expiresAt:number}; attackHeld?:boolean; attackTargetId?:string; attackUntil?:number; abilityCooldowns?:number[]; recallUntil?:number; regenCooldown?:number; shieldUntil?:number; }
export interface Structure extends Vec { id: string; team: Team; kind: 'core' | 'tower'; hp: number; maxHp: number; cooldown: number; }
export interface ResourceNode extends Vec { id: string; kind: ResourceKind; amount: number; maxAmount: number; }
export interface Effect extends Vec { id: string; kind: 'hit' | 'heal' | 'gather' | 'build' | 'ability'; team: Team; ttl: number; target?: Vec; }
export interface GameState { room: string; tick: number; elapsed: number; phase: 'playing' | 'finished'; winner?: Team; size: 2 | 3; actors: Actor[]; structures: Structure[]; resources: ResourceNode[]; bank: Record<Team, { wood: number; gold: number }>; effects: Effect[]; log: string[]; simulation?: {move:number;gather:number;ai:number;modes:Record<string,'move'|'gather'|'attack'|'idle'>;routes:Record<string,{goal:number;path:Vec[]}>;waypoints?:Record<string,number>}; }
export type Command = { type: 'move'; x: number; y: number } | {type:'steer';x:number;y:number;seq?:number} | { type: 'gather' } | { type: 'attack';targetId?:string;held?:boolean } | { type: 'ability';slot?:1|2|3;x?:number;y?:number } | { type: 'build'; x: number; y: number } | { type: 'order'; order: Order } | { type: 'recall' } | {type:'regen'};
export interface Draft { name: string; hero: HeroKind; companion: CompanionKind; size: 2 | 3; room?: string; }
export interface Session { playerId: string; room: string; token: string; }
export type ClientMessage = { type: 'join'; draft: Draft; token?: string } | { type: 'command'; command: Command } | { type: 'restart' } | { type: 'ping'; at: number };
export type ServerMessage = { type: 'welcome'; session: Session } | { type: 'state'; state: GameState } | { type: 'error'; message: string } | { type: 'pong'; at: number };
