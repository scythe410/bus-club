import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Uses the imported shell's meter scale (+Z forward). Actual donor wheel
// mounts are accepted so this stays aligned if the source model changes.
const DEFAULT_WHEELS = [
  [.957,.494,2.741,.421,.346],[-.834,.445,2.790,.421,.343],
  [.936,.491,-2.228,.418,.213],[.704,.496,-2.223,.421,.220],
  [-.777,.512,-2.215,.443,.213],[-.524,.512,-2.211,.446,.234],
];
export function createBusUndercarriage(source,{openPassengerDoors=false}={}) {
  const group = new THREE.Group(); group.name = 'Bus chassis and wheel housings';
  const wheels=[];
  const inspect=mount=>{
    if(typeof mount.userData?.frontWheel!=='boolean')return;
    const wheel=mount.children.find(child=>child.userData?.wheel);
    if(!wheel)return;
    wheel.geometry.computeBoundingBox();
    const size=wheel.geometry.boundingBox.getSize(new THREE.Vector3());
    wheels.push({x:mount.position.x,y:mount.position.y,z:mount.position.z,r:wheel.userData.radius||size.y/2,width:size.x,front:mount.userData.frontWheel});
  };
  if(Array.isArray(source))source.forEach(inspect);else source?.traverse(inspect);
  if(!wheels.length)for(const [x,y,z,r,width] of DEFAULT_WHEELS)wheels.push({x,y,z,r,width,front:z>0});
  const mats={
    steel:new THREE.MeshStandardMaterial({color:'#30363c',roughness:.75,metalness:.35}),
    mechanical:new THREE.MeshStandardMaterial({color:'#525b60',roughness:.62,metalness:.48}),
    rubber:new THREE.MeshStandardMaterial({color:'#171c21',roughness:.92,side:THREE.DoubleSide}),
  };
  const batches=new Map();
  const add=(key,geometry,x=0,y=0,z=0,rotation=new THREE.Euler())=>{
    if(geometry.index){const old=geometry;geometry=old.toNonIndexed();old.dispose();}
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(rotation),new THREE.Vector3(1,1,1)));
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push(geometry);
  };
  const box=(key,w,h,d,x,y,z)=>add(key,new THREE.BoxGeometry(w,h,d),x,y,z);
  const bar=(key,start,end,radius)=>{
    const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),delta=b.clone().sub(a);
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
    add(key,new THREE.CylinderGeometry(radius,radius,delta.length(),10),...a.add(b).multiplyScalar(.5).toArray(),new THREE.Euler().setFromQuaternion(q));
  };
  // Ladder frame and recessed floor pan leave the outer wheel corridors open.
  const center=.045;
  for(const side of [-1,1]){
    box('steel',.09,.20,8.25,center+side*.31,.72,-.15);
    box('mechanical',.115,.025,8.25,center+side*.31,.625,-.15);
  }
  for(const z of [-3.95,-3.10,-1.45,-.40,.70,1.70,3.55])box('steel',.74,.09,.075,center,.74,z);
  box('steel',.65,.045,7.8,center,.925,-.10);
  // Outboard floor sections stop before each wheel bay instead of sealing
  // the arches with a flat plate through the tires.
  for(const side of [-1,1])for(const [z,length]of [[3.85,1.15],[.30,3.50],[-3.60,1.65]]){
    if(openPassengerDoors&&side>0&&Math.abs(z)>3)continue;
    box('steel',.55,.045,length,center+side*.635,.975,z);
  }
  box('steel',.40,.30,1.05,center-.65,.65,-.35);
  for(const z of [-.71,.01])box('mechanical',.42,.025,.055,center-.65,.49,z);
  // Gearbox and sump are attached between the frame rails.
  box('mechanical',.38,.24,.68,center,.68,1.35);
  box('steel',.37,.11,.48,center,.53,1.52);
  const axleData=[];
  for(const front of [true,false]){
    const row=wheels.filter(w=>w.front===front);if(!row.length)continue;
    const y=row.reduce((s,w)=>s+w.y,0)/row.length,z=row.reduce((s,w)=>s+w.z,0)/row.length;
    const left=row.filter(w=>w.x<0),right=row.filter(w=>w.x>=0);
    // Stop at the inner tire sidewalls. The hub knuckles remain part of the
    // moving wheel mounts, so the fixed beam never enters a steering tire.
    const min=left.length?Math.max(...left.map(w=>w.x+w.width/2))+.025:-.45;
    const max=right.length?Math.min(...right.map(w=>w.x-w.width/2))-.025:.53;
    bar('mechanical',[min,y,z],[max,y,z],front?.048:.065);
    if(!front){
      const diff=new THREE.SphereGeometry(.15,12,8);diff.scale(1,.88,1.18);add('mechanical',diff,center,y,z);
      bar('mechanical',[center,.63,1.06],[center,y+.015,z+.13],.035);
    }
    for(const side of [-1,1]){
      const x=center+side*.29;
      // Three curved leaf layers and shackles support each axle.
      for(let leaf=0;leaf<3;leaf++){
        const half=.58-leaf*.09,points=[];
        for(let i=0;i<=8;i++){
          const t=-1+i/4;points.push(new THREE.Vector3(x,y+.075+leaf*.018+.10*t*t,z+t*half));
        }
        add('steel',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),8,.014,4,false));
      }
      for(const end of [-1,1])box('mechanical',.05,.15,.065,x,y+.21,z+end*.57);
      for(const dz of [-.095,.095])bar('mechanical',[x-.045,y-.06,z+dz],[x-.045,y+.15,z+dz],.009);
    }
    axleData.push({front,y,z,min,max});
  }
  // Half-cylinder liners follow each wheel pair. The open lower half and
  // extra radial clearance accommodate both rolling tires and front steering.
  const covers=[];
  for(const front of [true,false])for(const side of [-1,1]){
    const row=wheels.filter(w=>w.front===front&&Math.sign(w.x)===side);if(!row.length)continue;
    const min=Math.min(...row.map(w=>w.x-w.width/2)),max=Math.max(...row.map(w=>w.x+w.width/2));
    const x=(min+max)/2,y=Math.max(...row.map(w=>w.y)),z=row.reduce((s,w)=>s+w.z,0)/row.length;
    const radius=Math.max(...row.map(w=>w.r))+(front?.15:.09),depth=max-min+.025;
    add('rubber',new THREE.CylinderGeometry(radius,radius,depth,20,1,true,0,Math.PI),x,y,z,new THREE.Euler(0,0,Math.PI/2));
    covers.push({front,x,y,z,radius,depth});
  }
  // Rear side splash curtains sit behind the wheel travel envelope.
  for(const side of [-1,1]){
    const rear=wheels.filter(w=>!w.front&&Math.sign(w.x)===side);if(!rear.length)continue;
    const lo=Math.min(...rear.map(w=>w.x-w.width/2)),hi=Math.max(...rear.map(w=>w.x+w.width/2));
    const z=Math.min(...rear.map(w=>w.z-w.r))-.12;
    box('rubber',hi-lo,.34,.025,(hi+lo)/2,.42,z);
  }
  group.userData={axles:axleData,wheelCovers:covers};
  for(const [key,geometries]of batches){
    const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,mats[key]);mesh.name=`Undercarriage ${key}`;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  return group;
}
