import { ClassId, Item, Quest, QuestKind, Rarity, Slot, Stats } from '../shared/protocol.js';
import { Rng } from './rng.js';

export interface EnemyArchetype {
  kind: string;
  hp: number;
  power: number;
  speed: number;
  radius: number;
  ranged: boolean;
  xp: number;
  boss: boolean;
  /** Seconds between attacks. */
  attackCooldown: number;
}

export const ENEMIES: readonly EnemyArchetype[] = [
  { kind: 'slime', hp: 26, power: 5, speed: 42, radius: 13, ranged: false, xp: 8, boss: false, attackCooldown: 1.1 },
  { kind: 'skeleton', hp: 34, power: 8, speed: 62, radius: 12, ranged: false, xp: 12, boss: false, attackCooldown: 0.9 },
  { kind: 'cultist', hp: 28, power: 7, speed: 50, radius: 12, ranged: true, xp: 14, boss: false, attackCooldown: 1.8 },
  { kind: 'brute', hp: 62, power: 12, speed: 46, radius: 17, ranged: false, xp: 22, boss: false, attackCooldown: 1.4 },
  { kind: 'wraith', hp: 40, power: 10, speed: 78, radius: 13, ranged: true, xp: 20, boss: false, attackCooldown: 1.5 },
];

export const BOSSES: readonly EnemyArchetype[] = [
  { kind: 'bone-tyrant', hp: 420, power: 18, speed: 54, radius: 26, ranged: false, xp: 220, boss: true, attackCooldown: 1.2 },
  { kind: 'plague-maw', hp: 500, power: 16, speed: 44, radius: 28, ranged: true, xp: 260, boss: true, attackCooldown: 1.0 },
  { kind: 'void-warden', hp: 460, power: 21, speed: 62, radius: 25, ranged: true, xp: 300, boss: true, attackCooldown: 0.85 },
];

export const CLASS_BASE: Record<ClassId, Stats & { ranged: boolean; attackCooldown: number }> = {
  warrior: { power: 12, armor: 6, maxHp: 130, speed: 138, crit: 0.05, ranged: false, attackCooldown: 0.45 },
  ranger: { power: 10, armor: 3, maxHp: 100, speed: 158, crit: 0.12, ranged: true, attackCooldown: 0.38 },
};

const RARITY_WEIGHTS: ReadonlyArray<[Rarity, number]> = [
  ['common', 52],
  ['uncommon', 26],
  ['rare', 14],
  ['epic', 6],
  ['legendary', 2],
];

const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.35,
  rare: 1.8,
  epic: 2.4,
  legendary: 3.2,
};

const PREFIX: Record<Rarity, readonly string[]> = {
  common: ['Chipped', 'Worn', 'Plain'],
  uncommon: ['Sturdy', 'Keen', 'Hardened'],
  rare: ['Runed', 'Gleaming', 'Warded'],
  epic: ['Doomforged', 'Stormbound', 'Soulbit'],
  legendary: ['Godsplitter', 'Worldscar', 'Eternal'],
};

const BASE_NAME: Record<Slot, readonly string[]> = {
  weapon: ['Blade', 'Axe', 'Longbow', 'Maul', 'Spear'],
  armor: ['Mail', 'Plate', 'Leathers', 'Cuirass'],
  trinket: ['Charm', 'Sigil', 'Ring', 'Idol'],
};

let itemCounter = 0;

function rollRarity(rng: Rng, floor: number): Rarity {
  const luck = Math.min(2.2, 1 + floor * 0.06);
  const weights = RARITY_WEIGHTS.map(([rarity, weight], index) => {
    const scaled = index === 0 ? weight / luck : weight * (index >= 2 ? luck : 1);
    return [rarity, scaled] as [Rarity, number];
  });
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() * total;
  for (const [rarity, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return 'common';
}

export function rollItem(rng: Rng, floor: number, slotHint?: Slot): Item {
  const slot: Slot = slotHint ?? rng.pick<Slot>(['weapon', 'armor', 'trinket']);
  const rarity = rollRarity(rng, floor);
  const mult = RARITY_MULT[rarity] * (1 + floor * 0.18);
  const stats: Partial<Stats> = {};

  if (slot === 'weapon') {
    stats.power = Math.round(rng.range(3, 6) * mult);
    if (rng.chance(0.45)) stats.crit = Math.round(rng.range(1, 4) * mult) / 100;
  } else if (slot === 'armor') {
    stats.armor = Math.round(rng.range(2, 5) * mult);
    stats.maxHp = Math.round(rng.range(6, 12) * mult);
  } else {
    if (rng.chance(0.6)) stats.speed = Math.round(rng.range(2, 6) * mult);
    if (rng.chance(0.6)) stats.power = Math.round(rng.range(1, 4) * mult);
    if (rng.chance(0.5)) stats.maxHp = Math.round(rng.range(4, 9) * mult);
    if (Object.keys(stats).length === 0) stats.crit = Math.round(rng.range(2, 5) * mult) / 100;
  }

  itemCounter += 1;
  return {
    id: `it${itemCounter}`,
    name: `${rng.pick(PREFIX[rarity])} ${rng.pick(BASE_NAME[slot])}`,
    slot,
    rarity,
    level: floor,
    stats,
    value: Math.round(12 * RARITY_MULT[rarity] * (1 + floor * 0.35)),
  };
}

export function scaleEnemy(base: EnemyArchetype, floor: number): EnemyArchetype {
  const growth = 1 + (floor - 1) * 0.22;
  return {
    ...base,
    hp: Math.round(base.hp * growth),
    power: Math.round(base.power * (1 + (floor - 1) * 0.16)),
    xp: Math.round(base.xp * (1 + (floor - 1) * 0.12)),
  };
}

let questCounter = 0;

const QUEST_TITLES: Record<QuestKind, (target: number) => string> = {
  slay: (n) => `Cull the Horde: slay ${n} enemies`,
  loot: (n) => `Grave Robbing: collect ${n} pieces of loot`,
  descend: (n) => `Delve Deeper: clear ${n} more floor(s)`,
  boss: (n) => `Tyrant Hunt: defeat ${n} boss(es)`,
};

export function rollQuest(rng: Rng, floor: number): Quest {
  const kind = rng.pick<QuestKind>(['slay', 'loot', 'descend', 'boss']);
  const target =
    kind === 'slay' ? rng.int(8, 16) : kind === 'loot' ? rng.int(3, 6) : kind === 'descend' ? rng.int(1, 3) : 1;
  questCounter += 1;
  return {
    id: `q${questCounter}`,
    kind,
    title: QUEST_TITLES[kind](target),
    target,
    progress: 0,
    rewardGold: Math.round((25 + target * 9) * (1 + floor * 0.3)),
    rewardXp: Math.round((30 + target * 12) * (1 + floor * 0.25)),
    accepted: false,
    completed: false,
    turnedIn: false,
  };
}

export function xpForLevel(level: number): number {
  return Math.round(80 * Math.pow(1.28, level - 1));
}
