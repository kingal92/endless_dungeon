# Endless Dungeon — 2-Player Online Co-op Crawler

An endless, procedurally generated dungeon crawler for two players over the network. Runs in any
modern browser: keyboard + mouse on PC, virtual stick + buttons on mobile. The Node server is
authoritative (movement, combat, loot, XP, quests all resolve server-side), so the two clients stay
in sync and the game can't be trivially cheated from the browser console.

## Features

- **Online co-op for 2** — one player creates a dungeon and shares a 4-character room code.
- **Endless floors** — every floor is procedurally generated rooms + corridors with a fresh name.
- **Loot** — randomized weapons/armor/trinkets across 5 rarities, scaling with floor depth; equip,
  compare and sell for gold.
- **XP and levels** — kills and quests grant XP; each level raises power, armor, HP and speed.
- **Bosses** — every 5th floor is sealed until the boss dies; bosses fire volleys, charge, and drop
  guaranteed loot.
- **Quests** — a rotating quest board each floor (slay / loot / descend / boss hunt) with gold, XP
  and item rewards.
- **Co-op mechanics** — downed players can be revived by their partner; if both go down the run ends
  and can be restarted.
- **Purchase keys** — optional built-in paywall so you can sell the game for $5 (see below).

## Play locally

```bash
npm install
npm run build
npm start           # http://localhost:8080
```

Open the page in two browser windows (or a phone on the same network): create a dungeon in the
first, join with the code in the second, both press **Ready up**.

Dev mode with rebuild-on-save: `npm run dev`.

### Install on a phone

Deploy the game to a public HTTPS address, then open that address on the phone. On Android,
tap **Install app** in the game or choose **Install app / Add to Home screen** in the browser menu.
On iPhone or iPad, open the link in Safari, tap **Share**, then **Add to Home Screen**. The installed
app still needs an internet connection to play.

### Play together from different networks

Both players must open the same public HTTPS deployment; the game uses that host for its WebSocket
connection automatically. One player creates a dungeon and sends the four-character room code to
the other player. Localhost addresses only work on the computer running the server and cannot be
used by a friend on another network. Keep the deployment to one server instance; active rooms are
stored in that server's memory.

### Controls

| Action | PC | Mobile |
| --- | --- | --- |
| Move | WASD / arrows | left stick |
| Aim | mouse | movement direction |
| Attack | left click / Space | Attack button |
| Dash | Shift | Dash button |
| Potion | Q | Potion button |
| Descend | E (on the stairs) | on-screen prompt |
| Gear / Quests | I / J | Gear / Quests buttons |

## Deploy

Any host that can run a Docker container with WebSockets works. Two ready-made configs:

**Fly.io** (paid hosting; not recommended if you need a free always-on server):

```bash
fly launch --copy-config --no-deploy
fly secrets set LICENSE_SECRET="$(openssl rand -hex 32)"   # only if you want the paywall
fly deploy --ha=false
```

Keep `--ha=false` on redeploys: active rooms live in one server's memory and aren't shared between
multiple machines.

**Render free tier**: connect the repository in Render and create a Blueprint from `render.yaml`;
choose the Free plan when prompted. Keep the service to one instance because active rooms are held
in memory. Free services can sleep after 15 minutes without inbound traffic and may restart, so the
game sends a keepalive while a player is connected. Room progress is lost if the server restarts or
both players disconnect long enough for it to sleep. Render includes up to 750 free service hours
per workspace each month. Add `LICENSE_SECRET` in the dashboard only if you want to enable the
optional paywall.

The server serves the client bundle and WebSocket endpoint from the same origin and port, so both
players use one URL and no separate WebSocket address is needed. Use the public HTTPS URL returned
by the host after deployment; `/healthz` is the health probe. The app shell is cached for quick
launches, but joining or creating a dungeon requires the server to be reachable.

## Selling it for $5

The paywall is off by default. Turn it on by setting `LICENSE_SECRET` on the server; the menu then
asks for a purchase key and the server rejects connections without a valid one.

1. Set `LICENSE_SECRET` to a long random string on your host.
2. Sell on a store that supports digital delivery (itch.io, Gumroad, Ko-fi, Lemon Squeezy) at $5.
3. Mint keys with the same secret and deliver one per sale:

   ```bash
   LICENSE_SECRET=<same secret> node scripts/genkeys.mjs 25
   ```

Keys are HMAC-signed serials (`EDG-<serial>-<signature>`) verified offline — no database, no user
accounts. Every connecting client is checked, so both players in a party need a key. The client
remembers the key in `localStorage`.

Notes on store choice: itch.io takes an optional revenue share you set yourself and supports
"paid download / paid access" pages that can simply link to your hosted URL plus a key; Gumroad and
Lemon Squeezy can auto-deliver a key file per sale. Steam requires a $100 app fee and a build, so it
only makes sense after the web version sells.

## Project layout

```
src/shared/protocol.ts   wire types shared by client and server
src/server/              authoritative simulation (game loop, dungeon gen, loot, quests, rooms)
src/client/              canvas renderer, input, HUD/inventory/quest UI, networking
public/                  static shell (index.html, styles.css) + built bundle.js
scripts/smoke.mjs        headless two-client integration smoke test
scripts/genkeys.mjs      purchase-key minting
```

## Tests and checks

```bash
npm run lint
npm run typecheck
npm start & node scripts/smoke.mjs     # headless two-client run
```
