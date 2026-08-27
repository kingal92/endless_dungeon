import { ClientMessage, ServerMessage, Snapshot } from '../shared/protocol.js';

export interface NetHooks {
  onJoined: (code: string, playerId: string) => void;
  onSnapshot: (snapshot: Snapshot) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

export class Net {
  private socket: WebSocket | null = null;
  private queue: ClientMessage[] = [];

  constructor(private hooks: NetHooks) {}

  connect(): void {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws`);
    this.socket = socket;

    socket.addEventListener('open', () => {
      for (const message of this.queue) socket.send(JSON.stringify(message));
      this.queue = [];
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === 'joined') this.hooks.onJoined(message.code, message.playerId);
      else if (message.type === 'snapshot') this.hooks.onSnapshot(message.snapshot);
      else if (message.type === 'error') this.hooks.onError(message.message);
    });
    socket.addEventListener('close', () => this.hooks.onClose());
    socket.addEventListener('error', () => this.hooks.onError('Connection failed.'));
  }

  send(message: ClientMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    else this.queue.push(message);
  }
}
