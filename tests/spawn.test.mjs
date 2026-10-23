import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {spawnState} from '../shared/spawn.js';
import {roadX,roadYaw} from '../src/world.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function visibleFrom(driver,friend){
 const forward=new THREE.Vector3(Math.sin(driver.yaw),0,Math.cos(driver.yaw));
 const origin=new THREE.Vector3(driver.x,0,driver.z),camera=new THREE.PerspectiveCamera(52,16/9,.2,1200);
 camera.position.copy(origin).addScaledVector(forward,-17);camera.position.y=6.4;
 camera.lookAt(origin.clone().addScaledVector(forward,13).add(new THREE.Vector3(0,2.4,0)));camera.updateMatrixWorld();
 const screen=new THREE.Vector3(friend.x,2,friend.z).project(camera);
 return Math.abs(screen.x)<1&&Math.abs(screen.y)<1&&screen.z>-1&&screen.z<1;
}
test('fresh friends spawn side by side and are visible from both default cameras',()=>{
 const a=spawnState(),b=spawnState([{state:a}]);
 assert.ok(distance(a,b)>6&&distance(a,b)<8);
 assert.ok(visibleFrom(a,b));assert.ok(visibleFrom(b,a));
});
test('late joiners appear beside a friend already kilometres down a curving road',()=>{
 for(const z of [2400,10000,85000])for(const lateral of [0,3.3,-3.3]){
  const a={x:roadX(z)+lateral,z,yaw:roadYaw(z),speed:20},b=spawnState([a]);
  assert.ok(distance(a,b)<10,'Must not spawn back at the start.');
  assert.ok(visibleFrom(a,b));assert.ok(visibleFrom(b,a));
 }
});
test('eight buses get separate spaces and a departing driver leaves a reusable space',()=>{
 const players=[];for(let i=0;i<8;i++)players.push(spawnState(players));
 for(let a=0;a<players.length;a++)for(let b=0;b<a;b++)assert.ok(distance(players[a],players[b])>=6);
 const remaining=players.slice(1),replacement=spawnState(remaining);
 for(const p of remaining)assert.ok(distance(p,replacement)>=6);
 assert.ok(distance(replacement,remaining[0])<50);
});
