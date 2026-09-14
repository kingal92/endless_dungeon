import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { ClientMessage, MAX_PLAYERS, ServerMessage, SNAPSHOT_HZ, TICK_HZ } from '../shared/protocol.js';
import { Game } from './game.js';
import { paywallEnabled, verifyKey } from './license.js';

const PORT = Number(process.env.PORT ?? 8080);
const ROOM_IDLE_MS = 5 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface Client {
  socket: WebSocket;
  playerId: string;
  roomCode: string;
  lastFloorKey: number;
}

interface Room {
  code: string;
  game: Game;
  clients: Set<Client>;
  emptySince: number | null;
}

const rooms = new Map<string, Room>();

function makeCode(): string {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sanitizeName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().slice(0, 14) : '';
  return name.length > 0 ? name.replace(/[^\w \-']/g, '') || 'Hero' : 'Hero';
}

const app = express();
const dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(dirname, '../../public');

app.use(express.static(publicDir, { maxAge: '1h', index: 'index.html' }));
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});
app.get('/config', (_req, res) => {
  res.json({ paywall: paywallEnabled });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (socket) => {
  let client: Client | null = null;

  socket.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      return;
    }

    if (!client) {
      if (message.type === 'create' || message.type === 'join') {
        if (!verifyKey(message.key)) {
          send(socket, { type: 'error', message: 'Invalid or missing purchase key.' });
          return;
        }
        const cls = message.cls === 'ranger' ? 'ranger' : 'warrior';
        const name = sanitizeName(message.name);
        let room: Room | undefined;

        if (message.type === 'create') {
          const code = makeCode();
          room = { code, game: new Game(Math.floor(Math.random() * 2 ** 31)), clients: new Set(), emptySince: null };
          rooms.set(code, room);
        } else {
          room = rooms.get(String(message.code ?? '').toUpperCase());
          if (!room) {
            send(socket, { type: 'error', message: 'No dungeon found with that code.' });
            return;
          }
          if (room.clients.size >= MAX_PLAYERS) {
            send(socket, { type: 'error', message: 'That dungeon already has two heroes.' });
            return;
          }
        }

        const playerId = `pl${Math.random().toString(36).slice(2, 9)}`;
        client = { socket, playerId, roomCode: room.code, lastFloorKey: -1 };
        room.clients.add(client);
        room.emptySince = null;
        room.game.addPlayer(playerId, name, cls);
        send(socket, { type: 'joined', code: room.code, playerId });
      }
      return;
    }

    const room = rooms.get(client.roomCode);
    if (!room) return;
    const { game } = room;
    const id = client.playerId;

    switch (message.type) {
      case 'input':
        game.setInput(id, message.input);
        break;
      case 'ready':
        game.setReady(id, Boolean(message.value));
        break;
      case 'equip':
        game.equip(id, String(message.itemId));
        break;
      case 'sell':
        game.sell(id, String(message.itemId));
        break;
      case 'potion':
        game.drinkPotion(id);
        break;
      case 'acceptQuest':
        game.acceptQuest(id, String(message.questId));
        break;
      case 'turnInQuest':
        game.turnInQuest(id, String(message.questId));
        break;
      case 'descend':
        game.descend(id);
        break;
      case 'restart':
        game.restart();
        break;
      default:
        break;
    }
  });

  socket.on('close', () => {
    if (!client) return;
    const room = rooms.get(client.roomCode);
    if (!room) return;
    room.clients.delete(client);
    room.game.removePlayer(client.playerId);
    if (room.clients.size === 0) room.emptySince = Date.now();
  });
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const room of rooms.values()) room.game.update(dt);
}, 1000 / TICK_HZ);

setInterval(() => {
  for (const room of rooms.values()) {
    const snapshot = room.game.snapshot();
    for (const client of room.clients) {
      const payload =
        client.lastFloorKey === snapshot.floorKey ? { ...snapshot, tiles: [] } : snapshot;
      client.lastFloorKey = snapshot.floorKey;
      send(client.socket, { type: 'snapshot', snapshot: payload });
    }
  }
}, 1000 / SNAPSHOT_HZ);

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.emptySince !== null && now - room.emptySince > ROOM_IDLE_MS) rooms.delete(code);
  }
}, 30_000);

httpServer.listen(PORT, () => {
  console.log(`Endless Dungeon server listening on :${PORT}`);
});
