/** Wire protocol shared by the client bundle and the authoritative server. */

export const TILE = 32;
export const MAP_W = 56;
export const MAP_H = 42;
export const TICK_HZ = 30;
export const SNAPSHOT_HZ = 15;
export const MAX_PLAYERS = 2;

export type ClassId = 'warrior' | 'ranger';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type Slot = 'weapon' | 'armor' | 'trinket';
export type QuestKind = 'slay' | 'loot' | 'descend' | 'boss';

export interface Stats {
  power: number;
  armor: number;
  maxHp: number;
  speed: number;
  crit: number;
}

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  level: number;
  stats: Partial<Stats>;
  value: number;
}

export interface Quest {
  id: string;
  kind: QuestKind;
  title: string;
  target: number;
  progress: number;
  rewardGold: number;
  rewardXp: number;
  accepted: boolean;
  completed: boolean;
  turnedIn: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  cls: ClassId;
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToLevel: number;
  gold: number;
  alive: boolean;
  reviveProgress: number;
  attackCooldown: number;
  dashCooldown: number;
  potions: number;
  stats: Stats;
  equipment: Partial<Record<Slot, Item>>;
  inventory: Item[];
  quests: Quest[];
  ready: boolean;
}

export interface EnemyView {
  id: string;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  boss: boolean;
  telegraph: number;
}

export interface ProjectileView {
  id: string;
  x: number;
  y: number;
  radius: number;
  hostile: boolean;
}

export interface DropView {
  id: string;
  x: number;
  y: number;
  kind: 'item' | 'gold' | 'potion';
  rarity: Rarity;
  amount: number;
  name: string;
}

export interface FxView {
  id: string;
  kind: 'slash' | 'hit' | 'death' | 'levelup' | 'pickup' | 'quest';
  x: number;
  y: number;
  angle: number;
  age: number;
}

export type Phase = 'lobby' | 'exploring' | 'boss' | 'cleared' | 'wiped';

export interface Snapshot {
  t: number;
  phase: Phase;
  floor: number;
  seedName: string;
  floorKey: number;
  /** Empty when the client already has the current floor's tiles. */
  tiles: number[];
  exit: { x: number; y: number; open: boolean };
  players: PlayerView[];
  enemies: EnemyView[];
  projectiles: ProjectileView[];
  drops: DropView[];
  fx: FxView[];
  log: string[];
  questBoard: Quest[];
}

export interface InputState {
  mx: number;
  my: number;
  aimX: number;
  aimY: number;
  attack: boolean;
  dash: boolean;
}

export type ClientMessage =
  | { type: 'create'; name: string; cls: ClassId; key?: string }
  | { type: 'join'; code: string; name: string; cls: ClassId; key?: string }
  | { type: 'ready'; value: boolean }
  | { type: 'input'; input: InputState }
  | { type: 'equip'; itemId: string }
  | { type: 'sell'; itemId: string }
  | { type: 'potion' }
  | { type: 'acceptQuest'; questId: string }
  | { type: 'turnInQuest'; questId: string }
  | { type: 'descend' }
  | { type: 'restart' };

export type ServerMessage =
  | { type: 'joined'; code: string; playerId: string }
  | { type: 'error'; message: string }
  | { type: 'snapshot'; snapshot: Snapshot };

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#c8cdd6',
  uncommon: '#5fd46a',
  rare: '#4aa8ff',
  epic: '#c06bf0',
  legendary: '#ffab24',
};
