import * as THREE from 'three';

// The donor only includes a transparent windshield. Passenger-window apertures
// are cut out of the livery atlas, so add independent glazing inside the shell.
// Keeping the panels inside makes the existing opaque pillars mask their edges.
export function createPassengerGlazing({modelId='dam-rejina'}={}) {
  const blue=modelId==='nil-kirilli';
  const sltb=modelId==='sltb';
  const group=new THREE.Group();group.name='Smoked passenger and rear glazing';
  const material=new THREE.MeshStandardMaterial({
    name:blue?'Blue passenger glass':sltb?'SLTB passenger glass':'Smoked passenger glass',color:blue?'#247b9e':sltb?'#718b95':'#333b42',transparent:true,opacity:blue?.24:sltb?.20:.36,
    roughness:.24,metalness:.08,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
  });
  for(const side of [-1,1]) {
    const segments=side>0&&(blue||sltb)?sltb?[[.105,6.39],[-4.25,.32]]:[[.39,6.56],[-4.28,.26]]:[[-.37,8.08]];
    for(const [z,length]of segments){
    const pane=new THREE.Mesh(new THREE.PlaneGeometry(length,.84),material);
    pane.name=`${side<0?'Offside':'Passenger side'} smoked windows`;
    pane.position.set(side<0?-.926:1.021,2.055,z);
    pane.rotation.y=side*Math.PI/2;group.add(pane);
    }
  }
  const rearMaterial=sltb?new THREE.MeshStandardMaterial({color:'#2768b7',transparent:true,opacity:.8,roughness:.25,side:THREE.DoubleSide}):material;
  const rear=new THREE.Mesh(new THREE.PlaneGeometry(1.77,.77),rearMaterial);
  rear.name='Smoked rear window';rear.position.set(.045,2.10,-4.83);rear.rotation.y=Math.PI;group.add(rear);
  return group;
}
