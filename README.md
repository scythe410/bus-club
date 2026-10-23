# Bus Club

An original browser bus driving game. Procedural coast and highlands, bus liveries,
uploaded side skins, day/sunset/night, bus stops, and invite-code convoys for 2–8 drivers.
No Slow Roads code, assets, or extracted data is included.

## Play

Open the game, customize a bus, and select **Let's take a drive**. Use **Invite friends**
to create a room. Send **Copy invite link** to friends; the link joins the same convoy.
Everyone then starts their own bus. Friends spawn side by side near the current convoy,
including when the first driver has already left the starting area.
Rooms exist while at least one participant remains.

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
node tests/live-spawn.mjs
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
posts are instanced. Bus body meshes are merged by material. The Sri Lanka bus GLB adds a 5.9 MB asset download, cached and shared across convoy instances. Fog limits draw distance,
pixel ratio is capped, quality controls shadows/resolution, and remote buses interpolate
between network updates. The production JS download is approximately 172 KB gzip, plus the bus asset.

This is a casual convoy prototype: driving is client-authoritative, remote buses do not
collide, trees are decorative, and the driver camera uses a lightweight cockpit supplement. Room codes
are invite-only discovery rather than account authentication. Everyone shares the same
road geometry; scenery and lighting can be chosen individually.

## Bus model

The default player and convoy vehicle uses **Sri Lanka 3D Bus model** by
[lk motionfx](https://sketchfab.com/automaker), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
[Original model](https://sketchfab.com/3d-models/sri-lanka-3d-bus-model-4c5028233cee43efbe3ddb1a29445fa9).
See `public/models/ATTRIBUTION.md` for adaptations and credit details.

The GLB is served locally; gameplay does not require a Sketchfab login.
Its original body texture is retained. Color/pattern/upload controls customize
added side panels, Accent recolors the bumper, and destination text updates the
front sign. Other model parts are fixed. Wheels animate while driving, and the
classic procedural bus remains a fallback if the GLB cannot load.

## UI and handling

Controls use locally bundled [Iconoir](https://iconoir.com/) SVGs (MIT;
`src/icons/LICENSE`). Garage actions stay visible while scrolling, interactive
controls have larger targets, and dialogs isolate keyboard focus. Uploads work
with keyboard activation. Convoy connection actions wait for a server response.

The road uses two 3.5 m lanes and 0.4 m paved margins. The imported bus is scaled
uniformly to about 10.93 m long / 2.52 m wide; solo resets use the left lane,
and shared spawn logic places eight convoy members without overlapping.

Handling includes power/mass-based acceleration, load-sensitive braking,
speed-sensitive steering assist and damped visual body roll. It is a casual game
approximation, without rollover or tire/suspension simulation. See
`review/bus-physics.md` for manufacturer references and assumed parameters,
and `review/ui-review.md` for the interface checks.

The inside camera sits on the model’s right-hand driver seat, follows its pitch and roll, and shows an added lightweight steering wheel/dashboard. Bus sounds use native WebAudio synthesis (diesel pulses, gears/load, road noise, air-brake release and horn), not recorded samples; audio DSP suspends when muted or in the garage. New profiles default to pookie / 99.
