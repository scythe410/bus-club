/** Shared by Node and Cloudflare so friends join the convoy wherever it has driven. */
const roadX=z=>Math.sin(z*.0022)*95+Math.sin(z*.0057)*23;
const roadYaw=z=>Math.atan2(roadX(z+1)-roadX(z-1),2);
export function spawnState(players=[]){
  const states=players.map(p=>p.state??p).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));
  const anchor=states[0],origin=anchor?.z??0;
  const rows=[0,-14,14,-28,28,-42,42,-56,56];
  for(const offset of rows){
    const z=origin+offset,yaw=roadYaw(z),sin=Math.sin(yaw),cos=Math.cos(yaw);
    for(const lane of [3.3,-3.3]){
      const candidate={x:roadX(z)+cos*lane,y:0,z:z-sin*lane,yaw,speed:0};
      // Reserve an entire bus-length rectangle, including drivers paused in the garage.
      const occupied=states.some(p=>{
        const dx=candidate.x-p.x,dz=candidate.z-p.z;
        return Math.abs(dx*sin+dz*cos)<11.5&&Math.abs(dx*cos-dz*sin)<3.6;
      });
      if(!occupied)return candidate;
    }
  }
  // Capacity is eight; the search above has eighteen spaces around the convoy.
  const z=origin-70;return {x:roadX(z)+3.3,y:0,z,yaw:roadYaw(z),speed:0};
}
