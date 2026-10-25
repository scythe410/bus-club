import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBusUndercarriage } from '../src/bus-undercarriage.js';
import { mountBusWheel } from '../src/bus-wheels.js';

test('chassis stays above the road and in the body envelope with batched geometry',()=>{
  const chassis=createBusUndercarriage(),bounds=new THREE.Box3().setFromObject(chassis);
  assert.ok(bounds.min.y>.20&&bounds.max.y<1.2);
  assert.ok(bounds.min.x>-1.1&&bounds.max.x<1.2);
  assert.ok(bounds.min.z>-4.5&&bounds.max.z<4.5);
  assert.equal(chassis.children.length,3);
  let triangles=0;chassis.traverse(o=>{if(o.isMesh)triangles+=o.geometry.attributes.position.count/3;});
  assert.ok(triangles<6000,'the convoy can reuse a modest undercarriage mesh');
  assert.equal(chassis.userData.axles.length,2);
  assert.equal(chassis.userData.wheelCovers.length,4);
});

test('housings and fixed axle beams follow supplied wheel mounts and leave tire clearance',()=>{
  const model=new THREE.Group();
  for(const z of [3,-2.4])for(const x of [-.9,.9]){
    const geometry=new THREE.CylinderGeometry(.45,.45,.25,12).rotateZ(Math.PI/2);
    model.add(mountBusWheel(new THREE.Mesh(geometry),new THREE.Vector3(x,.5,z),.45));
  }
  const chassis=createBusUndercarriage(model);
  for(const axle of chassis.userData.axles){
    assert.ok(axle.min>-.775&&axle.max<.775,'fixed axle stops before tire sidewalls');
    assert.equal(axle.y,.5);assert.ok([3,-2.4].includes(axle.z));
  }
  for(const cover of chassis.userData.wheelCovers){
    assert.ok(cover.radius>=.54,'liner clears tire radial envelope');
    assert.ok(Math.abs(Math.abs(cover.x)-.9)<1e-8);
    assert.ok(Math.abs(cover.depth-.275)<1e-8);
  }
});
