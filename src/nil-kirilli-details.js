import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Coordinates share the imported bus normalization: +Z is forward, length 9.8 m.
// Keep the ornament as geometry, so its silhouette also reads from the road camera.
export function createNilKirilliDetails({lowDetail = false} = {}) {
  const group = new THREE.Group();
  group.name = 'Nil Kirilli chrome and touring equipment';
  const materials = {
    chrome: new THREE.MeshStandardMaterial({ color: '#d8e8ef', metalness: .78, roughness: .2 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d4b36c', metalness: .75, roughness: .24 }),
    blue: new THREE.MeshStandardMaterial({ color: '#0876dc', metalness: .35, roughness: .28 }),
    black: new THREE.MeshStandardMaterial({ color: '#071725', roughness: .4 }),
    mirror: new THREE.MeshStandardMaterial({ color: '#9fcbdf', metalness: .85, roughness: .12 }),
    white: new THREE.MeshStandardMaterial({ color: '#fff5d9', emissive: '#f9e3b1', emissiveIntensity: .55, roughness: .25 }),
    amber: new THREE.MeshStandardMaterial({ color: '#ffc02b', emissive: '#ff8d0a', emissiveIntensity: .45, roughness: .28 }),
    red: new THREE.MeshStandardMaterial({ color: '#ef352d', emissive: '#db161b', emissiveIntensity: .4, roughness: .28 }),
    cyan: new THREE.MeshStandardMaterial({ color: '#6edfff', emissive: '#25a7ff', emissiveIntensity: .55, roughness: .25 }),
  };
  const batches = new Map();
  const add = (geometry, material, x, y, z, rotation) => {
    if (geometry.index) {
      const original = geometry;
      geometry = geometry.toNonIndexed();
      original.dispose();
    }
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(rotation || new THREE.Euler()),
      new THREE.Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(transform);
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(geometry);
  };
  const box = (w, h, d, mat, x, y, z, radius = .015) =>
    add(lowDetail ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 3, h / 3, d / 3)), mat, x, y, z);
  const cylinder = (r, depth, mat, x, y, z, rotation = new THREE.Euler(Math.PI / 2, 0, 0)) =>
    add(new THREE.CylinderGeometry(r, r, depth, lowDetail ? 8 : 20), mat, x, y, z, rotation);
  const ring = (r, tube, mat, x, y, z) =>
    add(new THREE.TorusGeometry(r, tube, lowDetail ? 3 : 6, lowDetail ? 10 : 24), mat, x, y, z);
  const rod = (points, radius, mat) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    add(new THREE.TubeGeometry(curve, Math.max(6, points.length * (lowDetail ? 2 : 5)), radius, lowDetail ? 4 : 7, false), mat, 0, 0, 0);
  };
  const { chrome, gold, blue, black, mirror, white, amber, red, cyan } = materials;

  // Deep, bright horizontal grille with a polished raised surround.
  box(.87, .57, .065, chrome, .05, 1.21, 4.575);
  box(.79, .5, .04, black, .05, 1.21, 4.618);
  for (let i = 0; i < 13; i++) box(.76, .018, .035, chrome, .05, .976 + i * .039, 4.649, .004);
  box(.025, .51, .03, chrome, .05, 1.21, 4.667, .005);
  box(1.93, .095, .08, chrome, .045, 1.505, 4.565);
  box(1.99, .028, .075, gold, .045, 1.445, 4.574);
  for (const x of [-.665, .765]) {
    box(.5, .27, .055, gold, x, .9, 4.57, .025);
    box(.48, .22, .025, black, x, .9, 4.608, .015);
    box(.43, .255, .04, chrome, x, 1.285, 4.576);
    box(.39, .22, .025, black, x, 1.285, 4.607);
    for (let i = 0; i < 7; i++) box(.38, .012, .024, chrome, x, 1.19 + i * .031, 4.628, .003);
  }
  // Four independently modeled round lenses; ribs make the glass legible at dusk.
  for (const x of [-.79, -.54, .64, .89]) {
    cylinder(.13, .075, black, x, .9, 4.58);
    ring(.113, .024, chrome, x, .9, 4.637);
    cylinder(.096, .018, white, x, .9, 4.65);
    for (const dx of [-.045, 0, .045]) box(.002, .155, .003, mirror, x + dx, .9, 4.663, .0008);
  }
  for (const x of [-.965, 1.065]) box(.09, .16, .055, amber, x, 1.15, 4.57);
  // Smooth blue stepped bumper, with rectangular mesh inserts either side of
  // the central gold nameplate. The reference has a painted bumper face.
  box(2.1, .135, .13, blue, .045, .66, 4.82);
  box(2.12, .29, .18, blue, .045, .48, 4.82, .05);
  box(2.08, .045, .15, blue, .045, .555, 4.82);
  box(.6, .165, .025, gold, .045, .47, 4.918);
  // Front bumper driving lamps and slim blue marker strip.
  for (const x of [-.84, .93]) {
    box(.22, .13, .035, chrome, x, .53, 4.904);
    box(.18, .09, .014, mirror, x, .53, 4.928);
  }
  for (let i = 0; i < 9; i++) box(.048, .018, .018, cyan, -.64 + i * .17, .627, 4.899, .004);

  // High touring destination pod with rolled chrome edges and blue sun visor.
  box(2.12, .31, .47, blue, .045, 2.87, 4.255, .07);
  box(1.99, .245, .055, chrome, .045, 2.87, 4.515, .035);
  box(1.87, .187, .025, black, .045, 2.87, 4.554, .025);
  box(2.2, .08, .42, chrome, .045, 2.681, 4.365, .025);
  box(2.19, .055, .45, blue, .045, 2.72, 4.365, .02);
  // Multiple roof spotlights are mounted above, not drawn into the paint.
  for (let i = 0; i < 4; i++) {
    const x = -.52 + i * .38;
    box(.265, .17, .14, chrome, x, 3.105, 4.24, .035);
    box(.22, .125, .018, white, x, 3.105, 4.322, .02);
    box(.045, .08, .08, black, x, 3.01, 4.24);
  }
  for (const x of [-.94, -.78, .87, 1.03]) {
    cylinder(.055, .065, chrome, x, 3.04, 4.24);
    cylinder(.042, .01, cyan, x, 3.04, 4.28);
  }
  // Side marker lamps travel down the roof line and read in profile views.
  for (const s of [-1, 1]) {
    rod([[s * .94, 2.84, 3.75], [s * .97, 2.87, .3], [s * .96, 2.83, -4.2]], .018, chrome);
    for (let i = 0; i < 11; i++) {
      const z = 3.65 - i * .74;
      box(.05, .045, .095, i === 10 ? amber : cyan, s * 1.009 + .04, 2.805, z, .012);
    }
  }

  // Long articulated mirror brackets, separate polished housing and glass.
  for (const s of [-1, 1]) {
    rod([[.045 + s * .91, 2.39, 4.27], [.045 + s * 1.2, 2.56, 4.37], [.045 + s * 1.46, 2.48, 4.57], [.045 + s * 1.46, 2.13, 4.62]], .026, gold);
    rod([[.045 + s * .94, 2.16, 4.24], [.045 + s * 1.22, 2.28, 4.45], [.045 + s * 1.43, 2.2, 4.59]], .017, chrome);
    box(.19, .47, .16, gold, .045 + s * 1.47, 2.08, 4.62, .06);
    box(.145, .39, .018, mirror, .045 + s * 1.47, 2.08, 4.526, .035);
    box(.17, .16, .13, chrome, .045 + s * 1.46, 1.73, 4.63, .035);
    box(.13, .11, .016, mirror, .045 + s * 1.46, 1.73, 4.552, .025);
    // Small chrome air horns behind the front light rack.
    add(new THREE.ConeGeometry(.095, .32, 16, 1, true), chrome, s * .77, 3.025, 3.8, new THREE.Euler(Math.PI / 2, 0, 0));
    cylinder(.095, .015, black, s * .77, 3.025, 3.968);
    rod([[s * .77, 2.88, 3.7], [s * .77, 3.02, 3.69]], .018, chrome);
  }
  // Bright central badge, intentionally geometry rather than a copied logo.
  ring(.065, .011, gold, .05, 1.505, 4.625);

  // Rear touring spoiler and narrow off-center polished access ladder.
  box(2.12, .105, .42, blue, .04, 2.96, -4.62, .035);
  box(2.15, .025, .44, chrome, .04, 2.91, -4.62, .01);
  for (const x of [-.82, .91]) box(.065, .2, .17, blue, x, 2.82, -4.57);
  for (const x of [-.67, -.96]) rod([[x, 1.35, -4.985], [x, 2.6, -4.985], [x, 2.91, -4.68]], .023, chrome);
  for (let i = 0; i < 8; i++) box(.31, .028, .045, chrome, -.815, 1.39 + i * .195, -4.99, .007);

  // The ND-4138 rear reference has two horizontal three-lamp banks beside
  // the registration, rather than the vertical lamp stacks of the donor bus.
  for (const x of [-.73, .82]) {
    box(.59, .205, .055, chrome, x, 1.22, -4.9, .025);
    for (let i = 0; i < 3; i++) {
      const lampX = x + (i - 1) * .185;
      box(.17, .17, .025, black, lampX, 1.22, -4.938, .015);
      box(.135, .13, .022, i === 0 ? amber : red, lampX, 1.22, -4.962, .01);
    }
  }
  box(.61, .205, .035, chrome, .045, 1.22, -4.91, .015);
  box(.55, .16, .02, gold, .045, 1.22, -4.938, .009);
  for (const y of [.46, .61]) box(2.11, .065, .12, chrome, .045, y, -4.925, .025);
  box(1.88, .27, .045, blue, .045, .205, -4.72, .02);
  box(1.85, .024, .053, chrome, .045, .095, -4.724, .007);
  // Repeated silver inlays give the wide blue mudflap its decorated lower edge.
  for (let i = 0; i < 13; i++) box(.075, .025, .012, chrome, -.79 + i * .139, .155, -4.75, .005);
  for (const s of [-1, 1]) {
    const x = .045 + s * 1.01;
    // Leave the mural and both portraits clear of horizontal waist trim.
    // Split skirt strips at the wheel arches instead of crossing the tires.
    for (const [z, length] of [[-3.78, 2.03], [.22, 4.16], [3.94, 1.36]]) {
      // The rear stair opening must remain clear even at its lowest threshold.
      if(s>0&&z<-3)continue;
      for (const y of [.36, .455]) box(.045, .035, length, chrome, x, y, z, .009);
    }
    // Bright side-window rails match the silver surrounds in the photographs.
    const glassSegments=s>0?[[.38,6.52],[-4.30,.28]]:[[-.37,8.08]];
    for(const [z,length]of glassSegments)for(const y of [1.65,2.48])box(.014,.014,length,chrome,x,y,z,.004);
    for(let i=0;i<10;i++){
      const z=3.65-i*.83;
      if(s>0&&z<-2.95&&z>-4.09)continue;
      box(.014,.81,.013,chrome,x,2.065,z,.004);
    }
  }

  for (const [material, geometries] of batches) {
    // Normalized non-indexed geometry keeps all primitive attribute layouts compatible.
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error('Could not batch Nil Kirilli equipment');
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `Nil Kirilli ${Object.keys(materials).find(key => materials[key] === material)}`;
    group.add(mesh);
    geometries.forEach(g => g.dispose());
  }
  return group;
}
