import * as THREE from 'three';

// The donor only includes a transparent windshield. Passenger-window apertures
// are cut out of the livery atlas, so add independent glazing inside the shell.
// Keeping the panels inside makes the existing opaque pillars mask their edges.
export function createPassengerGlazing() {
  const group=new THREE.Group();group.name='Smoked passenger and rear glazing';
  const material=new THREE.MeshStandardMaterial({
    name:'Smoked passenger glass',color:'#333b42',transparent:true,opacity:.36,
    roughness:.24,metalness:.08,depthWrite:false,side:THREE.DoubleSide,
  });
  for(const side of [-1,1]) {
    const pane=new THREE.Mesh(new THREE.PlaneGeometry(8.08,.84),material);
    pane.name=`${side<0?'Offside':'Passenger side'} smoked windows`;
    pane.position.set(side<0?-.926:1.021,2.055,-.37);
    pane.rotation.y=side*Math.PI/2;group.add(pane);
  }
  const rear=new THREE.Mesh(new THREE.PlaneGeometry(1.77,.77),material);
  rear.name='Smoked rear window';rear.position.set(.045,2.10,-4.83);rear.rotation.y=Math.PI;group.add(rear);
  return group;
}
