import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A small local-player cockpit supplement. The supplied exterior model includes
// a driver's chair and engine cover but omits the steering wheel and instruments.
// Coordinates match the imported bus's normalized 9.8 m length.
export function createCockpit() {
  const cockpit = new THREE.Group();
  cockpit.name = 'Driver cockpit';
  const trim = new THREE.MeshStandardMaterial({ color: '#222b29', roughness: .94 });
  const metal = new THREE.MeshStandardMaterial({ color: '#65716c', roughness: .62, metalness: .35 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#111917', roughness: .92 });

  const dashboardParts = [];
  const block = (w, h, d, x, y, z) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(x, y, z);
    dashboardParts.push(geometry);
  };
  block(1.04, .12, .32, -.46, 1.52, 4.24);
  block(.68, .22, .14, -.46, 1.68, 4.30);
  const dashboard = new THREE.Mesh(mergeGeometries(dashboardParts), trim);
  dashboardParts.forEach(geometry => geometry.dispose());
  cockpit.add(dashboard);

  // Static, texture-based gauges avoid extra meshes and per-frame canvas work.
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 112;
  const context = canvas.getContext('2d');
  context.fillStyle = '#18221f'; context.fillRect(0, 0, 384, 112);
  for (const [x, radius, needle] of [[110, 43, -.7], [270, 34, .35]]) {
    context.strokeStyle = '#c6c5a4'; context.lineWidth = 2;
    context.beginPath(); context.arc(x, 59, radius, 0, Math.PI * 2); context.stroke();
    for (let tick = 0; tick < 11; tick++) {
      const angle = Math.PI * (.75 + tick * .15);
      context.beginPath();
      context.moveTo(x + Math.cos(angle) * (radius - 6), 59 + Math.sin(angle) * (radius - 6));
      context.lineTo(x + Math.cos(angle) * (radius - 2), 59 + Math.sin(angle) * (radius - 2));
      context.stroke();
    }
    context.strokeStyle = '#c77450'; context.lineWidth = 3;
    context.beginPath(); context.moveTo(x, 59);
    context.lineTo(x + Math.sin(needle) * (radius - 10), 59 - Math.cos(needle) * (radius - 10)); context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const gaugeMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const gauges = new THREE.Mesh(new THREE.PlaneGeometry(.61, .178), gaugeMaterial);
  gauges.rotation.y = Math.PI; gauges.position.set(-.46, 1.68, 4.224);
  cockpit.add(gauges);

  const steeringMount = new THREE.Group();
  steeringMount.position.set(-.46, 1.73, 4.03);
  steeringMount.rotation.x = .52;
  const wheel = new THREE.Group();
  wheel.name = 'Steering wheel';
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.265, .021, 6, 32), rubber);
  wheel.add(rim);
  const spokes = [];
  for (let index = 0; index < 3; index++) {
    const geometry = new THREE.BoxGeometry(.024, .23, .018);
    geometry.translate(0, .12, 0); geometry.rotateZ(index * Math.PI * 2 / 3);
    spokes.push(geometry);
  }
  const hub = new THREE.CylinderGeometry(.064, .064, .038, 12);
  hub.rotateX(Math.PI / 2); spokes.push(hub);
  wheel.add(new THREE.Mesh(mergeGeometries(spokes), metal));
  spokes.forEach(geometry => geometry.dispose());
  steeringMount.add(wheel);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(.024, .034, .38, 8), trim);
  column.rotation.x = Math.PI / 2; column.position.z = .2;
  steeringMount.add(column);
  cockpit.add(steeringMount);
  cockpit.userData.wheel = wheel;
  cockpit.visible = false;
  return cockpit;
}

export function animateCockpit(cockpit, steering = 0) {
  // Positive steering is right; viewed from this seat +Z rotation is clockwise.
  cockpit.userData.wheel.rotation.z = THREE.MathUtils.clamp(steering, -1, 1) * 2.3;
}
