import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// The stock SLTB photographs share the classic donor's proportions. +Z faces
// forward; the red route crown sits above the split windscreen, not on its glass.
export const SLTB_CROWN=Object.freeze({x:.045,y:2.80,z:4.595,width:1.78,height:.245});
export const SLTB_GRILLE=Object.freeze({x:.05,y:1.25,z:4.721,width:1.90,top:1.55,bottom:.87});
export const SLTB_TRIANGLE=Object.freeze({x:-.59,y:1.27,z:4.776,width:.49,height:.49});

export function createSLTBDetails(){
  const group=new THREE.Group();group.name='SLTB stock red body fittings';
  group.userData={frontCrown:SLTB_CROWN,grille:SLTB_GRILLE,hazardTriangle:SLTB_TRIANGLE};
  const materials={
    red:new THREE.MeshStandardMaterial({color:'#cf1022',metalness:.12,roughness:.54}),
    black:new THREE.MeshStandardMaterial({color:'#111214',metalness:.10,roughness:.67}),
    grilleRib:new THREE.MeshStandardMaterial({color:'#242627',metalness:.35,roughness:.55}),
    chrome:new THREE.MeshStandardMaterial({color:'#bbc2c2',metalness:.72,roughness:.34}),
    lens:new THREE.MeshStandardMaterial({color:'#f4ebce',emissive:'#f6dfb1',emissiveIntensity:.22,metalness:.08,roughness:.28}),
    amber:new THREE.MeshStandardMaterial({color:'#de8a1c',emissive:'#d8640c',emissiveIntensity:.12,roughness:.35}),
    tail:new THREE.MeshStandardMaterial({color:'#b21720',emissive:'#a91215',emissiveIntensity:.16,roughness:.36}),
    reflector:new THREE.MeshStandardMaterial({color:'#ff303b',metalness:.12,roughness:.38}),
    mirror:new THREE.MeshStandardMaterial({color:'#82939b',metalness:.77,roughness:.20}),
  };
  materials.lens.userData.headlight=true;
  const batches=new Map();
  const add=(geometry,key,x=0,y=0,z=0,rotation=new THREE.Euler())=>{
    const g=geometry.index?geometry.toNonIndexed():geometry;
    if(g!==geometry)geometry.dispose();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(rotation),new THREE.Vector3(1,1,1)));
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push(g);
  };
  const box=(w,h,d,key,x,y,z,r=.006)=>add(new RoundedBoxGeometry(w,h,d,1,Math.min(r,w/3,h/3,d/3)),key,x,y,z);
  const ring=(r,tube,key,x,y,z)=>add(new THREE.TorusGeometry(r,tube,5,24),key,x,y,z);
  const disk=(r,depth,key,x,y,z)=>add(new THREE.CylinderGeometry(r,r,depth,24),key,x,y,z,new THREE.Euler(Math.PI/2,0,0));
  const rod=(points,radius,key)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point)));
    add(new THREE.TubeGeometry(curve,Math.max(6,points.length*4),radius,6,false),key);
  };

  // A red flat nose masks the donor's decorated vents. The grille is a broad
  // black upper opening with a narrower central extension between the lamps.
  box(2.045,1.28,.18,'red',.045,1.05,4.61,.025);
  const opening=new THREE.Shape();
  opening.moveTo(-.91,.30);opening.lineTo(.91,.30);opening.quadraticCurveTo(.95,.30,.95,.22);
  opening.lineTo(.94,-.11);opening.quadraticCurveTo(.94,-.17,.88,-.17);
  opening.lineTo(.40,-.17);opening.lineTo(.35,-.34);opening.quadraticCurveTo(.34,-.38,.29,-.38);
  opening.lineTo(-.29,-.38);opening.quadraticCurveTo(-.34,-.38,-.35,-.34);
  opening.lineTo(-.40,-.17);opening.lineTo(-.88,-.17);opening.quadraticCurveTo(-.94,-.17,-.94,-.11);
  opening.lineTo(-.95,.22);opening.quadraticCurveTo(-.95,.30,-.91,.30);
  add(new THREE.ShapeGeometry(opening,10),'black',SLTB_GRILLE.x,SLTB_GRILLE.y,SLTB_GRILLE.z);
  for(let row=0;row<14;row++){
    const y=.913+row*.045;
    const width=y<1.08?.65:1.80;
    box(width,.014,.013,'grilleRib',.05,y,4.738,.002);
  }
  // Two narrow upright dividers are visible within the stock black grille.
  for(const x of [-.36,.46])box(.018,.42,.020,'black',x,1.32,4.751,.002);
  ring(.062,.011,'chrome',.05,1.30,4.767);
  disk(.031,.009,'chrome',.05,1.30,4.765);

  // Reflective warning triangle: a physical open frame over the viewer-left
  // grille. Its apex reaches the grille's top edge, with black louvers inside.
  const triangle=new THREE.Shape();triangle.moveTo(0,.30);triangle.lineTo(-.245,-.19);triangle.lineTo(.245,-.19);triangle.closePath();
  const hole=new THREE.Path();hole.moveTo(0,.175);hole.lineTo(.155,-.137);hole.lineTo(-.155,-.137);hole.closePath();triangle.holes.push(hole);
  add(new THREE.ExtrudeGeometry(triangle,{depth:.025,bevelEnabled:false}),'reflector',SLTB_TRIANGLE.x,SLTB_TRIANGLE.y,SLTB_TRIANGLE.z);

  // Four round lamps sit in plain red recesses with modest silver rings.
  for(const x of [-.67,.77])box(.525,.31,.08,'red',x,.88,4.705,.017);
  for(const x of [-.795,-.545,.645,.895]){
    disk(.124,.035,'black',x,.88,4.756);
    ring(.111,.014,'chrome',x,.88,4.783);
    disk(.095,.016,'lens',x,.88,4.789);
    for(const dx of [-.04,0,.04])box(.002,.145,.003,'chrome',x+dx,.88,4.801,.0008);
  }
  for(const x of [-.968,1.058]){
    box(.10,.245,.055,'black',x,.92,4.724,.010);
    box(.076,.214,.020,'amber',x,.92,4.762,.007);
  }
  // Simple stock silver bumper and two dark mounting bolts, no touring bar.
  box(2.105,.185,.16,'chrome',.045,.485,4.855,.015);
  for(const x of [-.73,.82])disk(.036,.012,'black',x,.485,4.943);
  ring(.063,.010,'chrome',.05,.715,4.752);
  add(new THREE.TorusGeometry(.036,.008,5,18,Math.PI*1.4),'chrome',.044,.72,4.761,new THREE.Euler(0,0,.60));

  // The unadorned rounded red route crown belongs above the windscreen.
  box(2.12,.33,.44,'red',.045,2.80,4.30,.060);
  box(1.88,.274,.035,'black',.045,2.80,4.565,.025);
  box(2.12,.055,.30,'red',.045,2.635,4.43,.012);
  box(2.04,.14,.06,'red',.045,2.56,4.65,.012);
  box(2.06,.018,.025,'chrome',.045,2.655,4.585,.004);
  // Ribbed silver belt directly below the two windshield panes.
  box(2.04,.105,.025,'chrome',.045,1.735,4.707,.008);
  for(let rib=0;rib<4;rib++)box(2.02,.005,.006,'black',.045,1.704+rib*.020,4.723,.001);
  for(const side of [-1,1]){
    const x=.045+side*.955;
    box(.027,.86,.028,'chrome',x,2.17,4.568,.004);
    rod([[x,2.40,4.16],[.045+side*1.19,2.40,4.20],[.045+side*1.19,2.07,4.20]],.017,'black');
    box(.20,.34,.105,'black',.045+side*1.20,2.08,4.20,.018);
    box(.162,.285,.008,'mirror',.045+side*1.20,2.08,4.141,.012);
  }

  // Plain red rear panel, small upright lamp banks and a stock silver bumper.
  // Window/route/registration lettering is supplied by the livery module.
  box(1.99,1.10,.072,'red',.045,1.16,-4.905,.022);
  box(1.89,.79,.032,'black',.045,2.11,-4.925,.022);
  box(2.035,.31,.42,'red',.045,2.69,-4.69,.045);
  box(1.73,.245,.026,'black',.045,2.69,-4.929,.017);
  for(const x of [-.80,.89]){
    box(.17,.385,.036,'black',x,.93,-4.954,.012);
    box(.128,.103,.017,'amber',x,1.052,-4.981,.004);
    box(.128,.103,.017,'tail',x,.933,-4.981,.004);
    box(.128,.085,.017,'lens',x,.823,-4.981,.004);
  }
  box(2.09,.125,.12,'chrome',.045,.485,-4.93,.012);
  box(.25,.18,.025,'black',.045,.305,-4.69,.005);

  // Thin silver belt and stock window surrounds stop at both open curbside
  // entrances. The driver's side retains a continuous simple belt.
  for(const side of [-1,1]){
    const x=.045+side*1.01;
    const segments=side>0?[[.10,6.40],[-4.375,.65]]:[[-.45,8.50]];
    for(const [z,length]of segments)box(.015,.018,length,'chrome',x,1.12,z,.004);
    const windows=side>0?[[.10,6.40],[-4.365,.61]]:[[-.37,8.08]];
    for(const [z,length]of windows)for(const y of [1.65,1.83,1.94,2.48])box(.014,y===1.83||y===1.94?.008:.014,length,'chrome',x,y,z,.003);
    for(let i=0;i<10;i++){
      const z=3.29-i*.81;
      if(side>0&&z<-3.10&&z>-4.05)continue;
      box(.014,.81,.014,'chrome',x,2.065,z,.004);
    }
  }

  for(const [key,geometries]of batches){
    const geometry=mergeGeometries(geometries,false);
    if(!geometry)throw new Error(`Could not batch SLTB ${key}`);
    geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,materials[key]);mesh.name=`SLTB ${key}`;
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  return group;
}
