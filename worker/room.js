import {spawnState} from '../shared/spawn.js';
import {DurableObject} from 'cloudflare:workers';

const MAX_MESSAGE=192*1024+4096;

function profile(input) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw Error('Invalid player profile.');
  const name=String(input.name??'Driver').trim().slice(0,24)||'Driver';
  if(!input.skin || typeof input.skin!=='object' || Array.isArray(input.skin) || Object.keys(input.skin).length>16)throw Error('Invalid bus skin.');
  const skin={};
  for(const [key,value] of Object.entries(input.skin)) {
    if(!/^[a-zA-Z][a-zA-Z0-9]{0,23}$/.test(key))throw Error('Invalid skin property.');
    if(value===null){skin[key]=null;continue;}
    if(typeof value!=='string')throw Error('Skin properties must be text.');
    if(/image|decal|livery/i.test(key)&&value.startsWith('data:')) {
      if(value.length>192*1024 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Use a PNG, JPEG or WebP skin smaller than 192 KB.');
    } else if(key==='rearText' ? value.length>80 || /[\u0000-\u0009\u000b-\u001f]/.test(value) || value.split('\n').length>2 : value.length>80 || /[\u0000-\u001f]/.test(value))throw Error('Skin text is too long or contains invalid line breaks.');
    skin[key]=value;
  }
  return {name,skin};
}
function state(input) {
  if(!input || typeof input!=='object')throw Error('Invalid bus position.');
  const result={};
  for(const key of ['x','z','yaw','speed']) {
    if(typeof input[key]!=='number'||!Number.isFinite(input[key])||Math.abs(input[key])>1e7)throw Error('Invalid bus position.');
    result[key]=input[key];
  }
  result.y=Number.isFinite(input.y)&&Math.abs(input.y)<1e7?input.y:0;
  return result;
}

/** One coordination object per convoy. Hibernates when drivers stop sending updates. */
export class BusRoom extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS room (code TEXT PRIMARY KEY)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    this.code=this.sql.exec('SELECT code FROM room LIMIT 1').toArray()[0]?.code??null;
    this.flushTimer=null;
  }
  active() {return this.ctx.getWebSockets().filter(ws=>ws.readyState===1);}
  send(ws,message) {try {if(ws.readyState===1)ws.send(typeof message==='string'?message:JSON.stringify(message));}catch {this.remove(ws);}}
  async fetch(request) {
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
    const url=new URL(request.url),code=url.searchParams.get('room'),intent=url.searchParams.get('intent');
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    const reject=message=>{server.accept();server.send(JSON.stringify({type:'error',message}));server.close(1008,'Room unavailable');return new Response(null,{status:101,webSocket:client});};
    if(!code || !/^[A-Z0-9]{6}$/.test(code))return reject('Enter a six-character room code.');
    if(intent!=='create'&&intent!=='join')return reject('Choose create or join.');
    const active=this.active();
    if(intent==='create' && this.code && active.length)return reject('That room code is in use. Please create a convoy again.');
    if(intent==='join' && (!this.code || !active.length))return reject('Room not found. Ask your friend to create a convoy.');
    if(active.length>=8)return reject('This convoy is full (8 drivers).');
    if(intent==='create') {this.sql.exec('DELETE FROM profiles');this.sql.exec('INSERT OR REPLACE INTO room(code) VALUES (?)',code);this.code=code;}
    const id=crypto.randomUUID();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({id,intent,joined:false,state:spawnState(active.map(ws=>ws.deserializeAttachment()?.state).filter(Boolean)),windowStart:Date.now(),messages:0,profileAt:0});
    this.send(server,{type:'connected',id});
    return new Response(null,{status:101,webSocket:client});
  }
  players() {
    const players=[];
    for(const ws of this.active()) {
      const data=ws.deserializeAttachment();
      if(!data?.joined)continue;
      const row=this.sql.exec('SELECT data FROM profiles WHERE id=?',data.id).toArray()[0];
      if(row)players.push({id:data.id,...JSON.parse(row.data),...data.state});
    }
    return players;
  }
  publishRoom() {
    const players=this.players();
    for(const ws of this.active()) {
      const data=ws.deserializeAttachment();
      if(data?.joined)this.send(ws,{type:'room',code:this.code,selfId:data.id,players});
    }
  }
  queueSnapshot() {
    if(this.flushTimer!==null)return;
    this.flushTimer=setTimeout(()=>{
      this.flushTimer=null;
      const joined=this.active().map(ws=>({ws,data:ws.deserializeAttachment()})).filter(p=>p.data?.joined);
      const players=joined.map(({data})=>({id:data.id,...data.state}));
      const snapshot=JSON.stringify({type:'snapshot',players,time:Date.now()});
      for(const {ws} of joined)this.send(ws,snapshot);
    },66);
  }
  webSocketMessage(ws,raw) {
    const data=ws.deserializeAttachment();if(!data)return;
    const now=Date.now();
    if(now-data.windowStart>1000){data.windowStart=now;data.messages=0;}
    if(++data.messages>40){ws.serializeAttachment(data);this.send(ws,{type:'error',message:'Sending updates too quickly.'});if(data.messages>80)ws.close(1008,'Rate limit');return;}
    ws.serializeAttachment(data);
    try {
      if(typeof raw!=='string'||raw.length>MAX_MESSAGE)throw Error('Message too large.');
      const msg=JSON.parse(raw);
      if(!msg||typeof msg.type!=='string')throw Error('Invalid message.');
      if(msg.type==='ping'){this.send(ws,{type:'pong',time:now});return;}
      if(msg.type==='leave'){this.remove(ws);ws.close(1000,'Left convoy');return;}
      if(msg.type==='create'||msg.type==='join') {
        if(data.joined || msg.type!==data.intent)throw Error('Invalid room request.');
        const clean=profile(msg.profile??{name:msg.name,skin:msg.skin});
        this.sql.exec('INSERT OR REPLACE INTO profiles(id,data) VALUES (?,?)',data.id,JSON.stringify(clean));
        data.joined=true;ws.serializeAttachment(data);this.publishRoom();return;
      }
      if(!data.joined)throw Error('Join a convoy first.');
      if(msg.type==='state'){data.state=state(msg.state??msg);ws.serializeAttachment(data);this.queueSnapshot();return;}
      if(msg.type==='profile') {
        if(now-data.profileAt<300)throw Error('Please wait before updating your skin again.');
        const clean=profile(msg.profile??{name:msg.name,skin:msg.skin});
        this.sql.exec('UPDATE profiles SET data=? WHERE id=?',JSON.stringify(clean),data.id);
        data.profileAt=now;ws.serializeAttachment(data);this.publishRoom();return;
      }
      throw Error('Unknown message.');
    }catch(error){this.send(ws,{type:'error',message:error.message||'Invalid message.'});}
  }
  remove(ws) {
    const data=ws.deserializeAttachment();
    if(data){this.sql.exec('DELETE FROM profiles WHERE id=?',data.id);data.joined=false;try{ws.serializeAttachment(data);}catch{}}
    const remaining=this.active().filter(other=>other!==ws);
    if(!remaining.length){this.sql.exec('DELETE FROM profiles');this.sql.exec('DELETE FROM room');this.code=null;}
    else this.publishRoom();
  }
  webSocketClose(ws,code) {this.remove(ws);try{ws.close(code===1006?1000:code,'Disconnected');}catch{}}
  webSocketError(ws) {this.remove(ws);try{ws.close(1011,'Connection error');}catch{}}
}
