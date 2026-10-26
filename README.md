# ISSARAHATA YANNA

Full game name: **MADA PELIYA ISSARAHATA YANNA**.

ලංකාවේ හොඳම බස් simulator game eka

An original browser bus driving game. Procedural coast and highlands, bus liveries,
uploaded side skins, day/sunset/night, bus stops, and invite-code convoys for 2–8 drivers.
No Slow Roads code, assets, or extracted data is included.

## Play

Open the game, set your bus signs, and select **Let's take a drive**. Use **Invite friends**
to create a room. Send **Copy invite link** to friends; the link joins the same convoy.
Everyone then starts their own bus. Friends spawn side by side near the current convoy,
including when the first driver has already left the starting area.
Rooms exist while at least one participant remains.

Startup shows a white Libraries.dev `thinking-orbs` solving animation and
“Paint gaana gaman” on textured charcoal. It stays visible for at least three
seconds after painting and until the bus/artwork, fonts, sounds, shaders and
first game frame are ready. The React orb is unmounted before gameplay.

WASD/arrows drive; S/down brakes, then reverses. Space brakes, C cycles cameras,
R returns to the road, H honks when sound is enabled, and Escape opens the garage.
In Chase view, pinch to zoom and scroll with two fingers or click-drag to orbit.
Mac Three Finger Drag also orbits when enabled in Accessibility → Pointer Control
→ Trackpad Options. Double-click the world to restore the default chase view.
Touch controls appear on phones. Graphics quality can be reduced in the garage.
The bus engine starts when you click Drive, with idle, acceleration and gear changes.
Use the sound button to mute; your sound preference is remembered.

The garage’s **Rear panel message** supports Sinhala and English, including mixed text
on two lines (up to 80 characters). Messages are saved and shared with your convoy.
The bundled Noto Sans Sinhala font is licensed under the SIL Open Font License;
see `public/fonts/OFL.txt`.

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

The homepage includes English and Sinhala game information, canonical and social
metadata, and VideoGame structured data. Public discovery files are `/robots.txt`,
`/sitemap.xml`, and `/llms.txt`. Google Search Console domain ownership is verified
for `issarahatayanna.gay`; keep its Google verification TXT record in Cloudflare DNS.

The frontend and multiplayer backend are served by the `bus-club-rooms` Cloudflare Worker at
`https://issarahatayanna.gay` (also `www.issarahatayanna.gay`).
The fallback address is `https://bus-club-rooms.neuralshift-games.workers.dev`.
Cloudflare Web Analytics is enabled for the domain with automatic beacon injection.
Traffic/security analytics and Worker request logs are available in Cloudflare;
Worker log sampling is set to 100%.
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
between network updates. The production JS download is approximately 300 KB gzip, plus the bus asset.
Three.js and the React orb are separate cached chunks; app-only releases replace about 61 KB gzip
of application code. Model, mural, and Sinhala font sources live in `src/assets/`;
Vite fingerprints their output URLs. `public/_headers` enables one-year immutable
browser caching for `/assets/*` on Cloudflare. The model and mural fetch in parallel,
Google Fonts no longer block page CSS, and clouds use one instanced draw.
Terrain tiles share decoration geometry and release instance buffers when recycled.
See `review/performance.md` for validation and remaining opportunities.

This is a casual convoy prototype: driving uses client prediction with server-confirmed
bus collision corrections. Bus bodies separate and transfer momentum, with sideways
motion and yaw on glancing impacts. Trees are decorative, and the driver camera uses
a lightweight cockpit supplement. Room codes
are invite-only discovery rather than account authentication. Everyone shares the same
road geometry; scenery and lighting can be chosen individually.

## Bus model

Both selectable player and convoy vehicles use **Sri Lanka 3D Bus model** by
[lk motionfx](https://sketchfab.com/automaker), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
[Original model](https://sketchfab.com/3d-models/sri-lanka-3d-bus-model-4c5028233cee43efbe3ddb1a29445fa9).
See `public/models/ATTRIBUTION.md` for adaptations and credit details.

The GLB is served locally; gameplay does not require a Sketchfab login.
The model is adapted as **Nil Kirilli / Blue Chick 02**: blue airbrushed livery,
Sinhala signs, chrome grille, four round headlights, roof lamps, articulated gold
mirrors, rear lamp banks, ladder, spoiler and chrome rails. The cabin includes blue
2+2 seats, navy curtains, white valances, chrome racks, speakers and colored roof
lights. The local cockpit adds instruments, steering, gear lever and dashboard
cushions. Press **C** to cycle Chase → Driver → Scenic → Cabin.

Press Escape to open the existing garage panel. Two compact bus thumbnails beside
its scenery controls select **Nil Kirilli** or **Dam Rajina / S & S Group**. The
selection is saved in the browser and shared with convoy peers and late joiners.
Legacy profiles default to Nil Kirilli. Each variant has independently cached
materials, livery, fittings and cabin; both share the same dimensions and handling.
Dam Rajina has a magenta shell, pale sweeping artwork, S & S Group crowns, chrome
bullbar, LED rear lamp banks and a burgundy/cream cabin with decorated ceiling
lights. Its generated side mural reproduces the macaw, fine silver tribal scrolls
and floral pink airbrush style from enlarged real-bus photos. Both buses have
separate rear passenger doors, glazed leaves, latches, hinges and grab rails.
Dam Rajina uses a shorter closed rear door with no exposed steps; Nil Kirilli retains its steps;
body textures leave the entrances clear and seats stop before the vestibules. Nil Kirilli has corrected horizontal rear lamp banks and reflective ceiling
inlays. Driver name, destination and the rear message remain editable.
Front wheels steer with the driving angle, with corrected tire axes and damped steering to avoid wobble. Shared undercarriages include chassis rails, axles, differential, suspension and wheel housings. Dam Rajina uses AI-generated side and front macaw murals, full-length Purple Queen Voyage lettering, darkened passenger/rear glazing and a dark backing behind lowered windshield decals. Custom driver-name strips are hidden from the sides. Wheels roll while driving, and the classic procedural bus remains a fallback
if the GLB cannot load. The additional original mural texture is about 920 KB.

This is a reference-informed recreation, not an exact scan. Small mural details,
seat upholstery and hidden geometry are interpreted. See
`review/nil-kirilli-reference.md` for sources and limitations. With Vite running,
open `/review/model-preview.html` to select either bus and inspect orbit, front, side,
rear, driver and cabin views with a day/night toggle. See `review/bus-references.md`
for the Google Images sources and the limits of the reference recreations.
`review/dam-rajina-mural.md` records the mural prompt and rear entrance update.

## UI and handling

Controls use locally bundled [Iconoir](https://iconoir.com/) SVGs (MIT;
`src/icons/LICENSE`). Garage actions stay visible while scrolling, interactive
controls have larger targets, and dialogs isolate keyboard focus. Uploads work
with keyboard activation. Convoy connection actions wait for a server response.

The road uses two 3.5 m lanes and 0.4 m paved margins. The imported bus is scaled
uniformly to about 10.93 m long / 2.52 m wide; solo resets use the left lane,
and shared spawn logic places eight convoy members without overlapping.

The bus can reach 120 km/h under sustained throttle. A lower, closer chase camera
follows translation without falling behind at speed, with a smooth 52–63° field-of-view
change. Roadside scenery retains its actual world speed; there is no motion blur.
World-anchored asphalt grain and roadside posts every 10 m make nearby motion
readable at both town and highway speeds. Seat views widen gently from 68–72°,
and wind/road sound builds with speed even when coasting. The road uses a shared
64×64 mipmapped texture; denser posts retain the existing instanced draw count.

Handling includes power/mass-based acceleration, load-sensitive braking,
speed-sensitive steering assist and damped visual body roll. It is a casual game
approximation, without rollover or tire/suspension simulation. See
`review/bus-physics.md` for manufacturer references and assumed parameters,
and `review/ui-review.md` for the interface checks.

Physics runs at 120 fixed ticks per second, with bounded catch-up work. Steering
unwinds faster on release; damped acceleration squat and braking dive add weight
to the bus and seat cameras. Convoy collisions solve connected groups together,
suppress low-speed rebound, and smooth network corrections without replaying
duplicate impacts. Peer prediction is separate from snapshots and extrapolates
for at most 150 ms when updates stop. No extra rendering effects are required.

The inside camera sits on the model’s right-hand driver seat, follows its pitch and roll, and shows an added lightweight steering wheel/dashboard. Bus sounds use native WebAudio synthesis (load-sensitive diesel pulses, gears, turbo spool and intake, tire rumble, wind through 120 km/h, air-brake release and horn), not recorded samples; audio DSP suspends when muted or in the garage. New profiles default to pookie / 99.
