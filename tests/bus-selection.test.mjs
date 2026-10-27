import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Bus} from '../src/bus.js';
import {BUS_MODEL_IDS,normalizeBusModelId} from '../src/bus-catalog.js';

const panel=()=>new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial());
function harness(){
  const bus=Object.assign(Object.create(Bus.prototype),{
    group:new THREE.Group(),skin:{},sidePanels:[panel(),panel()],destination:panel(),
    rearPanel:{mesh:panel(),useImportedModel(){}},lampMaterial:{emissiveIntensity:.45},
    setSkin(){},
  });
  bus.group.add(...bus.sidePanels,bus.destination,bus.rearPanel.mesh);
  return bus;
}
function model(){
  const root=new THREE.Group();const wheel=panel();wheel.userData={wheel:true,radius:.5};root.add(wheel);return root;
}
test('saved legacy and unknown model IDs fall back to Nil Kirilli',()=>{
  assert.deepEqual(BUS_MODEL_IDS,['nil-kirilli','dam-rejina','sltb']);
  assert.equal(normalizeBusModelId('sltb'),'sltb');
  for(const value of [undefined,null,'','invalid','toString','__proto__'])assert.equal(normalizeBusModelId(value),'nil-kirilli');
});
test('rapid model switching discards stale downloads and preserves signs and transform',async()=>{
  const bus=harness(),oldModel=model(),selected=model();let release,disposed=0;
  oldModel.children[0].geometry.addEventListener('dispose',()=>disposed++);
  bus.group.position.set(4,5,6);bus.group.rotation.y=.8;
  const first=bus.loadModel('nil-kirilli',()=>new Promise(resolve=>release=resolve));
  assert.equal(await bus.loadModel('dam-rejina',async()=>selected),true);
  release(oldModel);assert.equal(await first,false);
  assert.equal(disposed,1);assert.equal(bus.importedModel,selected);assert.equal(bus.modelId,'dam-rejina');
  assert.equal(bus.wheels.length,1);assert.equal(bus.wheels[0].userData.radius,.5*10.934/9.8);
  assert.deepEqual(bus.group.position.toArray(),[4,5,6]);assert.equal(bus.group.rotation.y,.8);
  assert.ok(bus.sidePanels.every(p=>p.parent===bus.group));
  assert.equal(bus.rearPanel.mesh.parent,bus.group);
  bus.disposeModel(bus.group);
});
test('a model arriving after a player leaves is disposed instead of attached',async()=>{
  const bus=harness(),late=model();let disposed=0;
  late.children[0].geometry.addEventListener('dispose',()=>disposed++);
  bus.disposed=true;
  assert.equal(await bus.loadModel('dam-rejina',async()=>late),false);
  assert.equal(disposed,1);assert.equal(late.parent,null);
  bus.disposeModel(bus.group);
});
