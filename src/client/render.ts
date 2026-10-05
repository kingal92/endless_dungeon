import { MAP_W, RARITY_COLOR, Snapshot, TILE } from '../shared/protocol.js';

const CLASS_COLOR: Record<string, string> = { warrior: '#ffcf6b', ranger: '#7ee0c0', mage: '#b68cff' };
const ENEMY_COLOR: Record<string, string> = {
  slime: '#66d17a',
  skeleton: '#dfe3ec',
  cultist: '#c07bf0',
  brute: '#e2794a',
  wraith: '#7fa8ff',
  spider: '#d45b9d',
  golem: '#a78f7c',
  imp: '#ff875c',
  'crystal-colossus': '#8c63d1',
  'ember-dragon': '#e64d32',
  'dread-queen': '#a654c7',
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

  private drawHeroSprite(player: Snapshot['players'][number], color: string): void {
    const { ctx } = this;
    const isWarrior = player.cls === 'warrior';
    const isMage = player.cls === 'mage';
    const weapon = player.equipment.weapon;
    const armor = player.equipment.armor;
    const trinket = player.equipment.trinket;
    const gearColor = (item: typeof weapon): string => (item ? RARITY_COLOR[item.rarity] : color);
    const outline = '#171522';
    const shadow = 'rgba(0,0,0,0.45)';
    const skin = player.alive ? '#f2b48b' : '#8c7e7b';
    const cloth = player.alive ? (isWarrior ? '#30456f' : isMage ? '#47316f' : '#285b55') : '#3a3b48';
    const lightCloth = player.alive ? (isWarrior ? '#5274aa' : isMage ? '#815dc0' : '#4a9980') : '#555663';

    ctx.save();
    ctx.translate(player.x, player.y);
    const flip = Math.cos(player.facing) < 0;
    ctx.rotate(player.facing + (flip ? -Math.PI : 0));
    if (flip) ctx.scale(-1, 1);
    ctx.globalAlpha = player.alive ? 1 : 0.55;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Ground shadow makes the sprite read clearly against the dungeon tiles.
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(0, 11, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isWarrior) {
      // Shield and shoulder cape.
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.moveTo(-13, -2);
      ctx.lineTo(-17, 2);
      ctx.lineTo(-13, 10);
      ctx.lineTo(-7, 7);
      ctx.lineTo(-7, -1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#a9c8d7';
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-15, 3);
      ctx.lineTo(-12, 7);
      ctx.lineTo(-9, 5);
      ctx.lineTo(-9, 1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#4c7894';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (isMage) {
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(14, 7);
      ctx.lineTo(10, 12);
      ctx.lineTo(-10, 12);
      ctx.lineTo(-14, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = cloth;
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(11, 7);
      ctx.lineTo(7, 9);
      ctx.lineTo(-7, 9);
      ctx.lineTo(-11, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d7c5ff';
      ctx.beginPath();
      ctx.arc(0, -8, 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Ranger's hood and trailing cloak.
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.moveTo(-10, -7);
      ctx.lineTo(-17, 5);
      ctx.lineTo(-11, 11);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = cloth;
      ctx.beginPath();
      ctx.moveTo(-9, -5);
      ctx.lineTo(-14, 4);
      ctx.lineTo(-10, 8);
      ctx.lineTo(-5, 4);
      ctx.closePath();
      ctx.fill();
    }

    // Body, belt, and boots.
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.roundRect(-9, -4, 18, 17, 4);
    ctx.fill();
    ctx.fillStyle = cloth;
    ctx.fillRect(-7, -3, 14, 13);
    ctx.fillStyle = lightCloth;
    ctx.fillRect(-6, 0, 12, 4);
    ctx.fillStyle = '#4b3340';
    ctx.fillRect(-7, 7, 14, 3);
    ctx.fillStyle = '#211d2c';
    ctx.fillRect(-7, 10, 5, 4);
    ctx.fillRect(2, 10, 5, 4);

    if (armor) {
      // Armor replaces the plain tunic with a visible chestplate and shoulder guards.
      const armorColor = gearColor(armor);
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.roundRect(-10, -5, 20, 18, 5);
      ctx.fill();
      ctx.fillStyle = armorColor;
      ctx.beginPath();
      ctx.roundRect(-8, -3, 16, 14, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.fillRect(-6, -1, 12, 2);
      ctx.fillStyle = '#2c263a';
      ctx.fillRect(-1, -2, 2, 11);
      ctx.fillStyle = '#c9d5df';
      ctx.beginPath();
      ctx.arc(0, 5, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = armorColor;
      ctx.beginPath();
      ctx.moveTo(-9, -3);
      ctx.lineTo(-14, 1);
      ctx.lineTo(-11, 7);
      ctx.lineTo(-7, 5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(9, -3);
      ctx.lineTo(14, 1);
      ctx.lineTo(11, 7);
      ctx.lineTo(7, 5);
      ctx.closePath();
      ctx.fill();
    }

    // Head and hair/hood.
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.arc(0, -8, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(1, -8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isWarrior ? '#d08b42' : '#37283f';
    ctx.beginPath();
    ctx.arc(-1, -11, 7, Math.PI, Math.PI * 2);
    ctx.lineTo(6, -8);
    ctx.lineTo(-6, -8);
    ctx.closePath();
    ctx.fill();
    if (!isWarrior) {
      ctx.fillStyle = '#514064';
      ctx.fillRect(-7, -10, 4, 7);
    }
    ctx.fillStyle = '#241d2a';
    ctx.fillRect(3, -8, 2, 2);

    // Equipped weapons replace the class starter weapon and use their rarity color.
    ctx.strokeStyle = outline;
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (weapon) {
      const weaponColor = gearColor(weapon);
      ctx.strokeStyle = weaponColor;
      ctx.lineWidth = 3;
      if (isWarrior) {
        ctx.moveTo(4, 2);
        ctx.lineTo(20, -14);
        ctx.stroke();
        ctx.strokeStyle = '#fff4d1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(11, -6);
        ctx.lineTo(21, -16);
        ctx.stroke();
      } else if (isMage) {
        ctx.strokeStyle = '#8d6ab2';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(7, 10);
        ctx.lineTo(13, -17);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(13, -19, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f0dcff';
        ctx.beginPath();
        ctx.arc(13, -19, 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#9a704b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(6, 1, 12, -1.15, 1.15);
        ctx.stroke();
        ctx.strokeStyle = weaponColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(6, -10);
        ctx.lineTo(6, 11);
        ctx.stroke();
        ctx.fillStyle = weaponColor;
        ctx.beginPath();
        ctx.arc(6, -10, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (isWarrior) {
      ctx.moveTo(5, 2);
      ctx.lineTo(16, -9);
      ctx.stroke();
      ctx.strokeStyle = '#dfe8f2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(11, -5);
      ctx.lineTo(20, -14);
      ctx.stroke();
      ctx.strokeStyle = '#d49b4b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, 2);
      ctx.lineTo(9, -3);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#a77a4c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(6, 1, 11, -1.15, 1.15);
      ctx.stroke();
      ctx.strokeStyle = '#dce8d5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(6, -9);
      ctx.lineTo(6, 11);
      ctx.stroke();
    }

    if (trinket) {
      // Trinkets hang beside the chest so they remain visible without obscuring gear.
      const trinketColor = gearColor(trinket);
      ctx.strokeStyle = trinketColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-10, 5, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = trinketColor;
      ctx.beginPath();
      ctx.moveTo(-10, 2);
      ctx.lineTo(-7, 6);
      ctx.lineTo(-10, 10);
      ctx.lineTo(-13, 6);
      ctx.closePath();
      ctx.fill();
    }

    // Class gem gives each hero a strong focal point at game scale.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.lineTo(3, 4);
    ctx.lineTo(0, 7);
    ctx.lineTo(-3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawEnemySprite(enemy: Snapshot['enemies'][number]): void {
    const { ctx } = this;
    const base = enemy.boss ? 26 : 16;
    const scale = enemy.radius / base;
    const color = ENEMY_COLOR[enemy.kind] ?? (enemy.boss ? '#b8324b' : '#cccccc');
    const outline = '#17131f';
    const pale = enemy.kind === 'skeleton' || enemy.kind === 'bone-tyrant' ? '#e8e0c9' : '#ffffff';

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, base * 0.65, base * 0.7, base * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    if (enemy.boss) {
      // Bosses share a heavy silhouette, with a distinct crown/core for each name.
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.arc(0, 0, base, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 1, base * 0.82, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#681d35';
      ctx.fillRect(-base * 0.58, base * 0.2, base * 1.16, base * 0.33);

      if (enemy.kind === 'bone-tyrant') {
        ctx.fillStyle = pale;
        ctx.beginPath();
        ctx.moveTo(-18, -12);
        ctx.lineTo(-11, -27);
        ctx.lineTo(-3, -16);
        ctx.lineTo(4, -28);
        ctx.lineTo(12, -15);
        ctx.lineTo(20, -21);
        ctx.lineTo(18, 2);
        ctx.lineTo(-18, 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#8f293e';
        ctx.fillRect(-12, -8, 7, 5);
        ctx.fillRect(5, -8, 7, 5);
      } else if (enemy.kind === 'plague-maw') {
        ctx.fillStyle = '#4eaa5c';
        ctx.beginPath();
        ctx.arc(0, -3, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1e2a22';
        ctx.beginPath();
        ctx.ellipse(0, 6, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d8d39b';
        for (let tooth = -9; tooth <= 9; tooth += 6) {
          ctx.beginPath();
          ctx.moveTo(tooth - 2, 3);
          ctx.lineTo(tooth, 10);
          ctx.lineTo(tooth + 2, 3);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = '#b8f06d';
        ctx.beginPath();
        ctx.arc(-7, -7, 3, 0, Math.PI * 2);
        ctx.arc(7, -7, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#171b35';
        ctx.beginPath();
        ctx.moveTo(0, -23);
        ctx.lineTo(17, -8);
        ctx.lineTo(13, 17);
        ctx.lineTo(0, 25);
        ctx.lineTo(-13, 17);
        ctx.lineTo(-17, -8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#8799ff';
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(8, 0);
        ctx.lineTo(0, 13);
        ctx.lineTo(-8, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#d4ddff';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (enemy.kind === 'slime') {
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.arc(0, 2, 15, Math.PI, 0);
      ctx.lineTo(13, 11);
      ctx.quadraticCurveTo(0, 18, -13, 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 1, 12, Math.PI, 0);
      ctx.lineTo(10, 10);
      ctx.quadraticCurveTo(0, 15, -10, 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#163d2c';
      ctx.fillRect(-6, 0, 3, 4);
      ctx.fillRect(3, 0, 3, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(-5, -6, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === 'skeleton') {
      ctx.strokeStyle = outline;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 15);
      ctx.moveTo(-9, 6);
      ctx.lineTo(9, 6);
      ctx.moveTo(-6, 14);
      ctx.lineTo(-10, 20);
      ctx.moveTo(6, 14);
      ctx.lineTo(10, 20);
      ctx.stroke();
      ctx.strokeStyle = pale;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.arc(0, -8, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pale;
      ctx.beginPath();
      ctx.arc(0, -8, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4b3340';
      ctx.fillRect(-4, -10, 3, 3);
      ctx.fillRect(2, -10, 3, 3);
    } else if (enemy.kind === 'cultist') {
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(14, 15);
      ctx.lineTo(-14, 15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(11, 13);
      ctx.lineTo(-11, 13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e9b7ff';
      ctx.beginPath();
      ctx.arc(0, -7, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#231b31';
      ctx.fillRect(-3, -8, 2, 2);
      ctx.fillRect(2, -8, 2, 2);
      ctx.strokeStyle = '#e6c978';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12, 11);
      ctx.lineTo(15, -18);
      ctx.stroke();
      ctx.fillStyle = '#f4d981';
      ctx.beginPath();
      ctx.arc(15, -20, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === 'brute') {
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.moveTo(-15, -8);
      ctx.lineTo(-23, -19);
      ctx.lineTo(-11, -15);
      ctx.lineTo(0, -20);
      ctx.lineTo(11, -15);
      ctx.lineTo(23, -19);
      ctx.lineTo(15, -8);
      ctx.lineTo(17, 15);
      ctx.lineTo(-17, 15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 1, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffb267';
      ctx.fillRect(-9, -3, 5, 4);
      ctx.fillRect(4, -3, 5, 4);
      ctx.fillStyle = '#512a2d';
      ctx.fillRect(-8, 7, 16, 4);
    } else if (enemy.kind === 'spider') {
      ctx.strokeStyle = outline;
      ctx.lineWidth = 4;
      for (const side of [-1, 1]) {
        for (let leg = 0; leg < 4; leg++) {
          ctx.beginPath();
          ctx.moveTo(side * 6, leg * 4 - 6);
          ctx.lineTo(side * (17 + leg * 2), leg * 5 - 13);
          ctx.stroke();
        }
      }
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.arc(0, 2, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 1, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe5f5';
      ctx.fillRect(-6, -3, 3, 3);
      ctx.fillRect(3, -3, 3, 3);
    } else if (enemy.kind === 'golem') {
      ctx.fillStyle = outline;
      ctx.fillRect(-16, -16, 32, 31);
      ctx.fillStyle = color;
      ctx.fillRect(-13, -13, 26, 25);
      ctx.fillStyle = '#e2b58a';
      ctx.fillRect(-10, -4, 6, 5);
      ctx.fillRect(4, -4, 6, 5);
      ctx.fillStyle = '#594b49';
      ctx.fillRect(-13, 6, 26, 5);
    } else if (enemy.kind === 'imp') {
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.moveTo(-13, -6);
      ctx.lineTo(-20, -20);
      ctx.lineTo(-7, -13);
      ctx.lineTo(0, -17);
      ctx.lineTo(7, -13);
      ctx.lineTo(20, -20);
      ctx.lineTo(13, -6);
      ctx.lineTo(12, 13);
      ctx.lineTo(-12, 13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 1, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff0a8';
      ctx.fillRect(-6, -3, 4, 3);
      ctx.fillRect(2, -3, 4, 3);
    } else {
      // Wraith: tapered cloak and bright spectral eyes.
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.quadraticCurveTo(15, -9, 13, 8);
      ctx.lineTo(18, 16);
      ctx.lineTo(8, 13);
      ctx.lineTo(0, 18);
      ctx.lineTo(-8, 13);
      ctx.lineTo(-18, 16);
      ctx.lineTo(-13, 8);
      ctx.quadraticCurveTo(-15, -9, 0, -16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.quadraticCurveTo(12, -7, 10, 8);
      ctx.lineTo(14, 12);
      ctx.lineTo(6, 10);
      ctx.lineTo(0, 14);
      ctx.lineTo(-6, 10);
      ctx.lineTo(-14, 12);
      ctx.lineTo(-10, 8);
      ctx.quadraticCurveTo(-12, -7, 0, -13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e5ffff';
      ctx.fillRect(-7, -3, 5, 3);
      ctx.fillRect(2, -3, 5, 3);
    }
    ctx.restore();
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
      this.drawEnemySprite(enemy);
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
      this.drawHeroSprite(player, color);
      ctx.globalAlpha = player.alive ? 1 : 0.4;
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
