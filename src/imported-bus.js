import * as THREE from 'three';
import { createNilKirilliSigns } from './nil-kirilli-livery.js';
import { createNilKirilliDetails } from './nil-kirilli-details.js';
import { createNilKirilliInterior } from './nil-kirilli-interior.js';
import { createDamRejinaSigns } from './dam-rejina-livery.js';
import { createDamRejinaDetails } from './dam-rejina-details.js';
import { createDamRejinaInterior } from './dam-rejina-interior.js';
import { createSLTBDetails } from './sltb-details.js';
import { createSLTBAtlas, createSLTBSigns } from './sltb-livery.js';
import { createSLTBInterior } from './sltb-interior.js';
import { createRearPassengerDoor, createPassengerDoor } from './bus-doors.js';
import { mountBusWheel, prepareBusWheelGeometry } from './bus-wheels.js';
import { createBusUndercarriage } from './bus-undercarriage.js';
import { createPassengerGlazing } from './bus-glazing.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { BUS_MODEL_IDS, normalizeBusModelId, getBusModelSpec } from './bus-catalog.js';
export { BUS_MODEL_IDS, normalizeBusModelId };
const templates = new Map();
const exteriors = new Map();
let donorModel;
// Let the browser paint between the larger model-building stages.
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));
function loadDonorModel() {
  donorModel ??= new GLTFLoader().loadAsync(busModelURL).catch(error => { donorModel = null; throw error; });
  return donorModel;
}
const busModelURL = new URL('./assets/sri-lanka-bus.glb', import.meta.url).href;
const muralURL = new URL('./assets/nil-kirilli-mural-v2.jpg', import.meta.url).href;
const nilFrontMuralURL = new URL('./assets/nil-kirilli-front-mural.jpg', import.meta.url).href;
const nilWindowDecalURL = new URL('./assets/nil-kirilli-window-decal.png', import.meta.url).href;
const damMuralURL = new URL('./assets/dam-rajina-mural-v2.jpg', import.meta.url).href;
const damFrontMuralURL = new URL('./assets/dam-rajina-front-mural.jpg', import.meta.url).href;
const nilAtlasURL = new URL('./assets/nil-kirilli-atlas.webp', import.meta.url).href;
const damAtlasURL = new URL('./assets/dam-rejina-atlas.webp', import.meta.url).href;
// Fetch and batch once for the whole convoy. Keep the author's textures shared.
function loadExterior(modelId = 'nil-kirilli') {
  modelId = normalizeBusModelId(modelId);
  if (exteriors.has(modelId)) return exteriors.get(modelId);
  const damRejina = modelId === 'dam-rejina';
  const sltb = modelId === 'sltb';
  const promise = Promise.all([
    loadDonorModel(),
    sltb ? Promise.resolve(null) : new THREE.ImageLoader().loadAsync(damRejina ? damMuralURL : muralURL),
    sltb ? Promise.resolve(null) : new THREE.ImageLoader().loadAsync(damRejina ? damFrontMuralURL : nilFrontMuralURL),
    damRejina || sltb ? Promise.resolve(null) : new THREE.ImageLoader().loadAsync(nilWindowDecalURL),
    sltb ? Promise.resolve(null) : new THREE.ImageLoader().loadAsync(damRejina ? damAtlasURL : nilAtlasURL),
  ]).then(async ([{ scene: donor }, artwork, frontArtwork, windowDecal, atlas]) => {
    await nextTask();
    // The donor's geometries/textures are immutable and reused by both variants.
    // Each variant owns its material edits; never dispose the donor geometries.
    const scene = donor.clone(true), variantMaterials = new Map();
    scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (!variantMaterials.has(mesh.material)) variantMaterials.set(mesh.material, mesh.material.clone());
      mesh.material = variantMaterials.get(mesh.material);
    });
    scene.rotation.y = Math.PI / 2; // The source faces -X; driving uses +Z.
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 9.8 / bounds.getSize(new THREE.Vector3()).z;
    const normalize = new THREE.Matrix4().makeScale(scale, scale, scale)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y + .025 / scale, -center.z));
    const group = new THREE.Group(), batches = new Map();
    group.name = getBusModelSpec(modelId).name;
    group.userData.modelId = modelId;
    const atlasMaterial = new Set();
    scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry.clone().applyMatrix4(normalize.clone().multiply(mesh.matrixWorld));
      const mat = mesh.material;
      if(sltb && mat.name!=='Material.008'){
        // The stock front replaces the donor's show-bus bumper accessories.
        const positions=geometry.attributes.position,indices=geometry.index,kept=[];
        for(let i=0;i<(indices?.count??positions.count);i+=3){
          const ids=[0,1,2].map(j=>indices?indices.getX(i+j):i+j);
          const replaced=ids.every(id=>positions.getZ(id)>4.50&&positions.getY(id)<1.70);
          if(!replaced)kept.push(...ids);
        }
        geometry.setIndex(kept);
      }
      // Replace the donor's unskinned rear door frames with complete open
      // leaves. Keep the independently modeled front entrance in place.
      if (!damRejina && mat.name === 'Material.009') {
        geometry.computeBoundingBox();
        const {min,max}=geometry.boundingBox;
        const rear=min.z > -4.1 && max.z < -3.1;
        const front=sltb && min.z > 3.1 && max.z < 4.5;
        if (min.x > .25 && max.x < 1.1 && (rear || front)) {
          geometry.dispose(); return;
        }
      }
      if (!damRejina && mat.name === 'Material.005') {
        // The original thick waist tubes also cross the mural and stairwell.
        // Remove their side spans while keeping the front and rear fittings.
        const positions = geometry.attributes.position, indices = geometry.index, kept = [];
        for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
          const ids = [0, 1, 2].map(j => indices ? indices.getX(i + j) : i + j);
          const side = ids.every(id => positions.getX(id) > .965) || ids.every(id => positions.getX(id) < -.89);
          const waist = ids.every(id => positions.getY(id) > 1.05 && positions.getY(id) < 1.18);
          if (!(side && waist)) kept.push(...ids);
        }
        geometry.setIndex(kept);
      }
      if (!damRejina && mat.name === 'Material_2.002') {
        // The donor's three dark projecting sun shields sit over this bus's
        // windshield sticker. Nil's reference has one slim blue visor instead.
        const positions = geometry.attributes.position, kept = [];
        const indices = geometry.index;
        for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
          const ids = [0, 1, 2].map(j => indices ? indices.getX(i + j) : i + j);
          const visor = ids.some(id => positions.getY(id) > 2.48 && positions.getY(id) < 2.66 && positions.getZ(id) > 4.45);
          if (!visor) kept.push(...ids);
        }
        geometry.setIndex(kept);
      }
      // The donor uses three materials for seats, including separate molded
      // back inserts (.002). Leaving any of them creates overlapping seat rows.
      if (['Material.002', 'Material.007', 'Material_1.002'].includes(mat.name)) { geometry.dispose(); return; }
      if (mat.name === 'Material.008' && !atlasMaterial.has(mat)) {
        // Fixed artwork is baked losslessly at asset-generation time. Avoid an
        // 8-million-pixel canvas readback/loop when another bus joins.
        mat.map = sltb ? createSLTBAtlas(mat.map.image) : new THREE.Texture(atlas); mat.map.flipY = false;
        mat.map.colorSpace = THREE.SRGBColorSpace; mat.map.anisotropy = 4;
        mat.map.needsUpdate = true;
        mat.metalnessMap = null; mat.roughnessMap = null;
        mat.metalness = .18; mat.roughness = .42;
        mat.alphaTest = .4; mat.needsUpdate = true; atlasMaterial.add(mat);
      }
      if (mat.name === 'Material.006') mat.color.set(sltb ? '#d51b24' : damRejina ? '#e32a9a' : '#0876dc');
      if (mat.name === 'Material.003') { mat.color.set('#b5deed'); mat.opacity = .16; mat.depthWrite = false; }
      if (mat.name === 'Material.001') { mat.color.set('#c3d8e3'); mat.metalness = .7; mat.roughness = .24; }
      if (mesh.name.startsWith('object_rad_1')) {
        const {position:pivot,radius} = prepareBusWheelGeometry(geometry);
        const wheel = new THREE.Mesh(geometry, mat);
        wheel.castShadow = true; wheel.receiveShadow = true;
        group.add(mountBusWheel(wheel, pivot, radius));
      } else {
        if (!batches.has(mat)) batches.set(mat, []);
        batches.get(mat).push(geometry);
      }
    });
    for (const [mat, geometries] of batches) {
      const geometry = mergeGeometries(geometries);
      if (!geometry) throw new Error('Bus geometry could not be combined');
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = !mat.transparent; mesh.receiveShadow = true;
      group.add(mesh);
      geometries.forEach(g => g.dispose());
    }
    await nextTask();
    group.add(createPassengerGlazing({modelId}));
    group.add(sltb ? createSLTBSigns() : damRejina ? createDamRejinaSigns(frontArtwork) : createNilKirilliSigns(artwork, frontArtwork, windowDecal));
    const doorColor=sltb?'#d51b24':damRejina?'#e32a9a':'#0876dc';
    group.add(createRearPassengerDoor({modelId,artwork,color:doorColor}));
    if(sltb)group.add(createPassengerDoor({modelId,color:doorColor,entrance:'front'}));
    return group;
  }).catch(error => { exteriors.delete(modelId); throw error; });
  exteriors.set(modelId, promise);
  return promise;
}

// Remote buses keep their recognizable exterior without repeating a passenger
// cabin. Coarser primitives preserve the fittings' silhouettes at road distance.
export function loadBusModel(modelId = 'nil-kirilli', {remote = false} = {}) {
  modelId = normalizeBusModelId(modelId);
  const key = `${modelId}:${remote ? 'peer' : 'local'}`;
  if (templates.has(key)) return templates.get(key);
  const promise = loadExterior(modelId).then(async exterior => {
    await nextTask();
    const group = exterior.clone(true);
    const details = modelId === 'sltb' ? createSLTBDetails({lowDetail: remote}) : modelId === 'dam-rejina'
      ? createDamRejinaDetails({lowDetail: remote})
      : createNilKirilliDetails({lowDetail: remote});
    details.userData.peerDetail = true;
    group.add(details);
    if (remote) group.traverse(mesh => {
      if (mesh.isMesh) { mesh.castShadow = false; mesh.receiveShadow = false; }
    });
    if (!remote) {
      await nextTask();
      group.add(createBusUndercarriage(group,{openPassengerDoors:modelId==='sltb'}));
      group.add(modelId === 'sltb' ? createSLTBInterior() : modelId === 'dam-rejina' ? createDamRejinaInterior() : createNilKirilliInterior());
    }
    return group;
  }).catch(error => { templates.delete(key); throw error; });
  templates.set(key, promise);
  return promise;
}

export function prewarmBusModels() {
  return Promise.all(BUS_MODEL_IDS.map(modelId => loadBusModel(modelId, {remote: true})));
}

export function cloneBusModel(source, {remote = false} = {}) {
  const model = source.clone(true), materials = new Map();
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    // Templates own immutable geometry/textures for the application lifetime.
    // Disposing one player must not invalidate any other player's buffers.
    mesh.userData.sharedGeometry = true;
    if (!materials.has(mesh.material)) {
      const material = mesh.material.clone();
      material.userData.sharedTextures = true;
      if ('metalness' in material) material.metalness = Math.min(material.metalness, .65);
      if ('roughness' in material) material.roughness = Math.max(material.roughness, .25);
      materials.set(mesh.material, material);
    }
    mesh.material = materials.get(mesh.material);
    if (remote) {
      mesh.castShadow = false; mesh.receiveShadow = false;
      if (['Blue passenger glass', 'Smoked passenger glass'].includes(mesh.material.name)) mesh.material.opacity = .72;
    }
    // Local meshes retain their builder's shadow exclusions (glass, LEDs/signs).
  });
  if (remote) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(2.03, 2.5, 9.2),
      new THREE.MeshBasicMaterial({colorWrite:false, depthWrite:false}));
    proxy.name = 'Convoy shadow proxy'; proxy.position.set(.04, 1.65, -.12);
    proxy.castShadow = true; proxy.userData.peerShadow = true;
    model.add(proxy);
  }
  return model;
}

export async function createBusModel(modelId = 'nil-kirilli', options = {}) {
  return cloneBusModel(await loadBusModel(modelId, options), options);
}
