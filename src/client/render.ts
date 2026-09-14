import { MAP_W, RARITY_COLOR, Snapshot, TILE } from '../shared/protocol.js';

const CLASS_COLOR: Record<string, string> = { warrior: '#ffcf6b', ranger: '#7ee0c0' };
const ENEMY_COLOR: Record<string, string> = {
  slime: '#66d17a',
  skeleton: '#dfe3ec',
  cultist: '#c07bf0',
  brute: '#e2794a',
  wraith: '#7fa8ff',
};

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private tiles: number[] = [];
  private floorKey = -1;
  private tileCanvas: HTMLCanvasElement | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
  }

  /** Caches the static tile map to an offscreen canvas; only redrawn when the floor changes. */
  private bakeTiles(): void {
    const rows = Math.ceil(this.tiles.length / MAP_W);
    const canvas = document.createElement('canvas');
    canvas.width = MAP_W * TILE;
    canvas.height = rows * TILE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.tiles[y * MAP_W + x] === 0) continue;
        const shade = 26 + ((x * 7 + y * 13) % 10);
        ctx.fillStyle = `rgb(${shade + 10}, ${shade + 8}, ${shade + 20})`;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }
    this.tileCanvas = canvas;
  }

  draw(snapshot: Snapshot, selfId: string): void {
    if (snapshot.tiles.length > 0) this.tiles = snapshot.tiles;
    if (snapshot.floorKey !== this.floorKey && this.tiles.length > 0) {
      this.floorKey = snapshot.floorKey;
      this.bakeTiles();
    }

    const { ctx, canvas } = this;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const self = snapshot.players.find((p) => p.id === selfId) ?? snapshot.players[0];
    const scale = (Math.min(canvas.width, canvas.height) < 700 * dpr ? 1.5 : 1.9) * dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!self) return;

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-self.x, -self.y);

    if (this.tileCanvas) ctx.drawImage(this.tileCanvas, 0, 0);

    // Exit stairs
    const exit = snapshot.exit;
    ctx.fillStyle = exit.open ? '#4be08a' : '#3a4058';
    ctx.fillRect(exit.x - 14, exit.y - 14, 28, 28);
    ctx.fillStyle = '#0b0d14';
    ctx.fillRect(exit.x - 8, exit.y - 8, 16, 16);
    if (exit.open) {
      ctx.strokeStyle = 'rgba(75, 224, 138, 0.7)';
      ctx.lineWidth = 2;
      ctx.strokeRect(exit.x - 18, exit.y - 18, 36, 36);
    }

    for (const drop of snapshot.drops) {
      ctx.fillStyle =
        drop.kind === 'gold' ? '#ffd44d' : drop.kind === 'potion' ? '#ff6b8a' : RARITY_COLOR[drop.rarity];
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.kind === 'item' ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      if (drop.kind === 'item') {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    for (const enemy of snapshot.enemies) {
      ctx.fillStyle = enemy.boss ? '#ff5d5d' : ENEMY_COLOR[enemy.kind] ?? '#cccccc';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
      if (enemy.telegraph > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      const w = enemy.boss ? 64 : 26;
      ctx.fillStyle = '#000';
      ctx.fillRect(enemy.x - w / 2, enemy.y - enemy.radius - 10, w, 4);
      ctx.fillStyle = enemy.boss ? '#ff2f2f' : '#e05555';
      ctx.fillRect(enemy.x - w / 2, enemy.y - enemy.radius - 10, (w * enemy.hp) / enemy.maxHp, 4);
    }

    for (const projectile of snapshot.projectiles) {
      ctx.fillStyle = projectile.hostile ? '#ff8a5c' : '#9fe8ff';
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const player of snapshot.players) {
      const color = CLASS_COLOR[player.cls] ?? '#ffffff';
      ctx.globalAlpha = player.alive ? 1 : 0.4;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = player.id === selfId ? '#ffffff' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + Math.cos(player.facing) * 20, player.y + Math.sin(player.facing) * 20);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#000';
      ctx.fillRect(player.x - 16, player.y - 22, 32, 4);
      ctx.fillStyle = player.alive ? '#5fd46a' : '#777';
      ctx.fillRect(player.x - 16, player.y - 22, (32 * player.hp) / player.maxHp, 4);
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#dfe3ec';
      ctx.fillText(`${player.name} L${player.level}`, player.x, player.y - 26);
      if (!player.alive) {
        ctx.strokeStyle = '#ffab24';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.reviveProgress);
        ctx.stroke();
      }
    }

    for (const fx of snapshot.fx) {
      const life = 1 - fx.age / 0.45;
      ctx.globalAlpha = Math.max(0, life);
      if (fx.kind === 'slash') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 22, fx.angle - 1, fx.angle + 1);
        ctx.stroke();
      } else if (fx.kind === 'hit') {
        ctx.fillStyle = '#ffd76b';
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 10 * (1 - life) + 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (fx.kind === 'death') {
        ctx.strokeStyle = '#ff8080';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 26 * (1 - life) + 6, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = fx.kind === 'quest' ? '#ffab24' : '#7ee0c0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 30 * (1 - life) + 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Converts a screen point to world coordinates for mouse aiming. */
  screenToWorld(sx: number, sy: number, self: { x: number; y: number }): { x: number; y: number } {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = (Math.min(this.canvas.width, this.canvas.height) < 700 * dpr ? 1.5 : 1.9) * dpr;
    return {
      x: self.x + (sx * dpr - this.canvas.width / 2) / scale,
      y: self.y + (sy * dpr - this.canvas.height / 2) / scale,
    };
  }
}
