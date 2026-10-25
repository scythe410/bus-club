import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {WebSocket} from 'ws';
import {createBusServer} from '../server.mjs';
let app,base;
before(async()=>{app=createBusServer({dist:fileURLToPath(new URL('../public',import.meta.url))});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');base=`ws://127.0.0.1:${app.server.address().port}/ws`;});
after(async()=>await app.close());
async function client() {
 const ws=new WebSocket(base);const messages=[];const listeners=new Set();
 ws.on('message',data=>{const m=JSON.parse(data);messages.push(m);for(const fn of listeners)fn(m);});await once(ws,'open');
 return {ws,send:m=>ws.send(JSON.stringify(m)),wait(type,predicate=()=>true){const existing=messages.find(m=>m.type===type&&predicate(m));if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{listeners.delete(fn);reject(Error(`Timed out: ${type}`));},2000);function fn(m){if(m.type===type&&predicate(m)){clearTimeout(timer);listeners.delete(fn);resolve(m);}}listeners.add(fn);});}};
}
const profile=(name,image=null)=>({name,skin:{color:'#ff8800',accent:'#ffffff',pattern:'stripe',name:'Island Express',destination:'ELLA',image}});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('three real clients share state and customized skins, including late joiners',async()=>{
 const a=await client(),b=await client(),c=await client();
 try {
  const image='data:image/png;base64,aGVsbG8=';
  const mixedText='සුබ ගමන්\nSafe travels';const hostProfile=profile('A',image);hostProfile.skin.rearText=mixedText;hostProfile.skin.modelId='dam-rejina';
  a.send({type:'create',profile:hostProfile});const room=await a.wait('room');
  b.send({type:'join',code:room.code,profile:profile('B')});const two=await b.wait('room',m=>m.players.length===2);
  const initialHost=two.players.find(p=>p.name==='A'),initialFriend=two.players.find(p=>p.name==='B');
  assert.ok(Math.hypot(initialHost.x-initialFriend.x,initialHost.z-initialFriend.z)<10);
  a.send({type:'state',state:{x:42,z:100,yaw:1.5,speed:12}});
  await b.wait('snapshot',m=>m.players.some(p=>p.id===room.selfId&&p.x===42));
  c.send({type:'join',code:room.code,profile:profile('C')});const joined=await c.wait('room',m=>m.players.length===3);
  assert.equal(joined.players.find(p=>p.name==='A').skin.image,image);
  assert.equal(joined.players.find(p=>p.name==='A').skin.modelId,'dam-rejina','late joiners see the selected base model');
  assert.equal(joined.players.find(p=>p.name==='A').skin.rearText,mixedText,'late joiners receive Sinhala and English rear-panel messages intact');
  const leader=joined.players.find(p=>p.name==='A'),late=joined.players.find(p=>p.name==='C');
  assert.ok(Math.hypot(leader.x-late.x,leader.z-late.z)<35,'Late joiner follows the current convoy position');
  const snapshot=await c.wait('snapshot',m=>m.players.some(p=>p.id===room.selfId&&p.x===42));
  assert.equal(snapshot.players.find(p=>p.id===room.selfId).speed,12);
  const updated=profile('Updated');updated.skin.modelId='nil-kirilli';
  b.send({type:'profile',profile:updated});const changed=await c.wait('room',m=>m.players.some(p=>p.name==='Updated'));
  assert.equal(changed.players.find(p=>p.name==='Updated').skin.modelId,'nil-kirilli','model changes travel with profile updates');
  a.ws.close();await b.wait('room',m=>m.players.length===2&&!m.players.some(p=>p.id===room.selfId));assert.ok(app.rooms.has(room.code));
 } finally {a.ws.terminate();b.ws.terminate();c.ws.terminate();await delay(30);}
});
test('room isolation, eight-player capacity and cleanup are enforced',async()=>{
 const clients=[];try {
  const host=await client();clients.push(host);host.send({type:'create',profile:profile('Host')});const room=await host.wait('room');
  const outsider=await client();clients.push(outsider);outsider.send({type:'create',profile:profile('Other')});const other=await outsider.wait('room');assert.notEqual(room.code,other.code);
  for(let i=1;i<8;i++){const p=await client();clients.push(p);p.send({type:'join',code:room.code,profile:profile(`P${i}`)});await p.wait('room');}
  const ninth=await client();clients.push(ninth);ninth.send({type:'join',code:room.code,profile:profile('Ninth')});assert.match((await ninth.wait('error')).message,/full/);
  assert.equal(app.rooms.get(other.code).players.size,1);
  for(const p of clients)p.ws.terminate();await delay(50);assert.equal(app.rooms.size,0);
 } finally {for(const p of clients)p.ws.terminate();await delay(30);}
});
test('missing rooms, malformed input, invalid positions and oversized skins do not crash server',async()=>{
 const p=await client();try {
  p.send({type:'join',code:'ZZZZZZ',profile:profile('Bad')});assert.match((await p.wait('error')).message,/not found/);
  p.ws.send('{bad json');await p.wait('error',m=>/JSON|Unexpected|property/i.test(m.message));
  p.send({type:'create',profile:profile('Valid')});const room=await p.wait('room');
  p.send({type:'state',state:{x:'unsafe',z:0,yaw:0,speed:0}});await p.wait('error',m=>/position/.test(m.message));
  p.send({type:'profile',profile:profile('Large','data:image/png;base64,'+'A'.repeat(196609))});await p.wait('error',m=>/192 KB/.test(m.message));
  assert.equal(app.rooms.get(room.code).players.get(room.selfId).state.x,room.players.find(p=>p.id===room.selfId).x);
  const response=await fetch(base.replace('ws:','http:').replace('/ws','/health'));assert.equal((await response.json()).ok,true);
 } finally {p.ws.terminate();await delay(30);}
});

test('soundboard relays all nine sounds only to room peers, validates IDs and limits repeats',async()=>{
 const a=await client(),b=await client(),outsider=await client();
 const receivedA=[],receivedB=[],receivedOther=[];
 a.ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='sound')receivedA.push(m);});
 b.ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='sound')receivedB.push(m);});
 outsider.ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='sound')receivedOther.push(m);});
 try {
  a.send({type:'create',profile:profile('Sound host')});const room=await a.wait('room');
  b.send({type:'join',code:room.code,profile:profile('Listener')});await b.wait('room');
  outsider.send({type:'create',profile:profile('Other room')});await outsider.wait('room');
  for(let id=1;id<=9;id++){
   if(id>1)await delay(620);
   a.send({type:'sound',soundId:id,playerId:'spoof'});
   const event=await b.wait('sound',m=>m.soundId===id);assert.equal(event.playerId,room.selfId);
  }
  a.send({type:'sound',soundId:1});
  for(const soundId of [0,10,1.5,'1',null])a.send({type:'sound',soundId});
  await a.wait('error',m=>m.message==='Invalid sound.');await delay(60);
  assert.equal(receivedB.length,9);assert.equal(receivedA.length,0);assert.equal(receivedOther.length,0);
  const response=await fetch(base.replace('ws:','http:').replace('/ws','/sounds/dry-fart.mp3'));
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/mpeg');
 } finally {a.ws.terminate();b.ws.terminate();outsider.ws.terminate();await delay(30);}
});

test('server resolves bus impacts for both clients and protects corrections from stale packets',async()=>{
 const a=await client(),b=await client();
 try {
  a.send({type:'create',profile:profile('A')});const room=await a.wait('room');
  b.send({type:'join',code:room.code,profile:profile('B')});const joined=await b.wait('room');
  const bId=joined.selfId;
  b.send({type:'state',state:{x:100,z:110.8,yaw:0,speed:0}});
  await a.wait('snapshot',m=>m.players.some(p=>p.id===bId&&p.x===100));
  a.send({type:'state',state:{x:100,z:100,yaw:0,speed:30}});
  const hitA=await a.wait('collision'),hitB=await b.wait('collision');
  assert.ok(hitA.state.speed<15);assert.ok(hitB.state.speed>15);
  assert.ok(hitB.state.z-hitA.state.z>=11);
  b.send({type:'state',state:{x:100,z:110.8,yaw:0,speed:0}});
  await delay(30);
  assert.equal(app.rooms.get(room.code).players.get(bId).state.speed,hitB.state.speed);
  b.send({type:'state',state:{...hitB.state,z:150}});
  await a.wait('snapshot',m=>m.players.some(p=>p.id===bId&&p.z===150));
 } finally {a.ws.terminate();b.ws.terminate();await delay(30);}
});
