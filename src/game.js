import * as THREE from 'three';
import { Bus } from './bus.js';
import { resolveBusCollisions } from '../shared/collisions.js';
import { createCockpit, animateCockpit } from './cockpit.js';
import { BUS_PHYSICS, stepVehicle } from './vehicle-physics.js';
import { chaseCamera } from './driving-camera.js';
import { CameraControls } from './camera-controls.js';
import { ROAD_HALF_WIDTH, LANE_CENTER } from '../shared/road.js';
import { World, roadX, roadY, roadYaw } from './world.js';

const clamp=THREE.MathUtils.clamp;
const lerp=THREE.MathUtils.lerp;
const angleLerp=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const PHYSICS_STEP=1/120;
const MAX_PHYSICS_FRAME=.25;
const REMOTE_DELAY=120;
const MAX_EXTRAPOLATION=150;
const sameSkin=(a,b)=>a===b||!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>a[key]===b[key]);
const motionChanged=(a,b)=>!a||['x','z','yaw','speed','sideSpeed','impactYawRate','paused'].some(key=>a[key]!==b[key]);

// Sample immutable snapshots on a shared clock. Visuals never read the bodies
// mutated by collision prediction, and keep advancing while the local bus parks.
export function sampleRemote(samples,time,out={}){
  let a=samples[0],b;
  if(!a)return null;
  for(let i=1;i<samples.length;i++){
    b=samples[i];
    if(time<=b.time){
      const t=clamp((time-a.time)/Math.max(.001,b.time-a.time),0,1);
      out.x=lerp(a.x,b.x,t);out.z=lerp(a.z,b.z,t);out.yaw=angleLerp(a.yaw,b.yaw,t);
      out.speed=lerp(a.speed||0,b.speed||0,t);return out;
    }
    a=b;
  }
  const dt=a.paused?0:clamp(time-a.time,0,MAX_EXTRAPOLATION)/1000;
  out.x=a.x+(Math.sin(a.yaw)*(a.speed||0)+Math.cos(a.yaw)*(a.sideSpeed||0))*dt;
  out.z=a.z+(Math.cos(a.yaw)*(a.speed||0)-Math.sin(a.yaw)*(a.sideSpeed||0))*dt;
  out.yaw=a.yaw+(a.impactYawRate||0)*dt;
  out.speed=dt>=MAX_EXTRAPOLATION/1000||a.paused?0:a.speed||0;
  return out;
}

export class BusGame {
  constructor(canvas,{onTelemetry=()=>{},onPickup=()=>{},onStall=()=>{}}={}){
    this.onStall=onStall;
    this.canvas=canvas;this.onTelemetry=onTelemetry;this.onPickup=onPickup;this.keys=new Set();this.input={throttle:0,brake:0,steer:0};this.started=false;this.garage=true;this.paused=false;this.cameraMode=0;this.peers=new Map();this.elapsed=0;this.telemetryTime=0;this.distance=0;this.passengers=0;this.collected=new Set();this.quality='auto';this.skin={color:'#e4a44b',accent:'#f5eed9',pattern:'stripe',name:'COAST CLUB',destination:'THE LONG WAY HOME'};
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#d5e7e4');this.scene.fog=new THREE.Fog('#d5e7e4',180,810);
    this.camera=new THREE.PerspectiveCamera(52,1,.2,1200);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.13;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.ambient=new THREE.HemisphereLight('#d9eeff','#74835c',2.3);this.scene.add(this.ambient);
    this.sun=new THREE.DirectionalLight('#fff1ce',3.2);this.sun.position.set(-80,120,65);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);this.sun.shadow.camera.left=-60;this.sun.shadow.camera.right=60;this.sun.shadow.camera.top=60;this.sun.shadow.camera.bottom=-60;this.sun.shadow.camera.far=340;this.sun.shadow.normalBias=.05;this.sun.shadow.bias=-.00025;this.scene.add(this.sun,this.sun.target);
    this.world=new World(this.scene);this.bus=new Bus(this.skin);this.bus.cockpit=createCockpit();this.bus.group.add(this.bus.cockpit);this.scene.add(this.bus.group);
    this.cameraForward=new THREE.Vector3();this.cameraRight=new THREE.Vector3();this.targetPosition=new THREE.Vector3();this.targetLook=new THREE.Vector3();
    this.makeClouds();this.reset();this.camera.position.set(this.x+17,roadY(this.z)+9,this.z+19);this.lookAt=new THREE.Vector3(this.x,roadY(this.z)+1.7,this.z);this.camera.lookAt(this.lookAt);
    this.cameraControls=new CameraControls(canvas,()=>this.started&&!this.garage&&!this.paused&&this.cameraMode===0);
    this.onKeyDown=e=>{if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||!this.started||this.paused||this.garage||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;const key=e.key.toLowerCase();if(key===' '&&e.target.closest?.('button,a[href]'))return;if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();if(!this.keys.has(key)){if(key==='r')this.reset();if(key==='c')this.setCamera();}this.keys.add(key);};
    this.onKeyUp=e=>this.keys.delete(e.key.toLowerCase());this.onBlur=()=>{this.cameraControls.cancel();this.keys.clear();this.input={throttle:0,brake:0,steer:0};};
    window.addEventListener('keydown',this.onKeyDown);window.addEventListener('keyup',this.onKeyUp);window.addEventListener('blur',this.onBlur);this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();this.clock=new THREE.Clock();this.frame=this.frame.bind(this);this.frameId=requestAnimationFrame(this.frame);
  }
  makeClouds(){
    const material=new THREE.MeshBasicMaterial({color:'#f6f6e9',transparent:true,opacity:.6,depthWrite:false});
    this.clouds=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),material,48);
    const puff=new THREE.Object3D();
    for(let i=0;i<16;i++)for(let n=0;n<3;n++){
      puff.scale.set(20+n*3,5+n*2,12);
      puff.position.set(Math.sin(i*2.4)*450+n*18,100+(i%4)*15+Math.sin(n)*2,(i-3)*90);
      puff.updateMatrix();this.clouds.setMatrixAt(i*3+n,puff.matrix);
    }
    this.scene.add(this.clouds);
  }
  resize(){const w=this.canvas.clientWidth||window.innerWidth,h=this.canvas.clientHeight||window.innerHeight;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
  start(){this.started=true;this.garage=false;this.setPaused(false);this.keys.clear();}
  setPaused(value){this.paused=value;this.physicsAccumulator=0;this.previousPhysicsPose=null;if(value)this.onBlur();else this.clock?.getDelta();}
  setGarage(value){this.garage=!!value;if(value){this.paused=true;this.onBlur();}}
  setInput(input){Object.assign(this.input,input);}
  setSkin(skin){Object.assign(this.skin,skin);this.bus.setSkin(this.skin);}
  setEnvironment(value){if(!['coast','highlands'].includes(value))return;this.world.setEnvironment(value);this.world.update(this.z);}
  setTime(value){const palette={day:{sky:'#d5e7e4',sun:'#fff1ce',ground:'#74835c',intensity:3.2,ambient:2.3,exposure:1.13},sunset:{sky:'#e4baa0',sun:'#ffc18b',ground:'#74616a',intensity:2.8,ambient:1.8,exposure:1.08},night:{sky:'#152d41',sun:'#8fbbdc',ground:'#253c48',intensity:.8,ambient:1.1,exposure:1}}[value]||null;if(!palette)return;this.time=value;this.scene.background.set(palette.sky);this.scene.fog.color.set(palette.sky);this.sun.color.set(palette.sun);this.sun.intensity=palette.intensity;this.ambient.groundColor.set(palette.ground);this.ambient.intensity=palette.ambient;this.renderer.toneMappingExposure=palette.exposure;this.bus.lampMaterial.emissiveIntensity=value==='night'?3:.45;this.clouds.visible=value!=='night';}
  setQuality(value){this.quality=value;const low=value==='low'||(value==='auto'&&(navigator.hardwareConcurrency||8)<5);this.renderer.setPixelRatio(Math.min(devicePixelRatio,low?1:1.6));this.renderer.shadowMap.enabled=!low;this.scene.fog.far=low?530:810;this.resize();}
  setCamera(){this.cameraControls?.cancel();this.cameraMode=(this.cameraMode+1)%4;return ['Chase','Driver','Scenic','Cabin'][this.cameraMode];}
  reset(){this.pendingReset=!!this.started;this.previousPhysicsPose=null;this.z=this.started?Math.max(0,this.z||0):0;this.yaw=roadYaw(this.z);this.x=roadX(this.z)+Math.cos(this.yaw)*LANE_CENTER;this.speed=0;this.sideSpeed=0;this.impactYawRate=0;this.pendingImpact=null;this.visualCorrection=null;this.physicsAccumulator=0;this.steering=0;this.dynamics=null;if(this.bus){this.bus.group.position.set(this.x,roadY(this.z),this.z);this.bus.group.rotation.set(0,this.yaw,0);}}
  getState(){const paused=!!(this.paused||this.garage||this.started===false);const state={x:this.x,z:this.z,yaw:this.yaw,speed:paused?0:this.speed,sideSpeed:paused?0:this.sideSpeed||0,impactYawRate:paused?0:this.impactYawRate||0,mass:this.dynamics?.mass,paused};if(this.pendingImpact&&!paused)state.impact=this.pendingImpact;this.pendingImpact=null;if(this.pendingReset){state.reset=true;this.pendingReset=false;}return state;}
  applyCollisionState(state){
    if(!state||![state.x,state.z,state.yaw,state.speed].every(Number.isFinite))return;
    // Physics accepts authority immediately. Preserve the displayed pose while
    // the small network correction decays, including the chase camera anchor.
    const previous=this.visualCorrection||{x:0,z:0,yaw:0};
    const dx=this.x-state.x+previous.x,dz=this.z-state.z+previous.z;
    this.visualCorrection=Math.hypot(dx,dz)<6?{x:dx,z:dz,yaw:Math.atan2(Math.sin(this.yaw-state.yaw+previous.yaw),Math.cos(this.yaw-state.yaw+previous.yaw))}:null;
    if(this.previousPhysicsPose){
      if(this.visualCorrection){
        this.previousPhysicsPose.x+=state.x-this.x;this.previousPhysicsPose.z+=state.z-this.z;
        this.previousPhysicsPose.yaw+=Math.atan2(Math.sin(state.yaw-this.yaw),Math.cos(state.yaw-this.yaw));
      }else this.previousPhysicsPose=null;
    }
    this.x=state.x;this.z=state.z;this.yaw=state.yaw;this.speed=state.speed;this.sideSpeed=state.sideSpeed||0;this.impactYawRate=state.impactYawRate||0;this.pendingImpact=null;
    if(this.dynamics)this.dynamics.speed=this.speed;
  }
  resolvePeers(dt=0){
    if(!this.peers.size)return;
    const body={x:this.x,z:this.z,yaw:this.yaw,speed:this.speed,sideSpeed:this.sideSpeed||0,impactYawRate:this.impactYawRate||0,mass:this.dynamics?.mass};
    const before={...body},bodies=[body];
    for(const item of this.peers.values()){
      const target=item.target;
      item.predicted??={...target};
      item.age=Number.isFinite(target._sampleTime)?Math.max(0,(performance.now()-target._sampleTime)/1000):(item.age||0)+dt;
      const peer=item.predicted;
      // Extrapolate for at most two network intervals, then stop rather than
      // inventing motion indefinitely when a connection stalls.
      const advance=Math.min(dt,Math.max(0,.15-(item.age-dt)));
      peer.x+=(Math.sin(peer.yaw)*(peer.speed||0)+Math.cos(peer.yaw)*(peer.sideSpeed||0))*advance;
      peer.z+=(Math.cos(peer.yaw)*(peer.speed||0)-Math.sin(peer.yaw)*(peer.sideSpeed||0))*advance;
      peer.yaw+=(peer.impactYawRate||0)*advance;
      const age=Math.min(item.age,.15),blend=1-Math.exp(-8*dt);
      const tx=target.x+(Math.sin(target.yaw)*(target.speed||0)+Math.cos(target.yaw)*(target.sideSpeed||0))*age;
      const tz=target.z+(Math.cos(target.yaw)*(target.speed||0)-Math.sin(target.yaw)*(target.sideSpeed||0))*age;
      peer.x=lerp(peer.x,tx,blend);peer.z=lerp(peer.z,tz,blend);peer.yaw=angleLerp(peer.yaw,target.yaw,blend);
      peer.speed=lerp(peer.speed||0,target.speed||0,blend);peer.sideSpeed=lerp(peer.sideSpeed||0,target.sideSpeed||0,blend);peer.impactYawRate=lerp(peer.impactYawRate||0,target.impactYawRate||0,blend);
      bodies.push(peer);
    }
    const hits=resolveBusCollisions(bodies,{activeBodies:[body]});
    for(const hit of hits)if(hit.a===body||hit.b===body){
      if(!this.pendingImpact)this.pendingImpact=before;
      this.collisionImpact=Math.max(this.collisionImpact||0,hit.closing);
    }
    this.x=body.x;this.z=body.z;this.speed=body.speed;this.sideSpeed=body.sideSpeed;this.impactYawRate=body.impactYawRate;
    if(this.dynamics)this.dynamics.speed=this.speed;
  }
  advancePhysics(dt){
    if(!Number.isFinite(dt)||dt<=0)return;
    // Normal slow frames still simulate all elapsed time (down to 4 FPS).
    // A background/suspension stall parks explicitly instead of running an
    // unbounded catch-up loop or silently advertising motion in slow time.
    if(dt>MAX_PHYSICS_FRAME){
      this.paused=true;this.physicsAccumulator=0;this.previousPhysicsPose=null;
      this.keys?.clear();this.input={throttle:0,brake:0,steer:0};this.pendingImpact=null;
      this.onStall?.();return;
    }
    this.physicsAccumulator=(this.physicsAccumulator||0)+dt;
    const fixed=PHYSICS_STEP;
    for(let steps=0;steps<30&&this.physicsAccumulator+1e-9>=fixed;steps++){
      // Keep the two simulation poses around the displayed instant. Showing
      // only the newest tick repeats poses on fast displays and jumps between
      // them when a frame lands between ticks, especially through tight turns.
      this.previousPhysicsPose??={x:0,z:0,yaw:0};
      this.previousPhysicsPose.x=this.x;this.previousPhysicsPose.z=this.z;this.previousPhysicsPose.yaw=this.yaw;
      this.step(fixed);this.physicsAccumulator-=fixed;
    }
  }
  renderedPose(){
    const pose=this.renderPose??={x:0,z:0,yaw:0};
    const previous=this.previousPhysicsPose;
    const alpha=clamp((this.physicsAccumulator||0)/PHYSICS_STEP,0,1);
    if(previous&&this.started&&!this.paused&&!this.garage){
      pose.x=lerp(previous.x,this.x,alpha);pose.z=lerp(previous.z,this.z,alpha);
      pose.yaw=angleLerp(previous.yaw,this.yaw,alpha);
    }else{pose.x=this.x;pose.z=this.z;pose.yaw=this.yaw;}
    return pose;
  }
  setState(state){if(!state||![state.x,state.z,state.yaw,state.speed].every(Number.isFinite))return false;this.pendingReset=false;this.previousPhysicsPose=null;this.x=clamp(state.x,-1000000,1000000);this.z=clamp(state.z,-1000000,1000000);this.yaw=Math.atan2(Math.sin(state.yaw),Math.cos(state.yaw));this.speed=clamp(state.speed,-BUS_PHYSICS.reverseSpeed,BUS_PHYSICS.maximumSpeed);this.sideSpeed=0;this.impactYawRate=0;this.pendingImpact=null;this.visualCorrection=null;this.physicsAccumulator=0;this.steering=0;this.dynamics=null;this.bus.group.position.set(this.x,roadY(this.z),this.z);this.bus.group.rotation.set(0,this.yaw,0);this.world.update(this.z);return true;}
  setPeers(peers,now=performance.now()){
    const seen=new Set();
    for(const peer of peers){
      if(!peer?.id||![peer.x,peer.z,peer.yaw].every(Number.isFinite))continue;
      seen.add(peer.id);let item=this.peers.get(peer.id);
      if(!item){
        const bus=new Bus({...peer.skin,name:peer.skin?.name||peer.name||'FRIEND'},{remote:true});
        this.scene.add(bus.group);bus.group.position.set(peer.x,roadY(peer.z),peer.z);bus.group.rotation.y=peer.yaw;
        item={bus,target:null,skinRef:null,samples:[]};this.peers.set(peer.id,item);
      }
      const fresh=!item.samples?.length||(Number.isSafeInteger(peer.stateSeq)?
        item.lastSequence===undefined||peer.stateSeq>item.lastSequence:motionChanged(item.target,peer));
      if(fresh){
        const previous=item.samples?.at(-1);
        const time=Number.isFinite(peer._sampleTime)?peer._sampleTime:now;
        const sample={...peer,time:previous?Math.max(time,previous.time+.001):time};
        const teleport=previous&&(peer.reset||Math.hypot(previous.x-peer.x,previous.z-peer.z)>24);
        item.samples=teleport?[]:item.samples||[];item.samples.push(sample);
        if(item.samples.length>32)item.samples.splice(0,item.samples.length-32);
        item.target=peer;item.lastSequence=peer.stateSeq;item.age=Math.max(0,now-time)/1000;
        if(teleport||!item.predicted)item.predicted={...peer};
        if(teleport){item.bus.group.position.set(peer.x,roadY(peer.z),peer.z);item.bus.group.rotation.y=peer.yaw;}
      }
      if(!sameSkin(peer.skin,item.skinRef)||peer.name!==item.profileName){
        item.bus.setSkin({...peer.skin,name:peer.skin?.name||peer.name||'FRIEND'});
        item.skinRef=peer.skin;item.profileName=peer.name;
      }
    }
    for(const [id,item]of this.peers)if(!seen.has(id)){this.scene.remove(item.bus.group);item.bus.dispose();this.peers.delete(id);}
  }
  renderPeers(dt,renderX,renderZ,now=performance.now()){
    for(const item of this.peers.values()){
      const t=sampleRemote(item.samples||[{...item.target,time:now}],now-REMOTE_DELAY,item.renderSample??={});
      if(!t)continue;
      const p=item.bus.group.position;p.set(t.x,roadY(t.z),t.z);
      item.bus.group.rotation.y=t.yaw;item.bus.animate(t.speed||0,dt);
      const distance=Math.hypot(t.x-renderX,t.z-renderZ);
      item.bus.setDistance?.(distance);item.bus.group.visible=distance<1000;
    }
  }
  horn(){} // Sound is owned by the application's shared, mute-aware audio controller.
  step(dt){
    const forward=this.keys.has('w')||this.keys.has('arrowup'),reverse=this.keys.has('s')||this.keys.has('arrowdown');
    let throttle=this.input.throttle,brake=this.input.brake+(this.keys.has(' ')?1:0);
    if(forward){if(this.speed<-.2)brake=1;else throttle+=1;}
    if(reverse){if(this.speed>.2)brake=1;else throttle-=.7;}
    throttle=clamp(throttle,-1,1);brake=clamp(brake,0,1);
    const steer=clamp(this.input.steer-(this.keys.has('a')||this.keys.has('arrowleft')?1:0)+(this.keys.has('d')||this.keys.has('arrowright')?1:0),-1,1);
    const lateral=Math.abs((this.x-roadX(this.z))*Math.cos(roadYaw(this.z)));
    this.offroad=lateral+1.0>ROAD_HALF_WIDTH;
    this.dynamics=stepVehicle(this.dynamics||{speed:this.speed,steering:this.steering},{throttle,brake,steer,passengers:this.passengers,offroad:this.offroad},dt);
    this.speed=this.dynamics.speed;this.steering=this.dynamics.steering;
    this.throttle=throttle;this.braking=brake;
    this.yaw+=this.dynamics.yawRate*dt;
    this.sideSpeed=(this.sideSpeed||0)*Math.exp(-2.7*dt);this.impactYawRate=(this.impactYawRate||0)*Math.exp(-3.2*dt);
    this.yaw+=this.impactYawRate*dt;
    const travelYaw=this.yaw+this.dynamics.slipAngle;
    this.x+=Math.sin(travelYaw)*this.speed*dt;this.z+=Math.cos(travelYaw)*this.speed*dt;this.distance+=Math.abs(this.speed)*dt/1000;
    this.x+=Math.cos(this.yaw)*this.sideSpeed*dt;this.z-=Math.sin(this.yaw)*this.sideSpeed*dt;
    this.resolvePeers(dt);
    if(Math.abs(this.x-roadX(this.z))>24){this.x=lerp(this.x,roadX(this.z)+Math.sign(this.x-roadX(this.z))*22,1-Math.exp(-2.45*dt));this.speed*=Math.exp(-3*dt);this.dynamics.speed=this.speed;}
    const nearestStop=Math.round((this.z-70)/480)*480+70;const stopId=Math.round((nearestStop-70)/480);
    if(Math.abs(this.z-nearestStop)<12&&this.speed<2&&this.speed>=0&&(this.x-roadX(this.z))*Math.cos(roadYaw(this.z))>0&&Math.abs(this.x-roadX(this.z))<6.5&&!this.collected.has(stopId)){this.collected.add(stopId);const passengers=2+Math.abs(stopId%4);this.passengers+=passengers;this.onPickup({passengers,total:this.passengers,stop:stopId});}
  }
  frame(){
    if(this.disposed)return;this.frameId=requestAnimationFrame(this.frame);const elapsed=this.clock.getDelta(),dt=Math.min(Math.max(0,elapsed),MAX_PHYSICS_FRAME);this.elapsed+=dt;
    if(this.started&&!this.paused&&!this.garage)this.advancePhysics(elapsed);
    else{this.physicsAccumulator=0;this.previousPhysicsPose=null;}
    const correction=this.visualCorrection;
    if(correction){const decay=Math.exp(-14*dt);correction.x*=decay;correction.z*=decay;correction.yaw*=decay;}
    const pose=this.renderedPose();
    const renderX=pose.x+(correction?.x||0),renderZ=pose.z+(correction?.z||0),renderYaw=pose.yaw+(correction?.yaw||0);
    const height=roadY(renderZ);this.bus.group.position.set(renderX,height+Math.sin(this.elapsed*1.4)*.008,renderZ);this.bus.group.rotation.y=renderYaw;const pitch=Math.atan2(roadY(renderZ+3)-roadY(renderZ-3),6);this.bus.group.rotation.x=lerp(this.bus.group.rotation.x,-pitch+(this.dynamics?.pitch||0),1-Math.exp(-8*dt));this.bus.group.rotation.z=lerp(this.bus.group.rotation.z,this.dynamics?.roll||0,1-Math.exp(-8*dt));this.bus.animate(this.paused?0:this.speed,dt,this.dynamics?.wheelAngle||0);
    this.world.update(renderZ);this.clouds.position.z=Math.floor(renderZ/1000)*1000;
    this.sun.position.set(renderX-70,height+100,renderZ+80);this.sun.target.position.set(renderX,height,renderZ+30);
    this.renderPeers(dt,renderX,renderZ);
    const targetPosition=this.targetPosition,targetLook=this.targetLook;
    const chase=chaseCamera(this.speed,this.dynamics?.acceleration);
    const forward=this.cameraForward.set(Math.sin(renderYaw),0,Math.cos(renderYaw));const right=this.cameraRight.set(Math.cos(renderYaw),0,-Math.sin(renderYaw));
    if(!this.started||this.garage){targetPosition.set(renderX,height+8.5,renderZ).addScaledVector(forward,18).addScaledVector(right,16+Math.sin(this.elapsed*.13)*1.3);targetLook.set(renderX,height+1.9,renderZ).addScaledVector(right,this.camera.aspect>1?-5:0);}
    else if(this.cameraMode===1){
      // Seat position is in the imported bus's local coordinates. The driver's
      // seat is on -X: facing +Z, this is the right-hand side of the cabin.
      this.bus.group.localToWorld(targetPosition.set(-.46,2.12,3.68));
      this.bus.group.localToWorld(targetLook.set(-.46,1.9,13.68));
    }
    else if(this.cameraMode===3){
      this.bus.group.localToWorld(targetPosition.set(0,2.15,-4.18));
      this.bus.group.localToWorld(targetLook.set(0,2.05,3.4));
    }
    else if(this.cameraMode===2){targetPosition.set(renderX,height+6.8,renderZ).addScaledVector(forward,-15).addScaledVector(right,13);targetLook.set(renderX,height+2,renderZ).addScaledVector(forward,12);}
    else if(this.cameraControls?.active){
      const orbit=this.cameraControls.pose(chase);
      targetPosition.set(renderX,height+orbit.height,renderZ).addScaledVector(forward,-orbit.back).addScaledVector(right,orbit.side);
      targetLook.set(renderX,height+orbit.pivot,renderZ);
    }
    else{targetPosition.set(renderX,height+chase.height,renderZ).addScaledVector(forward,-chase.distance);targetLook.set(renderX,height+chase.lookHeight,renderZ).addScaledVector(forward,chase.lookAhead);}
    const driverView=this.started&&!this.garage&&this.cameraMode===1;
    this.bus.cockpit.visible=true;animateCockpit(this.bus.cockpit,this.steering);
    const insideView=driverView||(this.started&&!this.garage&&this.cameraMode===3);
    const chaseView=this.started&&!this.garage&&this.cameraMode===0;
    const targetFov=insideView?chase.insideFov:chaseView?chase.fov:this.started&&!this.garage?chase.scenicFov:52;
    const cameraFov=Math.abs(this.camera.fov-targetFov)<.01?targetFov:lerp(this.camera.fov,targetFov,1-Math.exp(-3*dt)),cameraNear=insideView?.05:.2;
    if(this.camera.fov!==cameraFov||this.camera.near!==cameraNear){this.camera.fov=cameraFov;this.camera.near=cameraNear;this.camera.updateProjectionMatrix();}
    if(insideView){
      // Lock to the seat instead of chasing it through the rear seats on turns.
      this.camera.position.copy(targetPosition);this.lookAt.copy(targetLook);
      this.camera.up.set(0,1,0).applyQuaternion(this.bus.group.quaternion);
    }else{
      // Follow actual translation before damping the offset. World-space damping
      // alone leaves the camera another 11 m behind at 120 km/h.
      if(chaseView&&this.cameraAnchor){
        const dx=renderX-this.cameraAnchor.x,dz=renderZ-this.cameraAnchor.z;
        this.camera.position.x+=dx;this.camera.position.z+=dz;
        this.lookAt.x+=dx;this.lookAt.z+=dz;
      }
      this.camera.position.lerp(targetPosition,1-Math.exp(-3*dt));this.lookAt.lerp(targetLook,1-Math.exp(-5*dt));this.camera.up.set(0,1,0);
      if(chaseView&&this.cameraControls?.active){
        // Interpolating between opposite viewing angles cuts through the bus.
        // Keep even that transition outside a sphere enclosing its body.
        const dx=this.camera.position.x-renderX,dy=this.camera.position.y-height-1.8,dz=this.camera.position.z-renderZ;
        const radius=Math.hypot(dx,dy,dz);
        if(radius<7.2){
          if(radius>.001)this.camera.position.set(renderX+dx*7.2/radius,height+1.8+dy*7.2/radius,renderZ+dz*7.2/radius);
          else this.camera.position.copy(targetPosition);
        }
      }
    }
    this.cameraAnchor??=new THREE.Vector3();this.cameraAnchor.set(renderX,height,renderZ);
    this.camera.lookAt(this.lookAt);this.renderer.render(this.scene,this.camera);
    this.telemetryTime+=dt;if(this.telemetryTime>.1){this.telemetryTime=0;let nextStop=Math.ceil((this.z-70)/480)*480+70;const stopId=Math.round((nextStop-70)/480);if(this.collected.has(stopId))nextStop+=480;this.onTelemetry({speed:Math.round(Math.abs(this.speed)*3.6),distance:this.distance,stopDistance:Math.max(0,nextStop-this.z),throttle:this.throttle||0,braking:this.braking||0,offroad:!!this.offroad,passengers:this.passengers,heading:this.yaw,camera:['Chase','Driver','Scenic','Cabin'][this.cameraMode],quality:this.quality});}
  }
  dispose(){this.cameraControls?.dispose();this.disposed=true;cancelAnimationFrame(this.frameId);window.removeEventListener('keydown',this.onKeyDown);window.removeEventListener('keyup',this.onKeyUp);window.removeEventListener('blur',this.onBlur);this.resizeObserver.disconnect();this.world.dispose();this.bus.dispose();for(const item of this.peers.values())item.bus.dispose();this.clouds.dispose();this.clouds.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});this.renderer.dispose();}
}
