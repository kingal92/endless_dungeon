/**
 * Headless two-client smoke test. Both clients hold position and swing at whatever
 * walks into them, which exercises pathfinding, combat, loot, XP, quests and descending.
 * Usage: node scripts/smoke.mjs [url]
 */
import WebSocket from 'ws';

const url = process.argv[2] ?? 'ws://localhost:8080/ws';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

function client(name, cls) {
  const socket = new WebSocket(url);
  const state = { name, cls, socket, snapshot: null, code: '', id: '' };
  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type === 'joined') {
      state.code = message.code;
      state.id = message.playerId;
    } else if (message.type === 'snapshot') {
      state.snapshot = message.snapshot;
    } else if (message.type === 'error') {
      fail(`[${name}] ${message.message}`);
    }
  });
  state.open = new Promise((resolve) => socket.on('open', resolve));
  state.send = (message) => socket.send(JSON.stringify(message));
  state.self = () => state.snapshot?.players.find((player) => player.id === state.id);
  return state;
}

const a = client('Alpha', 'warrior');
await a.open;
a.send({ type: 'create', name: 'Alpha', cls: 'warrior' });
await wait(300);

const b = client('Bravo', 'ranger');
await b.open;
b.send({ type: 'join', code: a.code, name: 'Bravo', cls: 'ranger' });
await wait(300);

a.send({ type: 'ready', value: true });
b.send({ type: 'ready', value: true });
await wait(400);

if (!a.snapshot || a.snapshot.phase === 'lobby') fail('run did not start after both players readied up');
console.log(`floor ${a.snapshot.floor} "${a.snapshot.seedName}" with ${a.snapshot.enemies.length} enemies`);

const slayQuest = a.snapshot.questBoard.find((quest) => quest.kind === 'slay') ?? a.snapshot.questBoard[0];
a.send({ type: 'acceptQuest', questId: slayQuest.id });

// Hold the spawn room and fight whatever arrives.
for (let tick = 0; tick < 1600; tick++) {
  for (const player of [a, b]) {
    const self = player.self();
    const enemy = player.snapshot?.enemies
      .slice()
      .sort((one, two) => Math.hypot(one.x - self.x, one.y - self.y) - Math.hypot(two.x - self.x, two.y - self.y))[0];
    let aimX = 1;
    let aimY = 0;
    if (self && enemy) {
      const len = Math.hypot(enemy.x - self.x, enemy.y - self.y) || 1;
      aimX = (enemy.x - self.x) / len;
      aimY = (enemy.y - self.y) / len;
    }
    player.send({ type: 'input', input: { mx: 0, my: 0, aimX, aimY, attack: true, dash: false } });
  }
  if (tick % 200 === 0) a.send({ type: 'potion' });
  await wait(25);
}

const alpha = a.self();
const bravo = b.self();
for (const self of [alpha, bravo]) {
  console.log(
    `${self.name}: L${self.level} hp=${self.hp}/${self.maxHp} xp=${self.xp} gold=${self.gold} items=${self.inventory.length}`,
  );
}
console.log('enemies left', a.snapshot.enemies.length, 'phase', a.snapshot.phase);
console.log('log:', a.snapshot.log.slice(-3));

if (alpha.xp === 0 && alpha.level === 1 && bravo.xp === 0 && bravo.level === 1) fail('nobody gained any XP');
if (alpha.hp === alpha.maxHp && bravo.hp === bravo.maxHp) fail('enemies never reached the party');

const quest = alpha.quests[0];
if (!quest) fail('accepted quest never appeared on the player');
console.log(`quest "${quest.title}" progress ${quest.progress}/${quest.target}`);
if (quest.kind === 'slay' && quest.progress === 0) fail('slay quest progress was never tracked');
console.log('PASS');
process.exit(0);
