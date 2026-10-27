import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSLTBDetails,SLTB_CROWN,SLTB_GRILLE} from '../src/sltb-details.js';
import {createSLTBInterior} from '../src/sltb-interior.js';
import {createPassengerDoor,FRONT_DOOR,REAR_DOOR} from '../src/bus-doors.js';
import {createPassengerGlazing} from '../src/bus-glazing.js';

test('SLTB has a physical open hazard triangle in front of the grille and a raised route crown',()=>{
  const details=createSLTBDetails();details.updateMatrixWorld(true);
  const warning=details.getObjectByName('SLTB reflector'),bounds=new THREE.Box3().setFromObject(warning);
  assert.ok(bounds.min.z>SLTB_GRILLE.z,'triangle sits on top of the black grille');
  assert.ok(bounds.max.y>SLTB_GRILLE.top,'apex reaches just above the grille top');
  const ray=new THREE.Raycaster(new THREE.Vector3(-.59,1.27,5),new THREE.Vector3(0,0,-1));
  assert.equal(ray.intersectObject(warning).length,0,'the triangle has a real open center');
  ray.set(new THREE.Vector3(-.59,1.53,5),new THREE.Vector3(0,0,-1));
  assert.ok(ray.intersectObject(warning).length>0,'the upper reflective frame is solid');
  assert.ok(SLTB_CROWN.y-SLTB_CROWN.height/2>2.60,'route banner stays above the windshield');
  const overall=new THREE.Box3().setFromObject(details);
  assert.ok(overall.max.y<3.1&&overall.min.z>-5.1&&overall.max.z<5.1);
});

test('both SLTB passenger doors have solid open leaves and unobstructed entrances',()=>{
  for(const [entrance,dimensions]of [['front',FRONT_DOOR],['rear',REAR_DOOR]]){
    const door=createPassengerDoor({modelId:'sltb',entrance,color:'#d51b24'});door.updateMatrixWorld(true);
    assert.equal(door.userData.state,'open');assert.equal(door.userData.stepCount,3);
    assert.equal(door.userData.entrance,entrance);
    const label=entrance==='front'?'Front':'Rear',metal=door.getObjectByName(`${label} door paint`);
    const ray=new THREE.Raycaster(new THREE.Vector3(1.25,1.8,dimensions.z),new THREE.Vector3(-1,0,0));
    assert.equal(ray.intersectObject(metal).length,0,'open leaves do not seal the passage');
    const pane=new THREE.Box3().setFromObject(door.getObjectByName(`${label} door glass`));
    assert.ok(pane.min.x>.35&&pane.max.x<dimensions.x,'leaves fold inside the vehicle');
  }
  const glazing=createPassengerGlazing({modelId:'sltb'});
  for(const pane of glazing.children.filter(mesh=>mesh.position.x>.9)){
    const bounds=new THREE.Box3().setFromObject(pane);
    for(const opening of [FRONT_DOOR,REAR_DOOR])assert.ok(bounds.max.z<opening.z-opening.width/2||bounds.min.z>opening.z+opening.width/2,'glazing leaves both entrances open');
  }
});

test('SLTB cabin leaves both vestibules clear and stays within the stock shell',()=>{
  const cabin=createSLTBInterior(),bounds=new THREE.Box3().setFromObject(cabin);
  assert.ok(bounds.min.x>-.98&&bounds.max.x<.98&&bounds.min.y>=1.05&&bounds.max.y<2.85);
  for(const key of ['upholstery','insert']){
    const positions=cabin.getObjectByName(`SLTB cabin ${key}`).geometry.attributes.position;
    for(let i=0;i<positions.count;i++)if(positions.getX(i)>.2)assert.ok(positions.getZ(i)>-3.05&&positions.getZ(i)<3.25,'seats stay out of both passenger vestibules');
  }
});
