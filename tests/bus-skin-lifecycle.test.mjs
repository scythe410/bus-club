import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Bus} from '../src/bus.js';

const panel=()=>new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial());
function harness(){
  const bus=Object.assign(Object.create(Bus.prototype),{
    group:new THREE.Group(),skin:{modelId:'nil-kirilli',name:'Driver',destination:'99',pattern:'stripe',image:null},
    sidePanels:[panel(),panel()],destination:panel(),bodyMaterial:new THREE.MeshStandardMaterial(),
    accentMaterial:new THREE.MeshStandardMaterial(),lampMaterial:new THREE.MeshStandardMaterial(),
    rearPanel:{mesh:panel(),setSkin(){},useImportedModel(){},dispose(){}},
  });
  bus.sidePanels[0].position.x=-1;bus.sidePanels[1].position.x=1;
  bus.group.add(...bus.sidePanels,bus.destination,bus.rearPanel.mesh);
  return bus;
}
async function withBrowser(run){
  const previousDocument=globalThis.document,previousLoad=THREE.TextureLoader.prototype.load;
  const canvases=[],requests=[];
  globalThis.document={createElement(type){
    assert.equal(type,'canvas');
    const canvas={width:300,height:150,draws:0};
    const context=new Proxy({}, {get:(_object,key)=>key==='fillText'?()=>canvas.draws++:()=>{}});
    canvas.getContext=()=>context;canvases.push(canvas);return canvas;
  }};
  THREE.TextureLoader.prototype.load=function(source,onLoad,_progress,onError){requests.push({source,onLoad,onError});return new THREE.Texture();};
  try{await run({canvases,requests});}
  finally{globalThis.document=previousDocument;THREE.TextureLoader.prototype.load=previousLoad;}
}

test('rear-only and identical edits preserve textures; hidden side panels allocate no canvas',async()=>withBrowser(async({canvases})=>{
  const bus=harness();bus.setSkin({});
  const sign=bus.destination.material.map,version=sign.version;let disposals=0;
  sign.addEventListener('dispose',()=>disposals++);
  assert.equal(canvases.length,1,'only the visible destination needs a canvas');
  assert.ok(bus.sidePanels.every(p=>!p.visible&&p.material.map===null));
  bus.setSkin({});bus.setSkin({rearText:'New rear message'});bus.setSkin({name:'Another driver'});
  assert.equal(canvases.length,1);assert.equal(sign.version,version);assert.equal(disposals,0);
  bus.setSkin({destination:'120'});
  assert.equal(bus.destination.material.map,sign,'sign edits reuse its canvas and GPU texture');
  assert.equal(canvases.length,1);assert.ok(sign.version>version);assert.equal(disposals,0);
  bus.dispose();assert.equal(disposals,1);
}));

test('superseded image failures cannot cancel a newer pending or loaded upload',async()=>withBrowser(async({requests})=>{
  const bus=harness();bus.setSkin({image:'A'});const first=bus.skinReady;
  bus.setSkin({image:'B'});const second=bus.skinReady;
  requests[0].onError(new Error('Older revision expired'));
  assert.equal(bus.loadedImage,'B');assert.equal(await first,true);
  const image=new THREE.Texture();requests[1].onLoad(image);
  assert.equal(await second,true);assert.equal(bus.uploadedTexture,image);
  assert.ok(bus.sidePanels.every(p=>p.material.map===image));
  // An older error delivered after the latest image loaded must also be harmless.
  requests[0].onError(new Error('Late older error'));
  assert.equal(bus.loadedImage,'B');assert.equal(bus.uploadedTexture,image);
  bus.dispose();
}));

test('pending artwork reuses fallback and stale successes release their texture',async()=>withBrowser(async({canvases,requests})=>{
  const bus=harness();bus.setSkin({image:'A'});
  const fallback=bus.sidePanels[0].material.map,sign=bus.destination.material.map;
  const version=fallback.version;let fallbackDisposals=0,imageDisposals=0;
  fallback.addEventListener('dispose',()=>fallbackDisposals++);
  bus.setSkin({rearText:'Rear only'});bus.setSkin({});
  assert.equal(requests.length,1);assert.equal(canvases.length,2);assert.equal(fallback.version,version);
  bus.setSkin({name:'New name'});
  assert.equal(bus.sidePanels[0].material.map,fallback);assert.ok(fallback.version>version);assert.equal(canvases.length,2);
  bus.setSkin({image:'B'});
  const stale=new THREE.Texture();stale.addEventListener('dispose',()=>imageDisposals++);
  requests[0].onLoad(stale);assert.equal(imageDisposals,1);
  assert.equal(bus.sidePanels[0].material.map,fallback);assert.equal(fallbackDisposals,0);
  const current=new THREE.Texture();current.addEventListener('dispose',()=>imageDisposals++);
  requests[1].onLoad(current);await bus.skinReady;
  assert.equal(fallbackDisposals,1);assert.equal(bus.sideTexture,null);
  bus.setSkin({rearText:'Another message'});bus.setSkin({name:'Latest name'});
  assert.equal(canvases.length,2,'loaded artwork requires no replacement fallback');
  assert.equal(bus.destination.material.map,sign);assert.equal(requests.length,2);
  bus.setSkin({image:null});assert.equal(imageDisposals,2);
  assert.ok(bus.sidePanels.every(p=>p.material.map===null&&!p.visible));
  bus.dispose();assert.equal(imageDisposals,2);assert.equal(fallbackDisposals,1);
}));

test('variant changes preserve uploaded panel proportions and texture ownership',async()=>withBrowser(async({requests})=>{
  const bus=harness();bus.setSkin({image:'A'});
  const image=new THREE.Texture();let disposals=0;image.addEventListener('dispose',()=>disposals++);
  requests[0].onLoad(image);await bus.skinReady;
  for(const modelId of ['nil-kirilli','dam-rejina','sltb']){
    bus.skin.modelId=modelId;
    assert.equal(await bus.loadModel(modelId,async()=>new THREE.Group()),true);
    assert.ok(bus.sidePanels.every(p=>p.geometry.parameters.height===.55));
    assert.ok(bus.sidePanels.every(p=>p.material.map===image));
    assert.equal(disposals,0);assert.equal(requests.length,1);
  }
  bus.dispose();assert.equal(disposals,1);
}));

test('only a current image failure enables retry and disposed buses ignore late callbacks',async()=>withBrowser(async({requests})=>{
  const bus=harness();bus.setSkin({image:'A'});const first=bus.skinReady;
  requests[0].onError(new Error('Failed'));
  assert.equal(await first,false);assert.equal(bus.loadedImage,null);
  bus.setSkin({});assert.equal(requests.length,2,'an explicit later skin update retries a current failure');
  const pending=bus.skinReady;bus.dispose();
  const late=new THREE.Texture();let disposals=0;late.addEventListener('dispose',()=>disposals++);
  requests[1].onLoad(late);assert.equal(await pending,true);assert.equal(disposals,1);
  assert.equal(bus.uploadedTexture,null);
}));
