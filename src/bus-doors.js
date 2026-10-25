import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// The donor UV sheet places the curbside rear entrance in this rectangle.
// Run AFTER painting the livery: a mural must never seal the doorway again.
export const REAR_DOOR_UV = Object.freeze({x:866,y:292,width:69,height:172});
export const REAR_DOOR = Object.freeze({x:1.045,z:-3.57,width:.87,bottom:.43,top:2.64});
// The pink bus has a shorter closed rear entrance beneath a painted header.
export const DAM_REJINA_REAR_DOOR = Object.freeze({...REAR_DOOR, width:.80, bottom:.48, top:2.40});
export function clearRearDoorAtlas(context,width,height){
  const r=REAR_DOOR_UV;
  context.clearRect(r.x*width/1024,r.y*height/512,r.width*width/1024,r.height*height/512);
}

// Rear curbside passenger entrance behind the rear axle, located from the
// reference silhouette and donor UVs. Fine hardware is an interpretation.
// Closed leaves are explicit meshes, independent of the body mural.
export function createRearPassengerDoor({color='#0876dc',artwork,modelId='nil-kirilli'}={}){
  const group=new THREE.Group();group.name='Rear passenger door';
  const isDamRejina=modelId==='dam-rejina';
  const dimensions=isDamRejina?DAM_REJINA_REAR_DOOR:REAR_DOOR;
  group.userData={modelId,entrance:'rear',side:'left',state:'closed',leafCount:2,stepCount:isDamRejina?0:3,...dimensions};
  const mats={
    paint:new THREE.MeshStandardMaterial({color,roughness:.44,metalness:.18}),
    seal:new THREE.MeshStandardMaterial({color:'#111922',roughness:.85}),
    chrome:new THREE.MeshStandardMaterial({color:'#c2d7df',roughness:.28,metalness:.65}),
    glass:new THREE.MeshStandardMaterial({color:isDamRejina?'#333b42':'#80abb9',transparent:true,opacity:isDamRejina?.36:.25,roughness:.18,metalness:.12,depthWrite:false}),
    step:new THREE.MeshStandardMaterial({color:'#303740',roughness:.94}),
  };
  if(artwork){
    const texture=new THREE.Texture(artwork);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
    texture.offset.set(.80,.06);texture.repeat.set(.08,.88);
    mats.panel=new THREE.MeshStandardMaterial({map:texture,roughness:.44,metalness:.12});
  }else mats.panel=mats.paint;
  const batches=new Map();
  const box=(key,w,h,d,x,y,z)=>{
    // All leaf hardware follows the variant's shorter frame.
    const ratio=(dimensions.top-dimensions.bottom)/(REAR_DOOR.top-REAR_DOOR.bottom);
    const mappedY=dimensions.bottom+(y-REAR_DOOR.bottom)*ratio;
    const mappedZ=dimensions.z+(z-REAR_DOOR.z)*dimensions.width/REAR_DOOR.width;
    const geometry=new THREE.BoxGeometry(w,h*ratio,d*dimensions.width/REAR_DOOR.width);geometry.translate(x,mappedY,mappedZ);
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push(geometry);
  };
  const {x,z,width,bottom,top}=REAR_DOOR;
  // Outer rubber seal, bright jambs and a header under the bus roof.
  for(const edge of [-1,1]){
    box('seal',.065,top-bottom+.05,.06,x,(top+bottom)/2,z+edge*(width/2+.025));
    box('chrome',.077,top-bottom,.018,x+.009,(top+bottom)/2,z+edge*(width/2+.027));
  }
  for(const y of [bottom,top]){
    box('seal',.063,.06,width+.11,x,y,z);
    box('chrome',.079,.022,width+.08,x+.01,y,z);
  }
  const leafWidth=(width-.025)/2;
  for(const side of [-1,1]){
    const center=z+side*(leafWidth/2+.008);
    // Two glazed top panels and painted kick panels, divided by waist rails.
    box('panel',.038,.88,leafWidth-.025,x,1.0,center);
    box('glass',.016,1.02,leafWidth-.055,x+.009,2.075,center);
    for(const edge of [-1,1])box('chrome',.045,2.08,.014,x+.016,1.535,center+edge*(leafWidth/2-.01));
    for(const y of [1.47,2.60])box('paint',.044,.065,leafWidth-.015,x+.012,y,center);
    for(const y of [.58,1.41])box('chrome',.049,.012,leafWidth-.045,x+.022,y,center);
    // Recessed latch, small polished handle and visible hinge knuckles.
    box('seal',.027,.105,.043,x+.036,1.43,z+side*.054);
    box('chrome',.045,.067,.014,x+.057,1.43,z+side*.054);
    for(const y of [.78,1.66,2.38])box('chrome',.047,.064,.025,x+.025,y,center+side*(leafWidth/2-.006));
  }
  box('seal',.05,2.14,.018,x+.023,1.535,z);
  // Keep actual treads behind the closed leaves; their outer threshold remains
  // visible from a low side view and the cabin sees the interior handrails.
  for(let i=0;i<(isDamRejina?0:3);i++){
    const stepX=.93-i*.20,stepY=.43+i*.205;
    box('step',.23,.055,width-.05,stepX,stepY,z);
    box('chrome',.035,.018,width-.07,stepX+.107,stepY+.028,z);
    for(let rib=0;rib<3;rib++)box('seal',.018,.004,width-.09,stepX-.065+rib*.057,stepY+.03,z);
  }
  for(const edge of isDamRejina?[]:[-1,1]){
    box('chrome',.025,.77,.025,.87,1.61,z+edge*.39);
    box('chrome',.25,.025,.025,.76,1.99,z+edge*.39);
  }
  if(isDamRejina){
    // Cover the donor's original tall aperture above the closed door.
    const cap=new THREE.BoxGeometry(.065,REAR_DOOR.top-dimensions.top+.03,REAR_DOOR.width+.1);
    cap.translate(dimensions.x-.008,(REAR_DOOR.top+dimensions.top)/2+.01,dimensions.z);
    if(!batches.has('paint'))batches.set('paint',[]);batches.get('paint').push(cap);
  }
  for(const [key,geometries]of batches){
    const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,mats[key]);mesh.name=`Rear door ${key}`;mesh.castShadow=key!=='glass';mesh.receiveShadow=true;group.add(mesh);
  }
  return group;
}
