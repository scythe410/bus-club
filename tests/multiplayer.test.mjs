import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {WebSocket} from 'ws';
import {createBusServer} from '../server.mjs';
import {ROOM_CAPACITY} from '../shared/room-config.js';
import {png,alternatePng,imageBytes} from './fixtures/skin-images.mjs';
let app,base;
before(async()=>{app=createBusServer({dist:fileURLToPath(new URL('../public',import.meta.url))});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');base=`ws://127.0.0.1:${app.server.address().port}/ws`;});
after(async()=>await app.close());
async function client() {
 const ws=new WebSocket(base);const messages=[];const listeners=new Set();
 ws.on('message',data=>{const m=JSON.parse(data);messages.push(m);for(const fn of listeners)fn(m);});await once(ws,'open');
 return {ws,messages,send:m=>ws.send(JSON.stringify(m)),wait(type,predicate=()=>true){const existing=messages.find(m=>m.type===type&&predicate(m));if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{listeners.delete(fn);reject(Error(`Timed out: ${type}`));},2000);function fn(m){if(m.type===type&&predicate(m)){clearTimeout(timer);listeners.delete(fn);resolve(m);}}listeners.add(fn);});}};
}
const profile=(name,image=null)=>({name,skin:{color:'#ff8800',accent:'#ffffff',pattern:'stripe',name:'Island Express',destination:'ELLA',image}});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('three real clients share state and customized skins, including late joiners',async()=>{
 const a=await client(),b=await client(),c=await client();
 try {
  const image=png;
  const mixedText='සුබ ගමන්\nSafe travels';const hostProfile=profile('A',image);hostProfile.skin.rearText=mixedText;hostProfile.skin.modelId='dam-rejina';
  a.send({type:'create',profile:hostProfile});const room=await a.wait('room');
  b.send({type:'join',code:room.code,profile:profile('B')});const two=await b.wait('room',m=>m.players.length===2);
  const initialHost=two.players.find(p=>p.name==='A'),initialFriend=two.players.find(p=>p.name==='B');
  assert.ok(Math.hypot(initialHost.x-initialFriend.x,initialHost.z-initialFriend.z)<10);
  // Move the fixture's authoritative start so the protocol test stays in-range.
  Object.assign(app.rooms.get(room.code).players.get(room.selfId).state,{x:42,z:100,yaw:1.5});
  a.send({type:'state',state:{x:42,z:100,yaw:1.5,speed:12}});
  await b.wait('snapshot',m=>m.players.some(p=>p.id===room.selfId&&p.x===42));
  c.send({type:'join',code:room.code,profile:profile('C')});const joined=await c.wait('room',m=>m.players.length===3);
  const imageUrl=joined.players.find(p=>p.name==='A').skin.image;
  assert.ok(imageUrl.startsWith('/skin?'),'late joiners receive a versioned HTTP image reference');
  const skinResponse=await fetch(new URL(imageUrl,base.replace('ws:','http:')));
  assert.equal(skinResponse.status,200);assert.equal(skinResponse.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await skinResponse.arrayBuffer()),imageBytes(image));
  assert.equal(joined.players.find(p=>p.name==='A').skin.modelId,'dam-rejina','late joiners see the selected base model');
  assert.equal(joined.players.find(p=>p.name==='A').skin.rearText,mixedText,'late joiners receive Sinhala and English rear-panel messages intact');
  const leader=joined.players.find(p=>p.name==='A'),late=joined.players.find(p=>p.name==='C');
  assert.ok(Math.hypot(leader.x-late.x,leader.z-late.z)<35,'Late joiner follows the current convoy position');
  const snapshot=await c.wait('snapshot',m=>m.players.some(p=>p.id===room.selfId&&p.x===42));
  assert.equal(snapshot.players.find(p=>p.id===room.selfId).speed,12);
  const updated=profile('Updated');updated.skin.modelId='nil-kirilli';
  b.send({type:'profile',profile:updated});const changed=await c.wait('profile',m=>m.player.name==='Updated');
  assert.equal(changed.player.skin.modelId,'nil-kirilli','model changes travel with profile updates');
  a.ws.close();await b.wait('left',m=>m.playerId===room.selfId);assert.ok(app.rooms.has(room.code));
 } finally {a.ws.terminate();b.ws.terminate();c.ws.terminate();await delay(30);}
});
test('room isolation, five-player capacity and cleanup are enforced',async()=>{
 assert.equal(ROOM_CAPACITY,5);
 const clients=[];try {
  const host=await client();clients.push(host);host.send({type:'create',profile:profile('Host')});const room=await host.wait('room');
  const outsider=await client();clients.push(outsider);outsider.send({type:'create',profile:profile('Other')});const other=await outsider.wait('room');assert.notEqual(room.code,other.code);
  for(let i=1;i<ROOM_CAPACITY;i++){const p=await client();clients.push(p);p.send({type:'join',code:room.code,profile:profile(`P${i}`)});await p.wait('room');}
  assert.equal(app.rooms.get(room.code).players.size,5);
  const sixth=await client();clients.push(sixth);sixth.send({type:'join',code:room.code,profile:profile('Sixth')});assert.equal((await sixth.wait('error')).message,'This convoy is full (5 drivers).');
  assert.equal(app.rooms.get(room.code).players.size,5);
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
  Object.assign(app.rooms.get(room.code).players.get(bId).state,{x:100,z:110.8,yaw:0});
  b.send({type:'state',state:{x:100,z:110.8,yaw:0,speed:0}});
  await a.wait('snapshot',m=>m.players.some(p=>p.id===bId&&p.x===100));
  Object.assign(app.rooms.get(room.code).players.get(room.selfId).state,{x:100,z:100,yaw:0});
  a.send({type:'state',state:{x:100,z:100,yaw:0,speed:30}});
  const hitA=await a.wait('collision'),hitB=await b.wait('collision');
  assert.ok(hitA.state.speed<15);assert.ok(hitB.state.speed>15);
  assert.ok(hitB.state.z-hitA.state.z>=11);
  b.send({type:'state',state:{x:100,z:110.8,yaw:0,speed:0}});
  await delay(30);
  assert.equal(app.rooms.get(room.code).players.get(bId).state.speed,hitB.state.speed);
  // Advance a plausible second in this fixture and move beyond the contact
  // island, so CPU scheduling cannot create a second legitimate contact.
  app.rooms.get(room.code).players.get(bId).state.stateTime=Date.now()-1000;
  b.send({type:'state',state:{...hitB.state,z:hitB.state.z+15}});
  await a.wait('snapshot',m=>m.players.some(p=>p.id===bId&&p.z===hitB.state.z+15));
 } finally {a.ws.terminate();b.ws.terminate();await delay(30);}
});

test('Node room sends only member/profile deltas and serves revisioned image bytes over HTTP',async()=>{
 const a=await client(),b=await client(),image=png;
 const origin=base.replace('ws:','http:');
 try{
  a.send({type:'create',profile:profile('A',image)});const room=await a.wait('room');
  b.send({type:'join',code:room.code,profile:profile('B')});const joined=await b.wait('room');
  await a.wait('player',m=>m.player.id===joined.selfId);
  const url=new URL(joined.players.find(p=>p.id===room.selfId).skin.image,origin);
  const asset=await fetch(url);assert.equal(asset.status,200);assert.deepEqual(Buffer.from(await asset.arrayBuffer()),imageBytes(image));
  assert.equal(asset.headers.get('content-type'),'image/png');assert.match(asset.headers.get('cache-control'),/immutable/);
  assert.equal((await fetch(url,{method:'HEAD'})).headers.get('content-length'),String(imageBytes(image).length));
  assert.equal((await fetch(url,{headers:{'If-None-Match':asset.headers.get('etag')}})).status,304);
  const missing=new URL(url);missing.searchParams.set('revision','99');assert.equal((await fetch(missing)).status,404);
  missing.searchParams.set('room','ZZZZZZ');assert.equal((await fetch(missing)).status,404);
  a.send({type:'profile',profile:profile('A2',alternatePng)});
  const update=await b.wait('profile',m=>m.player.name==='A2');
  assert.equal(update.player.profileRevision,2);
  assert.deepEqual(Buffer.from(await (await fetch(new URL(update.player.skin.image,origin))).arrayBuffer()),imageBytes(alternatePng));
  assert.equal((await fetch(url)).status,404);
  assert.ok(!JSON.stringify([...a.messages,...b.messages]).includes('base64'),'skin bytes never enter downstream motion sockets');
  b.ws.close();await a.wait('left',m=>m.playerId===joined.selfId);
  assert.equal(a.messages.filter(m=>m.type==='room').length,1,'existing clients never receive full roster rebuilds');
 }finally{a.ws.terminate();b.ws.terminate();await delay(30);}
});

test('Node rejects impossible motion, resyncs the sender and accepts long-stall recovery',async()=>{
 const a=await client(),b=await client();
 try{
  a.send({type:'create',profile:profile('A')});const room=await a.wait('room');
  b.send({type:'join',code:room.code,profile:profile('B')});await b.wait('room');
  const self=app.rooms.get(room.code).players.get(room.selfId),start={...self.state};
  a.send({type:'state',state:{...start,speed:1e7}});
  await a.wait('error',m=>/speed/.test(m.message));const correction=await a.wait('collision');
  assert.equal(correction.state.x,start.x);assert.equal(correction.state.collisionRevision,1);
  assert.equal(b.messages.filter(m=>m.type==='collision').length,0);
  a.send({type:'state',state:{...correction.state,z:start.z+.5,speed:1,paused:false}});
  await a.wait('snapshot',m=>m.players.some(p=>p.id===room.selfId&&p.z===start.z+.5));
  Object.assign(self.state,{x:100,z:0,yaw:0,speed:30,paused:false,stateTime:Date.now()-10000});
  a.send({type:'state',state:{...self.state,z:300}});
  await a.wait('snapshot',m=>m.players.some(p=>p.id===room.selfId&&p.z===300));
  assert.equal(self.state.z,300);
 }finally{a.ws.terminate();b.ws.terminate();await delay(30);}
});

test('Node closes a connection that never completes the initial join',async()=>{
 const pendingApp=createBusServer({joinTimeoutMs:30});let ws;
 try{
  pendingApp.server.listen(0,'127.0.0.1');await once(pendingApp.server,'listening');
  ws=new WebSocket(`ws://127.0.0.1:${pendingApp.server.address().port}/ws`);
  const closed=once(ws,'close');await once(ws,'open');
  const [code,reason]=await closed;assert.equal(code,1008);assert.equal(reason.toString(),'Join timed out');
  assert.equal(pendingApp.rooms.size,0);
 }finally{ws?.terminate();await pendingApp.close();}
});

test('Node explicit leave closes the transport and releases its admission slot',async()=>{
 const p=await client();
 try{
  p.send({type:'create',profile:profile('Departing')});const room=await p.wait('room');
  const id=p.messages.find(m=>m.type==='connected').id;
  const closed=once(p.ws,'close');p.send({type:'leave'});
  assert.equal((await closed)[0],1000);
  await delay(10);
  assert.equal(app.rooms.has(room.code),false);
  assert.ok(![...app.wss.clients].some(ws=>ws.id===id),'departed clients cannot retain a global connection slot');
 }finally{p.ws.terminate();}
});

test('Node rejects malicious artwork without changing profiles or broadcasting it',async()=>{
 const a=await client(),b=await client();
 try{
  a.send({type:'create',profile:profile('Original',png)});const room=await a.wait('room');
  b.send({type:'join',code:room.code,profile:profile('Peer')});await b.wait('room');
  const oversized=imageBytes(png);oversized.writeUInt32BE(16384,16);oversized.writeUInt32BE(16384,20);
  for(const image of ['https://attacker.invalid/a.png',`data:image/png;base64,${oversized.toString('base64')}`,png.replace('image/png','image/jpeg')]){
   const start=a.messages.length;
   a.send({type:'profile',profile:profile('Rejected',image)});
   await a.wait('error',m=>a.messages.indexOf(m)>=start);
  }
  const saved=app.rooms.get(room.code).players.get(room.selfId);
  assert.equal(saved.name,'Original');assert.equal(saved.profileRevision,1);
  assert.ok(!b.messages.some(m=>m.type==='profile'),'invalid images never reach peers');
 }finally{a.ws.terminate();b.ws.terminate();await delay(30);}
});
