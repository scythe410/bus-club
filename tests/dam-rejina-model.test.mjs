import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createDamRejinaDetails} from '../src/dam-rejina-details.js';
import {createDamRejinaInterior} from '../src/dam-rejina-interior.js';
import {createNilKirilliInterior} from '../src/nil-kirilli-interior.js';

const triangleCount = group => {
  let count=0;group.traverse(mesh=>{if(mesh.isMesh)count+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;});return count;
};
test('Dam Rejina cabin stays inside the shared shell and convoy geometry budget',()=>{
  const cabin=createDamRejinaInterior(),bounds=new THREE.Box3().setFromObject(cabin);
  assert.ok(bounds.min.x> -1 && bounds.max.x<1);
  assert.ok(bounds.min.y>=1.05 && bounds.max.y<=2.85);
  assert.ok(triangleCount(cabin)<25000);
  assert.equal(cabin.getObjectByName('Dam Rejina cabin upholstery').material.color.getHexString(),'6b163b');
  assert.equal(cabin.getObjectByName('Dam Rejina cabin panel').material.color.getHexString(),'f1dba1');
});
test('Dam Rejina equipment fits the shared mirrors and bumpers envelope',()=>{
  const details=createDamRejinaDetails(),bounds=new THREE.Box3().setFromObject(details);
  assert.ok(bounds.min.x> -1.6 && bounds.max.x<1.65);
  assert.ok(bounds.min.z> -5.1 && bounds.max.z<5.1);
  assert.ok(bounds.max.y<3.25);
  assert.equal(details.getObjectByName('Dam Rejina white').material.userData.headlight,true);
});
test('model cabin materials are independent across variants and instances',()=>{
  const dam=createDamRejinaInterior(),other=createDamRejinaInterior(),nil=createNilKirilliInterior();
  const mat=dam.getObjectByName('Dam Rejina cabin upholstery').material;
  assert.notEqual(mat,other.getObjectByName('Dam Rejina cabin upholstery').material);
  mat.color.set('#000000');
  assert.equal(other.getObjectByName('Dam Rejina cabin upholstery').material.color.getHexString(),'6b163b');
  assert.notEqual(nil.getObjectByName('Nil Kirilli cabin upholstery').material.color.getHexString(),'000000');
});
