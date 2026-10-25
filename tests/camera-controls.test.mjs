import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraControls } from '../src/camera-controls.js';
import { chaseCamera } from '../src/driving-camera.js';

function fixture(){
  const canvas=new EventTarget();canvas.clientHeight=900;
  let captured=null,enabled=true;
  canvas.setPointerCapture=id=>{captured=id;};canvas.hasPointerCapture=id=>captured===id;
  canvas.releasePointerCapture=()=>{captured=null;};
  const controls=new CameraControls(canvas,()=>enabled);
  const send=(name,data={})=>{const e=new Event(name,{cancelable:true});Object.assign(e,data);canvas.dispatchEvent(e);return e;};
  return {controls,send,setEnabled:v=>{enabled=v;},capture:()=>captured};
}
test('trackpad pinch changes camera radius without page zoom or orbit',()=>{
  const {controls:c,send}=fixture();
  const original=c.pose(chaseCamera());
  assert.ok(send('wheel',{ctrlKey:true,deltaX:0,deltaY:-30,deltaMode:0}).defaultPrevented);
  assert.ok(c.pose(chaseCamera()).back<original.back);assert.equal(c.yaw,0);
  for(let i=0;i<100;i++)send('wheel',{ctrlKey:true,deltaX:0,deltaY:-100,deltaMode:0});
  const pose=c.pose(chaseCamera(120/3.6));
  assert.ok(Math.hypot(pose.back,pose.side,pose.height-pose.pivot)>=8-1e-9);
});
test('two-finger scrolling or macOS pointer dragging orbits and release stops movement',()=>{
  const {controls:c,send,capture}=fixture();
  send('wheel',{deltaX:100,deltaY:40,deltaMode:0});assert.ok(c.yaw<0&&c.elevation<0);
  c.reset();
  send('pointerdown',{pointerId:1,pointerType:'mouse',button:0,clientX:100,clientY:100});
  send('pointermove',{pointerId:1,clientX:200,clientY:120});assert.equal(capture(),1);
  assert.ok(c.yaw>0&&c.elevation>0,'right/down pointer drag increases yaw and elevation');
  send('pointermove',{pointerId:1,clientX:200,clientY:100});
  assert.ok(Math.abs(c.elevation)<1e-9,'dragging up reverses the vertical camera movement');
  const yaw=c.yaw;send('pointerup',{pointerId:1});assert.equal(capture(),null);
  send('pointermove',{pointerId:1,clientX:500,clientY:100});assert.equal(c.yaw,yaw);
  send('dblclick');assert.equal(c.active,false);assert.equal(c.zoomScale,1);
});
test('Safari gesture scale zooms once and suppresses duplicate wheel zoom',()=>{
  const {controls:c,send}=fixture();
  send('gesturestart');send('gesturechange',{scale:1.5});const scale=c.zoomScale;
  send('wheel',{ctrlKey:true,deltaY:-50,deltaX:0});assert.equal(c.zoomScale,scale);
  send('gesturechange',{scale:2});assert.ok(c.zoomScale<scale);
  send('gestureend');assert.equal(c.gesture,null);
});
test('garage, other cameras and pause retain native input; dispose removes listeners',()=>{
  const {controls:c,send,setEnabled}=fixture();setEnabled(false);
  assert.equal(send('wheel',{ctrlKey:true,deltaY:20,deltaX:0}).defaultPrevented,false);
  send('pointerdown',{pointerId:1,button:0});assert.equal(c.active,false);
  setEnabled(true);c.dispose();send('wheel',{ctrlKey:true,deltaY:20,deltaX:0});assert.equal(c.active,false);
});
test('orbit can surround the bus while elevation and zoom stay outside its body',()=>{
  const {controls:c}=fixture();
  for(let i=0;i<1000;i++){
    c.orbit(.03,Math.sin(i)*.1);c.zoom(i%2?.2:-.2);
    const p=c.pose(chaseCamera(120/3.6,2));
    assert.ok(Object.values(p).every(Number.isFinite));assert.ok(p.height>2);
    assert.ok(Math.hypot(p.back,p.side,p.height-p.pivot)>=8-1e-9);
  }
});
