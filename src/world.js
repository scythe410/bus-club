import * as THREE from 'three';

import { roadX, roadY, roadYaw, ROAD_HALF_WIDTH } from '../shared/road.js';
export { roadX, roadY, roadYaw };
const random=(n)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const TILE=160;

// A tiny shared, mipmapped surface gives the eye nearby motion references.
// Texture coordinates stay fixed in world metres across recycled tiles.
function asphaltTexture(){
  const size=64,data=new Uint8Array(size*size*4);
  for(let i=0;i<size*size;i++){
    const shade=Math.round(210+random(i+41)*45);
    data[i*4]=data[i*4+1]=data[i*4+2]=shade;data[i*4+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}

export class World {
  constructor(scene){this.scene=scene;this.environment='coast';this.tiles=new Map();this.materials={road:new THREE.MeshStandardMaterial({color:'#55605e',roughness:1}),line:new THREE.MeshStandardMaterial({color:'#eee8c5',roughness:1}),ground:new THREE.MeshStandardMaterial({color:'#a9b98a',flatShading:true,roughness:1,vertexColors:true}),trunk:new THREE.MeshStandardMaterial({color:'#7d7461',roughness:1}),foliage:new THREE.MeshStandardMaterial({color:'#527b67',roughness:1,flatShading:true}),rock:new THREE.MeshStandardMaterial({color:'#b2b39e',roughness:1,flatShading:true}),rail:new THREE.MeshStandardMaterial({color:'#e4dfc8',roughness:1}),sign:new THREE.MeshStandardMaterial({color:'#e9ba73'})};
    this.roadTexture=asphaltTexture();this.materials.road.map=this.roadTexture;
    // Tile instances share immutable geometry; only terrain and road strips vary.
    this.geometries={dash:new THREE.BoxGeometry(.16,.025,4.5),trunk:new THREE.CylinderGeometry(.23,.38,4,5),tree:new THREE.ConeGeometry(2.8,7.7,6),rock:new THREE.DodecahedronGeometry(1,0),post:new THREE.BoxGeometry(.18,.9,.18),pole:new THREE.CylinderGeometry(.08,.08,3,6),sign:new THREE.BoxGeometry(1.2,.9,.12)};
    this.sharedGeometries=new Set(Object.values(this.geometries));
    this.ocean=new THREE.Mesh(new THREE.PlaneGeometry(8000,8000),new THREE.MeshStandardMaterial({color:'#6baeb2',roughness:.35,metalness:.08}));this.ocean.rotation.x=-Math.PI/2;this.ocean.position.set(-2900,-2,0);this.scene.add(this.ocean);this.update(0);
  }
  setEnvironment(value){if(value===this.environment)return;this.environment=value;this.currentTile=null;this.ocean.visible=value==='coast';this.materials.ground.color.set(value==='coast'?'#a9b98a':'#8caa82');for(const group of this.tiles.values())this.remove(group);this.tiles.clear();}
  height(x,z){const d=x-roadX(z);if(this.environment==='coast'&&d<-24)return roadY(z)-Math.min(18,(-d-24)*.18)+Math.sin(z*.015)*.7;const flatten=Math.min(1,Math.max(0,(Math.abs(d)-10)/75));return roadY(z)-.12+flatten*(Math.sin(x*.014+z*.008)*7+Math.cos(z*.017)*5+Math.max(0,d)*.045);}
  strip(start,width,offset,y,mat){const vertices=[],uvs=[],indices=[];for(let i=0;i<=40;i++){const z=start+i*TILE/40;const a=roadYaw(z);for(const side of [-1,1]){const lateral=offset+side*width/2;vertices.push(roadX(z)+Math.cos(a)*lateral,roadY(z)+y,z-Math.sin(a)*lateral);uvs.push(lateral/4,z/4);}if(i<40){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();const mesh=new THREE.Mesh(g,mat);mesh.receiveShadow=true;return mesh;}
  create(index){const start=index*TILE,group=new THREE.Group();group.add(this.strip(start,ROAD_HALF_WIDTH*2,0,.01,this.materials.road));for(const side of [-1,1])group.add(this.strip(start,.14,side*3.5,.025,this.materials.line));
    const offsets=[-300,-250,-200,-150,-100,-70,-45,-25,-15,-9,0,9,15,25,45,70,100,150,200,250,300],positions=[],colors=[],indices=[];const color=new THREE.Color();for(let i=0;i<=16;i++){const z=start+i*10;for(let j=0;j<=20;j++){const x=roadX(z)+offsets[j];positions.push(x,this.height(x,z),z);color.set(this.environment==='coast'?'#9eaf80':'#8ca980');color.multiplyScalar(.91+random(i+index*100+j)*.16);colors.push(color.r,color.g,color.b);if(i<16&&j<20){const n=i*21+j;indices.push(n,n+21,n+1,n+1,n+21,n+22);}}}
    const ground=new THREE.BufferGeometry();ground.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));ground.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));ground.setIndex(indices);ground.computeVertexNormals();const groundMesh=new THREE.Mesh(ground,this.materials.ground);groundMesh.receiveShadow=true;group.add(groundMesh);
    const dashes=new THREE.InstancedMesh(this.geometries.dash,this.materials.line,16);const temp=new THREE.Object3D();for(let i=0;i<16;i++){const z=start+i*10;temp.position.set(roadX(z),roadY(z)+.04,z);temp.rotation.set(0,roadYaw(z),0);temp.updateMatrix();dashes.setMatrixAt(i,temp.matrix);}group.add(dashes);
    const count=44,trunks=new THREE.InstancedMesh(this.geometries.trunk,this.materials.trunk,count),trees=new THREE.InstancedMesh(this.geometries.tree,this.materials.foliage,count),rocks=new THREE.InstancedMesh(this.geometries.rock,this.materials.rock,15);
    for(let i=0;i<count;i++){const seed=index*145+i;const z=start+random(seed+1)*TILE;const side=this.environment==='coast'?(random(seed+12)>.16?1:-1):(random(seed+12)>.5?1:-1);const x=roadX(z)+side*(18+random(seed+6)*(this.environment==='coast'&&side===-1?16:190));const y=this.height(x,z);const scale=.7+random(seed+32)*1.1;temp.position.set(x,y+scale*1.7,z);temp.rotation.set(0,random(seed+8)*6,0);temp.scale.setScalar(scale);temp.updateMatrix();trunks.setMatrixAt(i,temp.matrix);temp.position.y=y+scale*6;temp.updateMatrix();trees.setMatrixAt(i,temp.matrix);const c=new THREE.Color(this.environment==='coast'?'#5f836d':'#4e7867');c.multiplyScalar(.8+random(seed+5)*.4);trees.setColorAt(i,c);}
    for(let i=0;i<15;i++){const seed=index*67+i;const z=start+random(seed+98)*TILE;const x=roadX(z)+(random(seed+7)>.3?1:-1)*(16+random(seed+4)*40);const scale=1+random(seed+84)*2;temp.position.set(x,this.height(x,z)+scale*.35,z);temp.scale.set(scale*1.4,scale*.65,scale);temp.rotation.set(random(seed),random(seed+2)*6,0);temp.updateMatrix();rocks.setMatrixAt(i,temp.matrix);}trunks.castShadow=true;trees.castShadow=true;group.add(trunks,trees,rocks);
    // Ten-metre spacing gives readable optic flow even at town speeds, using
    // the existing single instanced draw. Offset along the curved road normal.
    const posts=new THREE.InstancedMesh(this.geometries.post,this.materials.rail,32);for(let i=0;i<32;i++){const z=start+Math.floor(i/2)*10;const side=i%2===0?-1:1,a=roadYaw(z);temp.position.set(roadX(z)+Math.cos(a)*side*4.8,roadY(z)+.45,z-Math.sin(a)*side*4.8);temp.rotation.set(0,a,0);temp.scale.set(1,1,1);temp.updateMatrix();posts.setMatrixAt(i,temp.matrix);}group.add(posts);
    if(index%3===0){const z=start+70;const stop=new THREE.Group();const pole=new THREE.Mesh(this.geometries.pole,this.materials.rail);pole.position.y=1.5;stop.add(pole);const sign=new THREE.Mesh(this.geometries.sign,this.materials.sign);sign.position.y=3;stop.add(sign);stop.position.set(roadX(z)+5.5,roadY(z),z);group.add(stop);}
    this.scene.add(group);return group;
  }
  update(z){this.ocean.position.z=z;const current=Math.floor(z/TILE);if(current===this.currentTile)return;this.currentTile=current;for(let i=current-2;i<=current+6;i++)if(!this.tiles.has(i))this.tiles.set(i,this.create(i));for(const [i,group]of this.tiles)if(i<current-2||i>current+6){this.remove(group);this.tiles.delete(i);}}
  remove(group){this.scene.remove(group);group.traverse(o=>{if(o.geometry&&!this.sharedGeometries.has(o.geometry))o.geometry.dispose();if(o.isInstancedMesh)o.dispose();if(o.userData.ownMaterial)o.material.dispose();});}
  dispose(){for(const g of this.tiles.values())this.remove(g);this.tiles.clear();for(const g of this.sharedGeometries)g.dispose();this.roadTexture.dispose();Object.values(this.materials).forEach(m=>m.dispose());this.scene.remove(this.ocean);this.ocean.geometry.dispose();this.ocean.material.dispose();}
}
