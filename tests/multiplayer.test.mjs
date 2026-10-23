import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createBusServer} from '../server.mjs';
let app,base;
before(async()=>{app=createBusServer();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');base=`ws://127.0.0.1:${app.server.address().port}/ws`;});
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
  a.send({type:'create',profile:profile('A',image)});const room=await a.wait('room');
  b.send({type:'join',code:room.code,profile:profile('B')});await b.wait('room',m=>m.players.length===2);
  a.send({type:'state',state:{x:42,z:100,yaw:1.5,speed:12}});
  c.send({type:'join',code:room.code,profile:profile('C')});const joined=await c.wait('room',m=>m.players.length===3);
  assert.equal(joined.players.find(p=>p.name==='A').skin.image,image);
  const snapshot=await c.wait('snapshot',m=>m.players.some(p=>p.id===room.selfId&&p.x===42));
  assert.equal(snapshot.players.find(p=>p.id===room.selfId).speed,12);
  b.send({type:'profile',profile:profile('Updated')});await c.wait('room',m=>m.players.some(p=>p.name==='Updated'));
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
  assert.equal(app.rooms.get(room.code).players.get(room.selfId).state.x,0);
  const response=await fetch(base.replace('ws:','http:').replace('/ws','/health'));assert.equal((await response.json()).ok,true);
 } finally {p.ws.terminate();await delay(30);}
});
