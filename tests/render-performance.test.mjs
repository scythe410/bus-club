import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {World} from '../src/world.js';
import {BusGame} from '../src/game.js';

const meshes = world => [...world.tiles.values()].flatMap(group => {
  const result=[];group.traverse(mesh=>{if(mesh.isMesh)result.push(mesh);});return result;
});

test('terrain shares decoration resources and releases instance buffers on tile eviction',()=>{
  const world=new World(new THREE.Scene());
  const decorations=meshes(world).filter(mesh=>mesh.isInstancedMesh);
  assert.equal(decorations.length,45);
  assert.equal(new Set(decorations.map(mesh=>mesh.geometry)).size,5);
  const grounds=meshes(world).filter(mesh=>mesh.material.vertexColors);
  assert.equal(new Set(grounds.map(mesh=>mesh.material)).size,1);
  let sharedDisposals=0,instanceDisposals=0,groundDisposals=0;
  for(const geometry of world.sharedGeometries)geometry.addEventListener('dispose',()=>sharedDisposals++);
  for(const mesh of decorations)mesh.addEventListener('dispose',()=>instanceDisposals++);
  for(const mesh of grounds)mesh.geometry.addEventListener('dispose',()=>groundDisposals++);
  world.update(1600);
  assert.equal(world.tiles.size,9);
  assert.equal(instanceDisposals,45,'evicted instance buffers must be released');
  assert.equal(groundDisposals,9,'evicted terrain remains owned by its tile');
  assert.equal(sharedDisposals,0,'active tiles still use the shared geometries');
  world.dispose();
  assert.equal(sharedDisposals,7,'shared geometry is released once, when the world ends');
});

test('same tile and environment preserve scenery; changing environment rebuilds at the current location',()=>{
  const world=new World(new THREE.Scene());
  const original=[...world.tiles.values()];
  world.update(100);world.setEnvironment('coast');world.update(120);
  assert.deepEqual([...world.tiles.values()],original);
  assert.equal(world.ocean.position.z,120);
  world.setEnvironment('highlands');world.update(120);
  assert.equal(world.tiles.size,9);
  assert.ok([...world.tiles.values()].every(tile=>!original.includes(tile)));
  assert.equal(world.ocean.visible,false);
  world.dispose();
});

test('clouds use one instanced draw with all original puff transforms',()=>{
  const game={scene:new THREE.Scene()};BusGame.prototype.makeClouds.call(game);
  assert.ok(game.clouds.isInstancedMesh);
  assert.equal(game.clouds.count,48);
  const transform=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
  for(let i=0;i<16;i++)for(let n=0;n<3;n++){
    game.clouds.getMatrixAt(i*3+n,transform);transform.decompose(position,rotation,scale);
    assert.ok(Math.abs(position.x-(Math.sin(i*2.4)*450+n*18))<.0001);
    assert.ok(Math.abs(position.y-(100+(i%4)*15+Math.sin(n)*2))<.0001);
    assert.equal(position.z,(i-3)*90);
    assert.deepEqual(scale.toArray(),[20+n*3,5+n*2,12]);
  }
  game.clouds.dispose();game.clouds.geometry.dispose();game.clouds.material.dispose();
});

test('all camera modes reuse targets and inside seats follow the bus transform',()=>{
  const previousRAF=globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame=()=>0;
  try{
    for(const mode of [0,1,2,3]){
      const group=new THREE.Group(),cockpit=new THREE.Group();
      cockpit.userData.wheel=new THREE.Object3D();group.add(cockpit);
      const scene=new THREE.Scene();scene.add(group);
      const game=Object.assign(Object.create(BusGame.prototype),{
        clock:{getDelta:()=>1/60},elapsed:0,started:true,paused:true,garage:false,
        z:400,x:30,yaw:.3,speed:0,steering:.1,bus:{group,cockpit,animate(){}},
        world:{update(){}},clouds:new THREE.Group(),sun:new THREE.DirectionalLight(),
        peers:new Map(),cameraMode:mode,camera:new THREE.PerspectiveCamera(),lookAt:new THREE.Vector3(),
        cameraForward:new THREE.Vector3(),cameraRight:new THREE.Vector3(),targetPosition:new THREE.Vector3(),targetLook:new THREE.Vector3(),
        renderer:{render(){}},telemetryTime:0,
      });
      const target=game.targetPosition;game.frame();
      assert.equal(game.targetPosition,target);
      assert.ok([...game.camera.position,...game.lookAt].every(Number.isFinite));
      if(mode===1||mode===3){
        const seat=mode===1?new THREE.Vector3(-.46,2.12,3.68):new THREE.Vector3(0,2.15,-4.18);
        assert.ok(game.camera.position.distanceTo(group.localToWorld(seat))<1e-9);
      }
    }
  }finally{globalThis.requestAnimationFrame=previousRAF;}
});
