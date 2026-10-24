import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createNilKirilliDetails} from '../src/nil-kirilli-details.js';
import {createNilKirilliInterior} from '../src/nil-kirilli-interior.js';
import {BusGame} from '../src/game.js';

test('detailed cabin stays inside the bus shell and within convoy geometry budget',()=>{
  const model=createNilKirilliInterior();const bounds=new THREE.Box3().setFromObject(model);
  assert.ok(bounds.min.x> -1 && bounds.max.x<1,'cabin must not protrude through side glass');
  assert.ok(bounds.min.y>=1.05 && bounds.max.y<=2.85,'cabin fits between floor and roof');
  let triangles=0;
  model.traverse(mesh=>{if(!mesh.isMesh)return;triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;});
  assert.ok(triangles<25000,'interior is repeated for every convoy vehicle');
});
test('touring equipment fits within expected vehicle ornament envelope',()=>{
  const bounds=new THREE.Box3().setFromObject(createNilKirilliDetails());
  assert.ok(bounds.min.x> -1.6 && bounds.max.x<1.65,'mirror brackets stay within expected width');
  assert.ok(bounds.min.z> -5.1 && bounds.max.z<5.1,'no ornament extends far beyond bumpers');
  assert.ok(bounds.max.y<3.25,'light bar remains close to the roof');
});
test('camera cycle includes passenger cabin and returns to chase',()=>{
  const game={cameraMode:0};
  assert.deepEqual(Array.from({length:4},()=>BusGame.prototype.setCamera.call(game)),['Driver','Scenic','Cabin','Chase']);
});
