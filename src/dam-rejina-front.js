import * as THREE from 'three';

// Small front fittings remain separate from the shell's shared donor texture.
export function createDamRejinaFrontDetails() {
  const group=new THREE.Group();group.name='Dam Rejina front crown decals and marker lamps';
  const chrome=new THREE.MeshStandardMaterial({color:'#dce4e5',metalness:.85,roughness:.18});
  const lens=new THREE.MeshStandardMaterial({color:'#e8eee4',emissive:'#e7f4d3',emissiveIntensity:.2,roughness:.24});
  const amber=new THREE.MeshStandardMaterial({color:'#e94c18',emissive:'#df300e',emissiveIntensity:.3,roughness:.25});
  const pink=new THREE.MeshStandardMaterial({color:'#ff9acb',metalness:.25,roughness:.35});
  const purple=new THREE.MeshStandardMaterial({color:'#601343',metalness:.3,roughness:.4});
  const add=(geometry,material,x,y,z,rotation=0)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.rotation.z=rotation;group.add(mesh);return mesh;
  };
  // The pale rotated square on each upper corner has two purple quadrants,
  // with a small amber/red round lamp over its lower half.
  for(const side of [-1,1]) {
    const x=.045+side*.925;
    const diamond=add(new THREE.PlaneGeometry(.245,.245),pink,x,2.875,4.579,side*Math.PI/4);
    diamond.name=`Dam Rejina ${side<0?'left':'right'} crown diamond sticker`;
    for(const quadrant of [-1,1]) {
      const part=new THREE.Mesh(new THREE.PlaneGeometry(.116,.116),purple);
      part.position.set(quadrant*.061,quadrant*.061,.002);diamond.add(part);
    }
    add(new THREE.TorusGeometry(.043,.009,5,16),chrome,x,2.827,4.594);
    const lamp=add(new THREE.CircleGeometry(.034,16),amber,x,2.827,4.601);
    lamp.name='Dam Rejina crown corner amber lamp';
  }
  // Thirteen exposed round marker lenses run immediately below the visor.
  add(new THREE.BoxGeometry(2.04,.018,.022),chrome,.045,2.635,4.598);
  for(let i=0;i<13;i++) {
    const x=-.93+i*.1625;
    add(new THREE.TorusGeometry(.028,.009,5,12),chrome,x,2.66,4.625);
    const lamp=add(new THREE.CircleGeometry(.023,12),lens,x,2.66,4.631);
    lamp.name='Dam Rejina visor round marker lens';
  }
  return group;
}
