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

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const canvas = el<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);

let snapshot: Snapshot | null = null;
let selfId = '';
let roomCode = '';
let selectedClass: ClassId = 'warrior';
let started = false;

const classPicker = el('class-picker');
const selectClass = (option: HTMLElement): void => {
  const cls = option.dataset.class;
  if (cls !== 'warrior' && cls !== 'ranger' && cls !== 'mage') return;
  selectedClass = cls;
  classPicker.querySelectorAll<HTMLElement>('.class-option').forEach((other) => {
    const selected = other === option;
    other.classList.toggle('selected', selected);
    other.setAttribute('aria-pressed', String(selected));
  });
};

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
  onDrop: (itemId) => net.send({ type: 'drop', itemId }),
  onAcceptQuest: (questId) => net.send({ type: 'acceptQuest', questId }),
  onTurnInQuest: (questId) => net.send({ type: 'turnInQuest', questId }),
  onRestart: () => net.send({ type: 'restart' }),
  onDescend: () => net.send({ type: 'descend' }),
  onChoosePath: (path) => net.send({ type: 'choosePath', path }),
});

const input = new InputController(canvas, {
  onPotion: () => net.send({ type: 'potion' }),
  onDescend: () => net.send({ type: 'descend' }),
  onToggleGear: () => ui.toggleGear(),
  onToggleQuests: () => ui.toggleQuests(),
});

let installPrompt: InstallPromptEvent | null = null;
const installButton = el<HTMLButtonElement>('btn-install');
const installHelp = el<HTMLParagraphElement>('install-help');
if (window.matchMedia('(display-mode: standalone)').matches) installButton.classList.add('hidden');

window.addEventListener('beforeinstallprompt', (event: Event) => {
  event.preventDefault();
  installPrompt = event as InstallPromptEvent;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installButton.classList.add('hidden');
  installHelp.classList.add('hidden');
});

installButton.addEventListener('click', async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') installButton.classList.add('hidden');
    installPrompt = null;
    return;
  }

  installHelp.textContent = /iPad|iPhone|iPod/.test(navigator.userAgent)
    ? 'In Safari, tap Share, then Add to Home Screen.'
    : 'Open your browser menu and choose Install app or Add to Home screen.';
  installHelp.classList.toggle('hidden');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js').catch((error: unknown) => {
      console.error('Could not register the offline app shell:', error);
    });
  });
}

classPicker.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const option = target.closest<HTMLElement>('.class-option');
  if (option) selectClass(option);
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
