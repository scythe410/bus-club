import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialRoomState,updateRoomMotion,recoverRoomMotion} from '../shared/room-state.js';
import {busContact} from '../shared/collisions.js';
import {spawnState} from '../shared/spawn.js';

test('authority compares staggered equal-speed samples at a common time without false collisions',()=>{
 const now=10000,speed=120/3.6;
 const players=[{id:'follower',state:initialRoomState({x:0,z:0,yaw:0,speed},now-75)},{id:'leader',state:initialRoomState({x:0,z:12,yaw:0,speed},now-75)}];
 for(const p of players)p.state.paused=false;
 const unchanged=structuredClone(players[1].state);
 assert.deepEqual(updateRoomMotion(players,'follower',{x:0,z:2.5,yaw:0,speed},now),[]);
 assert.equal(players[0].state.stateSeq,1);assert.equal(players[0].state.stateTime,now);
 assert.deepEqual(players[1].state,unchanged,'unrelated snapshots never make the leader sample fresh');
});

test('motion accepts legitimate travel after a transport stall longer than five seconds',()=>{
 const player={id:'one',state:initialRoomState({x:0,z:0,yaw:0,speed:30},1000)};
 player.state.paused=false;
 assert.deepEqual(updateRoomMotion([player],'one',{x:0,z:300,yaw:0,speed:30},11000),[]);
 assert.equal(player.state.z,300);assert.equal(player.state.stateTime,11000);
});

test('invalid speed, teleport and turn are rejected, and correction acknowledgements allow recovery',()=>{
 const player={id:'one',state:initialRoomState({x:0,z:0,yaw:0,speed:0},1000)};
 for(const input of [{x:0,z:0,yaw:0,speed:1e7},{x:0,z:1000,yaw:0,speed:0},{x:0,z:0,yaw:3,speed:0}])assert.throws(()=>updateRoomMotion([player],'one',input,1075));
 assert.equal(player.state.z,0);recoverRoomMotion(player,1075);
 assert.equal(player.state.collisionRevision,1);
 updateRoomMotion([player],'one',{x:0,z:.5,yaw:0,speed:1,collisionRevision:1},1150);
 assert.equal(player.state.z,.5);assert.equal(player.state.stateSeq,2);
});

test('explicit reset reserves a free road slot without moving another driver and preserves pause',()=>{
 const occupied=spawnState(),driver={id:'one',state:initialRoomState({...occupied,x:occupied.x+20},1000)};
 const other={id:'two',state:initialRoomState(occupied,1000)},before=structuredClone(other.state);
 const corrections=updateRoomMotion([driver,other],'one',{...driver.state,reset:true,paused:true},1075);
 assert.deepEqual(corrections,[driver]);assert.equal(busContact(driver.state,other.state),null);
 assert.deepEqual(other.state,before);assert.equal(driver.state.paused,true);
 assert.equal(driver.state.speed,0);assert.equal(driver.state.collisionRevision,1);
});

test('high-frequency movement cannot collect fresh jitter slack for each packet',()=>{
 const player={id:'one',state:initialRoomState({x:0,z:0,yaw:0,speed:30},0)};
 updateRoomMotion([player],'one',{x:0,z:3,yaw:0,speed:30},25);
 const accepted=structuredClone(player.state);
 assert.throws(()=>updateRoomMotion([player],'one',{x:0,z:6,yaw:0,speed:30,movementSlack:1e6},50),/moved too far/);
 assert.deepEqual(player.state,accepted,'a rejected sample and client-supplied budget cannot alter authority');
});

test('legitimate maximum-speed samples tolerate repeated jitter bursts',()=>{
 const player={id:'one',state:initialRoomState({x:0,z:0,yaw:0,speed:40},0)};
 for(let pair=1;pair<=20;pair++)for(const [offset,z]of [[0,pair*6-3],[1,pair*6]]){
  assert.doesNotThrow(()=>updateRoomMotion([player],'one',{x:0,z,yaw:0,speed:40},pair*150+offset));
 }
 assert.equal(player.state.z,120);
});

test('five-FPS duplicate samples keep the full movement interval available',()=>{
 const player={id:'one',state:{...initialRoomState({x:0,z:0,yaw:0,speed:100/3},0),paused:false}};
 for(let now=75;now<=1500;now+=75){
  const z=Math.floor(now/200)*.2*(100/3);
  assert.doesNotThrow(()=>updateRoomMotion([player],'one',{x:0,z,yaw:0,speed:100/3},now));
 }
 assert.equal(player.state.stateSeq,7);
 assert.equal(player.state.z,7*.2*(100/3));
});

test('rejected-state corrections and road resets cannot replenish spent slack',()=>{
 const player={id:'one',state:initialRoomState({x:0,z:0,yaw:0,speed:0},1000)};
 updateRoomMotion([player],'one',{x:0,z:3,yaw:0,speed:0},1000);
 recoverRoomMotion(player,1000);
 assert.throws(()=>updateRoomMotion([player],'one',{...player.state,z:6},1000),/moved too far/);
 updateRoomMotion([player],'one',{...player.state,reset:true},1000);
 const reset=structuredClone(player.state);
 assert.throws(()=>updateRoomMotion([player],'one',{...reset,z:reset.z+1},1000),/moved too far/);
 assert.deepEqual(updateRoomMotion([player],'one',{...reset,z:999,collisionRevision:0},1000),[player]);
 assert.deepEqual(player.state,reset,'stale correction acknowledgements cannot change the budget');
 assert.doesNotThrow(()=>updateRoomMotion([player],'one',{...reset,z:reset.z+1},1025));
});

test('pre-impact proposals cannot bypass the cumulative movement limit',()=>{
 const player={id:'one',state:initialRoomState({x:0,z:0,yaw:0,speed:0},1000)};
 const peer={id:'two',state:initialRoomState({x:0,z:14,yaw:0,speed:0},1000)},before=structuredClone(peer.state);
 assert.throws(()=>updateRoomMotion([player,peer],'one',{x:0,z:0,yaw:0,speed:30,impact:{x:0,z:4,yaw:0,speed:30}},1000),/moved too far/);
 assert.deepEqual(peer.state,before);
});
