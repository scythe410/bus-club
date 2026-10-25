# Bus selection validation — 25 October 2026

The Escape garage has two 88 × 50 px bus images. Each is a render of its actual
playable model. The selected model is saved as skin.modelId and travels through
existing profile broadcasts, including late joins. Unknown and legacy model IDs
use Nil Kirilli. Both variants use identical scale, wheels and physics.

Dam Rajina has a separate material/livery/details/cabin template. The source GLB
is unchanged; no third-party game skins were downloaded. References and historical
variant limitations are listed in bus-references.md. The display spelling follows
the corrected Google search 'dam rajina bus'; the stable internal ID is dam-rejina.

Validation:
- npm test: 100 tests pass, including real WebSocket model ID propagation,
  late joins, out-of-order model loads, leaving before a load completes, geometry
  bounds and cabin budgets.
- npm run build: succeeds; Vite retains its existing Three.js chunk size warning.
- Browser: rapid selection changes, selection after reload, two loaded small
  thumbnails, driving and Escape return, desktop and 390 px mobile layout.
- Visual review: both bus exteriors, rear lighting, and Dam Rajina passenger cabin.
  Removed all three donor seat materials so original seat backs cannot overlap
  the recreated cabins. Checked both cached models for leftover donor back inserts.
- Local changes only; no deployment was performed.
