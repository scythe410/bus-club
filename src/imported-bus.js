import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let template;
// Fetch and batch once for the whole convoy. Keep the author's textures shared.
export function loadBusModel() {
  return template ||= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/sri-lanka-bus.glb`).then(({ scene }) => {
    scene.rotation.y = Math.PI / 2; // The source faces -X; driving uses +Z.
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 9.8 / bounds.getSize(new THREE.Vector3()).z;
    const normalize = new THREE.Matrix4().makeScale(scale, scale, scale)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y + .025 / scale, -center.z));
    const group = new THREE.Group(), batches = new Map();
    scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry.clone().applyMatrix4(normalize.clone().multiply(mesh.matrixWorld));
      const mat = mesh.material;
      if (mesh.name.startsWith('object_rad_1')) {
        geometry.computeBoundingBox();
        const pivot = geometry.boundingBox.getCenter(new THREE.Vector3());
        geometry.translate(-pivot.x, -pivot.y, -pivot.z);
        const wheel = new THREE.Mesh(geometry, mat);
        wheel.position.copy(pivot); wheel.userData.wheel = true;
        wheel.userData.radius = geometry.boundingBox.getSize(new THREE.Vector3()).y / 2;
        group.add(wheel);
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
    return group;
  }).catch(error => { template = null; throw error; });
}

export async function createBusModel() {
  const source = await loadBusModel();
  const model = source.clone(true), materials = new Map();
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    if (!materials.has(mesh.material)) {
      const material = mesh.material.clone();
      material.userData.sharedTextures = true;
      // Metallic surfaces need a little diffuse response in the outdoor scene.
      material.metalness = Math.min(material.metalness, .65);
      material.roughness = Math.max(material.roughness, .25);
      materials.set(mesh.material, material);
    }
    mesh.material = materials.get(mesh.material);
    mesh.castShadow = true; mesh.receiveShadow = true;
  });
  return model;
}
