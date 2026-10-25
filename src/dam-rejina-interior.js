import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Reference photographs show burgundy upholstery with pale headrests, decorated
// LED ceiling panels and pale speaker surrounds. Seat count and row spacing are
// interpreted to fit the shared shell; photos do not establish exact dimensions.
// Same normalized shell coordinates: +Z front, floor 1.05, roof 2.85.
export function createDamRejinaInterior() {
  const group = new THREE.Group();
  group.name = 'Dam Rejina burgundy touring cabin';
  const materials = {
    upholstery: new THREE.MeshStandardMaterial({ color: '#6b163b', roughness: .82 }),
    panel: new THREE.MeshStandardMaterial({ color: '#f1dba1', roughness: .7 }),
    pattern: new THREE.MeshStandardMaterial({ color: '#efd8ad', roughness: .74 }),
    navy: new THREE.MeshStandardMaterial({ color: '#4d1434', roughness: .9 }),
    white: new THREE.MeshStandardMaterial({ color: '#faebda', roughness: .75 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#a2c6da', metalness: .72, roughness: .22 }),
    dark: new THREE.MeshStandardMaterial({ color: '#111c2b', roughness: .8 }),
    gold: new THREE.MeshStandardMaterial({ color: '#e2b76f', metalness: .45, roughness: .45 }),
    blueLed: new THREE.MeshBasicMaterial({ color: '#43aaff' }),
    greenLed: new THREE.MeshBasicMaterial({ color: '#53ffc9' }),
    pinkLed: new THREE.MeshBasicMaterial({ color: '#f070e8' }),
    whiteLed: new THREE.MeshBasicMaterial({ color: '#e5f7ff' }),
  };
  materials.seatPrint = new THREE.MeshStandardMaterial({ color: '#f3dfa9', roughness: .8 });
  const batches = new Map();
  function add(geometry, key, x, y, z, rotation = new THREE.Euler()) {
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    if (geometry !== nonIndexed) geometry.dispose();
    nonIndexed.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1),
    ));
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(nonIndexed);
  }
  // Keep soft edges on seat silhouettes; small fittings use 12-triangle boxes.
  const box = (w, h, d, key, x, y, z, r = .012) =>
    add(key === 'upholstery'
      ? new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 3, h / 3, d / 3))
      : new THREE.BoxGeometry(w, h, d), key, x, y, z);
  const rod = (a, b, radius = .015, key = 'chrome') => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 6);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    const middle = start.add(end).multiplyScalar(.5);
    add(geometry, key, middle.x, middle.y, middle.z);
  };
  // Compact forward-facing 2+2 rows leave the aisle and front vestibule clear.
  for (let row = 0; row < 10; row++) {
    const z = 2.40 - row * .68;
    for (const x of [-.775, -.405, .405, .775]) {
      if(x>0&&z<=-3)continue; // Rear passenger vestibule must stay clear.
      box(.33, .115, .45, 'upholstery', x, 1.43, z, .035);
      box(.33, .62, .10, 'upholstery', x, 1.79, z - .22, .04);
      box(.30, .20, .112, 'panel', x, 2.02, z - .22, .035);
      // Pale vertical piping frames the burgundy backs and center insert.
      for (const dx of [-.145,.145]) box(.009,.45,.009,'pattern',x+dx,1.79,z-.278);
      box(.115, .34, .012, 'seatPrint', x, 1.78, z - .282, .014);
      for (const dx of [-.105, .105]) rod([x + dx, 1.10, z - .12], [x + dx, 1.39, z - .12], .014, 'dark');
      // Chrome grab handle on the top edge of each seat back.
      rod([x - .105, 2.13, z - .22], [x + .105, 2.13, z - .22], .011);
    }
    for (const s of [-1, 1]) {
      if(s>0&&z<=-3)continue;
      rod([s * .23, 1.42, z - .10], [s * .23, 1.64, z - .10], .012);
      box(.035, .035, .29, 'dark', s * .23, 1.65, z, .012);
    }
  }
  box(.43, .018, 7.8, 'dark', 0, 1.071, -.5, .004);
  for (const x of [-.226, .226]) box(.012, .012, 7.8, 'chrome', x, 1.083, -.5, .003);

  // Gathered wine-colored curtains sit at window edges rather than covering the view.
  for (const s of [-1, 1]) {
    for (let window = 0; window < 9; window++) {
      const z = 2.50 - window * .79;
      for (let fold = 0; fold < 4; fold++) {
        box(.035, .69 - (fold % 2) * .035, .035, 'navy',
          s * (.947 - (fold % 2) * .014), 2.17, z + fold * .032, .009);
      }
      box(.045, .055, .13, 'gold', s * .924, 2.05, z + .05, .008);
      for (let scallop = 0; scallop < 5; scallop++) {
        box(.045, .085 + (scallop % 2) * .035, .11, 'white',
          s * .938, 2.505, z - .12 - scallop * .12, .035);
      }
    }
    // Reflective luggage rack with repeated round inset fascia ornaments.
    box(.27, .035, 7.65, 'chrome', s * .78, 2.55, -.48);
    box(.035, .13, 7.65, 'navy', s * .64, 2.61, -.48);
    for (let ring = 0; ring < 36; ring++) {
      add(new THREE.TorusGeometry(.038, .006, 3, 8), 'white', s * .618, 2.61,
        3.18 - ring * .21, new THREE.Euler(0, Math.PI / 2, 0));
    }
    for (let segment = 0; segment < 12; segment++) {
      const z = 3.05 - segment * .62;
      box(.02, .018, .53, segment % 3 === 0 ? 'greenLed' : segment % 3 === 1 ? 'pinkLed' : 'blueLed',
        s * .62, 2.53, z, .004);
    }
    rod([s * .39, 2.65, 2.80], [s * .39, 2.65, -4.25], .018);
    for (const z of [2.7, 1.3, -.1, -1.5, -2.9, -4.15]) {
      rod([s * .39, 2.65, z], [s * .39, 2.81, z], .012);
    }
  }
  // Low roof liner, center light panels and transverse chrome ribs.
  box(1.84, .018, 7.7, 'panel', 0, 2.814, -.48);
  for (let i = 0; i < 9; i++) {
    const z = 2.85 - i * .82;
    // Nested ceiling light frames seen in the photographed decorated cabin.
    box(.56, .014, .54, 'navy', 0, 2.794, z, .018);
    for (const [width, depth, key] of [[.55,.53,'whiteLed'],[.43,.41,'pinkLed'],[.31,.29,'blueLed']]) {
      for (const x of [-width/2,width/2]) box(.012,.014,depth,key,x,2.778,z);
      for (const dz of [-depth/2,depth/2]) box(width,.014,.012,key,0,2.778,z+dz);
    }
    box(.18,.014,.16,'gold',0,2.772,z);
    box(1.78, .025, .023, 'chrome', 0, 2.78, z - .30, .005);
    for (const x of [-.23, .23]) box(.018, .015, .60, 'blueLed', x, 2.79, z, .004);
  }
  // Five circular speaker cones on the front overhead bulkhead, facing aft.
  box(1.36, .30, .10, 'white', 0, 2.59, 2.92);
  for (const x of [-.48, -.24, 0, .24, .48]) {
    add(new THREE.CylinderGeometry(.083, .083, .025, 12), 'dark', x, 2.59, 2.851,
      new THREE.Euler(Math.PI / 2, 0, 0));
    add(new THREE.TorusGeometry(.079, .011, 3, 12), 'gold', x, 2.59, 2.833);
    add(new THREE.CylinderGeometry(.047, .047, .03, 10), 'dark', x, 2.59, 2.822,
      new THREE.Euler(Math.PI / 2, 0, 0));
  }
  for (const s of [-1, 1]) {
    rod([s * .27, 1.08, 2.90], [s * .27, 2.68, 2.90], .019);
    rod([s * .27, 2.68, 2.90], [s * .39, 2.68, 2.65], .019);
  }
  for (const [key, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error(`Could not batch cabin ${key}`);
    const mesh = new THREE.Mesh(geometry, materials[key]);
    mesh.name = `Dam Rejina cabin ${key}`;
    mesh.castShadow = !key.endsWith('Led');
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
  }
  return group;
}
