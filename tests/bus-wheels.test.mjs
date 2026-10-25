import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mountBusWheel, animateBusWheels, prepareBusWheelGeometry } from '../src/bus-wheels.js';
import { stepVehicle } from '../src/vehicle-physics.js';

function axle(z) {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.3).rotateZ(Math.PI/2));
  return mountBusWheel(wheel, new THREE.Vector3(1,.5,z), .5);
}

test('front wheels follow actual assisted physics steering while all tires keep rolling', () => {
  const front = axle(3), rear = axle(-3), wheels = [front.children[0], rear.children[0]];
  const dynamics = stepVehicle({speed:20},{steer:1},.05);
  animateBusWheels(wheels,dynamics.speed,.05,dynamics.wheelAngle);
  assert.ok(Math.abs(front.rotation.y)<Math.abs(dynamics.wheelAngle),'steering damps sudden frame changes');
  assert.ok(front.rotation.y < 0, 'right input turns toward -X, like vehicle yaw');
  assert.equal(rear.rotation.y,0);
  assert.equal(wheels[0].rotation.x,dynamics.speed*.05/.5);
  assert.equal(wheels[1].rotation.x,wheels[0].rotation.x);
  assert.deepEqual(front.position.toArray(),[1,.5,3]);
  animateBusWheels(wheels,0,.05,-dynamics.wheelAngle);
  for(let i=0;i<60;i++)animateBusWheels(wheels,0,.05,-dynamics.wheelAngle);
  assert.ok(Math.abs(front.rotation.y+dynamics.wheelAngle)<1e-9);
  assert.equal(wheels[0].rotation.x,dynamics.speed*.05/.5,'steering at rest preserves roll');
  for(let i=0;i<60;i++)animateBusWheels(wheels,0,.05);
  assert.ok(Math.abs(front.rotation.y)<1e-9,'straightening input centers front wheels');
});

test('reverse travel reverses tire roll and cloned models steer independently', () => {
  const source = new THREE.Group();source.add(axle(3),axle(-3));
  const clone = source.clone(true), wheels = clone.children.map(mount=>mount.children[0]);
  animateBusWheels(wheels,-4,.25,.3);
  assert.ok(Math.abs(clone.children[0].rotation.y-.3*(1-Math.exp(-5)))<1e-12);
  assert.equal(clone.children[1].rotation.y,0);
  assert.equal(wheels[0].rotation.x,-2);
  assert.equal(source.children[0].rotation.y,0);
  assert.equal(source.children[0].children[0].rotation.x,0);
});

test('baked donor toe is removed so a complete tire revolution stays concentric', () => {
  const geometry=new THREE.CylinderGeometry(.5,.5,.3,32).rotateZ(Math.PI/2).rotateY(.045).translate(1,.6,3);
  const {position,radius}=prepareBusWheelGeometry(geometry);
  assert.ok(position.distanceTo(new THREE.Vector3(1,.6,3))<1e-6);
  assert.ok(Math.abs(radius-.5)<1e-6);
  for(let i=0;i<16;i++){
    const spinning=geometry.clone().rotateX(i*Math.PI/8);spinning.computeBoundingBox();
    const size=spinning.boundingBox.getSize(new THREE.Vector3()),center=spinning.boundingBox.getCenter(new THREE.Vector3());
    assert.ok(center.length()<1e-6,'tire center remains on axle');
    assert.ok(Math.abs(size.x-.3)<1e-6,'tire sidewall remains upright through its revolution');
    assert.ok(Math.abs(size.y-1)<1e-6&&Math.abs(size.z-1)<1e-6,'tread keeps the same radial envelope');
    spinning.dispose();
  }
  geometry.dispose();
});
