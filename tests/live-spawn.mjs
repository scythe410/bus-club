/** Opt-in live check: new room spawns and joining a friend already down the road. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const endpoint=process.argv[2]??'wss://bus-club-rooms.neuralshift-games.workers.dev/ws';
const room=randomBytes(3).toString('hex').toUpperCase(),clients=[];
const roadX=z=>Math.sin(z*.0022)*95+Math.sin(z*.0057)*23;
async function client(intent,name){
 const url=new URL(endpoint);url.searchParams.set('room',room);url.searchParams.set('intent',intent);
 const ws=new WebSocket(url),messages=[],listeners=new Set();
 ws.on('message',raw=>{const m=JSON.parse(raw);messages.push(m);for(const listener of listeners)listener(m);});
 const c={ws,send:m=>ws.send(JSON.stringify(m)),wait(type,predicate=()=>true){
  const found=messages.find(m=>m.type===type&&predicate(m));if(found)return Promise.resolve(found);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{listeners.delete(fn);reject(Error(`Timed out: ${type}`));},10000);function fn(m){if(m.type===type&&predicate(m)){clearTimeout(timer);listeners.delete(fn);resolve(m);}}listeners.add(fn);});
 }};clients.push(c);await once(ws,'open');c.send({type:intent,code:room,profile:{name,skin:{color:'#a3cbd0',accent:'#ffffff',pattern:'stripe'}}});return c;
}
const separation=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
try{
 const host=await client('create','Spawn test host'),first=await host.wait('room');
 const second=await client('join','Spawn test friend'),joined=await second.wait('room',m=>m.players.length===2);
 const a=joined.players.find(p=>p.id===first.selfId),b=joined.players.find(p=>p.id===joined.selfId);
 const freshDistance=separation(a,b);console.log(`Fresh room: buses spawn ${freshDistance.toFixed(1)} m apart.`);
 assert.ok(freshDistance>=3&&freshDistance<30,'New players must spawn near each other without overlapping.');
 host.send({type:'state',state:{x:roadX(2400),z:2400,yaw:0,speed:0}});
 await second.wait('snapshot',m=>m.players.some(p=>p.id===first.selfId&&p.z===2400));
 const closed=once(second.ws,'close');second.ws.close(1000,'Test late joining');await closed;
 const late=await client('join','Spawn test late friend'),lateRoom=await late.wait('room',m=>m.players.length===2);
 const leader=lateRoom.players.find(p=>p.id===first.selfId),newcomer=lateRoom.players.find(p=>p.id===lateRoom.selfId);
 const lateDistance=separation(leader,newcomer);console.log(`Friend 2.4 km down the road: newcomer spawns ${lateDistance.toFixed(1)} m away.`);
 assert.ok(lateDistance>=3&&lateDistance<50,'A late joiner must spawn near their friend, not back at the start.');
 console.log('PASS: fresh and late-joining friends spawn nearby without overlapping.');
}finally{for(const c of clients)c.ws.terminate();}
