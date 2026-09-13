import {
  ClassId,
  DropView,
  EnemyView,
  FxView,
  InputState,
  Item,
  MAP_H,
  MAP_W,
  Phase,
  PlayerView,
  ProjectileView,
  Quest,
  Slot,
  Snapshot,
  Stats,
  TILE,
} from '../shared/protocol.js';
import { BOSSES, CLASS_BASE, ENEMIES, EnemyArchetype, rollItem, rollQuest, scaleEnemy, xpForLevel } from './content.js';
import { buildFlowField, Dungeon, floorName, generateDungeon, hasLineOfSight, moveWithCollision } from './dungeon.js';
import { Rng } from './rng.js';

const REVIVE_SECONDS = 3;
const PICKUP_RADIUS = 26;
const MELEE_RANGE = 52;
const MELEE_ARC = 1.2;
const INVENTORY_SIZE = 18;
const MAX_ACTIVE_QUESTS = 3;
const BOSS_EVERY = 5;

interface Player {
  id: string;
  name: string;
  cls: ClassId;
  x: number;
  y: number;
  facing: number;
  hp: number;
  level: number;
  xp: number;
  gold: number;
  potions: number;
  alive: boolean;
  reviveProgress: number;
  attackCooldown: number;
  dashCooldown: number;
  dashTimer: number;
  hurtCooldown: number;
  equipment: Partial<Record<Slot, Item>>;
  inventory: Item[];
  quests: Quest[];
  input: InputState;
  ready: boolean;
  connected: boolean;
}

interface Enemy {
  id: string;
  arch: EnemyArchetype;
  x: number;
  y: number;
  hp: number;
  cooldown: number;
  telegraph: number;
  dashTimer: number;
  /** Seconds left of wall-hugging sidestep, used when a straight chase is blocked. */
  strafe: number;
  strafeDir: number;
}

interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  hostile: boolean;
  radius: number;
  ownerId?: string;
}

interface Drop {
  id: string;
  x: number;
  y: number;
  kind: 'item' | 'gold' | 'potion';
  amount: number;
  item?: Item;
}

interface Fx {
  id: string;
  kind: FxView['kind'];
  x: number;
  y: number;
  angle: number;
  age: number;
}

let entityCounter = 0;
const nextId = (prefix: string): string => `${prefix}${(entityCounter += 1)}`;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export class Game {
  phase: Phase = 'lobby';
  floor = 1;
  seedName = 'Dungeon Gate';
  questBoard: Quest[] = [];
  /** Bumped whenever the tile map changes, so clients only download it once per floor. */
  floorKey = 0;

  private rng: Rng;
  private dungeon: Dungeon;
  private exitOpen = false;
  private clearRewarded = false;
  private players = new Map<string, Player>();
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private drops: Drop[] = [];
  private fx: Fx[] = [];
  private log: string[] = [];
  private time = 0;
  private flowFields = new Map<string, Int32Array>();
  private flowAge = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.dungeon = generateDungeon(this.rng, 8);
    this.questBoard = [rollQuest(this.rng, 1), rollQuest(this.rng, 1), rollQuest(this.rng, 1)];
  }

  get playerCount(): number {
    return [...this.players.values()].filter((p) => p.connected).length;
  }

  addPlayer(id: string, name: string, cls: ClassId): void {
    const base = CLASS_BASE[cls];
    this.players.set(id, {
      id,
      name,
      cls,
      x: this.dungeon.spawn.x,
      y: this.dungeon.spawn.y,
      facing: 0,
      hp: base.maxHp,
      level: 1,
      xp: 0,
      gold: 0,
      potions: 2,
      alive: true,
      reviveProgress: 0,
      attackCooldown: 0,
      dashCooldown: 0,
      dashTimer: 0,
      hurtCooldown: 0,
      equipment: {},
      inventory: [],
      quests: [],
      input: { mx: 0, my: 0, aimX: 1, aimY: 0, attack: false, dash: false },
      ready: false,
      connected: true,
    });
    this.pushLog(`${name} the ${cls} enters the dungeon.`);
  }

  removePlayer(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    player.connected = false;
    this.players.delete(id);
    this.pushLog(`${player.name} left the party.`);
    if (this.players.size === 0) this.phase = 'lobby';
  }

  setInput(id: string, input: InputState): void {
    const player = this.players.get(id);
    if (!player) return;
    const len = Math.hypot(input.mx, input.my) || 1;
    player.input = {
      mx: Math.abs(input.mx) > 1 || len > 1 ? input.mx / len : input.mx,
      my: Math.abs(input.my) > 1 || len > 1 ? input.my / len : input.my,
      aimX: input.aimX,
      aimY: input.aimY,
      attack: input.attack,
      dash: input.dash,
    };
  }

  setReady(id: string, value: boolean): void {
    const player = this.players.get(id);
    if (!player) return;
    player.ready = value;
    const all = [...this.players.values()];
    if (this.phase === 'lobby' && all.length > 0 && all.every((p) => p.ready)) {
      this.startFloor(1);
    }
  }

  equip(id: string, itemId: string): void {
    const player = this.players.get(id);
    if (!player) return;
    const index = player.inventory.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    const item = player.inventory[index];
    const previous = player.equipment[item.slot];
    player.inventory.splice(index, 1);
    player.equipment[item.slot] = item;
    if (previous) player.inventory.push(previous);
    player.hp = Math.min(player.hp, this.statsOf(player).maxHp);
    this.pushLog(`${player.name} equips ${item.name}.`);
  }

  sell(id: string, itemId: string): void {
    const player = this.players.get(id);
    if (!player) return;
    const index = player.inventory.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    const [item] = player.inventory.splice(index, 1);
    player.gold += item.value;
    this.pushLog(`${player.name} sells ${item.name} for ${item.value}g.`);
  }

  drinkPotion(id: string): void {
    const player = this.players.get(id);
    if (!player || player.potions <= 0 || !player.alive) return;
    const max = this.statsOf(player).maxHp;
    if (player.hp >= max) return;
    player.potions -= 1;
    player.hp = Math.min(max, player.hp + Math.round(max * 0.45));
    this.spawnFx('pickup', player.x, player.y, 0);
  }

  acceptQuest(id: string, questId: string): void {
    const player = this.players.get(id);
    if (!player) return;
    if (player.quests.filter((q) => !q.turnedIn).length >= MAX_ACTIVE_QUESTS) return;
    const quest = this.questBoard.find((q) => q.id === questId);
    if (!quest || player.quests.some((q) => q.id === questId)) return;
    player.quests.push({ ...quest, accepted: true });
    this.pushLog(`${player.name} accepted "${quest.title}".`);
  }

  turnInQuest(id: string, questId: string): void {
    const player = this.players.get(id);
    if (!player) return;
    const quest = player.quests.find((q) => q.id === questId);
    if (!quest || !quest.completed || quest.turnedIn) return;
    quest.turnedIn = true;
    player.gold += quest.rewardGold;
    this.grantXp(player, quest.rewardXp);
    const reward = rollItem(this.rng, this.floor + 1);
    this.giveItem(player, reward);
    this.spawnFx('quest', player.x, player.y, 0);
    this.pushLog(`${player.name} completed a quest: +${quest.rewardGold}g, +${quest.rewardXp}xp, ${reward.name}.`);
  }

  descend(id: string): void {
    const player = this.players.get(id);
    if (!player || !this.exitOpen) return;
    if (dist(player.x, player.y, this.dungeon.exit.x, this.dungeon.exit.y) > TILE * 1.6) return;
    this.startFloor(this.floor + 1);
  }

  restart(): void {
    if (this.phase !== 'wiped') return;
    this.floor = 1;
    for (const player of this.players.values()) {
      player.level = 1;
      player.xp = 0;
      player.gold = Math.floor(player.gold / 2);
      player.inventory = [];
      player.equipment = {};
      player.quests = [];
      player.potions = 2;
      player.hp = this.statsOf(player).maxHp;
      player.alive = true;
    }
    this.startFloor(1);
  }

  private startFloor(floor: number): void {
    this.floor = floor;
    this.floorKey += 1;
    this.dungeon = generateDungeon(this.rng, Math.min(14, 6 + Math.floor(floor / 2)));
    this.seedName = floorName(this.rng);
    this.enemies = [];
    this.projectiles = [];
    this.drops = [];
    const isBossFloor = floor % BOSS_EVERY === 0;
    // Normal floors can be rushed; boss floors stay sealed until the boss dies.
    this.exitOpen = !isBossFloor;
    this.clearRewarded = false;
    this.phase = isBossFloor ? 'boss' : 'exploring';

    if (isBossFloor) {
      const boss = scaleEnemy(this.rng.pick(BOSSES), floor);
      const room = this.dungeon.rooms[this.dungeon.rooms.length - 1];
      this.spawnEnemy(boss, (room.x + room.w / 2) * TILE, (room.y + room.h / 2) * TILE);
      this.pushLog(`Floor ${floor}: ${boss.kind.toUpperCase()} stirs in the ${this.seedName}.`);
    } else {
      this.pushLog(`Floor ${floor}: the ${this.seedName}.`);
    }

    const packs = isBossFloor ? 2 : Math.min(10, 3 + Math.floor(floor * 0.8));
    for (let i = 0; i < packs; i++) {
      const room = this.rng.pick(this.dungeon.rooms.slice(1));
      const count = this.rng.int(2, 4);
      for (let j = 0; j < count; j++) {
        const arch = scaleEnemy(this.rng.pick(ENEMIES), floor);
        this.spawnEnemy(
          arch,
          (room.x + this.rng.range(1, room.w - 1)) * TILE,
          (room.y + this.rng.range(1, room.h - 1)) * TILE,
        );
      }
    }

    for (const room of this.dungeon.rooms) {
      if (!this.rng.chance(0.4)) continue;
      this.drops.push({
        id: nextId('d'),
        x: (room.x + room.w / 2) * TILE,
        y: (room.y + room.h / 2) * TILE,
        kind: this.rng.chance(0.35) ? 'potion' : 'item',
        amount: 1,
        item: this.rng.chance(0.65) ? rollItem(this.rng, floor) : undefined,
      });
    }
    for (const drop of this.drops) {
      if (drop.kind === 'item' && !drop.item) drop.item = rollItem(this.rng, floor);
    }

    this.questBoard = [rollQuest(this.rng, floor), rollQuest(this.rng, floor), rollQuest(this.rng, floor)];

    for (const player of this.players.values()) {
      player.x = this.dungeon.spawn.x;
      player.y = this.dungeon.spawn.y;
      player.alive = true;
      player.reviveProgress = 0;
      player.hp = Math.max(player.hp, Math.round(this.statsOf(player).maxHp * 0.5));
      if (floor > 1) this.progressQuests(player, 'descend', 1);
    }
  }

  private spawnEnemy(arch: EnemyArchetype, x: number, y: number): void {
    this.enemies.push({
      id: nextId('e'),
      arch,
      x,
      y,
      hp: arch.hp,
      cooldown: this.rng.range(0, 1),
      telegraph: 0,
      dashTimer: 0,
      strafe: 0,
      strafeDir: this.rng.chance(0.5) ? 1 : -1,
    });
  }

  private statsOf(player: Player): Stats {
    const base = CLASS_BASE[player.cls];
    const levelBonus = player.level - 1;
    const stats: Stats = {
      power: base.power + levelBonus * 2,
      armor: base.armor + levelBonus,
      maxHp: base.maxHp + levelBonus * 12,
      speed: base.speed + levelBonus * 1.5,
      crit: base.crit + levelBonus * 0.004,
    };
    for (const item of Object.values(player.equipment)) {
      if (!item) continue;
      stats.power += item.stats.power ?? 0;
      stats.armor += item.stats.armor ?? 0;
      stats.maxHp += item.stats.maxHp ?? 0;
      stats.speed += item.stats.speed ?? 0;
      stats.crit += item.stats.crit ?? 0;
    }
    return stats;
  }

  private grantXp(player: Player, amount: number): void {
    player.xp += amount;
    while (player.xp >= xpForLevel(player.level)) {
      player.xp -= xpForLevel(player.level);
      player.level += 1;
      player.hp = this.statsOf(player).maxHp;
      this.spawnFx('levelup', player.x, player.y, 0);
      this.pushLog(`${player.name} reached level ${player.level}!`);
    }
  }

  private giveItem(player: Player, item: Item): void {
    if (player.inventory.length >= INVENTORY_SIZE) {
      player.gold += item.value;
      this.pushLog(`${player.name}'s pack is full — ${item.name} sold for ${item.value}g.`);
      return;
    }
    player.inventory.push(item);
    this.progressQuests(player, 'loot', 1);
  }

  private progressQuests(player: Player, kind: Quest['kind'], amount: number): void {
    for (const quest of player.quests) {
      if (quest.kind !== kind || quest.turnedIn || quest.completed) continue;
      quest.progress = Math.min(quest.target, quest.progress + amount);
      if (quest.progress >= quest.target) {
        quest.completed = true;
        this.pushLog(`${player.name} finished "${quest.title}" — turn it in for rewards.`);
      }
    }
  }

  private pushLog(message: string): void {
    this.log.push(message);
    if (this.log.length > 8) this.log.shift();
  }

  private spawnFx(kind: Fx['kind'], x: number, y: number, angle: number): void {
    this.fx.push({ id: nextId('f'), kind, x, y, angle, age: 0 });
    if (this.fx.length > 60) this.fx.shift();
  }

  update(dt: number): void {
    this.time += dt;
    if (this.phase === 'lobby') return;

    for (const player of this.players.values()) this.updatePlayer(player, dt);
    this.refreshFlowFields(dt);
    for (const enemy of this.enemies) this.updateEnemy(enemy, dt);
    this.separateEnemies();
    this.updateProjectiles(dt);
    this.updatePickups();

    this.enemies = this.enemies.filter((enemy) => enemy.hp > 0);
    if (this.enemies.length === 0 && !this.clearRewarded && this.phase !== 'wiped') {
      this.clearRewarded = true;
      this.exitOpen = true;
      this.phase = 'cleared';
      this.pushLog('Floor cleared — a reward cache appears by the stairs.');
      this.drops.push({
        id: nextId('d'),
        x: this.dungeon.exit.x + 34,
        y: this.dungeon.exit.y,
        kind: 'item',
        amount: 1,
        item: rollItem(this.rng, this.floor + 1),
      });
      this.drops.push({ id: nextId('d'), x: this.dungeon.exit.x - 34, y: this.dungeon.exit.y, kind: 'potion', amount: 1 });
    }

    for (const fx of this.fx) fx.age += dt;
    this.fx = this.fx.filter((fx) => fx.age < 0.45);

    const active = [...this.players.values()];
    if (active.length > 0 && active.every((p) => !p.alive) && this.phase !== 'wiped') {
      this.phase = 'wiped';
      this.pushLog('The party has fallen. Press RESTART to run again.');
    }
  }

  private updatePlayer(player: Player, dt: number): void {
    const stats = this.statsOf(player);
    player.attackCooldown = Math.max(0, player.attackCooldown - dt);
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.dashTimer = Math.max(0, player.dashTimer - dt);
    player.hurtCooldown = Math.max(0, player.hurtCooldown - dt);

    if (!player.alive) {
      const reviver = [...this.players.values()].find(
        (other) => other.id !== player.id && other.alive && dist(other.x, other.y, player.x, player.y) < 46,
      );
      player.reviveProgress = reviver ? Math.min(REVIVE_SECONDS, player.reviveProgress + dt) : 0;
      if (player.reviveProgress >= REVIVE_SECONDS) {
        player.alive = true;
        player.reviveProgress = 0;
        player.hp = Math.round(stats.maxHp * 0.5);
        this.spawnFx('levelup', player.x, player.y, 0);
        this.pushLog(`${player.name} is back on their feet.`);
      }
      return;
    }

    const input = player.input;
    if (input.mx !== 0 || input.my !== 0) player.facing = Math.atan2(input.my, input.mx);
    if (input.aimX !== 0 || input.aimY !== 0) player.facing = Math.atan2(input.aimY, input.aimX);

    if (input.dash && player.dashCooldown === 0 && (input.mx !== 0 || input.my !== 0)) {
      player.dashCooldown = 2.2;
      player.dashTimer = 0.18;
    }

    const speed = stats.speed * (player.dashTimer > 0 ? 3.4 : 1);
    const moved = moveWithCollision(this.dungeon.tiles, player.x, player.y, input.mx * speed * dt, input.my * speed * dt, 11);
    player.x = moved.x;
    player.y = moved.y;

    if (input.attack && player.attackCooldown === 0) {
      const base = CLASS_BASE[player.cls];
      player.attackCooldown = base.attackCooldown;
      if (base.ranged) {
        this.projectiles.push({
          id: nextId('p'),
          x: player.x,
          y: player.y,
          vx: Math.cos(player.facing) * 430,
          vy: Math.sin(player.facing) * 430,
          life: 1.1,
          damage: this.rollDamage(stats),
          hostile: false,
          radius: 6,
          ownerId: player.id,
        });
      } else {
        this.spawnFx('slash', player.x + Math.cos(player.facing) * 26, player.y + Math.sin(player.facing) * 26, player.facing);
        for (const enemy of this.enemies) {
          const d = dist(player.x, player.y, enemy.x, enemy.y);
          if (d > MELEE_RANGE + enemy.arch.radius) continue;
          const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
          let delta = Math.abs(angle - player.facing);
          if (delta > Math.PI) delta = Math.PI * 2 - delta;
          if (delta > MELEE_ARC) continue;
          this.damageEnemy(enemy, this.rollDamage(stats), player);
        }
      }
    }
  }

  private rollDamage(stats: Stats): number {
    const crit = Math.random() < stats.crit;
    const base = stats.power * (0.85 + Math.random() * 0.3);
    return Math.max(1, Math.round(base * (crit ? 2 : 1)));
  }

  private damageEnemy(enemy: Enemy, amount: number, source: Player): void {
    enemy.hp -= amount;
    this.spawnFx('hit', enemy.x, enemy.y, 0);
    if (enemy.hp > 0) return;
    this.spawnFx('death', enemy.x, enemy.y, 0);
    for (const player of this.players.values()) {
      this.grantXp(player, enemy.arch.xp);
      this.progressQuests(player, 'slay', 1);
      if (enemy.arch.boss) this.progressQuests(player, 'boss', 1);
    }
    if (enemy.arch.boss) {
      this.pushLog(`${enemy.arch.kind.toUpperCase()} falls to ${source.name}!`);
    }

    const lootRolls = enemy.arch.boss ? 3 : 1;
    for (let i = 0; i < lootRolls; i++) {
      if (!enemy.arch.boss && !this.rng.chance(0.32)) continue;
      this.drops.push({
        id: nextId('d'),
        x: enemy.x + this.rng.range(-14, 14),
        y: enemy.y + this.rng.range(-14, 14),
        kind: 'item',
        amount: 1,
        item: rollItem(this.rng, this.floor + (enemy.arch.boss ? 2 : 0)),
      });
    }
    this.drops.push({
      id: nextId('d'),
      x: enemy.x,
      y: enemy.y,
      kind: 'gold',
      amount: Math.round((enemy.arch.boss ? 180 : 8) * (1 + this.floor * 0.4) * this.rng.range(0.7, 1.4)),
    });
    if (this.rng.chance(enemy.arch.boss ? 1 : 0.08)) {
      this.drops.push({ id: nextId('d'), x: enemy.x + 12, y: enemy.y, kind: 'potion', amount: 1 });
    }
  }

  private damagePlayer(player: Player, amount: number): void {
    if (!player.alive || player.hurtCooldown > 0 || player.dashTimer > 0) return;
    const stats = this.statsOf(player);
    const mitigated = Math.max(1, Math.round(amount * (100 / (100 + stats.armor * 4))));
    player.hp -= mitigated;
    player.hurtCooldown = 0.35;
    this.spawnFx('hit', player.x, player.y, 0);
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      player.reviveProgress = 0;
      this.pushLog(`${player.name} is down!`);
    }
  }

  private updateEnemy(enemy: Enemy, dt: number): void {
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.telegraph = Math.max(0, enemy.telegraph - dt);
    enemy.dashTimer = Math.max(0, enemy.dashTimer - dt);

    const targets = [...this.players.values()].filter((p) => p.alive);
    if (targets.length === 0) return;
    const target = targets.reduce((closest, p) =>
      dist(p.x, p.y, enemy.x, enemy.y) < dist(closest.x, closest.y, enemy.x, enemy.y) ? p : closest,
    );
    const d = dist(target.x, target.y, enemy.x, enemy.y);
    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);

    const visible = hasLineOfSight(this.dungeon.tiles, enemy.x, enemy.y, target.x, target.y);
    const wantsDistance = enemy.arch.ranged && d < 150 && visible;
    const chase = enemy.arch.ranged && visible && d >= 150 && d <= 320 ? 0.2 : 1;
    const speed = enemy.arch.speed * chase * (enemy.dashTimer > 0 ? 3 : 1);
    enemy.strafe = Math.max(0, enemy.strafe - dt);

    let dir = wantsDistance ? angle + Math.PI : angle;
    if (!visible) {
      const path = this.pathDirection(enemy, target.id);
      if (path !== null) dir = path;
    }
    if (enemy.strafe > 0) dir += (enemy.strafeDir * Math.PI) / 2;

    const inMeleeRange = !enemy.arch.ranged && d < enemy.arch.radius + 16;
    const step = inMeleeRange ? 0 : speed * dt;
    const moved = moveWithCollision(
      this.dungeon.tiles,
      enemy.x,
      enemy.y,
      Math.cos(dir) * step,
      Math.sin(dir) * step,
      enemy.arch.radius * 0.7,
    );
    // Corridors have no pathfinding: when a chase stalls against geometry, sidestep for a moment.
    if (step > 0 && dist(moved.x, moved.y, enemy.x, enemy.y) < step * 0.4 && enemy.strafe === 0) {
      enemy.strafe = 0.7;
      enemy.strafeDir = this.rng.chance(0.5) ? 1 : -1;
    }
    enemy.x = moved.x;
    enemy.y = moved.y;

    if (enemy.cooldown > 0) return;

    if (enemy.arch.ranged) {
      if (d > 420) return;
      enemy.cooldown = enemy.arch.attackCooldown;
      enemy.telegraph = 0.2;
      const shots = enemy.arch.boss ? 7 : 1;
      const spread = enemy.arch.boss ? 0.9 : 0;
      for (let i = 0; i < shots; i++) {
        const a = angle + (shots === 1 ? 0 : -spread + (spread * 2 * i) / (shots - 1));
        this.projectiles.push({
          id: nextId('p'),
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(a) * 220,
          vy: Math.sin(a) * 220,
          life: 2.2,
          damage: enemy.arch.power,
          hostile: true,
          radius: enemy.arch.boss ? 9 : 6,
        });
      }
      return;
    }

    if (enemy.arch.boss && d > 90 && d < 420) {
      enemy.cooldown = enemy.arch.attackCooldown * 2;
      enemy.telegraph = 0.35;
      enemy.dashTimer = 0.45;
      return;
    }

    if (d < enemy.arch.radius + 18) {
      enemy.cooldown = enemy.arch.attackCooldown;
      this.damagePlayer(target, enemy.arch.power);
    }
  }

  /** Keeps a pack from collapsing into a single point on top of the player. */
  private separateEnemies(): void {
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        const minimum = (a.arch.radius + b.arch.radius) * 0.85;
        const d = dist(a.x, a.y, b.x, b.y);
        if (d >= minimum) continue;
        const angle = d === 0 ? this.rng.range(0, Math.PI * 2) : Math.atan2(b.y - a.y, b.x - a.x);
        const push = (minimum - d) / 2;
        const away = moveWithCollision(
          this.dungeon.tiles,
          a.x,
          a.y,
          -Math.cos(angle) * push,
          -Math.sin(angle) * push,
          a.arch.radius * 0.7,
        );
        const toward = moveWithCollision(
          this.dungeon.tiles,
          b.x,
          b.y,
          Math.cos(angle) * push,
          Math.sin(angle) * push,
          b.arch.radius * 0.7,
        );
        a.x = away.x;
        a.y = away.y;
        b.x = toward.x;
        b.y = toward.y;
      }
    }
  }

  /** Recomputes per-player BFS distance fields a few times a second for enemy pathing. */
  private refreshFlowFields(dt: number): void {
    this.flowAge += dt;
    if (this.flowAge < 0.3) return;
    this.flowAge = 0;
    this.flowFields.clear();
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      this.flowFields.set(
        player.id,
        buildFlowField(this.dungeon.tiles, Math.floor(player.x / TILE), Math.floor(player.y / TILE)),
      );
    }
  }

  /** Direction toward the neighbouring tile that is closest to the target, or null if unreachable. */
  private pathDirection(enemy: Enemy, targetId: string): number | null {
    const field = this.flowFields.get(targetId);
    if (!field) return null;
    const tx = Math.floor(enemy.x / TILE);
    const ty = Math.floor(enemy.y / TILE);
    const here = field[ty * MAP_W + tx];
    if (here === undefined || here < 0) return null;

    let best: { x: number; y: number; value: number } | null = null;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const value = field[ny * MAP_W + nx];
      if (value < 0) continue;
      if (!best || value < best.value) best = { x: nx, y: ny, value };
    }
    if (!best || best.value >= here) return null;
    return Math.atan2((best.y + 0.5) * TILE - enemy.y, (best.x + 0.5) * TILE - enemy.x);
  }

  private updateProjectiles(dt: number): void {
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      const tx = Math.floor(projectile.x / TILE);
      const ty = Math.floor(projectile.y / TILE);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H || this.dungeon.tiles[ty * MAP_W + tx] === 0) {
        projectile.life = 0;
        continue;
      }
      if (projectile.hostile) {
        for (const player of this.players.values()) {
          if (!player.alive) continue;
          if (dist(player.x, player.y, projectile.x, projectile.y) < projectile.radius + 11) {
            this.damagePlayer(player, projectile.damage);
            projectile.life = 0;
            break;
          }
        }
      } else {
        for (const enemy of this.enemies) {
          if (enemy.hp <= 0) continue;
          if (dist(enemy.x, enemy.y, projectile.x, projectile.y) < projectile.radius + enemy.arch.radius) {
            const owner = projectile.ownerId ? this.players.get(projectile.ownerId) : undefined;
            if (owner) this.damageEnemy(enemy, projectile.damage, owner);
            projectile.life = 0;
            break;
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0);
  }

  private updatePickups(): void {
    const remaining: Drop[] = [];
    for (const drop of this.drops) {
      const looter = [...this.players.values()].find(
        (player) => player.alive && dist(player.x, player.y, drop.x, drop.y) < PICKUP_RADIUS,
      );
      if (!looter) {
        remaining.push(drop);
        continue;
      }
      if (drop.kind === 'gold') {
        looter.gold += drop.amount;
      } else if (drop.kind === 'potion') {
        looter.potions += 1;
      } else if (drop.item) {
        this.giveItem(looter, drop.item);
      }
      this.spawnFx('pickup', drop.x, drop.y, 0);
    }
    this.drops = remaining;
  }

  snapshot(): Snapshot {
    const players: PlayerView[] = [...this.players.values()].map((player) => {
      const stats = this.statsOf(player);
      return {
        id: player.id,
        name: player.name,
        cls: player.cls,
        x: player.x,
        y: player.y,
        facing: player.facing,
        hp: Math.round(player.hp),
        maxHp: stats.maxHp,
        level: player.level,
        xp: player.xp,
        xpToLevel: xpForLevel(player.level),
        gold: player.gold,
        alive: player.alive,
        reviveProgress: player.reviveProgress / REVIVE_SECONDS,
        attackCooldown: player.attackCooldown,
        dashCooldown: player.dashCooldown,
        potions: player.potions,
        stats,
        equipment: player.equipment,
        inventory: player.inventory,
        quests: player.quests,
        ready: player.ready,
      };
    });

    const enemies: EnemyView[] = this.enemies.map((enemy) => ({
      id: enemy.id,
      kind: enemy.arch.kind,
      x: enemy.x,
      y: enemy.y,
      hp: Math.max(0, Math.round(enemy.hp)),
      maxHp: enemy.arch.hp,
      radius: enemy.arch.radius,
      boss: enemy.arch.boss,
      telegraph: enemy.telegraph,
    }));

    const projectiles: ProjectileView[] = this.projectiles.map((projectile) => ({
      id: projectile.id,
      x: projectile.x,
      y: projectile.y,
      radius: projectile.radius,
      hostile: projectile.hostile,
    }));

    const drops: DropView[] = this.drops.map((drop) => ({
      id: drop.id,
      x: drop.x,
      y: drop.y,
      kind: drop.kind,
      rarity: drop.item?.rarity ?? 'common',
      amount: drop.amount,
      name: drop.item?.name ?? (drop.kind === 'gold' ? `${drop.amount} gold` : 'Health Potion'),
    }));

    return {
      t: this.time,
      phase: this.phase,
      floor: this.floor,
      seedName: this.seedName,
      floorKey: this.floorKey,
      tiles: this.dungeon.tiles,
      exit: { x: this.dungeon.exit.x, y: this.dungeon.exit.y, open: this.exitOpen },
      players,
      enemies,
      projectiles,
      drops,
      fx: this.fx.map((fx) => ({ id: fx.id, kind: fx.kind, x: fx.x, y: fx.y, angle: fx.angle, age: fx.age })),
      log: [...this.log],
      questBoard: this.questBoard,
    };
  }
}
