import test from 'node:test';
import assert from 'node:assert/strict';
import {busContact,busVelocity,resolveBusCollision,resolveBusCollisions,updateCollisionStates} from '../shared/collisions.js';
const body=(overrides={})=>({x:0,z:0,yaw:0,speed:0,...overrides});
test('oriented bus bodies separate at their bumpers and allow close passing lanes',()=>{
  const a=body(),b=body({z:10.5});
  assert.ok(busContact(a,b));resolveBusCollision(a,b);assert.equal(busContact(a,b),null);
  assert.equal(busContact(body(),body({x:3,z:0})),null);
  const crossing=body({x:4,z:0,yaw:Math.PI/2});
  assert.ok(busContact(body(),crossing));
});
test('rear-end impacts transfer momentum without springy bouncing or overlap',()=>{
  const a=body({speed:25}),b=body({z:10.8});
  const energyBefore=a.speed**2+b.speed**2;
  const hit=resolveBusCollision(a,b);
  assert.equal(hit.closing,25);assert.ok(a.speed<13&&a.speed>10);assert.ok(b.speed>12);
  assert.ok(Math.abs(a.speed+b.speed-25)<1e-10);assert.ok(a.speed**2+b.speed**2<energyBefore);
  assert.equal(a.impactYawRate,0);assert.equal(busContact(a,b),null);
});
test('head-on impacts stop both buses and do not pass through',()=>{
  const a=body({speed:33.33}),b=body({z:10.8,yaw:Math.PI,speed:33.33});
  resolveBusCollision(a,b);
  assert.ok(Math.abs(a.speed)<3);assert.ok(Math.abs(b.speed)<3);assert.equal(busContact(a,b),null);
});
test('side and corner impacts create lateral motion and rotation',()=>{
  const a=body({speed:15}),b=body({x:1.8,z:10.8});
  resolveBusCollision(a,b);
  assert.ok(Math.abs(a.impactYawRate)>.05);assert.ok(Math.abs(b.impactYawRate)>.05);
  const sideA=body({x:-6,yaw:Math.PI/2,speed:15}),sideB=body();
  resolveBusCollision(sideA,sideB);assert.ok(busVelocity(sideB).x>1);assert.ok(sideB.sideSpeed>1);
});
test('stationary overlap is separated and separating buses receive no second impulse',()=>{
  const a=body(),b=body({z:10.8});resolveBusCollision(a,b);assert.equal(a.speed,0);assert.equal(b.speed,0);
  a.speed=-1;b.speed=1;b.z-=.01;resolveBusCollision(a,b);assert.equal(a.speed,-1);assert.equal(b.speed,1);
});
test('a heavier loaded bus deflects less and gains less speed',()=>{
  const a=body({speed:20,mass:9500}),b=body({z:10.5,mass:16200});
  resolveBusCollision(a,b);assert.ok(b.speed<9);assert.ok(Math.abs(a.z)>Math.abs(b.z-10.5));
});
test('authority corrects both drivers and rejects stale states until collision is acknowledged',()=>{
  const players=[{id:'a',state:body()},{id:'b',state:body({z:10.8})}];
  const changed=updateCollisionStates(players,'a',body({speed:20}));
  assert.equal(changed.length,2);assert.ok(players[1].state.speed>9);
  const corrected={...players[1].state};
  const retry=updateCollisionStates(players,'b',body({z:10.8}));
  assert.deepEqual(retry,[players[1]]);assert.deepEqual(players[1].state,corrected);
  updateCollisionStates(players,'b',{...corrected,z:30});assert.equal(players[1].state.z,30);
});
test('local predicted impact preserves incoming momentum for the server',()=>{
  const players=[{id:'a',state:body()},{id:'b',state:body({z:10.8})}];
  updateCollisionStates(players,'a',body({z:-.11,speed:9.2}),body({speed:20}));
  assert.ok(players[1].state.speed>10);
});

test('the driving loop catches a 120 km/h impact before buses can tunnel through',async()=>{
  const {BusGame}=await import('../src/game.js');
  const {roadX}=await import('../src/world.js');
  const peer={x:roadX(0),z:13,yaw:0,speed:0};
  const game=Object.assign(Object.create(BusGame.prototype),{
    ...body({x:roadX(0),speed:120/3.6}),keys:new Set(),input:{throttle:1,brake:0,steer:0},
    peers:new Map([['peer',{target:peer}]]),collected:new Set(),passengers:0,distance:0,onPickup:()=>{},
  });
  for(let i=0;i<5;i++)game.step(.05);
  assert.ok(game.pendingImpact,'pre-impact momentum is retained for authority');
  assert.ok(game.speed<20);assert.equal(busContact(game,game.peers.get('peer').predicted||game.peers.get('peer').target),null);
  game.steering=.4;game.applyCollisionState({...body({z:50,speed:10}),sideSpeed:2,impactYawRate:.2});
  assert.equal(game.steering,.4,'server correction does not reset driver steering');
  assert.equal(game.dynamics.speed,10);assert.equal(game.sideSpeed,2);
});


test('eight-bus pile-up separates once and preserves momentum without contact chatter',()=>{
  const buses=Array.from({length:8},(_,i)=>body({z:i*10.8,speed:i===0?24:0}));
  const contacts=resolveBusCollisions(buses);
  assert.equal(contacts.length,7);
  for(let i=0;i<buses.length;i++)for(let j=i+1;j<buses.length;j++)assert.equal(busContact(buses[i],buses[j]),null);
  assert.ok(Math.abs(buses.reduce((sum,b)=>sum+b.speed,0)-24)<1e-9);
  assert.ok(buses.reduce((sum,b)=>sum+b.speed*b.speed,0)<24*24);
  const settled=buses.map(b=>({...b}));
  assert.deepEqual(resolveBusCollisions(buses),[]);
  assert.deepEqual(buses,settled,'a settled pile does not get nudged again');
});
test('low-speed bumper contact has no rebound and separating contact has no impulse',()=>{
  const a=body({speed:.2}),b=body({z:10.999});resolveBusCollisions([a,b]);
  assert.ok(Math.abs(a.speed-.1)<1e-10);assert.ok(Math.abs(b.speed-.1)<1e-10);
  const c=body({speed:-2}),d=body({z:10.9,speed:3});resolveBusCollisions([c,d]);
  assert.equal(c.speed,-2);assert.equal(d.speed,3);
});
test('contact margins never introduce positional drift',()=>{
  const a=body(),b=body({z:11.005});
  for(let i=0;i<100;i++)resolveBusCollision(a,b,{margin:.01});
  assert.equal(a.z,0);assert.equal(b.z,11.005);
});
test('authority expands a pile into newly reached neighbours without touching unrelated buses',()=>{
  const players=[{id:'a',state:body({speed:15})},{id:'b',state:body({z:10})},{id:'c',state:body({z:21.1})},
    {id:'d',state:body({x:100})},{id:'e',state:body({x:100,z:10})}];
  const before=players.slice(3).map(p=>({...p.state}));
  const changed=updateCollisionStates(players,'a',{...players[0].state});
  assert.equal(changed.length,3);assert.ok(players[2].state.speed>0);
  assert.deepEqual(players.slice(3).map(p=>p.state),before);
  for(let i=0;i<3;i++)assert.equal(players[i].state.collisionRevision,1);
});

test('a moving eight-bus pile stays separated over two seconds without repeated large corrections',()=>{
  const buses=Array.from({length:8},(_,i)=>body({z:i*10.8,speed:i===0?24:0}));
  for(let frame=0;frame<240;frame++){
    for(const b of buses)b.z+=b.speed/120;
    const positions=buses.map(b=>b.z);resolveBusCollisions(buses);
    for(let i=0;i<buses.length;i++){
      assert.ok(Number.isFinite(buses[i].speed)&&buses[i].speed>=0);
      if(frame>0)assert.ok(Math.abs(buses[i].z-positions[i])<.005,'contact corrections stay below 5 mm after initial separation');
      for(let j=i+1;j<buses.length;j++)assert.equal(busContact(buses[i],buses[j]),null);
    }
  }
  assert.ok(Math.abs(buses.reduce((sum,b)=>sum+b.speed,0)-24)<1e-9);
});
