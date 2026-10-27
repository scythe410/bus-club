import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createBusModel,cloneBusModel} from '../src/imported-bus.js';
import {Bus} from '../src/bus.js';
import {createDamRejinaFrontDetails} from '../src/dam-rejina-front.js';

const meshList = root => {const result=[];root.traverse(mesh=>{if(mesh.isMesh)result.push(mesh);});return result;};
const triangles = root => meshList(root).reduce((total,mesh)=>total+(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3,0);

test('bus clones share immutable buffers, keep materials independent, and release only owned resources',()=>{
  const source=new THREE.Group(),geometry=new THREE.BoxGeometry(1,1,1);
  const texture=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map:texture});
  const shell=new THREE.Mesh(geometry,material);shell.castShadow=true;source.add(shell);
  const a=cloneBusModel(source),b=cloneBusModel(source);
  let geometryDisposals=0,textureDisposals=0,materialDisposals=0;
  geometry.addEventListener('dispose',()=>geometryDisposals++);
  texture.addEventListener('dispose',()=>textureDisposals++);
  a.children[0].material.addEventListener('dispose',()=>materialDisposals++);
  assert.equal(a.children[0].geometry,b.children[0].geometry);
  assert.equal(a.children[0].geometry,geometry);
  assert.notEqual(a.children[0].material,b.children[0].material);
  a.children[0].material.color.set('#ff0000');
  assert.notEqual(a.children[0].material.color.getHex(),b.children[0].material.color.getHex());
  Bus.prototype.disposeModel(a);
  assert.equal(geometryDisposals,0);assert.equal(textureDisposals,0);assert.equal(materialDisposals,1);
  Bus.prototype.disposeModel(b);
  assert.equal(geometryDisposals,0);assert.equal(textureDisposals,0);
  geometry.dispose();texture.dispose();material.dispose();
});

test('remote models use one owned shadow proxy while local builder exclusions survive cloning',()=>{
  const source=new THREE.Group();
  for(const casts of [true,false]){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());m.castShadow=casts;source.add(m);}
  const local=cloneBusModel(source),remote=cloneBusModel(source,{remote:true});
  assert.deepEqual(local.children.map(mesh=>mesh.castShadow),[true,false]);
  assert.equal(meshList(remote).filter(mesh=>mesh.castShadow).length,1);
  const proxy=remote.getObjectByName('Convoy shadow proxy');
  assert.ok(proxy);assert.equal(proxy.material.colorWrite,false);assert.equal(proxy.material.depthWrite,false);
  let proxyDisposals=0;proxy.geometry.addEventListener('dispose',()=>proxyDisposals++);
  Bus.prototype.disposeModel(remote);assert.equal(proxyDisposals,1);
  Bus.prototype.disposeModel(local);source.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});
});

test('peer detail thresholds have hysteresis and leave the shell visible',()=>{
  const model=new THREE.Group(),detail=new THREE.Group(),shell=new THREE.Group(),shadow=new THREE.Group();
  detail.userData.peerDetail=true;shadow.userData.peerShadow=true;model.add(shell,detail,shadow);
  const bus={remote:true,importedModel:model};
  for(const [distance,visible] of [[50,true],[76,false],[70,false],[59,true]]){
    Bus.prototype.setDistance.call(bus,distance);
    assert.equal(detail.visible,visible);assert.equal(shell.visible,true);
  }
  Bus.prototype.setDistance.call(bus,100);assert.equal(shadow.visible,false);
  Bus.prototype.setDistance.call(bus,30);assert.equal(shadow.visible,true);
});

test('static front fittings batch into five draws without losing triangles or their envelope',()=>{
  const front=createDamRejinaFrontDetails();
  assert.equal(meshList(front).length,5);
  assert.equal(triangles(front),2092); // Original rings, lenses, stickers and backing combined.
  const box=new THREE.Box3().setFromObject(front);
  assert.ok(box.min.x> -1.1&&box.max.x<1.2);
  assert.ok(box.min.y>2.6&&box.max.y<3.1);
  Bus.prototype.disposeModel(front);
});

test('actual GLB assemblies use exterior peer budgets and one shared donor parse',async()=>{
  const previousDocument=globalThis.document,previousSelf=globalThis.self;
  const previousGLTF=GLTFLoader.prototype.loadAsync,previousImage=THREE.ImageLoader.prototype.loadAsync;
  let parses=0,readbacks=0;const imageURLs=new Set();
  globalThis.self=globalThis;
  globalThis.document={createElement(){const canvas={width:300,height:150};canvas.getContext=()=>new Proxy({
    getImageData:(x,y,w,h)=>{readbacks++;return {data:new Uint8ClampedArray(w*h*4)};},measureText:()=>({width:100}),
    createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),
  },{get:(obj,key)=>obj[key]??(()=>{})});return canvas;}};
  const bytes=fs.readFileSync(new URL('../src/assets/sri-lanka-bus.glb',import.meta.url));
  GLTFLoader.prototype.loadAsync=async()=>{
    parses++;const parser=new GLTFLoader();
    parser.register(()=>({name:'mock_texture',loadTexture:async()=>new THREE.Texture({width:1024,height:512})}));
    return parser.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  };
  THREE.ImageLoader.prototype.loadAsync=async url=>{imageURLs.add(url);return {width:1536,height:1024};};
  try{
    for(const id of ['nil-kirilli','dam-rejina']){
      const local=await createBusModel(id),peer=await createBusModel(id,{remote:true}),other=await createBusModel(id,{remote:true});
      assert.ok(triangles(peer)<triangles(local)*.4,'peer drops cabin and costly close-up ornament');
      assert.ok(triangles(peer)<35000,'nearby peer stays within the exterior geometry budget');
      assert.ok(!meshList(peer).some(mesh=>mesh.name.includes('cabin')),'peer has no full passenger cabin');
      assert.equal(meshList(peer).filter(mesh=>mesh.castShadow).length,1);
      assert.equal(meshList(peer)[0].geometry,meshList(other)[0].geometry);
      Bus.prototype.disposeModel(peer);Bus.prototype.disposeModel(other);Bus.prototype.disposeModel(local);
    }
    assert.equal(parses,1,'both variants and peers reuse one immutable GLB parse');
    assert.equal(readbacks,0,'runtime model assembly never reads/loops over atlas pixels');
    for(const id of ['nil-kirilli','dam-rejina']){
      assert.ok([...imageURLs].some(url=>url.endsWith(`${id}-atlas.webp`)));
      assert.ok(fs.statSync(new URL(`../src/assets/${id}-atlas.webp`,import.meta.url)).size>0);
    }
  }finally{
    globalThis.document=previousDocument;globalThis.self=previousSelf;
    GLTFLoader.prototype.loadAsync=previousGLTF;THREE.ImageLoader.prototype.loadAsync=previousImage;
  }
});
