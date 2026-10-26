import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoadingScreen} from '../src/loading-screen.js';
import {readFile} from 'node:fs/promises';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('the first HTML response contains the orb before React or the game downloads',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const orb=html.match(/<div id="loading-orb"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(orb?.includes('<svg'),'the first paint cannot depend on a JavaScript component');
  assert.ok((orb.match(/<circle /g)||[]).length>100,'the initial image contains the actual dotted solving sphere');
  assert.ok(html.indexOf(orb)<html.indexOf('<script type="module"'));
  assert.ok(html.includes('prefers-reduced-motion:reduce'));
});
function fixture(options={}){
  const detail={hidden:true},heading={hidden:true},retry={hidden:true,addEventListener(){}},classes=new Set();
  const overlay={hidden:false,querySelector:selector=>selector==='button'?retry:selector==='h1'?heading:detail,classList:{add:name=>classes.add(name)}};
  const ui={inert:true,setAttribute(name,value){this[name]=value;}},canvas={removeAttribute(name){this[name]=null;}};
  const frames=[];
  const loader=createLoadingScreen({overlay,ui,canvas,requestFrame:fn=>frames.push(fn),minimumMs:0,...options});
  frames.shift()();frames.shift()(); // The initial loader has painted.
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

test('fast loading still displays the orb for at least three seconds',async()=>{
  let time=100,remaining,disposed=0;const timer=deferred();
  const f=fixture({minimumMs:3000,now:()=>time,delay:ms=>{remaining=ms;return timer.promise;},onFinish:()=>disposed++});
  const ready=f.loader.wait([]);
  await Promise.resolve();await Promise.resolve();
  time=600;f.frames.shift()();f.frames.shift()();await Promise.resolve();await Promise.resolve();
  assert.equal(remaining,2500);assert.equal(f.overlay.hidden,false);assert.equal(f.ui.inert,true);assert.equal(disposed,0);
  time=3100;timer.resolve();await ready;
  assert.equal(f.overlay.hidden,true);assert.equal(disposed,1);
  f.loader.release();assert.equal(disposed,1,'orb cleanup runs only once');
});

test('slow assets finish before reveal without adding another three-second delay',async()=>{
  let time=0,delays=0;const asset=deferred();
  const f=fixture({minimumMs:3000,now:()=>time,delay:async()=>delays++});
  const ready=f.loader.wait([asset.promise]);time=6000;
  assert.equal(f.overlay.hidden,false);asset.resolve();
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  f.frames.shift()();f.frames.shift()();await ready;
  assert.equal(f.overlay.hidden,true);assert.equal(delays,0);
});

test('an error during the minimum display period never reveals a partial game',async()=>{
  const timer=deferred(),f=fixture({minimumMs:3000,now:()=>0,delay:()=>timer.promise});
  const ready=f.loader.wait([]);await Promise.resolve();await Promise.resolve();
  f.frames.shift()();f.frames.shift()();await Promise.resolve();
  f.loader.fail('Model failed');timer.resolve();await ready;
  assert.equal(f.overlay.hidden,false);assert.equal(f.ui.inert,true);assert.equal(f.detail.textContent,'Model failed');
});
