/** Shared by Node and Cloudflare so friends join the convoy wherever it has driven. */
import { roadX, roadYaw, LANE_CENTER } from './road.js';
export function spawnState(players=[]){
  const states=players.map(p=>p.state??p).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));
  const anchor=states[0],origin=anchor?.z??0;
  const rows=[0,-14,14,-28,28,-42,42,-56,56];
  for(const offset of rows){
    const z=origin+offset,yaw=roadYaw(z),sin=Math.sin(yaw),cos=Math.cos(yaw);
    for(const lane of [LANE_CENTER,-LANE_CENTER]){
      const candidate={x:roadX(z)+cos*lane,y:0,z:z-sin*lane,yaw,speed:0};
      // Reserve an entire bus-length rectangle, including drivers paused in the garage.
      const occupied=states.some(p=>{
        const dx=candidate.x-p.x,dz=candidate.z-p.z;
        return Math.abs(dx*sin+dz*cos)<11.5&&Math.abs(dx*cos-dz*sin)<3.1;
      });
      if(!occupied)return candidate;
    }
  }
  // Capacity is eight; the search above checks eighteen nearby positions.
  const z=origin-70;return {x:roadX(z)+Math.cos(roadYaw(z))*LANE_CENTER,y:0,z,yaw:roadYaw(z),speed:0};
}
