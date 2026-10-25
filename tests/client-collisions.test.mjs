import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BusGame} from '../src/game.js';

function game(state={}){
  return Object.assign(Object.create(BusGame.prototype),{
    x:0,z:0,yaw:0,speed:0,sideSpeed:0,impactYawRate:0,peers:new Map(),...state,
  });
}
test('collision authority updates physics while preserving the rendered pose',()=>{
  const bus=game({x:2,z:4,yaw:.1,speed:10,dynamics:{speed:10}});
  bus.applyCollisionState({x:1,z:3,yaw:0,speed:4,sideSpeed:1});
  assert.equal(bus.x,1);assert.equal(bus.z,3);assert.equal(bus.speed,4);
  assert.equal(bus.dynamics.speed,4);
  assert.equal(bus.x+bus.visualCorrection.x,2);
  assert.equal(bus.z+bus.visualCorrection.z,4);
  assert.ok(Math.abs(bus.yaw+bus.visualCorrection.yaw-.1)<1e-9);
  bus.applyCollisionState({x:.5,z:2.5,yaw:0,speed:3});
  assert.equal(bus.x+bus.visualCorrection.x,2,'successive corrections retain the current displayed pose');
});
test('large authority changes snap and invalid corrections are ignored',()=>{
  const bus=game();bus.applyCollisionState({x:100,z:0,yaw:0,speed:0});
  assert.equal(bus.visualCorrection,null);assert.equal(bus.x,100);
  bus.applyCollisionState({x:NaN,z:0,yaw:0,speed:0});assert.equal(bus.x,100);
});
test('fixed physics ticks give identical integration at 30, 60 and 144 fps',()=>{
  for(const fps of [30,60,144]){
    const bus=game();let ticks=0;
    bus.step=dt=>{ticks++;bus.z+=dt;};
    for(let frame=0;frame<fps;frame++)bus.advancePhysics(1/fps);
    assert.equal(ticks,120);assert.ok(Math.abs(bus.z-1)<1e-9);
  }
  const bus=game();let ticks=0;bus.step=()=>ticks++;bus.advancePhysics(2);
  assert.equal(ticks,6,'background stalls cannot create unbounded catch-up work');
});
test('low-speed turns render continuously between physics ticks at different refresh rates',()=>{
  for(const fps of [30,60,90,120,144,165]){
    const bus=game({started:true,paused:false,garage:false});
    // Constant low-speed translation and full-lock rotation isolate rendering
    // cadence from acceleration and suspension changes.
    bus.step=dt=>{bus.z+=2.2*dt;bus.yaw+=.22*dt;};
    let time=0,previous=null;
    for(let frame=0;frame<fps;frame++){
      const dt=1/fps;time+=dt;bus.advancePhysics(dt);
      const pose={...bus.renderedPose()};
      if(time>=1/120){
        assert.ok(Math.abs(pose.z-2.2*(time-1/120))<1e-9,`${fps} Hz translation follows render time`);
        assert.ok(Math.abs(pose.yaw-.22*(time-1/120))<1e-9,`${fps} Hz turning follows render time`);
        if(previous){
          assert.ok(Math.abs(pose.z-previous.z-2.2*dt)<1e-9,'no repeated pose or double-sized step');
          assert.ok(Math.abs(pose.yaw-previous.yaw-.22*dt)<1e-9,'steady rotation at full lock');
        }
        previous=pose;
      }
    }
    assert.ok(Math.abs(bus.z-2.2)<1e-9,'authoritative physics still advances the complete second');
  }
});
test('render interpolation takes the shortest heading across the angle boundary',()=>{
  const bus=game({started:true,previousPhysicsPose:{x:0,z:0,yaw:Math.PI-.01},yaw:-Math.PI+.01,physicsAccumulator:1/240});
  assert.ok(Math.abs(bus.renderedPose().yaw-Math.PI)<1e-9);
  bus.paused=true;
  assert.equal(bus.renderedPose().yaw,bus.yaw,'paused state uses the settled simulation pose');
});
test('uneven frame intervals do not quantize low-speed motion to physics ticks',()=>{
  const bus=game({started:true});let time=0;
  bus.step=dt=>{bus.z+=2*dt;bus.yaw-=.2*dt;};
  for(let frame=0;frame<240;frame++){
    const dt=[.014,.019,.007,.011,.022][frame%5];time+=dt;
    bus.advancePhysics(dt);
    const pose=bus.renderedPose();
    assert.ok(Math.abs(pose.z-2*(time-1/120))<1e-9);
    assert.ok(Math.abs(pose.yaw+.2*(time-1/120))<1e-9);
  }
});
test('collision corrections preserve an interpolated turn and large corrections discard stale poses',()=>{
  const bus=game({started:true,x:2,z:4,yaw:.1,previousPhysicsPose:{x:1.9,z:3.8,yaw:.09},physicsAccumulator:1/240});
  const before={...bus.renderedPose()};
  bus.applyCollisionState({x:1,z:3,yaw:0,speed:4});
  const after=bus.renderedPose();
  assert.ok(Math.abs(after.x+bus.visualCorrection.x-before.x)<1e-9);
  assert.ok(Math.abs(after.z+bus.visualCorrection.z-before.z)<1e-9);
  assert.ok(Math.abs(after.yaw+bus.visualCorrection.yaw-before.yaw)<1e-9);
  bus.applyCollisionState({x:100,z:100,yaw:2,speed:0});
  assert.equal(bus.previousPhysicsPose,null);
  assert.deepEqual(bus.renderedPose(),{x:100,z:100,yaw:2});
});
test('peer collision prediction never mutates the received snapshot',()=>{
  const target={id:'peer',x:0,z:9,yaw:0,speed:0};
  const bus=game({speed:10,peers:new Map([['peer',{target}]])});
  const received={...target};bus.resolvePeers(1/120);
  assert.deepEqual(target,received);
  assert.ok(bus.pendingImpact,'the server still receives the pose before the predicted impulse');
  assert.notEqual(bus.peers.get('peer').predicted.z,target.z);
});
test('remote prediction follows velocity but stops extrapolating a stalled snapshot',()=>{
  const target={id:'peer',x:20,z:0,yaw:0,speed:10};
  const bus=game({peers:new Map([['peer',{target}]])});
  for(let step=0;step<240;step++)bus.resolvePeers(1/120);
  const peer=bus.peers.get('peer').predicted;
  assert.ok(Math.abs(peer.z-1.5)<.001,`extrapolation must stop after 150 ms; got ${peer.z}`);
  assert.equal(target.z,0);
});
