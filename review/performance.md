# Performance pass — 24 October 2026

Three parallel agents reviewed startup/downloads, runtime/rendering, and
Cloudflare/server behavior. The initial pass left these changes local. The deployment
follow-up publishes them through the existing GitHub-to-Cloudflare build.

## Implemented

- Load the bus GLB and mural concurrently, with preload hints using the same
  fingerprinted URLs as the loaders. Remove the blocking Google Fonts CSS import.
- Fingerprint the GLB, mural and Sinhala font through Vite and cache `/assets/*`
  immutably for one year. HTML and unversioned assets continue to revalidate.
- Separate Three.js from app code to preserve the engine cache across app releases.
- Replace 48 cloud meshes with one instanced mesh. Share five decoration geometries
  across 45 terrain instance meshes and one ground material across nine tiles.
- Update tile membership only at tile boundaries; dispose evicted instance buffers.
- Reuse four camera vectors and remove redundant recursive bus matrix updates.
- Cache HUD references and avoid unchanged/hidden telemetry text writes.
- Serialize motion snapshots once per room broadcast instead of once per player.
- Add ETag/304 handling to the local server and serve HEAD without reading files.

## Validation

The production build succeeds. JavaScript totals about 183.4 KB gzip, including a
152.45 KB Three.js chunk and 30.99 KB app chunk. First-load JavaScript is essentially
unchanged; the split improves cache reuse on app-only releases.

All 44 tests passed at combined verification, including four new rendering/resource
regressions, a static cache regression, and actual local multiplayer socket tests. Browser verification of the
production build confirmed the detailed bus renders, driving updates the HUD, and
the driver camera works, with no browser console warnings or errors.

A Wrangler deployment dry-run could not start because the installed dependencies
lack the optional `@cloudflare/workerd-darwin-arm64` binary. No production changes
were made during that pass. This local macOS dependency issue does not block the
existing Linux Cloudflare build; the deployment follow-up uses that pipeline.

These are code/resource reductions, not measured FPS or internet load-time gains.
Chrome DevTools tracing was unavailable; no controlled mobile before/after timings
were captured.

The production model response inspected during this pass returned HTTP 200,
`CF-Cache-Status: HIT` and `Cache-Control: public, max-age=0, must-revalidate`.
Cloudflare edge caching already works; the added headers address browser reuse.
References: [Static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
and [Durable Object WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

## Remaining opportunities

The largest first-visit payloads remain the 5.90 MB GLB, 942 KB mural and 236 KB
Sinhala font. A visual-quality pass could reduce model texture resolution or add
mesh/texture compression; this requires loader and bus/cabin/lettering validation.

After deployment, verify asset Cache-Control and compression headers, then capture
cold and warm loads on a throttled mobile connection. Measure time to usable garage,
time until the detailed bus appears, driving frame times, and memory after several
kilometres with a full convoy. Paint metrics alone do not show game readiness.
