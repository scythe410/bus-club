import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Standard public-service cabin. The references establish an undecorated bus;
// the hidden seating details and row count are a restrained reconstruction.
// Coordinates share the donor normalization: +Z front, floor 1.05, roof 2.85.
export function createSLTBInterior() {
  const group = new THREE.Group();
  group.name = 'SLTB standard passenger cabin';
  const materials = {
    upholstery: new THREE.MeshStandardMaterial({ color: '#49494a', roughness: .88 }),
    insert: new THREE.MeshStandardMaterial({ color: '#68615a', roughness: .9 }),
    floor: new THREE.MeshStandardMaterial({ color: '#262b2d', roughness: .96 }),
    cream: new THREE.MeshStandardMaterial({ color: '#dbd8c9', roughness: .85 }),
    panel: new THREE.MeshStandardMaterial({ color: '#b8bbba', roughness: .76 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#bdc6c8', roughness: .33, metalness: .64 }),
    light: new THREE.MeshStandardMaterial({ color: '#f1eee1', roughness: .5 }),
  };
  const batches = new Map();
  const add = (geometry, key, x, y, z, rotation = new THREE.Euler()) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1),
    ));
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(g);
  };
  const box = (w, h, d, key, x, y, z, round = false) => add(round
    ? new RoundedBoxGeometry(w, h, d, 1, .022)
    : new THREE.BoxGeometry(w, h, d), key, x, y, z);
  const rod = (start, end, radius = .013, key = 'chrome') => {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), delta = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 6);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    const middle = a.add(b).multiplyScalar(.5);
    add(geometry, key, middle.x, middle.y, middle.z);
  };

  // Modest paired vinyl seats, with an open center aisle and no decorative trim.
  for (let row = 0; row < 10; row++) {
    const z = 2.65 - row * .69;
    for (const side of [-1, 1]) {
      // The rear passenger entrance opens directly into this clear vestibule.
      if (side > 0 && z < -2.75) continue;
      const benchX = side * .59;
      box(.66, .105, .43, 'upholstery', benchX, 1.405, z, true);
      box(.66, .49, .085, 'upholstery', benchX, 1.69, z - .205, true);
      // Two restrained stitched back inserts read as a standard paired bench.
      for (const dx of [-.163, .163]) {
        box(.292, .32, .012, 'insert', benchX + dx, 1.70, z - .253);
      }
      for (const dx of [-.23, .23]) {
        rod([benchX + dx, 1.065, z - .10], [benchX + dx, 1.35, z - .10], .016, 'floor');
      }
      rod([benchX - .265, 1.97, z - .205], [benchX + .265, 1.97, z - .205], .014);
      rod([benchX - .265, 1.88, z - .205], [benchX - .265, 1.97, z - .205], .014);
      rod([benchX + .265, 1.88, z - .205], [benchX + .265, 1.97, z - .205], .014);
    }
  }

  // Only the center aisle is supplemented; neither doorway receives a floor
  // plane over its recessed steps. The donor supplies the remaining cabin floor.
  box(.46, .018, 7.75, 'floor', 0, 1.064, -.40);
  for (const side of [-1, 1]) {
    const wallSegments = side > 0 ? [[.10, 6.22], [-4.20, .22]] : [[-.30, 8.0]];
    for (const [z, length] of wallSegments) {
      box(.018, .39, length, 'panel', side * .951, 1.355, z);
      box(.019, .035, length, 'cream', side * .951, 1.565, z);
    }
  }
  box(1.86, .018, 8.02, 'cream', 0, 2.81, -.30);
  for (let i = 0; i < 9; i++) {
    const z = 3.12 - i * .85;
    box(1.82, .025, .022, 'panel', 0, 2.784, z);
    if (i % 3 === 1) {
      box(.28, .025, .15, 'panel', 0, 2.775, z + .22);
      box(.245, .012, .12, 'light', 0, 2.757, z + .22);
    }
  }
  // Plain overhead handrails and vertical stanchions follow the aisle edges.
  for (const side of [-1, 1]) {
    rod([side * .31, 2.54, -3.73], [side * .31, 2.54, 3.12], .018);
    for (const z of [-2.72, -.82, 1.08, 2.98]) {
      rod([side * .265, 1.065, z], [side * .265, 2.54, z], .017);
      rod([side * .265, 2.54, z], [side * .31, 2.54, z], .017);
    }
  }
  box(1.45, .16, .06, 'cream', 0, 2.68, 3.13);

  for (const [key, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (!geometry) throw new Error(`Could not batch SLTB cabin ${key}`);
    const mesh = new THREE.Mesh(geometry, materials[key]);
    mesh.name = `SLTB cabin ${key}`;
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
