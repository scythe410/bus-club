import {initialRoomState,updateRoomMotion,recoverRoomMotion,JOIN_TIMEOUT_MS} from '../shared/room-state.js';
import {validSound,SOUND_COOLDOWN_MS} from '../shared/soundboard.js';
import {spawnState} from '../shared/spawn.js';
import {ROOM_CAPACITY} from '../shared/room-config.js';
import {publicProfile,profileImage} from '../shared/skin-assets.js';
import {validProfile as profile} from '../shared/profile.js';
import {MAX_IMAGE_BYTES} from '../shared/skin-image.js';
import {DurableObject} from 'cloudflare:workers';

const MAX_MESSAGE=MAX_IMAGE_BYTES+4096;

/** One coordination object per convoy. Hibernates when drivers stop sending updates. */
export class BusRoom extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS room (code TEXT PRIMARY KEY)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    this.code=this.sql.exec('SELECT code FROM room LIMIT 1').toArray()[0]?.code??null;
    this.flushTimer=null;
    this.handshakeTimers=new Map();
    for(const ws of this.active())if(!ws.deserializeAttachment()?.joined)this.armHandshake(ws);
  }
  active() {return this.ctx.getWebSockets().filter(ws=>ws.readyState===1);}
  send(ws,message) {try {if(ws.readyState===1)ws.send(typeof message==='string'?message:JSON.stringify(message));}catch {this.remove(ws);}}
  clearHandshake(ws){clearTimeout(this.handshakeTimers?.get(ws));this.handshakeTimers?.delete(ws);}
  armHandshake(ws){
    this.handshakeTimers??=new Map();
    this.clearHandshake(ws);
    const remaining=Math.max(0,(ws.deserializeAttachment()?.handshakeDeadline??Date.now()+JOIN_TIMEOUT_MS)-Date.now());
    this.handshakeTimers.set(ws,setTimeout(()=>{
      this.handshakeTimers.delete(ws);
      if(ws.readyState===1&&!ws.deserializeAttachment()?.joined){this.remove(ws);try{ws.close(1008,'Join timed out');}catch{}}
    },remaining));
  }
  async fetch(request) {
    const url=new URL(request.url);
    if(url.pathname==='/skin') {
      if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
      const id=url.searchParams.get('player')||'',field=url.searchParams.get('field')||'',revision=url.searchParams.get('revision')||'';
      const row=this.sql.exec('SELECT data FROM profiles WHERE id=?',id).toArray()[0];
      const asset=profileImage(row?JSON.parse(row.data):null,field,revision);
      if(!asset)return new Response('Skin not found',{status:404,headers:{'Cache-Control':'no-store'}});
      const etag=`"${id}-${revision}-${field}"`;
      const headers={'Content-Type':asset.contentType,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*','ETag':etag};
      if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers});
      return new Response(request.method==='HEAD'?null:asset.bytes,{headers:{...headers,'Content-Length':String(asset.bytes.length)}});
    }
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
    const code=url.searchParams.get('room'),intent=url.searchParams.get('intent');
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    const reject=message=>{server.accept();server.send(JSON.stringify({type:'error',message}));server.close(1008,'Room unavailable');return new Response(null,{status:101,webSocket:client});};
    if(!code || !/^[A-Z0-9]{6}$/.test(code))return reject('Enter a six-character room code.');
    if(intent!=='create'&&intent!=='join')return reject('Choose create or join.');
    const active=this.active();
    if(intent==='create' && this.code && active.length)return reject('That room code is in use. Please create a convoy again.');
    if(intent==='join' && (!this.code || !active.length))return reject('Room not found. Ask your friend to create a convoy.');
    if(active.length>=ROOM_CAPACITY)return reject(`This convoy is full (${ROOM_CAPACITY} drivers).`);
    if(intent==='create') {this.sql.exec('DELETE FROM profiles');this.sql.exec('INSERT OR REPLACE INTO room(code) VALUES (?)',code);this.code=code;}
    const id=crypto.randomUUID();
    this.ctx.acceptWebSocket(server);
    const now=Date.now();
    server.serializeAttachment({id,intent,joined:false,state:initialRoomState(spawnState(active.map(ws=>ws.deserializeAttachment()?.state).filter(Boolean)),now),windowStart:now,messages:0,profileAt:0,handshakeDeadline:now+JOIN_TIMEOUT_MS});
    this.armHandshake(server);
    this.send(server,{type:'connected',id});
    return new Response(null,{status:101,webSocket:client});
  }
  players() {
    const players=[];
    for(const ws of this.active()) {
      const data=ws.deserializeAttachment();
      if(!data?.joined)continue;
      const row=this.sql.exec('SELECT data FROM profiles WHERE id=?',data.id).toArray()[0];
      if(row)players.push({id:data.id,...publicProfile(JSON.parse(row.data),data.id,this.code),...data.state});
    }
    return players;
  }
  publishRoom(recipient) {
    const players=this.players();
    for(const ws of this.active()) {
      const data=ws.deserializeAttachment();
      if(data?.joined&&(!recipient||recipient===ws))this.send(ws,{type:'room',code:this.code,selfId:data.id,players,time:Date.now()});
    }
  }
  broadcast(message,except){for(const ws of this.active())if(ws!==except&&ws.deserializeAttachment()?.joined)this.send(ws,message);}
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
        const clean={...profile(msg.profile??{name:msg.name,skin:msg.skin}),profileRevision:1};
        this.sql.exec('INSERT OR REPLACE INTO profiles(id,data) VALUES (?,?)',data.id,JSON.stringify(clean));
        data.joined=true;ws.serializeAttachment(data);this.clearHandshake(ws);
        this.publishRoom(ws);this.broadcast({type:'player',player:{id:data.id,...publicProfile(clean,data.id,this.code),...data.state},time:now},ws);return;
      }
      if(!data.joined)throw Error('Join a convoy first.');
      if(msg.type==='state'){
        const input=msg.state??msg;
        const players=this.active().map(peer=>({ws:peer,...peer.deserializeAttachment()})).filter(p=>p.joined);
        const before=new Map(players.map(p=>[p.id,p.state]));
        let changed;
        try{changed=updateRoomMotion(players,data.id,input,now);}
        catch(error){
          const self=players.find(p=>p.id===data.id);recoverRoomMotion(self,now);
          const saved=ws.deserializeAttachment();ws.serializeAttachment({...saved,state:self.state});
          this.send(ws,{type:'collision',state:self.state,time:now});this.queueSnapshot();throw error;
        }
        // Store revisions with each hibernating socket before sending corrections.
        for(const p of players)if(p.state!==before.get(p.id)){const saved=p.ws.deserializeAttachment();p.ws.serializeAttachment({...saved,state:p.state});}
        for(const p of changed)this.send(p.ws,{type:'collision',state:p.state,time:now});
        this.queueSnapshot();return;
      }
      if(msg.type==='sound') {
        if(!validSound(msg.soundId))throw Error('Invalid sound.');
        if(now-(data.soundAt??-Infinity)<SOUND_COOLDOWN_MS)return;
        data.soundAt=now;ws.serializeAttachment(data);
        for(const peer of this.active())if(peer!==ws&&peer.deserializeAttachment()?.joined)this.send(peer,{type:'sound',soundId:msg.soundId,playerId:data.id});
        return;
      }
      if(msg.type==='profile') {
        if(now-data.profileAt<300)throw Error('Please wait before updating your skin again.');
        const previous=this.sql.exec('SELECT data FROM profiles WHERE id=?',data.id).toArray()[0];
        const clean={...profile(msg.profile??{name:msg.name,skin:msg.skin}),profileRevision:(previous?JSON.parse(previous.data).profileRevision||0:0)+1};
        this.sql.exec('UPDATE profiles SET data=? WHERE id=?',JSON.stringify(clean),data.id);
        data.profileAt=now;ws.serializeAttachment(data);this.broadcast({type:'profile',player:{id:data.id,...publicProfile(clean,data.id,this.code)},time:now});return;
      }
      throw Error('Unknown message.');
    }catch(error){this.send(ws,{type:'error',message:error.message||'Invalid message.'});}
  }
  remove(ws) {
    this.clearHandshake(ws);
    const data=ws.deserializeAttachment(),wasJoined=data?.joined;
    if(data){this.sql.exec('DELETE FROM profiles WHERE id=?',data.id);data.joined=false;try{ws.serializeAttachment(data);}catch{}}
    const remaining=this.active().filter(other=>other!==ws);
    if(!remaining.length){this.sql.exec('DELETE FROM profiles');this.sql.exec('DELETE FROM room');this.code=null;}
    else if(wasJoined)this.broadcast({type:'left',playerId:data.id,time:Date.now()},ws);
  }
  webSocketClose(ws,code) {this.remove(ws);try{ws.close(code===1006?1000:code,'Disconnected');}catch{}}
  webSocketError(ws) {this.remove(ws);try{ws.close(1011,'Connection error');}catch{}}
}
