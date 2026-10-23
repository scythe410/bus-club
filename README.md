# Bus Club

An original browser bus driving game. Procedural coast and highlands, bus liveries,
uploaded side skins, day/sunset/night, bus stops, and invite-code convoys for 2–8 drivers.
No Slow Roads code, assets, or extracted data is included.

## Play

Open the game, customize a bus, and select **Let's take a drive**. Use **Invite friends**
to create a room. Send **Copy invite link** to friends; the link joins the same convoy.
Everyone then starts their own bus. Rooms exist while at least one participant remains.

WASD/arrows drive; S/down brakes, then reverses. Space brakes, C cycles cameras,
R returns to the road, H honks when sound is enabled, and Escape opens the garage.
Touch controls appear on phones. Graphics quality can be reduced in the garage.
The bus engine starts when you click Drive, with idle, acceleration and gear changes.
Use the music-note button to mute; your sound preference is remembered.

## Develop

Requires Node.js 22+.

```sh
npm ci
npm start       # local static + WebSocket server :8787
# In a second terminal:
npm run dev    # Vite :5173; /ws proxies to :8787
```

`npm run build` generates `dist/`. Local `npm start` serves it without Vite.
Production builds use same-origin WebSockets on Cloudflare. Override
`VITE_WS_URL` at build time to use a different server.

```sh
npm test
node tests/live-smoke.mjs
# Optional custom endpoint:
node tests/live-smoke.mjs wss://example.com/ws
```

The opt-in live test opens three actual WebSocket clients, verifies late-join PNG skins,
positions, profile edits, host departure and room cleanup, then disconnects every client.

## Hosting

The frontend and multiplayer backend are served by the `bus-club-rooms` Cloudflare Worker at
`https://bus-club-rooms.neuralshift-games.workers.dev`.
`worker/index.js` exports `BusRoom`; bind `BUS_ROOM` to that class and create a SQLite
Durable Object migration (`new_sqlite_classes: ["BusRoom"]`, tag `v1`).
The committed Wrangler configuration includes the built `dist/` static assets.
Run `npm run deploy` to build and deploy with an authenticated Cloudflare CLI.
Cloudflare Workers Builds is connected to `scythe410/bus-club`. Pushes to `main`
automatically run `npm test && npm run build`, then `npx wrangler deploy` from the
repository root. Other branches do not deploy to production.
Each room has its own Durable Object. WebSockets use hibernation; motion snapshots are
batched, skins are only resent when profiles change, and SQL profile data is cleared
when the last participant leaves. There are no game accounts or persistent cloud saves.
Skin customization is saved on the current browser, including compressed uploaded images.

## Performance and current scope

Terrain is deterministic and bounded to nine recycled tiles. Trees, rocks and roadside
posts are instanced. Bus body meshes are merged by material. Fog limits draw distance,
pixel ratio is capped, quality controls shadows/resolution, and remote buses interpolate
between network updates. The production JS download is approximately 138 KB gzip.

This is a casual convoy prototype: driving is client-authoritative, remote buses do not
collide, trees are decorative, and the driver camera has no detailed interior. Room codes
are invite-only discovery rather than account authentication. Everyone shares the same
road geometry; scenery and lighting can be chosen individually.
