import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BusGame,sampleRemote} from '../src/game.js';
import {RoomClient} from '../src/network.js';
import {initialRoomState,updateRoomMotion} from '../shared/room-state.js';

const makePeer=()=>{
  const group=new THREE.Group();
  const bus={group,animate(){},setSkin(){this.skinChanges=(this.skinChanges||0)+1;},setDistance(){}};
  return {bus,target:null,samples:[]};
};
const observer=item=>Object.assign(Object.create(BusGame.prototype),{
  peers:new Map([['peer',item]]),started:true,paused:true,garage:false,
});
const state=(seq,time)=>({id:'peer',x:20,z:time/100,yaw:0,speed:10,stateSeq:seq,stateTime:time,_sampleTime:time,skin:{name:'Friend'}});

test('paused and garage observers render buffered passing motion despite jitter and mutated collision bodies',()=>{
  for(const garage of [false,true]){
    const item=makePeer(),game=observer(item);game.garage=garage;
    // Arrival jitter varies; the authoritative timestamps stay on one clock.
    const packets=Array.from({length:24},(_,i)=>({sample:state(i,i*75),arrival:i*75+[18,42,9,65][i%4]}));
    let next=0,previous=null;
    for(let frame=0;frame<100;frame++){
      const now=frame*1000/60;
      while(next<packets.length&&packets[next].arrival<=now){game.setPeers([packets[next].sample],now);next++;}
      if(!item.samples.length)continue;
      // Local predicted collisions must never displace remote visual snapshots.
      item.predicted={x:900,z:900,yaw:1,speed:0};
      game.renderPeers(1/60,0,0,now);
      const expected=Math.max(0,now-120)/100;
      assert.ok(Math.abs(item.bus.group.position.z-expected)<1e-8,`continuous at t=${now}, garage=${garage}`);
      assert.equal(item.bus.group.visible,true);
      if(previous!==null&&now>140)assert.ok(Math.abs(item.bus.group.position.z-previous-1/6)<1e-8,'no repeated poses or 12 metre hops');
      previous=item.bus.group.position.z;
    }
  }
});

test('duplicate snapshots and profile changes preserve sample age, buffers, and unchanged skins',()=>{
  const item=makePeer(),game=observer(item),first=state(1,100);
  game.setPeers([first],150);item.age=.7;
  const target=item.target,samples=item.samples,skinChanges=item.bus.skinChanges;
  game.setPeers([{...first,skin:{...first.skin}}],800);
  assert.equal(item.target,target);assert.equal(item.samples,samples);assert.equal(item.samples.length,1);
  assert.equal(item.age,.7);assert.equal(item.bus.skinChanges,skinChanges,'equal skin values do not regenerate canvases');
  game.setPeers([{...first,skin:{name:'New sign'}}],850);
  assert.equal(item.samples.length,1);assert.equal(item.age,.7);assert.equal(item.bus.skinChanges,skinChanges+1);
  game.setPeers([{...first,stateSeq:0,z:999}],900);
  assert.equal(item.target.z,1,'older sequences cannot rewind the peer');
});

test('visual extrapolation is bounded, paused samples stay parked, and buffer memory stays bounded',()=>{
  const item=makePeer(),game=observer(item);
  for(let i=0;i<80;i++)game.setPeers([state(i,i*75)],i*75+20);
  assert.equal(item.samples.length,32);
  const last=item.samples.at(-1);
  game.renderPeers(.1,0,0,last.time+2000);
  assert.ok(Math.abs(item.bus.group.position.z-last.z-1.5)<1e-9,'at most 150 ms beyond last authoritative pose');
  game.setPeers([{...state(80,6000),paused:true,speed:0}],6020);
  game.renderPeers(.1,0,0,9000);
  assert.equal(item.bus.group.position.z,60);
});

test('buffered heading follows the short arc and reset teleports clear previous history',()=>{
  const pose=sampleRemote([{x:0,z:0,yaw:Math.PI-.01,time:0},{x:0,z:1,yaw:-Math.PI+.01,time:100}],50);
  assert.ok(Math.abs(pose.yaw-Math.PI)<1e-9);
  const item=makePeer(),game=observer(item);
  game.setPeers([state(0,0)],0);game.setPeers([{...state(1,75),z:100,reset:true}],75);
  assert.equal(item.samples.length,1);assert.equal(item.bus.group.position.z,100);
});

test('parked motion reports zero velocity without discarding the local resumable speed',()=>{
  for(const flags of [{paused:true},{garage:true},{started:false}]){
    const game=Object.assign(Object.create(BusGame.prototype),{started:true,x:0,z:0,yaw:0,speed:30,sideSpeed:2,impactYawRate:.2,pendingImpact:{x:0},...flags});
    const packet=game.getState();
    assert.equal(packet.paused,true);assert.equal(packet.speed,0);assert.equal(packet.sideSpeed,0);assert.equal(packet.impactYawRate,0);
    assert.equal(packet.impact,undefined);assert.equal(game.speed,30);
  }
});

test('one network scheduler sends every callback and congestion does not consume pending state',()=>{
  const previous=globalThis.WebSocket;globalThis.WebSocket={OPEN:1};
  try{
    const packets=[],client=new RoomClient();client.code='ABC123';
    client.socket={readyState:1,bufferedAmount:0,send:raw=>packets.push(JSON.parse(raw))};
    for(let i=0;i<40;i++)assert.equal(client.sendState({x:0,z:i,yaw:0,speed:10}),true);
    assert.equal(packets.length,40);assert.ok(packets.every(p=>Number.isFinite(p.state.sampleTime)));
    client.socket.bufferedAmount=1;let sampled=false;
    assert.equal(client.sendState(()=>{sampled=true;return {}; }),false);
    assert.equal(sampled,false,'pending impact/reset is not consumed while motion cannot be sent');
  }finally{globalThis.WebSocket=previous;}
});

test('low FPS duplicate moving ticks do not reset the server plausibility clock',()=>{
  const previous=globalThis.WebSocket;globalThis.WebSocket={OPEN:1};
  try{
    for(const fps of [4,5,10,15]){
      const player={id:'self',state:initialRoomState({x:0,z:0,yaw:0,speed:0},0)};
      const client=new RoomClient();client.code='ABC123';let now=0,sends=0;
      client.socket={readyState:1,bufferedAmount:0,send:raw=>{
        const packet=JSON.parse(raw);sends++;
        assert.doesNotThrow(()=>updateRoomMotion([player],'self',packet.state,now),`${fps} FPS at ${now} ms`);
      }};
      for(now=0;now<=1500;now+=75){
        const tick=Math.floor(now/(1000/fps))*(1000/fps);
        client.sendState({x:0,z:tick/1000*(100/3),yaw:0,speed:100/3,paused:false});
      }
      assert.ok(sends<21||fps>=15,'unchanged moving poses must not consume new server timestamps');
      const before=sends;
      client.sendState({...client.lastStateSent,paused:true,speed:0});
      assert.equal(sends,before+1,'pause is signaled immediately even without a position change');
      client.sendState({...client.lastStateSent,reset:true});
      assert.equal(sends,before+2,'reset is never mistaken for a duplicate pose');
    }
  }finally{globalThis.WebSocket=previous;}
});

test('slow rendered frames use real elapsed physics time and long stalls publish an explicit pause',()=>{
  const previous=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=()=>0;
  try{
    const group=new THREE.Group(),cockpit=new THREE.Group();cockpit.userData.wheel=new THREE.Object3D();group.add(cockpit);
    let elapsed=.1,stalls=0;
    const game=Object.assign(Object.create(BusGame.prototype),{
      clock:{getDelta:()=>elapsed},elapsed:0,started:true,paused:false,garage:false,x:0,z:0,yaw:0,speed:10,steering:0,
      bus:{group,cockpit,animate(){}},world:{update(){}},clouds:new THREE.Group(),sun:new THREE.DirectionalLight(),
      peers:new Map(),cameraMode:0,camera:new THREE.PerspectiveCamera(),lookAt:new THREE.Vector3(),cameraForward:new THREE.Vector3(),cameraRight:new THREE.Vector3(),targetPosition:new THREE.Vector3(),targetLook:new THREE.Vector3(),
      renderer:{render(){}},telemetryTime:0,collected:new Set(),onTelemetry(){},onStall(){stalls++;},
      step(dt){this.z+=this.speed*dt;},
    });
    for(let i=0;i<10;i++)game.frame();
    assert.ok(Math.abs(game.z-10)<1e-8,'10 FPS still moves ten metres in one real second');
    elapsed=2;game.frame();
    assert.equal(stalls,1);assert.equal(game.paused,true);assert.equal(game.getState().speed,0);
    assert.ok(Math.abs(game.z-10)<1e-8,'suspended time never creates a giant collision/teleport step');
  }finally{globalThis.requestAnimationFrame=previous;}
});
