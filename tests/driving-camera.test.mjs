import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chaseCamera } from '../src/driving-camera.js';

test('the chase camera moves lower and closer as speed and acceleration rise', () => {
  const idle = chaseCamera(), cruise = chaseCamera(60 / 3.6), fast = chaseCamera(120 / 3.6), pulling = chaseCamera(120 / 3.6, 2);
  assert.ok(idle.distance > cruise.distance && cruise.distance > fast.distance && fast.distance > pulling.distance);
  assert.ok(idle.height > cruise.height && cruise.height > fast.height && fast.height > pulling.height);
  assert.ok(fast.lookAhead > idle.lookAhead);
  assert.ok(fast.fov > idle.fov && pulling.fov < 64);
  assert.ok(pulling.distance > 11, 'camera stays safely behind the 10.934 m bus');
});
test('closer high speed framing keeps the complete bus visible on wide and tall screens', () => {
  for (const aspect of [16 / 9, 9 / 16]) {
    for (const speed of [0, 120 / 3.6]) {
      for (const acceleration of [-6, 0, 2]) {
        const view = chaseCamera(speed, acceleration);
        const camera = new THREE.PerspectiveCamera(view.fov, aspect, .2, 1200);
        camera.position.set(0, view.height, -view.distance);
        camera.lookAt(0, view.lookHeight, view.lookAhead);camera.updateMatrixWorld();
        for (const x of [-1.3, 1.3]) for (const y of [0, 3.3]) for (const z of [-5.467, 5.467]) {
          const point = new THREE.Vector3(x,y,z).project(camera);
          assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && point.z < 1, `bus corner stays in frame at ${aspect}, ${speed}`);
        }
      }
    }
  }
});
test('braking provides a restrained camera response and reverse uses acceleration along travel', () => {
  const cruise = chaseCamera(120 / 3.6), braking = chaseCamera(120 / 3.6, -6);
  assert.ok(braking.distance < cruise.distance && braking.distance > 11);
  assert.ok(braking.height > cruise.height);
  assert.ok(braking.fov < cruise.fov && cruise.fov - braking.fov <= .5);
  assert.deepEqual(chaseCamera(-4, -2), chaseCamera(4, 2));
  assert.deepEqual(chaseCamera(-4, 2), chaseCamera(4, -2));
});
test('camera tuning stays finite and bounded for reverse and invalid telemetry', () => {
  for (const [speed, acceleration] of [[-4,-6],[NaN,Infinity],[Infinity,NaN],[10000,10000]]) {
    const view = chaseCamera(speed, acceleration);
    assert.ok(Object.values(view).every(Number.isFinite));
    assert.ok(view.fov >= 52 && view.fov < 64);
    assert.ok(view.height > 3.5);
  }
});

test('30 and 90 km/h have distinct chase and seat speed cues', () => {
  const town=chaseCamera(30/3.6),highway=chaseCamera(90/3.6);
  assert.ok(highway.fov-town.fov>7, 'highway framing visibly opens up');
  assert.ok(highway.insideFov-town.insideFov>2, 'seat views also communicate speed');
  assert.ok(highway.scenicFov>town.scenicFov, 'the side camera retains a speed response');
  assert.ok(highway.height<town.height, 'lower eye line strengthens near-road parallax');
  assert.deepEqual(chaseCamera(-90/3.6),highway, 'speed cues work in either travel direction');
});

test('actual driving passes stationary scenery about three times faster at 90 than 30 km/h', async () => {
  const {BusGame}=await import('../src/game.js');
  const {roadX}=await import('../src/world.js');
  const travel=[];
  for(const kmh of [30,90]){
    const game=Object.assign(Object.create(BusGame.prototype),{
      x:roadX(0),z:0,yaw:0,speed:kmh/3.6,steering:0,distance:0,
      keys:new Set(),input:{throttle:0,brake:0,steer:0},peers:new Map(),
      collected:new Set(),passengers:0,onPickup(){},
    });
    for(let frame=0;frame<60;frame++)game.advancePhysics(1/60);
    travel.push(game.z);
  }
  assert.ok(travel[0]>8 && travel[0]<8.4);
  assert.ok(travel[1]/travel[0]>2.9 && travel[1]/travel[0]<3.1);
  // The same stationary roadside point must sweep faster in screen space too,
  // even with the wider high-speed FOV (which otherwise reduces optical flow).
  const marker=new THREE.Vector3(4.8,0,30),sweep=[];
  for(const [i,kmh]of [30,90].entries()){
    const view=chaseCamera(kmh/3.6),camera=new THREE.PerspectiveCamera(view.fov,16/9,.2,1200);
    const project=z=>{
      camera.position.set(0,view.height,z-view.distance);
      camera.lookAt(0,view.lookHeight,z+view.lookAhead);camera.updateMatrixWorld();
      return marker.clone().project(camera);
    };
    sweep.push(project(0).distanceTo(project(travel[i])));
  }
  assert.ok(sweep[1]>sweep[0]*2, 'higher speed produces visibly faster roadside motion');
});

test('highway chase framing follows translation without a growing speed-dependent gap', async () => {
  const { BusGame } = await import('../src/game.js');
  const previousRAF=globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame=()=>0;
  try {
    const group=new THREE.Group(),cockpit=new THREE.Group();
    cockpit.userData.wheel=new THREE.Object3D();group.add(cockpit);
    const game=Object.assign(Object.create(BusGame.prototype),{
      clock:{getDelta:()=>1/60},elapsed:0,started:true,paused:true,garage:false,
      z:0,x:0,yaw:0,speed:120/3.6,steering:0,bus:{group,cockpit,animate(){}},
      world:{update(){}},clouds:new THREE.Group(),sun:new THREE.DirectionalLight(),
      peers:new Map(),cameraMode:0,camera:new THREE.PerspectiveCamera(52),lookAt:new THREE.Vector3(),
      cameraForward:new THREE.Vector3(),cameraRight:new THREE.Vector3(),targetPosition:new THREE.Vector3(),targetLook:new THREE.Vector3(),
      renderer:{render(){}},telemetryTime:0,onTelemetry(){},collected:new Set(),
    });
    for(let i=0;i<300;i++){game.z+=game.speed/60;game.frame();}
    assert.ok(Math.abs((game.z-game.camera.position.z)-chaseCamera(game.speed).distance)<.01);
    assert.ok(game.camera.fov > 58);
  } finally { globalThis.requestAnimationFrame=previousRAF; }
});
