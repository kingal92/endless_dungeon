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

**Fly.io** (scales to zero, roughly $0–3/month for light traffic):

```bash
fly launch --copy-config --no-deploy
fly secrets set LICENSE_SECRET="$(openssl rand -hex 32)"   # only if you want the paywall
fly deploy
```

**Render**: point a new Blueprint at `render.yaml`. The Blueprint deploys with the paywall
disabled; to enable it, add `LICENSE_SECRET` as a secret environment variable in the Render
service's dashboard.

The server serves the client bundle and the WebSocket endpoint from the same origin and port, so no
CORS or separate CDN setup is needed. `/healthz` is the health probe.

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
