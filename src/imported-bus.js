import * as THREE from 'three';
import { createNilKirilliAtlas, createNilKirilliSigns } from './nil-kirilli-livery.js';
import { createNilKirilliDetails } from './nil-kirilli-details.js';
import { createNilKirilliInterior } from './nil-kirilli-interior.js';
import { createDamRejinaAtlas, createDamRejinaSigns } from './dam-rejina-livery.js';
import { createDamRejinaDetails } from './dam-rejina-details.js';
import { createDamRejinaInterior } from './dam-rejina-interior.js';
import { createRearPassengerDoor } from './bus-doors.js';
import { mountBusWheel, prepareBusWheelGeometry } from './bus-wheels.js';
import { createBusUndercarriage } from './bus-undercarriage.js';
import { createPassengerGlazing } from './bus-glazing.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { BUS_MODEL_IDS, normalizeBusModelId } from './bus-catalog.js';
export { BUS_MODEL_IDS, normalizeBusModelId };
const templates = new Map();
const busModelURL = new URL('./assets/sri-lanka-bus.glb', import.meta.url).href;
const muralURL = new URL('./assets/nil-kirilli-mural.jpg', import.meta.url).href;
const damMuralURL = new URL('./assets/dam-rajina-mural-v2.jpg', import.meta.url).href;
const damFrontMuralURL = new URL('./assets/dam-rajina-front-mural.jpg', import.meta.url).href;
// Fetch and batch once for the whole convoy. Keep the author's textures shared.
export function loadBusModel(modelId = 'nil-kirilli') {
  modelId = normalizeBusModelId(modelId);
  if (templates.has(modelId)) return templates.get(modelId);
  const damRejina = modelId === 'dam-rejina';
  const promise = Promise.all([
    new GLTFLoader().loadAsync(busModelURL),
    new THREE.ImageLoader().loadAsync(damRejina ? damMuralURL : muralURL),
    damRejina ? new THREE.ImageLoader().loadAsync(damFrontMuralURL) : Promise.resolve(null),
  ]).then(([{ scene }, artwork, frontArtwork]) => {
    scene.rotation.y = Math.PI / 2; // The source faces -X; driving uses +Z.
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 9.8 / bounds.getSize(new THREE.Vector3()).z;
    const normalize = new THREE.Matrix4().makeScale(scale, scale, scale)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y + .025 / scale, -center.z));
    const group = new THREE.Group(), batches = new Map();
    group.name = damRejina ? 'Dam Rajina' : 'Nil Kirilli';
    group.userData.modelId = modelId;
    const atlasMaterial = new Set();
    scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry.clone().applyMatrix4(normalize.clone().multiply(mesh.matrixWorld));
      const mat = mesh.material;
      // The donor uses three materials for seats, including separate molded
      // back inserts (.002). Leaving any of them creates overlapping seat rows.
      if (['Material.002', 'Material.007', 'Material_1.002'].includes(mat.name)) { geometry.dispose(); return; }
      if (mat.name === 'Material.008' && !atlasMaterial.has(mat)) {
        mat.map = damRejina ? createDamRejinaAtlas(mat.map.image, artwork) : createNilKirilliAtlas(mat.map.image, artwork);
        mat.metalnessMap = null; mat.roughnessMap = null;
        mat.metalness = .18; mat.roughness = .42;
        mat.alphaTest = .4; mat.needsUpdate = true; atlasMaterial.add(mat);
      }
      if (mat.name === 'Material.006') mat.color.set(damRejina ? '#e32a9a' : '#0876dc');
      if (mat.name === 'Material.003') { mat.color.set('#b5deed'); mat.opacity = .16; mat.depthWrite = false; }
      if (mat.name === 'Material.001') { mat.color.set('#c3d8e3'); mat.metalness = .7; mat.roughness = .24; }
      if (mesh.name.startsWith('object_rad_1')) {
        const {position:pivot,radius} = prepareBusWheelGeometry(geometry);
        const wheel = new THREE.Mesh(geometry, mat);
        group.add(mountBusWheel(wheel, pivot, radius));
      } else {
        if (!batches.has(mat)) batches.set(mat, []);
        batches.get(mat).push(geometry);
      }
    });
    for (const [mat, geometries] of batches) {
      const geometry = mergeGeometries(geometries);
      if (!geometry) throw new Error('Bus geometry could not be combined');
      group.add(new THREE.Mesh(geometry, mat));
      geometries.forEach(g => g.dispose());
    }
    scene.traverse(mesh => { if (mesh.isMesh) mesh.geometry.dispose(); });
    group.add(createBusUndercarriage(group));
    if (damRejina) group.add(createPassengerGlazing());
    group.add(...(damRejina
      ? [createDamRejinaDetails(), createDamRejinaSigns(frontArtwork), createDamRejinaInterior()]
      : [createNilKirilliDetails(), createNilKirilliSigns(artwork), createNilKirilliInterior(artwork)]));
    group.add(createRearPassengerDoor({modelId,artwork,color:damRejina?'#e32a9a':'#0876dc'}));
    return group;
  }).catch(error => { templates.delete(modelId); throw error; });
  templates.set(modelId, promise);
  return promise;
}

export async function createBusModel(modelId = 'nil-kirilli') {
  const source = await loadBusModel(modelId);
  const model = source.clone(true), materials = new Map();
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    if (!materials.has(mesh.material)) {
      const material = mesh.material.clone();
      material.userData.sharedTextures = true;
      // Metallic surfaces need a little diffuse response in the outdoor scene.
      if ('metalness' in material) material.metalness = Math.min(material.metalness, .65);
      if ('roughness' in material) material.roughness = Math.max(material.roughness, .25);
      materials.set(mesh.material, material);
    }
    mesh.material = materials.get(mesh.material);
    mesh.castShadow = true; mesh.receiveShadow = true;
  });
  return model;
}
