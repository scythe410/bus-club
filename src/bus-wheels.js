import * as THREE from 'three';

// The donor's tires have a few degrees of toe baked into their vertices.
// Recover their symmetry axis before spinning them; a bus-X rotation of that
// tilted geometry otherwise makes the tread wobble once every revolution.
export function prepareBusWheelGeometry(geometry) {
  const points = [], unique = new Set(), positions = geometry.attributes.position;
  const center = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(positions, i);
    const key = point.toArray().map(value => Math.round(value * 100000)).join(',');
    if (unique.has(key)) continue;
    unique.add(key); points.push(point); center.add(point);
  }
  center.multiplyScalar(1 / points.length);
  let xx=0, xy=0, xz=0, yy=0, yz=0, zz=0;
  for (const point of points) {
    point.sub(center);
    xx+=point.x*point.x; xy+=point.x*point.y; xz+=point.x*point.z;
    yy+=point.y*point.y; yz+=point.y*point.z; zz+=point.z*point.z;
  }
  // For a tire the smallest covariance eigenvector follows its short axle.
  // Power iteration of trace(C)I-C finds that axis without an eigensolver.
  const axle = new THREE.Vector3(1,0,0);
  for (let i=0; i<48; i++) {
    const {x,y,z}=axle;
    axle.set((yy+zz)*x-xy*y-xz*z, -xy*x+(xx+zz)*y-yz*z, -xz*x-yz*y+(xx+yy)*z).normalize();
  }
  if (axle.x < 0) axle.negate();
  geometry.translate(-center.x,-center.y,-center.z);
  const alignment=new THREE.Quaternion().setFromUnitVectors(axle,new THREE.Vector3(1,0,0));
  geometry.applyQuaternion(alignment);
  geometry.computeBoundingBox();
  // Center the radial bounds as well, independent of hub depth and UV seams.
  const radialCenter=geometry.boundingBox.getCenter(new THREE.Vector3());radialCenter.x=0;
  geometry.translate(0,-radialCenter.y,-radialCenter.z);
  center.add(radialCenter.applyQuaternion(alignment.clone().invert()));
  const size=geometry.boundingBox.getSize(new THREE.Vector3());
  return {position:center,radius:(size.y+size.z)/4};
}

// Separate steering about the upright from rolling about the axle. Keep only
// plain metadata so cloned convoy buses retain their own independent mounts.
export function mountBusWheel(wheel, position, radius, front = position.z > 0) {
  const mount = new THREE.Group();
  mount.name = front ? 'Front wheel steering pivot' : 'Rear wheel axle';
  mount.position.copy(position);
  mount.userData.frontWheel = front;
  wheel.position.set(0, 0, 0);
  wheel.userData.wheel = true;
  wheel.userData.radius = radius;
  mount.add(wheel);
  return mount;
}

export function animateBusWheels(wheels, speed, dt, wheelAngle = 0) {
  for (const wheel of wheels) {
    const mount = wheel.parent;
    if (typeof mount?.userData.frontWheel === 'boolean') {
      const target=mount.userData.frontWheel ? wheelAngle : 0;
      mount.rotation.y += (target-mount.rotation.y)*(1-Math.exp(-20*Math.max(0,dt)));
    }
    wheel.rotation.x += speed * dt / (wheel.userData.radius || .6);
  }
}
