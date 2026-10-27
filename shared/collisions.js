// Planar rigid bodies in metres / seconds. The rectangle includes the bumpers
// of the 10.934 m imported bus; mirrors are deliberately non-solid.
export const BUS_BODY = Object.freeze({halfWidth:1.45, halfLength:5.5, mass:11000, restitution:.08});
const dot=(a,b)=>a.x*b.x+a.z*b.z;
const cross=(a,b)=>a.z*b.x-a.x*b.z; // positive rotation about THREE's +Y
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const axes=b=>[{x:Math.cos(b.yaw),z:-Math.sin(b.yaw)},{x:Math.sin(b.yaw),z:Math.cos(b.yaw)}];
export function busVelocity(b){const [r,f]=axes(b);return {x:f.x*b.speed+r.x*(b.sideSpeed||0),z:f.z*b.speed+r.z*(b.sideSpeed||0)};}
export function busContact(a,b,margin=0){
  const aa=axes(a),ba=axes(b),delta={x:b.x-a.x,z:b.z-a.z};
  if(Math.hypot(delta.x,delta.z)>12+margin)return null;
  let depth=Infinity,normal;
  for(const axis of [...aa,...ba]){
    const radius=([r,f])=>BUS_BODY.halfWidth*Math.abs(dot(r,axis))+BUS_BODY.halfLength*Math.abs(dot(f,axis));
    const overlap=radius(aa)+radius(ba)+margin-Math.abs(dot(delta,axis));
    if(overlap<=0)return null;
    if(overlap<depth){depth=overlap;normal={x:axis.x*(dot(delta,axis)<0?-1:1),z:axis.z*(dot(delta,axis)<0?-1:1)};}
  }
  // Midpoint of the intersecting contact faces: centred bumper hits don't spin,
  // while corner and side impacts produce a yaw impulse.
  const tangent={x:normal.z,z:-normal.x};
  const radius=(ax,d)=>BUS_BODY.halfWidth*Math.abs(dot(ax[0],d))+BUS_BODY.halfLength*Math.abs(dot(ax[1],d));
  const aT=dot(a,tangent),bT=dot(b,tangent);
  const contactT=(Math.max(aT-radius(aa,tangent),bT-radius(ba,tangent))+Math.min(aT+radius(aa,tangent),bT+radius(ba,tangent)))/2;
  const contactN=(dot(a,normal)+radius(aa,normal)+dot(b,normal)-radius(ba,normal))/2;
  return {depth,normal,point:{x:normal.x*contactN+tangent.x*contactT,z:normal.z*contactN+tangent.z*contactT}};
}
function setVelocity(body,v){const [r,f]=axes(body);body.speed=dot(v,f);body.sideSpeed=dot(v,r);}
const INERTIA=(BUS_BODY.halfWidth**2+BUS_BODY.halfLength**2)/3;
const CONTACT_GAP=.002;
function motion(body,fixed=false){
  const inverseMass=fixed?0:1/clamp(body.mass||BUS_BODY.mass,9500,16200);
  return {body,velocity:busVelocity(body),yawRate:body.impactYawRate||0,inverseMass,inverseInertia:inverseMass/INERTIA};
}
function constraint(a,b,hit){
  const n=hit.normal,ra={x:hit.point.x-a.body.x,z:hit.point.z-a.body.z},rb={x:hit.point.x-b.body.x,z:hit.point.z-b.body.z};
  const armA=cross(ra,n),armB=cross(rb,n);
  const closing=()=>dot(a.velocity,n)+a.yawRate*armA-dot(b.velocity,n)-b.yawRate*armB;
  const initialClosing=closing();
  return {a,b,n,armA,armB,closing,initialClosing,impulse:0,
    // Resting contact absorbs tiny closing velocities instead of bouncing every frame.
    rebound:initialClosing>1?BUS_BODY.restitution*initialClosing:0,
    effectiveMass:1/(a.inverseMass+b.inverseMass+armA*armA*a.inverseInertia+armB*armB*b.inverseInertia)};
}
function solveVelocity(c){
  const {a,b,n,armA,armB}=c;
  const impulse=Math.max(0,c.impulse+(c.closing()+c.rebound)*c.effectiveMass),delta=impulse-c.impulse;c.impulse=impulse;
  a.velocity.x-=delta*n.x*a.inverseMass;a.velocity.z-=delta*n.z*a.inverseMass;
  b.velocity.x+=delta*n.x*b.inverseMass;b.velocity.z+=delta*n.z*b.inverseMass;
  a.yawRate-=delta*armA*a.inverseInertia;b.yawRate+=delta*armB*b.inverseInertia;
}
function writeMotion(m){if(!m.inverseMass)return;setVelocity(m.body,m.velocity);m.body.impactYawRate=clamp(m.yawRate,-.65,.65);}
function separate(a,b,hit,fixedB=false,margin=0){
  const depth=hit.depth-margin;if(depth<=0)return;
  const invA=1/clamp(a.mass||BUS_BODY.mass,9500,16200),invB=fixedB?0:1/clamp(b.mass||BUS_BODY.mass,9500,16200);
  const correction=(depth+CONTACT_GAP)/(invA+invB),n=hit.normal;
  a.x-=n.x*correction*invA;a.z-=n.z*correction*invA;
  b.x+=n.x*correction*invB;b.z+=n.z*correction*invB;
}
export function resolveBusCollision(a,b,{fixedB=false,margin=0}={}){
  const hit=busContact(a,b,margin);if(!hit)return null;
  const ma=motion(a),mb=motion(b,fixedB),contact=constraint(ma,mb,hit);
  solveVelocity(contact);writeMotion(ma);writeMotion(mb);separate(a,b,hit,fixedB,margin);
  return {...hit,closing:Math.max(0,contact.initialClosing)};
}

// Solve a whole contact island together. Position projection must converge before
// velocity constraints are solved, otherwise a third bus can push its neighbour
// back into an already-resolved pair. Work is bounded for the five-bus convoy.
export function resolveBusCollisions(bodies,{activeBodies=null}={}){
  if(bodies.length<2)return [];
  const contacts=new Map(),active=activeBodies?new Set(activeBodies):null;
  for(let pass=0;pass<64;pass++){
    let overlapping=false;
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
      const a=bodies[i],b=bodies[j];
      if(active&&!active.has(a)&&!active.has(b))continue;
      const hit=busContact(a,b);if(!hit)continue;
      if(active){active.add(a);active.add(b);}
      const key=i*bodies.length+j;
      if(!contacts.has(key))contacts.set(key,{a,b,...hit});
      separate(a,b,hit);overlapping=true;
    }
    if(!overlapping)break;
  }
  if(!contacts.size)return [];
  const touched=new Set([...contacts.values()].flatMap(hit=>[hit.a,hit.b]));
  const motions=new Map([...touched].map(body=>[body,motion(body)]));
  const constraints=[...contacts.values()].map(hit=>{
    // Recompute the arms after positional projection without requiring overlap.
    const geometry=busContact(hit.a,hit.b,CONTACT_GAP*4)||hit;
    const c=constraint(motions.get(hit.a),motions.get(hit.b),geometry);
    hit.closing=Math.max(0,c.initialClosing);return c;
  });
  for(let pass=0;pass<32;pass++)for(const c of constraints)solveVelocity(c);
  for(const m of motions.values())writeMotion(m);
  return [...contacts.values()];
}

// Both server implementations use the same solver and revision protocol. A
// client reports its pre-prediction contact pose so its local braking impulse
// doesn't erase the momentum before the server can transfer it to its peer.
export function predictCollisionState(state,now){
  if(!Number.isFinite(now)||!Number.isFinite(state.stateTime))return state;
  const age=state.paused?0:clamp((now-state.stateTime)/1000,0,.15);
  const velocity=busVelocity(state);
  return {...state,x:state.x+velocity.x*age,z:state.z+velocity.z*age,yaw:state.yaw+(state.impactYawRate||0)*age};
}
export function updateCollisionStates(players,id,incoming,proposal,{now}={}){
  const self=players.find(p=>p.id===id);if(!self)return [];
  const revision=self.state.collisionRevision||0;
  if((incoming.collisionRevision||0)<revision)return [self];
  self.state={...incoming,collisionRevision:revision};
  // Expand only the sender's contact island as projection finds new contacts.
  // Unrelated parked buses receive neither revisions nor correction packets.
  // Received poses belong to different instants. Compare all participants at
  // the sender's server receipt time; unrelated stale samples stay untouched.
  const atTime=state=>predictCollisionState(state,now);
  if(proposal&&['x','z','yaw','speed'].every(k=>Number.isFinite(proposal[k]))&&Math.hypot(proposal.x-incoming.x,proposal.z-incoming.z)<6&&Math.abs(proposal.speed)<40){
    if(players.some(p=>p!==self&&busContact(proposal,atTime(p.state))))self.state={...self.state,...proposal,collisionRevision:revision};
  }
  const byBody=new Map(players.map(p=>[atTime(p.state),p]));
  const selfBody=[...byBody].find(([,p])=>p===self)[0];
  const changed=new Set();
  for(const hit of resolveBusCollisions([...byBody.keys()],{activeBodies:[selfBody]})){changed.add(byBody.get(hit.a));changed.add(byBody.get(hit.b));}
  for(const [body,p] of byBody)if(changed.has(p)){
    p.state={...body,collisionRevision:(p.state.collisionRevision||0)+1};
    if(Number.isFinite(now)){p.state.stateTime=now;p.state.stateSeq=(p.state.stateSeq||0)+1;}
  }
  return [...changed];
}
export function collisionMotion(input){
  return {sideSpeed:clamp(Number.isFinite(input.sideSpeed)?input.sideSpeed:0,-40,40),impactYawRate:clamp(Number.isFinite(input.impactYawRate)?input.impactYawRate:0,-.65,.65),mass:clamp(Number.isFinite(input.mass)?input.mass:BUS_BODY.mass,9500,16200),collisionRevision:Number.isSafeInteger(input.collisionRevision)&&input.collisionRevision>=0?input.collisionRevision:0};
}
