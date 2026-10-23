/** Opt-in smoke test against a deployed server; creates and removes its own convoy. */
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {once} from 'node:events';
const endpoint=process.argv[2]??'wss://bus-club-rooms.neuralshift-games.workers.dev/ws';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code=()=>[...randomBytes(6)].map(n=>alphabet[n%32]).join('');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const profile=(name,image=null)=>({name,skin:{color:'#ff8800',accent:'#ffffff',pattern:'stripe',name:'Smoke Express',destination:'ELLA',image}});
const clients=[];
async function connect(room,intent,name,image=null){
 const url=new URL(endpoint);url.searchParams.set('room',room);url.searchParams.set('intent',intent);
 const ws=new WebSocket(url),messages=[],listeners=new Set();let sequence=0;
 ws.on('message',raw=>{const message=JSON.parse(raw);message.seq=++sequence;messages.push(message);for(const fn of listeners)fn(message);});
 const client={ws,send:message=>ws.send(JSON.stringify(message)),cursor:()=>sequence,wait(type,predicate=()=>true,after=0){
  const existing=messages.find(message=>message.seq>after&&message.type===type&&predicate(message));if(existing)return Promise.resolve(existing);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{listeners.delete(listener);reject(Error(`Timed out waiting for ${type} in ${room}`));},10000);function listener(message){if(message.seq>after&&message.type===type&&predicate(message)){clearTimeout(timer);listeners.delete(listener);resolve(message);}}listeners.add(listener);});
 }};
 clients.push(client);await once(ws,'open');client.send({type:intent,code:room,profile:profile(name,image)});return client;
}
try {
 const roomCode=code();
 const host=await connect(roomCode,'create','Smoke Host',png);const first=await host.wait('room');
 const b=await connect(roomCode,'join','Smoke B');await b.wait('room',m=>m.players.length===2);
 host.send({type:'state',state:{x:123,z:456,y:2,yaw:0.5,speed:18}});
 await b.wait('snapshot',m=>m.players.some(p=>p.id===first.selfId&&p.x===123));
 const c=await connect(roomCode,'join','Smoke C');const late=await c.wait('room',m=>m.players.length===3);
 assert.equal(late.players.find(p=>p.id===first.selfId)?.skin.image,png,'Late joiner receives full image skin');
 assert.equal(late.players.find(p=>p.id===first.selfId)?.x,123,'Late joiner receives current position');
 const cursor=c.cursor();b.send({type:'profile',profile:profile('Smoke B Updated',png)});
 await c.wait('room',m=>m.players.some(p=>p.name==='Smoke B Updated'&&p.skin.image===png),cursor);
 const afterLeave=b.cursor();host.ws.close(1000,'Smoke test host leaves');
 await b.wait('room',m=>m.players.length===2&&!m.players.some(p=>p.id===first.selfId),afterLeave);
 b.send({type:'state',state:{x:999,z:555,yaw:1,speed:20}});
 await c.wait('snapshot',m=>m.players.some(p=>p.x===999));
 const missing=await connect(code(),'join','Missing Room');assert.match((await missing.wait('error')).message,/not found/i);
 await Promise.all([b,c].map(async p=>{const closed=once(p.ws,'close');p.ws.close(1000,'Smoke test complete');await closed;}));
 // A new connection to an emptied room must not restore a ghost convoy.
 const empty=await connect(roomCode,'join','Empty Room');assert.match((await empty.wait('error')).message,/not found/i);
 console.log('PASS: deployed three-player convoy, skin late join, state/profile sync, host departure, missing rooms and empty-room cleanup.');
} finally {for(const client of clients)client.ws.terminate();}
