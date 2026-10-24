import * as THREE from 'three';
import { Bus } from './bus.js';
import { createCockpit, animateCockpit } from './cockpit.js';
import { stepVehicle } from './vehicle-physics.js';
import { ROAD_HALF_WIDTH, LANE_CENTER } from '../shared/road.js';
import { World, roadX, roadY, roadYaw } from './world.js';

const clamp=THREE.MathUtils.clamp;
const lerp=THREE.MathUtils.lerp;
const angleLerp=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;

export class BusGame {
  constructor(canvas,{onTelemetry=()=>{},onPickup=()=>{}}={}){
    this.canvas=canvas;this.onTelemetry=onTelemetry;this.onPickup=onPickup;this.keys=new Set();this.input={throttle:0,brake:0,steer:0};this.started=false;this.garage=true;this.paused=false;this.cameraMode=0;this.peers=new Map();this.elapsed=0;this.telemetryTime=0;this.distance=0;this.passengers=0;this.collected=new Set();this.quality='auto';this.skin={color:'#e4a44b',accent:'#f5eed9',pattern:'stripe',name:'COAST CLUB',destination:'THE LONG WAY HOME'};
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#d5e7e4');this.scene.fog=new THREE.Fog('#d5e7e4',180,810);
    this.camera=new THREE.PerspectiveCamera(52,1,.2,1200);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.13;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.ambient=new THREE.HemisphereLight('#d9eeff','#74835c',2.3);this.scene.add(this.ambient);
    this.sun=new THREE.DirectionalLight('#fff1ce',3.2);this.sun.position.set(-80,120,65);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);this.sun.shadow.camera.left=-60;this.sun.shadow.camera.right=60;this.sun.shadow.camera.top=60;this.sun.shadow.camera.bottom=-60;this.sun.shadow.camera.far=340;this.sun.shadow.normalBias=.05;this.sun.shadow.bias=-.00025;this.scene.add(this.sun,this.sun.target);
    this.world=new World(this.scene);this.bus=new Bus(this.skin);this.bus.cockpit=createCockpit();this.bus.group.add(this.bus.cockpit);this.scene.add(this.bus.group);
    this.cameraForward=new THREE.Vector3();this.cameraRight=new THREE.Vector3();this.targetPosition=new THREE.Vector3();this.targetLook=new THREE.Vector3();
    this.makeClouds();this.reset();this.camera.position.set(this.x+17,roadY(this.z)+9,this.z+19);this.lookAt=new THREE.Vector3(this.x,roadY(this.z)+1.7,this.z);this.camera.lookAt(this.lookAt);
    this.onKeyDown=e=>{if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||!this.started||this.paused||this.garage||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;const key=e.key.toLowerCase();if(key===' '&&e.target.closest?.('button,a[href]'))return;if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();if(!this.keys.has(key)){if(key==='r')this.reset();if(key==='c')this.setCamera();}this.keys.add(key);};
    this.onKeyUp=e=>this.keys.delete(e.key.toLowerCase());this.onBlur=()=>{this.keys.clear();this.input={throttle:0,brake:0,steer:0};};
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
  start(){this.started=true;this.garage=false;this.paused=false;this.keys.clear();}
  setPaused(value){this.paused=value;if(value)this.onBlur();}
  setGarage(value){this.garage=!!value;if(value){this.paused=true;this.onBlur();}}
  setInput(input){Object.assign(this.input,input);}
  setSkin(skin){Object.assign(this.skin,skin);this.bus.setSkin(this.skin);}
  setEnvironment(value){if(!['coast','highlands'].includes(value))return;this.world.setEnvironment(value);this.world.update(this.z);}
  setTime(value){const palette={day:{sky:'#d5e7e4',sun:'#fff1ce',ground:'#74835c',intensity:3.2,ambient:2.3,exposure:1.13},sunset:{sky:'#e4baa0',sun:'#ffc18b',ground:'#74616a',intensity:2.8,ambient:1.8,exposure:1.08},night:{sky:'#152d41',sun:'#8fbbdc',ground:'#253c48',intensity:.8,ambient:1.1,exposure:1}}[value]||null;if(!palette)return;this.time=value;this.scene.background.set(palette.sky);this.scene.fog.color.set(palette.sky);this.sun.color.set(palette.sun);this.sun.intensity=palette.intensity;this.ambient.groundColor.set(palette.ground);this.ambient.intensity=palette.ambient;this.renderer.toneMappingExposure=palette.exposure;this.bus.lampMaterial.emissiveIntensity=value==='night'?3:.45;this.clouds.visible=value!=='night';}
  setQuality(value){this.quality=value;const low=value==='low'||(value==='auto'&&(navigator.hardwareConcurrency||8)<5);this.renderer.setPixelRatio(Math.min(devicePixelRatio,low?1:1.6));this.renderer.shadowMap.enabled=!low;this.scene.fog.far=low?530:810;this.resize();}
  setCamera(){this.cameraMode=(this.cameraMode+1)%4;return ['Chase','Driver','Scenic','Cabin'][this.cameraMode];}
  reset(){this.z=this.started?Math.max(0,this.z||0):0;this.yaw=roadYaw(this.z);this.x=roadX(this.z)+Math.cos(this.yaw)*LANE_CENTER;this.speed=0;this.steering=0;this.dynamics=null;if(this.bus){this.bus.group.position.set(this.x,roadY(this.z),this.z);this.bus.group.rotation.set(0,this.yaw,0);}}
  getState(){return {x:this.x,z:this.z,yaw:this.yaw,speed:this.speed};}
  setState(state){if(!state||![state.x,state.z,state.yaw,state.speed].every(Number.isFinite))return false;this.x=clamp(state.x,-1000000,1000000);this.z=clamp(state.z,-1000000,1000000);this.yaw=Math.atan2(Math.sin(state.yaw),Math.cos(state.yaw));this.speed=clamp(state.speed,-5,31);this.steering=0;this.dynamics=null;this.bus.group.position.set(this.x,roadY(this.z),this.z);this.bus.group.rotation.set(0,this.yaw,0);this.world.update(this.z);return true;}
  setPeers(peers){const seen=new Set();for(const peer of peers){if(!peer?.id||![peer.x,peer.z,peer.yaw].every(Number.isFinite))continue;seen.add(peer.id);let item=this.peers.get(peer.id);if(!item){const bus=new Bus({...peer.skin,name:peer.skin?.name||peer.name||'FRIEND'});this.scene.add(bus.group);bus.group.position.set(peer.x,roadY(peer.z),peer.z);bus.group.rotation.y=peer.yaw;item={bus,target:peer,skinRef:null};this.peers.set(peer.id,item);}item.target=peer;if(peer.skin!==item.skinRef){item.bus.setSkin({...peer.skin,name:peer.skin?.name||peer.name||'FRIEND'});item.skinRef=peer.skin;}}for(const [id,item]of this.peers)if(!seen.has(id)){this.scene.remove(item.bus.group);item.bus.dispose();this.peers.delete(id);}}
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
    const travelYaw=this.yaw+this.dynamics.slipAngle;
    this.x+=Math.sin(travelYaw)*this.speed*dt;this.z+=Math.cos(travelYaw)*this.speed*dt;this.distance+=Math.abs(this.speed)*dt/1000;
    if(Math.abs(this.x-roadX(this.z))>24){this.x=lerp(this.x,roadX(this.z)+Math.sign(this.x-roadX(this.z))*22,.04);this.speed*=Math.exp(-3*dt);this.dynamics.speed=this.speed;}
    const nearestStop=Math.round((this.z-70)/480)*480+70;const stopId=Math.round((nearestStop-70)/480);
    if(Math.abs(this.z-nearestStop)<12&&this.speed<2&&this.speed>=0&&(this.x-roadX(this.z))*Math.cos(roadYaw(this.z))>0&&Math.abs(this.x-roadX(this.z))<6.5&&!this.collected.has(stopId)){this.collected.add(stopId);const passengers=2+Math.abs(stopId%4);this.passengers+=passengers;this.onPickup({passengers,total:this.passengers,stop:stopId});}
  }
  frame(){
    if(this.disposed)return;this.frameId=requestAnimationFrame(this.frame);const dt=Math.min(this.clock.getDelta(),.05);this.elapsed+=dt;
    if(this.started&&!this.paused&&!this.garage)this.step(dt);
    const height=roadY(this.z);this.bus.group.position.set(this.x,height+Math.sin(this.elapsed*1.4)*.008,this.z);this.bus.group.rotation.y=this.yaw;const pitch=Math.atan2(roadY(this.z+3)-roadY(this.z-3),6);this.bus.group.rotation.x=lerp(this.bus.group.rotation.x,-pitch,.1);this.bus.group.rotation.z=lerp(this.bus.group.rotation.z,this.dynamics?.roll||0,1-Math.exp(-8*dt));this.bus.animate(this.paused?0:this.speed,dt);
    this.world.update(this.z);this.clouds.position.z=Math.floor(this.z/1000)*1000;
    this.sun.position.set(this.x-70,height+100,this.z+80);this.sun.target.position.set(this.x,height,this.z+30);
    for(const item of this.peers.values()){const p=item.bus.group.position;const t=item.target;p.x=lerp(p.x,t.x,1-Math.exp(-10*dt));p.z=lerp(p.z,t.z,1-Math.exp(-10*dt));p.y=roadY(p.z);item.bus.group.rotation.y=angleLerp(item.bus.group.rotation.y,t.yaw,1-Math.exp(-10*dt));item.bus.animate(t.speed||0,dt);item.bus.group.visible=Math.abs(t.z-this.z)<1000;}
    const targetPosition=this.targetPosition,targetLook=this.targetLook;
    const forward=this.cameraForward.set(Math.sin(this.yaw),0,Math.cos(this.yaw));const right=this.cameraRight.set(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    if(!this.started||this.garage){targetPosition.set(this.x,height+8.5,this.z).addScaledVector(forward,18).addScaledVector(right,16+Math.sin(this.elapsed*.13)*1.3);targetLook.set(this.x,height+1.9,this.z).addScaledVector(right,this.camera.aspect>1?-5:0);}
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
    else if(this.cameraMode===2){targetPosition.set(this.x,height+6.8,this.z).addScaledVector(forward,-15).addScaledVector(right,13);targetLook.set(this.x,height+2,this.z).addScaledVector(forward,12);}
    else{targetPosition.set(this.x,height+6.4+this.speed*.035,this.z).addScaledVector(forward,-17-this.speed*.07);targetLook.set(this.x,height+2.4,this.z).addScaledVector(forward,13+this.speed*.2);}
    const driverView=this.started&&!this.garage&&this.cameraMode===1;
    this.bus.cockpit.visible=true;animateCockpit(this.bus.cockpit,this.steering);
    const insideView=driverView||(this.started&&!this.garage&&this.cameraMode===3);
    const cameraFov=insideView?68:52,cameraNear=insideView?.05:.2;
    if(this.camera.fov!==cameraFov||this.camera.near!==cameraNear){this.camera.fov=cameraFov;this.camera.near=cameraNear;this.camera.updateProjectionMatrix();}
    if(insideView){
      // Lock to the seat instead of chasing it through the rear seats on turns.
      this.camera.position.copy(targetPosition);this.lookAt.copy(targetLook);
      this.camera.up.set(0,1,0).applyQuaternion(this.bus.group.quaternion);
    }else{
      this.camera.position.lerp(targetPosition,1-Math.exp(-3*dt));this.lookAt.lerp(targetLook,1-Math.exp(-5*dt));this.camera.up.set(0,1,0);
    }
    this.camera.lookAt(this.lookAt);this.renderer.render(this.scene,this.camera);
    this.telemetryTime+=dt;if(this.telemetryTime>.1){this.telemetryTime=0;let nextStop=Math.ceil((this.z-70)/480)*480+70;const stopId=Math.round((nextStop-70)/480);if(this.collected.has(stopId))nextStop+=480;this.onTelemetry({speed:Math.round(Math.abs(this.speed)*3.6),distance:this.distance,stopDistance:Math.max(0,nextStop-this.z),throttle:this.throttle||0,braking:this.braking||0,offroad:!!this.offroad,passengers:this.passengers,heading:this.yaw,camera:['Chase','Driver','Scenic','Cabin'][this.cameraMode],quality:this.quality});}
  }
  dispose(){this.disposed=true;cancelAnimationFrame(this.frameId);window.removeEventListener('keydown',this.onKeyDown);window.removeEventListener('keyup',this.onKeyUp);window.removeEventListener('blur',this.onBlur);this.resizeObserver.disconnect();this.world.dispose();this.bus.dispose();for(const item of this.peers.values())item.bus.dispose();this.clouds.dispose();this.clouds.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});this.renderer.dispose();}
}
