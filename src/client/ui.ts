import { Item, PlayerView, Quest, RARITY_COLOR, Snapshot, Stats } from '../shared/protocol.js';

export interface UiHooks {
  onEquip: (itemId: string) => void;
  onSell: (itemId: string) => void;
  onAcceptQuest: (questId: string) => void;
  onTurnInQuest: (questId: string) => void;
  onRestart: () => void;
  onDescend: () => void;
}

const el = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
};

function statLine(stats: Partial<Stats>): string {
  const parts: string[] = [];
  if (stats.power) parts.push(`+${stats.power} pow`);
  if (stats.armor) parts.push(`+${stats.armor} arm`);
  if (stats.maxHp) parts.push(`+${stats.maxHp} hp`);
  if (stats.speed) parts.push(`+${stats.speed} spd`);
  if (stats.crit) parts.push(`+${Math.round(stats.crit * 100)}% crit`);
  return parts.join(' · ') || 'no bonuses';
}

export class Ui {
  private gearOpen = false;
  private questsOpen = false;

  constructor(private hooks: UiHooks) {
    el('btn-gear').addEventListener('click', () => this.toggleGear());
    el('btn-quests').addEventListener('click', () => this.toggleQuests());
    document.querySelectorAll<HTMLElement>('[data-close]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.dataset.close;
        if (target === 'panel-gear') this.toggleGear(false);
        if (target === 'panel-quests') this.toggleQuests(false);
      });
    });
  }

  toggleGear(force?: boolean): void {
    this.gearOpen = force ?? !this.gearOpen;
    el('panel-gear').classList.toggle('hidden', !this.gearOpen);
  }

  toggleQuests(force?: boolean): void {
    this.questsOpen = force ?? !this.questsOpen;
    el('panel-quests').classList.toggle('hidden', !this.questsOpen);
  }

  update(snapshot: Snapshot, selfId: string, code: string): void {
    const self = snapshot.players.find((player) => player.id === selfId);
    el('floor-info').textContent = `Floor ${snapshot.floor} — ${snapshot.seedName}`;
    el('room-info').textContent = `Room ${code} · ${snapshot.players.length}/2`;

    el('party').innerHTML = snapshot.players
      .map((player) => {
        const hp = Math.max(0, (player.hp / player.maxHp) * 100);
        const xp = Math.min(100, (player.xp / player.xpToLevel) * 100);
        return `<div class="party-card">
          <div><strong>${player.name}</strong> · ${player.cls} L${player.level}${player.alive ? '' : ' · DOWN'}</div>
          <div class="bar hp"><div style="width:${hp}%"></div></div>
          <div class="bar xp"><div style="width:${xp}%"></div></div>
          <div class="stats">${player.hp}/${player.maxHp} hp · ${player.gold}g · ${player.potions} potion(s)</div>
        </div>`;
      })
      .join('');

    el('log').innerHTML = snapshot.log.map((line) => `<div>${line}</div>`).join('');

    const banner = el('banner');
    if (snapshot.phase === 'wiped') {
      banner.classList.remove('hidden');
      banner.innerHTML = '<div>The party has fallen</div><button id="btn-restart" type="button">Restart run</button>';
      el('btn-restart').addEventListener('click', this.hooks.onRestart, { once: true });
    } else if (snapshot.exit.open && self) {
      const near = Math.hypot(self.x - snapshot.exit.x, self.y - snapshot.exit.y) < 60;
      banner.classList.toggle('hidden', !near);
      if (near) {
        banner.innerHTML = '<div>Stairs down</div><button id="btn-descend" type="button">Descend (E)</button>';
        el('btn-descend').addEventListener('click', this.hooks.onDescend, { once: true });
      }
    } else {
      banner.classList.add('hidden');
    }

    if (self) {
      if (this.gearOpen) this.renderGear(self);
      if (this.questsOpen) this.renderQuests(self, snapshot.questBoard);
    }
  }

  private renderGear(self: PlayerView): void {
    const equipped = (['weapon', 'armor', 'trinket'] as const)
      .map((slot) => {
        const item = self.equipment[slot];
        return `<div class="item-row">
          <div>
            <div style="color:${item ? RARITY_COLOR[item.rarity] : '#666'}">${slot.toUpperCase()}: ${
              item ? item.name : 'empty'
            }</div>
            <div class="stats">${item ? statLine(item.stats) : '—'}</div>
          </div>
        </div>`;
      })
      .join('');
    el('gear-equipped').innerHTML =
      equipped +
      `<div class="item-row"><div><strong>Totals</strong><div class="stats">${statLine(self.stats)}</div></div></div>`;

    el('gear-inventory').innerHTML =
      self.inventory.map((item: Item) => this.itemRow(item)).join('') ||
      '<div class="item-row"><div class="stats">Backpack empty — go kill something.</div></div>';

    el('gear-inventory')
      .querySelectorAll<HTMLElement>('[data-equip]')
      .forEach((button) =>
        button.addEventListener('click', () => this.hooks.onEquip(String(button.dataset.equip)), { once: true }),
      );
    el('gear-inventory')
      .querySelectorAll<HTMLElement>('[data-sell]')
      .forEach((button) =>
        button.addEventListener('click', () => this.hooks.onSell(String(button.dataset.sell)), { once: true }),
      );
  }

  private itemRow(item: Item): string {
    return `<div class="item-row">
      <div>
        <div style="color:${RARITY_COLOR[item.rarity]}">${item.name} <span class="stats">(${item.slot} · ilvl ${
          item.level
        })</span></div>
        <div class="stats">${statLine(item.stats)} · worth ${item.value}g</div>
      </div>
      <div class="row-actions">
        <button data-equip="${item.id}" type="button">Equip</button>
        <button data-sell="${item.id}" type="button">Sell</button>
      </div>
    </div>`;
  }

  private renderQuests(self: PlayerView, board: Quest[]): void {
    const active = self.quests.filter((quest) => !quest.turnedIn);
    el('quest-active').innerHTML =
      active
        .map(
          (quest) => `<div class="quest-row">
            <div>
              <div>${quest.title}</div>
              <div class="meta">${quest.progress}/${quest.target} · ${quest.rewardGold}g · ${quest.rewardXp}xp</div>
            </div>
            <div class="row-actions">${
              quest.completed ? `<button data-turnin="${quest.id}" type="button">Claim</button>` : ''
            }</div>
          </div>`,
        )
        .join('') || '<div class="quest-row"><div class="meta">No active contracts.</div></div>';

    const taken = new Set(self.quests.map((quest) => quest.id));
    el('quest-board').innerHTML = board
      .map(
        (quest) => `<div class="quest-row">
          <div>
            <div>${quest.title}</div>
            <div class="meta">${quest.rewardGold}g · ${quest.rewardXp}xp · +1 item</div>
          </div>
          <div class="row-actions">${
            taken.has(quest.id) ? '<span class="meta">taken</span>' : `<button data-accept="${quest.id}" type="button">Accept</button>`
          }</div>
        </div>`,
      )
      .join('');

    el('quest-active')
      .querySelectorAll<HTMLElement>('[data-turnin]')
      .forEach((button) =>
        button.addEventListener('click', () => this.hooks.onTurnInQuest(String(button.dataset.turnin)), { once: true }),
      );
    el('quest-board')
      .querySelectorAll<HTMLElement>('[data-accept]')
      .forEach((button) =>
        button.addEventListener('click', () => this.hooks.onAcceptQuest(String(button.dataset.accept)), { once: true }),
      );
  }
}
