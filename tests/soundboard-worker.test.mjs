import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ROOM_CAPACITY} from '../shared/room-config.js';
import {initialRoomState,JOIN_TIMEOUT_MS} from '../shared/room-state.js';
import {png,imageBytes} from './fixtures/skin-images.mjs';

// Exercise the production room handler with hibernating socket attachments.
const source=(await readFile(new URL('../worker/room.js',import.meta.url),'utf8'))
 .replace("import {DurableObject} from 'cloudflare:workers';",'class DurableObject {}')
 .replaceAll("'../shared/",`'${new URL('../shared/',import.meta.url).href}`);
const {BusRoom}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function socket(id,joined=true){return {readyState:1,data:{id,joined,windowStart:Date.now(),messages:0},messages:[],deserializeAttachment(){return {...this.data};},serializeAttachment(data){this.data={...data};},send(raw){this.messages.push(JSON.parse(raw));}};}
function fixture(sockets,profiles=new Map()){
 const room=Object.create(BusRoom.prototype);room.code='ABC123';room.queueSnapshot=()=>{};
 room.ctx={getWebSockets:()=>sockets};room.sql={exec(query,...args){
  if(query.startsWith('SELECT data'))return {toArray:()=>profiles.has(args[0])?[{data:JSON.stringify(profiles.get(args[0]))}]:[]};
  if(query.startsWith('INSERT OR REPLACE INTO profiles'))profiles.set(args[0],JSON.parse(args[1]));
  if(query.startsWith('UPDATE profiles'))profiles.set(args[1],JSON.parse(args[0]));
  if(query==='DELETE FROM profiles')profiles.clear();
  else if(query.startsWith('DELETE FROM profiles WHERE'))profiles.delete(args[0]);
  return {toArray:()=>[]};
 }};return room;
}
test('Cloudflare accepts the fifth bus and rejects the sixth at the WebSocket upgrade',async()=>{
 const previousPair=globalThis.WebSocketPair,previousResponse=globalThis.Response;
 const opened=[],active=Array.from({length:4},(_,i)=>socket(`p${i}`));
 globalThis.WebSocketPair=class {
  constructor(){
   this[0]={};this[1]=socket(`pending${opened.length}`,false);
   this[1].accept=()=>{};
   this[1].close=(code)=>{this[1].readyState=3;this[1].closeCode=code;};
   opened.push(this[1]);
  }
 };
 globalThis.Response=class {constructor(body,options){Object.assign(this,options);}};
 try{
  assert.equal(ROOM_CAPACITY,5);
  const room=Object.create(BusRoom.prototype);room.code='ABC123';
  room.ctx={getWebSockets:()=>active,acceptWebSocket:ws=>active.push(ws)};
  const request=new Request('https://example.com/ws?room=ABC123&intent=join',{headers:{Upgrade:'websocket'}});
  const fifth=await room.fetch(request);
  assert.equal(fifth.status,101);assert.equal(active.length,5);
  assert.equal(opened[0].messages[0].type,'connected');
  // Complete the fifth member's handshake before attempting a sixth member.
  opened[0].data.joined=true;
  const sixth=await room.fetch(request);
  assert.equal(sixth.status,101);assert.equal(active.length,5);
  assert.deepEqual(opened[1].messages,[{type:'error',message:'This convoy is full (5 drivers).'}]);
  assert.equal(opened[1].closeCode,1008);
  room.clearHandshake(opened[0]);
 }finally{
  globalThis.Response=previousResponse;
  if(previousPair===undefined)delete globalThis.WebSocketPair;else globalThis.WebSocketPair=previousPair;
 }
});

test('Cloudflare room relays nine valid sounds, persists cooldown and excludes sender/unjoined sockets',()=>{
 const host=socket('host'),peer=socket('peer'),pending=socket('pending',false);
 const room=Object.create(BusRoom.prototype);room.ctx={getWebSockets:()=>[host,peer,pending]};
 for(let soundId=1;soundId<=9;soundId++){
  host.data.soundAt=Date.now()-601;
  room.webSocketMessage(host,JSON.stringify({type:'sound',soundId,playerId:'spoof'}));
 }
 assert.deepEqual(peer.messages.map(m=>m.soundId),[1,2,3,4,5,6,7,8,9]);
 assert.ok(peer.messages.every(m=>m.playerId==='host'));
 room.webSocketMessage(host,JSON.stringify({type:'sound',soundId:1}));
 assert.equal(peer.messages.length,9);
 assert.equal(host.messages.length,0);assert.equal(pending.messages.length,0);
 room.webSocketMessage(host,JSON.stringify({type:'sound',soundId:10}));
 assert.equal(host.messages.at(-1).message,'Invalid sound.');
 room.webSocketMessage(pending,JSON.stringify({type:'sound',soundId:1}));
 assert.equal(pending.messages.at(-1).message,'Join a convoy first.');
});

test('Cloudflare collisions persist both corrections through hibernation and reject stale updates',()=>{
 const host=socket('host'),peer=socket('peer');
 host.data.state={x:0,z:0,yaw:0,speed:0};peer.data.state={x:0,z:10.8,yaw:0,speed:0};
 const room=Object.create(BusRoom.prototype);room.ctx={getWebSockets:()=>[host,peer]};room.queueSnapshot=()=>{};
 room.webSocketMessage(host,JSON.stringify({type:'state',state:{x:0,z:0,yaw:0,speed:30}}));
 const hitA=host.messages.at(-1),hitB=peer.messages.at(-1);
 assert.equal(hitA.type,'collision');assert.equal(hitB.type,'collision');
 assert.ok(hitA.state.speed<15);assert.ok(hitB.state.speed>15);
 assert.equal(peer.data.state.collisionRevision,1);
 room.webSocketMessage(peer,JSON.stringify({type:'state',state:{x:0,z:10.8,yaw:0,speed:0}}));
 assert.equal(peer.data.state.speed,hitB.state.speed);
 room.webSocketMessage(peer,JSON.stringify({type:'state',state:{...hitB.state,z:hitB.state.z+.5}}));
 assert.equal(peer.data.state.z,hitB.state.z+.5);
});

test('Cloudflare handler preserves sample age, avoids false following collisions and resyncs rejected motion',()=>{
 const host=socket('host'),peer=socket('peer'),now=Date.now(),speed=120/3.6;
 host.data.state={...initialRoomState({x:0,z:0,yaw:0,speed},now-75),paused:false};
 peer.data.state={...initialRoomState({x:0,z:12,yaw:0,speed},now-75),paused:false};
 const room=fixture([host,peer]),before=structuredClone(peer.data.state);
 room.webSocketMessage(host,JSON.stringify({type:'state',state:{x:0,z:2.5,yaw:0,speed}}));
 assert.equal(host.messages.length,0);assert.equal(peer.messages.length,0);
 assert.equal(host.data.state.stateSeq,1);assert.deepEqual(peer.data.state,before);
 room.webSocketMessage(host,JSON.stringify({type:'state',state:{x:0,z:10000,yaw:0,speed}}));
 const correction=host.messages.find(m=>m.type==='collision');
 assert.ok(correction);assert.equal(correction.state.z,2.5);assert.equal(correction.state.collisionRevision,1);
 assert.ok(host.messages.some(m=>m.type==='error'));assert.deepEqual(peer.data.state,before);
 room.webSocketMessage(host,JSON.stringify({type:'state',state:{...correction.state,z:3}}));
 assert.equal(host.data.state.z,3);assert.ok(host.data.state.stateSeq>correction.state.stateSeq);
});

test('Cloudflare accepts real five-FPS travel between duplicate 75 ms timer packets',t=>{
 const start=100000;t.mock.timers.enable({apis:['Date'],now:start});
 const host=socket('host'),speed=120/3.6;
 host.data.state={...initialRoomState({x:0,z:0,yaw:0,speed},start),paused:false};
 const room=fixture([host]);
 for(let elapsed=75;elapsed<=1500;elapsed+=75){
  t.mock.timers.setTime(start+elapsed);
  const z=Math.floor(elapsed/200)*.2*speed;
  room.webSocketMessage(host,JSON.stringify({type:'state',state:{x:0,z,yaw:0,speed}}));
 }
 assert.ok(!host.messages.some(m=>m.type==='error'),'duplicate source poses cannot shorten the movement allowance');
 assert.equal(host.data.state.z,Math.floor(1500/200)*.2*speed);
 assert.equal(host.data.state.stateSeq,7,'only actual new poses advance the sample sequence');
});

test('Cloudflare sends profile/member deltas and serves versioned images outside the motion socket',async()=>{
 const host=socket('host'),newcomer=socket('new',false),image=png;
 host.data.state=initialRoomState({x:0,z:0,yaw:0,speed:0});
 newcomer.data.state=initialRoomState({x:3.5,z:0,yaw:0,speed:0});newcomer.data.intent='join';
 const profiles=new Map([['host',{name:'Host',skin:{image},profileRevision:1}]]),room=fixture([host,newcomer],profiles);
 room.webSocketMessage(newcomer,JSON.stringify({type:'join',profile:{name:'New',skin:{image}}}));
 assert.deepEqual(host.messages.map(m=>m.type),['player']);
 assert.deepEqual(newcomer.messages.map(m=>m.type),['room']);
 const initial=newcomer.messages[0];assert.equal(initial.players.length,2);
 const imageUrl=initial.players.find(p=>p.id==='host').skin.image;
 assert.ok(imageUrl.startsWith('/skin?'));assert.ok(!JSON.stringify([...host.messages,...newcomer.messages]).includes('base64'));
 const response=await room.fetch(new Request(new URL(imageUrl,'https://example.com')));
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
 assert.match(response.headers.get('cache-control'),/immutable/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),imageBytes(image));
 const cached=await room.fetch(new Request(new URL(imageUrl,'https://example.com'),{headers:{'If-None-Match':response.headers.get('etag')}}));
 assert.equal(cached.status,304);
 host.messages.length=0;newcomer.messages.length=0;
 room.webSocketMessage(host,JSON.stringify({type:'profile',profile:{name:'Changed',skin:{image}}}));
 assert.deepEqual(newcomer.messages.map(m=>m.type),['profile']);
 assert.equal(newcomer.messages[0].player.profileRevision,2);
 assert.ok(!JSON.stringify(newcomer.messages).includes('base64'));
 assert.equal((await room.fetch(new Request(new URL(imageUrl,'https://example.com')))).status,404,'superseded revision cannot serve different bytes');
 assert.equal((await room.fetch(new Request('https://example.com/skin?player=missing&revision=1&field=image'))).status,404);
 newcomer.messages.length=0;room.remove(host);
 assert.deepEqual(newcomer.messages.map(m=>m.type),['left']);assert.equal(newcomer.messages[0].playerId,'host');
});

test('Cloudflare closes an unjoined connection at its handshake deadline',t=>{
 const now=100000;t.mock.timers.enable({apis:['setTimeout','Date'],now});
 const host=socket('host'),pending=socket('pending',false);pending.data.handshakeDeadline=now+JOIN_TIMEOUT_MS;
 pending.close=code=>{pending.readyState=3;pending.closeCode=code;};
 const room=fixture([host,pending]);room.armHandshake(pending);
 t.mock.timers.tick(JOIN_TIMEOUT_MS-1);assert.equal(pending.readyState,1);
 t.mock.timers.tick(1);assert.equal(pending.closeCode,1008);assert.equal(room.active().length,1);
 assert.equal(room.handshakeTimers.size,0);assert.equal(host.messages.length,0);
});

test('Cloudflare rejects malicious artwork before persisting or publishing profiles',()=>{
 const host=socket('host'),peer=socket('peer');
 const profiles=new Map([['host',{name:'Original',skin:{image:png},profileRevision:1}]]);
 const room=fixture([host,peer],profiles);
 const oversized=imageBytes(png);oversized.writeUInt32BE(16384,16);oversized.writeUInt32BE(16384,20);
 for(const image of ['https://attacker.invalid/a.png',`data:image/png;base64,${oversized.toString('base64')}`,png.replace('image/png','image/jpeg')]){
  room.webSocketMessage(host,JSON.stringify({type:'profile',profile:{name:'Rejected',skin:{image}}}));
  assert.equal(host.messages.at(-1).type,'error');
 }
 assert.equal(profiles.get('host').name,'Original');assert.equal(profiles.get('host').profileRevision,1);
 assert.equal(peer.messages.length,0);
 const newcomer=socket('new',false);newcomer.data.intent='join';newcomer.data.state=initialRoomState({x:30,z:0,yaw:0,speed:0});
 const pendingRoom=fixture([host,newcomer],profiles);
 pendingRoom.webSocketMessage(newcomer,JSON.stringify({type:'join',profile:{name:'Rejected',skin:{image:'https://attacker.invalid/a'}}}));
 assert.equal(newcomer.data.joined,false);assert.equal(profiles.has('new'),false);
});
