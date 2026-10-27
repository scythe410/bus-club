import {collisionMotion, updateCollisionStates,predictCollisionState} from './collisions.js';
import {spawnState} from './spawn.js';
import {roadX} from './road.js';

// Includes a little collision headroom above the 120 km/h driving limit.
export const MAX_NETWORK_SPEED = 40;
export const JOIN_TIMEOUT_MS = 10000;
const MOVEMENT_SLACK = 3;

export function initialRoomState(state, now=Date.now()) {
  return {...state,y:Number.isFinite(state.y)?state.y:0,...collisionMotion(state),paused:true,stateTime:now,stateSeq:0,movementSlack:MOVEMENT_SLACK};
}

export function recoverRoomMotion(player,now=Date.now()) {
  // Reject a bad sample without leaving an honest driver permanently stuck
  // resending an unreachable pose. The client acknowledges this correction.
  player.state={...player.state,stateTime:now,stateSeq:(player.state.stateSeq||0)+1,collisionRevision:(player.state.collisionRevision||0)+1};
  return player;
}

function motion(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid bus position.');
  const state={};
  for(const key of ['x','z','yaw','speed']) {
    if(typeof input[key]!=='number'||!Number.isFinite(input[key])||Math.abs(input[key])>1e7)throw Error('Invalid bus position.');
    state[key]=input[key];
  }
  if(Math.abs(state.speed)>MAX_NETWORK_SPEED)throw Error('Bus speed exceeds the driving limit.');
  if(input.sideSpeed!==undefined&&(!Number.isFinite(input.sideSpeed)||Math.abs(input.sideSpeed)>MAX_NETWORK_SPEED))throw Error('Invalid sideways speed.');
  if(input.impactYawRate!==undefined&&(!Number.isFinite(input.impactYawRate)||Math.abs(input.impactYawRate)>.65))throw Error('Invalid bus turn rate.');
  if(input.paused!==undefined&&typeof input.paused!=='boolean')throw Error('Invalid paused state.');
  state.y=Number.isFinite(input.y)&&Math.abs(input.y)<1e7?input.y:0;
  state.yaw=Math.atan2(Math.sin(state.yaw),Math.cos(state.yaw));
  return {...state,...collisionMotion(input),paused:input.paused===true};
}

export function updateRoomMotion(players,id,input,now=Date.now()) {
  const self=players.find(p=>p.id===id);if(!self)return [];
  const previous=self.state,incoming=motion(input);
  // Do not replace an acknowledged correction with an older outgoing sample.
  if(incoming.collisionRevision<(previous.collisionRevision||0))return [self];
  // A network timer can fire several times between render/physics frames.
  // Repeating that same pose is not a fresh physics sample: keeping its time
  // avoids rejecting the next real 5 FPS movement as a 75 ms teleport.
  const identical=['x','y','z','yaw','speed','sideSpeed','impactYawRate','mass','paused'].every(key=>incoming[key]===previous[key]);
  if(identical&&!input.impact&&input.reset!==true)return [];
  const elapsed=Number.isFinite(previous.stateTime)?Math.max(0,(now-previous.stateTime)/1000):.075;
  // Carry a bounded jitter allowance instead of granting three fresh metres
  // per packet. The receipt clock still credits the whole transport interval.
  const slack=Number.isFinite(previous.movementSlack)?Math.max(0,Math.min(MOVEMENT_SLACK,previous.movementSlack)):MOVEMENT_SLACK;
  const allowance=MAX_NETWORK_SPEED*elapsed+slack;
  const next={...incoming,stateTime:now,stateSeq:(previous.stateSeq||0)+1,movementSlack:Math.min(MOVEMENT_SLACK,allowance)};
  if(input.reset===true) {
    if(Math.abs(incoming.z-previous.z)>allowance||Math.abs(incoming.speed)>1)throw Error('Invalid road reset.');
    // Reserve a free lane/row near this driver; resetting cannot shove a peer.
    const z=Math.max(0,previous.z),other=players.filter(p=>p!==self);
    const spawn=spawnState([{x:roadX(z)+20,z},...other.map(p=>predictCollisionState(p.state,now))]);
    self.state={...next,...spawn,speed:0,sideSpeed:0,impactYawRate:0,collisionRevision:(previous.collisionRevision||0)+1};
    return [self];
  }
  const proposal=!next.paused&&input.impact?motion(input.impact):null;
  // A pre-impact pose can replace the reported pose inside the collision
  // solver, so it must spend the same movement budget too.
  const distance=Math.max(Math.hypot(incoming.x-previous.x,incoming.z-previous.z),proposal?Math.hypot(proposal.x-previous.x,proposal.z-previous.z):0);
  if(distance>allowance+1e-6)throw Error('Bus position moved too far. Use the road reset.');
  next.movementSlack=Math.max(0,Math.min(MOVEMENT_SLACK,allowance-distance));
  const turn=Math.abs(Math.atan2(Math.sin(incoming.yaw-previous.yaw),Math.cos(incoming.yaw-previous.yaw)));
  if(turn>2*elapsed+.3)throw Error('Bus heading changed too quickly.');
  if(next.paused){next.speed=0;next.sideSpeed=0;next.impactYawRate=0;}
  return updateCollisionStates(players,id,next,proposal,{now});
}
