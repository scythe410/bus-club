import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BusGame} from '../src/game.js';
import {roadX} from '../src/world.js';
import {engineVoice} from '../src/audio.js';

function vehicle(key,yaw,touch=0){
  return Object.assign(Object.create(BusGame.prototype),{
    keys:new Set(key?[key]:[]),input:{throttle:0,brake:0,steer:touch},
    x:roadX(0),z:0,yaw,speed:10,steering:0,distance:0,
    collected:new Set(),passengers:0,onPickup:()=>{},
  });
}
// Project the simulated movement through the actual chase-camera orientation.
// Looking along +Z reverses screen X; testing raw world X misses this regression.
for(const yaw of [0,Math.PI/2,-Math.PI/2]){
  for(const [key,direction] of [['a',-1],['arrowleft',-1],['d',1],['arrowright',1]]){
    test(`${key} steers screen-${direction<0?'left':'right'} at heading ${yaw}`,()=>{
      const bus=vehicle(key,yaw),origin=new THREE.Vector3(bus.x,0,bus.z);
      const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
      const camera=new THREE.PerspectiveCamera(52,1,.2,1200);
      camera.position.copy(origin).addScaledVector(forward,-17);camera.position.y=6.4;
      camera.lookAt(origin.clone().addScaledVector(forward,13).add(new THREE.Vector3(0,2.4,0)));camera.updateMatrixWorld();
      for(let i=0;i<12;i++)bus.step(1/60);
      const screen=new THREE.Vector3(bus.x,0,bus.z).project(camera);
      assert.ok(screen.x*direction>0,`${key} should move the bus to the expected side of the view`);
    });
  }
}
for(const direction of [-1,1])test(`touch steering follows ${direction<0?'left':'right'} input`,()=>{
  const bus=vehicle(null,0,direction);for(let i=0;i<12;i++)bus.step(1/60);
  assert.ok(bus.x*direction<0);
});
test('engine idles, responds to throttle and speed, and drops revs on upshifts',()=>{
  const idle=engineVoice(0,0),revving=engineVoice(0,1);
  assert.ok(idle.frequency>20&&idle.volume>0);
  assert.ok(revving.frequency>idle.frequency&&revving.volume>idle.volume);
  assert.ok(engineVoice(10,1).frequency>engineVoice(5,1).frequency);
  assert.ok(engineVoice(12.1,1).frequency<engineVoice(11.9,1).frequency);
  for(const speed of [0,40,100,130,NaN]){
    const voice=engineVoice(speed,1);assert.ok(Object.values(voice).every(Number.isFinite));
    assert.ok(voice.volume<.2);
  }
});
