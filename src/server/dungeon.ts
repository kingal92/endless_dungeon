import { MAP_H, MAP_W, TILE } from '../shared/protocol.js';
import { Rng } from './rng.js';

export const WALL = 0;
export const FLOOR = 1;

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Dungeon {
  tiles: number[];
  rooms: Room[];
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
}

const ADJECTIVES = ['Sunken', 'Ashen', 'Howling', 'Forgotten', 'Bleeding', 'Frozen', 'Gilded', 'Rotting'];
const NOUNS = ['Catacombs', 'Vaults', 'Warrens', 'Hollow', 'Sanctum', 'Depths', 'Reliquary', 'Crypt'];

export function floorName(rng: Rng): string {
  return `${rng.pick(ADJECTIVES)} ${rng.pick(NOUNS)}`;
}

function roomCenter(room: Room): { x: number; y: number } {
  return { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
}

function overlaps(a: Room, b: Room): boolean {
  return a.x - 1 < b.x + b.w && a.x + a.w + 1 > b.x && a.y - 1 < b.y + b.h && a.y + a.h + 1 > b.y;
}

function carveRoom(tiles: number[], room: Room): void {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      tiles[y * MAP_W + x] = FLOOR;
    }
  }
}

function carveCorridor(tiles: number[], ax: number, ay: number, bx: number, by: number, rng: Rng): void {
  const horizontalFirst = rng.chance(0.5);
  const stepX = (y: number) => {
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
      tiles[y * MAP_W + x] = FLOOR;
      tiles[(y + 1) * MAP_W + x] = FLOOR;
    }
  };
  const stepY = (x: number) => {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
      tiles[y * MAP_W + x] = FLOOR;
      tiles[y * MAP_W + x + 1] = FLOOR;
    }
  };
  if (horizontalFirst) {
    stepX(ay);
    stepY(bx);
  } else {
    stepY(ax);
    stepX(by);
  }
}

/** Generates a connected set of rectangular rooms joined by L-shaped corridors. */
export function generateDungeon(rng: Rng, roomCount: number): Dungeon {
  const tiles = new Array<number>(MAP_W * MAP_H).fill(WALL);
  const rooms: Room[] = [];

  for (let attempt = 0; attempt < roomCount * 12 && rooms.length < roomCount; attempt++) {
    const w = rng.int(6, 12);
    const h = rng.int(5, 10);
    const room: Room = {
      x: rng.int(2, MAP_W - w - 3),
      y: rng.int(2, MAP_H - h - 3),
      w,
      h,
    };
    if (rooms.some((other) => overlaps(room, other))) continue;
    rooms.push(room);
  }

  rooms.forEach((room, index) => {
    carveRoom(tiles, room);
    if (index > 0) {
      const a = roomCenter(rooms[index - 1]);
      const b = roomCenter(room);
      carveCorridor(tiles, a.x, a.y, b.x, b.y, rng);
    }
  });

  const first = roomCenter(rooms[0]);
  const last = roomCenter(rooms[rooms.length - 1]);
  return {
    tiles,
    rooms,
    spawn: { x: first.x * TILE + TILE / 2, y: first.y * TILE + TILE / 2 },
    exit: { x: last.x * TILE + TILE / 2, y: last.y * TILE + TILE / 2 },
  };
}

export function isWall(tiles: number[], px: number, py: number): boolean {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return tiles[ty * MAP_W + tx] === WALL;
}

/** Breadth-first distance field (in tiles) from a target tile, used for enemy navigation. */
export function buildFlowField(tiles: number[], tx: number, ty: number): Int32Array {
  const field = new Int32Array(MAP_W * MAP_H).fill(-1);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H || tiles[ty * MAP_W + tx] === WALL) return field;
  const queue = [ty * MAP_W + tx];
  field[queue[0]] = 0;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const x = index % MAP_W;
    const y = (index - x) / MAP_W;
    const neighbours = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbours) {
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const nIndex = ny * MAP_W + nx;
      if (field[nIndex] !== -1 || tiles[nIndex] === WALL) continue;
      field[nIndex] = field[index] + 1;
      queue.push(nIndex);
    }
  }
  return field;
}

/** True when nothing solid blocks the straight line between two world points. */
export function hasLineOfSight(tiles: number[], ax: number, ay: number, bx: number, by: number): boolean {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (TILE / 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isWall(tiles, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

/** Axis-separated collision resolution against the tile grid. */
export function moveWithCollision(
  tiles: number[],
  x: number,
  y: number,
  dx: number,
  dy: number,
  radius: number,
): { x: number; y: number } {
  let nx = x;
  let ny = y;
  const probe = (px: number, py: number) =>
    isWall(tiles, px - radius, py - radius) ||
    isWall(tiles, px + radius, py - radius) ||
    isWall(tiles, px - radius, py + radius) ||
    isWall(tiles, px + radius, py + radius);

  if (!probe(x + dx, y)) nx = x + dx;
  if (!probe(nx, y + dy)) ny = y + dy;
  return { x: nx, y: ny };
}
