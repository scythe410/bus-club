import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRearPassengerDoor,REAR_DOOR,clearRearDoorAtlas,REAR_DOOR_UV,DAM_REJINA_REAR_DOOR} from '../src/bus-doors.js';
import {createNilKirilliInterior} from '../src/nil-kirilli-interior.js';
import {createDamRejinaInterior} from '../src/dam-rejina-interior.js';

test('rear entrances preserve the open blue stairwell and closed pink leaves behind the axle',()=>{
  for(const [modelId,color]of [['nil-kirilli','#0876dc'],['dam-rejina','#e32a9a']]){
    const door=createRearPassengerDoor({modelId,color}),bounds=new THREE.Box3().setFromObject(door);
    assert.equal(door.userData.leafCount,2);assert.equal(door.userData.state,modelId==='dam-rejina'?'closed':'open');
    assert.equal(door.userData.stepCount,modelId==='dam-rejina'?0:3);
    if(modelId==='dam-rejina'){
      assert.ok(door.userData.top<REAR_DOOR.top-.2,'pink bus rear door is shorter than the donor aperture');
      assert.equal(door.getObjectByName('Rear door step'),undefined,'closed pink bus has no exposed stairs');
      assert.ok(new THREE.Box3().setFromObject(door.getObjectByName('Rear door glass')).max.y<DAM_REJINA_REAR_DOOR.top);
    }else{
      const leaves=new THREE.Box3().setFromObject(door.getObjectByName('Rear door glass'));
      assert.ok(leaves.max.x<REAR_DOOR.x-.05,'folded leaves remain inside the body');
      const ray=new THREE.Raycaster();door.updateMatrixWorld(true);
      for(const z of [REAR_DOOR.z-.39,REAR_DOOR.z+.39]){
        ray.set(new THREE.Vector3(.80,.98,z+.08),new THREE.Vector3(0,0,-1));
        assert.ok(ray.intersectObject(door.getObjectByName('Rear door paint')).length>0,'both open leaves have solid lower metal panels');
      }
      for(const y of [.95,1.8,2.35]){
        ray.set(new THREE.Vector3(1.2,y,REAR_DOOR.z),new THREE.Vector3(-1,0,0));
        assert.equal(ray.intersectObject(door.getObjectByName('Rear door paint')).length,0,'complete leaves and stair cheeks leave the entrance open');
      }
    }
    assert.ok(bounds.min.x>.2&&bounds.max.x<1.15,'door and interior treads stay on the left side within the body envelope');
    assert.ok(bounds.max.z<-3&&bounds.min.z>-4.15,'rear entrance stays behind the rear axle');
    assert.ok(bounds.min.y>.3&&bounds.max.y<2.75);
    const glass=door.getObjectByName('Rear door glass');assert.ok(glass.material.transparent);assert.equal(glass.material.depthWrite,false);
    assert.equal(door.getObjectByName('Rear door paint').material.color.getHexString(),color.slice(1));
    let triangles=0;door.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
    assert.ok(triangles<2000,'doors stay inexpensive when repeated for eight players');
  }
});
test('body UV doorway cutout scales correctly at both atlas resolutions',()=>{
  for(const scale of [1,2]){
    const calls=[];clearRearDoorAtlas({clearRect(...args){calls.push(args);}},1024*scale,512*scale);
    assert.deepEqual(calls,[[REAR_DOOR_UV.x*scale,REAR_DOOR_UV.y*scale,REAR_DOOR_UV.width*scale,REAR_DOOR_UV.height*scale]]);
  }
});
test('neither recreated cabin puts seat upholstery into the rear passenger vestibule',()=>{
  for(const make of [createNilKirilliInterior,createDamRejinaInterior]){
    const cabin=make();
    cabin.traverse(mesh=>{
      if(!mesh.name.endsWith(' upholstery'))return;
      const position=mesh.geometry.attributes.position;
      for(let i=0;i<position.count;i++){
        const x=position.getX(i),z=position.getZ(i);
        assert.ok(!(x>.2&&z<REAR_DOOR.z+.44&&z>REAR_DOOR.z-.5),'seats must leave access from aisle to rear doors');
      }
    });
  }
});
