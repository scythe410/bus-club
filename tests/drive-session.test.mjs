import test from 'node:test';
import assert from 'node:assert/strict';
import {createDriveSession} from '../src/drive-session.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
  let ready=deferred(),starts=0,unavailable=0;
  const session=createDriveSession({getReady:()=>ready.promise,activate:()=>starts++,onUnavailable:()=>unavailable++});
  return {session,get ready(){return ready;},select(next){ready=next;},get starts(){return starts;},get unavailable(){return unavailable;}};
}

test('Drive waits for the selected bus before activating once',async()=>{
  const f=fixture(),request=f.session.start();
  assert.equal(f.session.pending,true);assert.equal(f.starts,0);
  f.ready.resolve(true);
  assert.equal(await request,true);assert.equal(f.starts,1);assert.equal(f.session.pending,false);
});

test('cancelling a delayed Drive prevents activation after loading finishes',async()=>{
  const f=fixture(),request=f.session.start();
  f.session.cancel();f.ready.resolve(true);
  assert.equal(await request,false);assert.equal(f.starts,0);assert.equal(f.session.pending,false);
});

test('rapid Drive requests allow only the latest request to activate',async()=>{
  const f=fixture(),first=f.session.start(),latest=f.session.start();
  f.ready.resolve(true);
  assert.equal(await first,false);assert.equal(await latest,true);assert.equal(f.starts,1);
});

test('switching buses while Drive waits follows every newly selected model',async()=>{
  const f=fixture(),firstBus=f.ready,request=f.session.start(),secondBus=deferred(),lastBus=deferred();
  f.select(secondBus);firstBus.resolve(true);await Promise.resolve();
  assert.equal(f.starts,0);
  f.select(lastBus);secondBus.resolve(false);await Promise.resolve();
  assert.equal(f.starts,0);assert.equal(f.unavailable,0);
  lastBus.resolve(true);
  assert.equal(await request,true);assert.equal(f.starts,1);
});

test('a cancelled request cannot clear or activate a newer pending Drive',async()=>{
  const f=fixture(),oldBus=f.ready,oldRequest=f.session.start();
  f.session.cancel();const nextBus=deferred();f.select(nextBus);const request=f.session.start();
  oldBus.resolve(true);assert.equal(await oldRequest,false);
  assert.equal(f.session.pending,true);assert.equal(f.starts,0);
  nextBus.resolve(true);assert.equal(await request,true);assert.equal(f.starts,1);
});

test('cancellation suppresses a stale load rejection',async()=>{
  const f=fixture(),request=f.session.start();
  f.session.cancel();f.ready.reject(Error('old download failed'));
  assert.equal(await request,false);assert.equal(f.unavailable,0);assert.equal(f.starts,0);
});

test('a superseded failed download does not prevent the newly selected bus starting',async()=>{
  const f=fixture(),oldBus=f.ready,request=f.session.start(),nextBus=deferred();
  f.select(nextBus);oldBus.reject(Error('old download failed'));await Promise.resolve();
  nextBus.resolve(true);assert.equal(await request,true);assert.equal(f.starts,1);
});

test('a current unavailable model reports failure and never activates',async()=>{
  const f=fixture(),request=f.session.start();f.ready.resolve(false);
  assert.equal(await request,false);assert.equal(f.unavailable,1);assert.equal(f.starts,0);assert.equal(f.session.pending,false);
});

test('a current rejected download reports its error and clears the pending session',async()=>{
  const f=fixture(),request=f.session.start();f.ready.reject(Error('download failed'));
  await assert.rejects(request,/download failed/);assert.equal(f.starts,0);assert.equal(f.session.pending,false);
});
