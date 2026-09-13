import { ClassId, Snapshot } from '../shared/protocol.js';
import { InputController } from './input.js';
import { Net } from './net.js';
import { Renderer } from './render.js';
import { Ui } from './ui.js';

const el = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
};

const canvas = el<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);

let snapshot: Snapshot | null = null;
let selfId = '';
let roomCode = '';
let selectedClass: ClassId = 'warrior';
let started = false;

const net = new Net({
  onJoined: (code, playerId) => {
    roomCode = code;
    selfId = playerId;
    el('menu').classList.add('hidden');
    el('lobby').classList.remove('hidden');
    el('lobby-code').textContent = code;
  },
  onSnapshot: (next) => {
    snapshot = next;
    if (!started && next.phase !== 'lobby') {
      started = true;
      el('lobby').classList.add('hidden');
      el('hud').classList.remove('hidden');
      if (input.isTouch) el('touch').classList.remove('hidden');
    }
    if (!started) {
      el('lobby-players').innerHTML = next.players
        .map((player) => `<div class="item-row"><div>${player.name} · ${player.cls}</div><div class="meta">${
          player.ready ? 'READY' : 'waiting…'
        }</div></div>`)
        .join('');
    }
  },
  onError: (message) => {
    el('menu-error').textContent = message;
  },
  onClose: () => {
    el('menu-error').textContent = 'Disconnected from the dungeon.';
  },
});

const ui = new Ui({
  onEquip: (itemId) => net.send({ type: 'equip', itemId }),
  onSell: (itemId) => net.send({ type: 'sell', itemId }),
  onAcceptQuest: (questId) => net.send({ type: 'acceptQuest', questId }),
  onTurnInQuest: (questId) => net.send({ type: 'turnInQuest', questId }),
  onRestart: () => net.send({ type: 'restart' }),
  onDescend: () => net.send({ type: 'descend' }),
});

const input = new InputController(canvas, {
  onPotion: () => net.send({ type: 'potion' }),
  onDescend: () => net.send({ type: 'descend' }),
  onToggleGear: () => ui.toggleGear(),
  onToggleQuests: () => ui.toggleQuests(),
});

document.querySelectorAll<HTMLElement>('.class-option').forEach((option) => {
  option.addEventListener('click', () => {
    document.querySelectorAll('.class-option').forEach((other) => other.classList.remove('selected'));
    option.classList.add('selected');
    selectedClass = option.dataset.class === 'ranger' ? 'ranger' : 'warrior';
  });
});

const heroName = (): string => el<HTMLInputElement>('input-name').value.trim() || 'Hero';

const KEY_STORAGE = 'endless-dungeon.key';
const purchaseKey = (): string | undefined => {
  const key = el<HTMLInputElement>('input-key').value.trim();
  if (key) localStorage.setItem(KEY_STORAGE, key);
  return key || undefined;
};

void fetch('/config')
  .then((response) => response.json() as Promise<{ paywall: boolean }>)
  .then(({ paywall }) => {
    if (!paywall) return;
    el('key-row').classList.remove('hidden');
    el<HTMLInputElement>('input-key').value = localStorage.getItem(KEY_STORAGE) ?? '';
  })
  .catch(() => undefined);

el('btn-create').addEventListener('click', () => {
  net.connect();
  net.send({ type: 'create', name: heroName(), cls: selectedClass, key: purchaseKey() });
});

el('btn-join').addEventListener('click', () => {
  const code = el<HTMLInputElement>('input-code').value.trim().toUpperCase();
  if (code.length !== 4) {
    el('menu-error').textContent = 'Enter the 4-letter dungeon code.';
    return;
  }
  net.connect();
  net.send({ type: 'join', code, name: heroName(), cls: selectedClass, key: purchaseKey() });
});

let ready = false;
el('btn-ready').addEventListener('click', () => {
  ready = !ready;
  el('btn-ready').textContent = ready ? 'Waiting for party…' : 'Ready up';
  net.send({ type: 'ready', value: ready });
});

setInterval(() => {
  if (!snapshot || !started) return;
  const self = snapshot.players.find((player) => player.id === selfId);
  let aim = { x: 0, y: 0 };
  if (self && input.usingMouseAim) {
    const mouse = input.mousePosition;
    const world = renderer.screenToWorld(mouse.x, mouse.y, self);
    const dx = world.x - self.x;
    const dy = world.y - self.y;
    const len = Math.hypot(dx, dy) || 1;
    aim = { x: dx / len, y: dy / len };
  }
  net.send({ type: 'input', input: input.state(aim) });
}, 1000 / 30);

function frame(): void {
  if (snapshot && started) {
    renderer.draw(snapshot, selfId);
    ui.update(snapshot, selfId, roomCode);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
