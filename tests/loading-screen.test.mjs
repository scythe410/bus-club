import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoadingScreen} from '../src/loading-screen.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
  const detail={hidden:true},heading={hidden:true},retry={hidden:true,addEventListener(){}},classes=new Set();
  const overlay={hidden:false,querySelector:selector=>selector==='button'?retry:selector==='h1'?heading:detail,classList:{add:name=>classes.add(name)}};
  const ui={inert:true,setAttribute(name,value){this[name]=value;}},canvas={removeAttribute(name){this[name]=null;}};
  const frames=[];
  const loader=createLoadingScreen({overlay,ui,canvas,requestFrame:fn=>frames.push(fn)});
  return {loader,overlay,ui,detail,heading,retry,frames,classes};
}
test('loader waits for every download, GPU preparation and the first painted frame',async()=>{
  const f=fixture(),bus=deferred(),sound=deferred(),gpu=deferred();let preparing=false;
  const ready=f.loader.wait([bus.promise,sound.promise],()=>{preparing=true;return gpu.promise;});
  bus.resolve();await Promise.resolve();assert.equal(f.overlay.hidden,false);assert.equal(preparing,false);
  sound.resolve();await Promise.resolve();await Promise.resolve();assert.equal(preparing,true);assert.equal(f.ui.inert,true);
  gpu.resolve();await Promise.resolve();await Promise.resolve();assert.equal(f.overlay.hidden,false);
  f.frames.shift()();assert.equal(f.overlay.hidden,false);f.frames.shift()();await ready;
  assert.equal(f.overlay.hidden,true);assert.equal(f.ui.inert,false);assert.equal(f.ui['aria-busy'],'false');
});
test('a failed download offers reload and never exposes a partial game',async()=>{
  const f=fixture();
  await f.loader.wait([Promise.reject(Error('Bus download failed'))]).catch(error=>f.loader.fail(error.message));
  assert.equal(f.overlay.hidden,false);assert.equal(f.ui.inert,true);assert.equal(f.retry.hidden,false);
  assert.equal(f.detail.textContent,'Bus download failed');assert.equal(f.detail.hidden,false);assert.equal(f.heading.hidden,false);assert.ok(f.classes.has('loading-failed'));
});
test('fatal renderer errors can clear the overlay to expose the existing error dialog',()=>{
  const f=fixture();f.loader.release();assert.equal(f.overlay.hidden,true);assert.equal(f.ui.inert,false);
});
