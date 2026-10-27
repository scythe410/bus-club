import {validSound} from '../shared/soundboard.js';
const motionKeys=['x','z','yaw','speed','sideSpeed','impactYawRate','mass','paused','collisionRevision'];
const sameSkin=(a,b)=>a===b||!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>a[key]===b[key]);
/** The same room protocol is served by Node locally and Durable Objects online. */
export class RoomClient {
  constructor({onRoom=()=>{},onPeers=()=>{},onError=()=>{},onStatus=()=>{},onSound=()=>{},onCollision=()=>{}}={}) {
    Object.assign(this,{onRoom,onPeers,onError,onStatus,onSound,onCollision});
    this.socket=null;this.code=null;this.selfId=null;this.players=new Map();this.generation=0;this.collisionRevision=0;this.serverClockOffset=null;this.lastStateSent=null;
  }
  create(profile) {return this.connect('create',this.randomCode(),profile);}
  join(code,profile) {return this.connect('join',String(code).trim().toUpperCase(),profile);}
  randomCode() {
    const bytes=crypto.getRandomValues(new Uint8Array(6));
    return [...bytes].map(n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');
  }
  connect(intent,code,profile) {
    this.leave();const generation=++this.generation;
    this.onStatus('connecting');
    const configured=import.meta.env?.VITE_WS_URL;
    const url=new URL(configured || `${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);
    url.searchParams.set('room',code);url.searchParams.set('intent',intent);
    const socket=new WebSocket(url);this.socket=socket;
    let resolveConnection,rejectConnection;
    const connection=new Promise((resolve,reject)=>{resolveConnection=resolve;rejectConnection=reject;});
    const settle=(error,room)=>{
      if(this.pendingConnection?.generation!==generation)return;
      clearTimeout(this.pendingConnection.timer);this.pendingConnection=null;
      if(error)rejectConnection(error);else resolveConnection(room);
    };
    const timer=setTimeout(()=>{if(generation!==this.generation)return;settle(new Error('Connecting took too long. Please try again.'));socket.close();},15000);
    this.pendingConnection={generation,timer,reject:rejectConnection};
    socket.addEventListener('open',()=>{if(generation===this.generation)socket.send(JSON.stringify({type:intent,code,profile}));});
    socket.addEventListener('message',event=>{
      if (generation!==this.generation) return;
      let message;try {message=JSON.parse(event.data);}catch{return;}
      const now=performance.now();
      if(Number.isFinite(message.time)){
        // The minimum observed transit offset avoids retiming every sample to
        // its jittery arrival. Server state timestamps remain on one timeline.
        const offset=now-message.time;
        this.serverClockOffset=this.serverClockOffset===null?offset:Math.min(this.serverClockOffset,offset);
      }
      if (message.type==='room') {
        const newlyConnected=!this.code;
        this.code=message.code;this.selfId=message.selfId;
        this.players=new Map(message.players.map(p=>[p.id,this.mergePlayer(p,message.time,now)]));
        this.collisionRevision=Math.max(this.collisionRevision,this.players.get(this.selfId)?.collisionRevision||0);
        const room={code:this.code,selfId:this.selfId,players:[...this.players.values()]};
        if(newlyConnected)this.onStatus('connected');this.onRoom(room);settle(null,room);
        this.emitPeers();
      } else if(message.type==='player'||message.type==='profile'){
        const player=message.player;
        if(player?.id&&(message.type==='player'||this.players.has(player.id))){
          const previous=this.players.get(player.id);
          if(previous&&Number.isFinite(player.profileRevision)&&player.profileRevision<(previous.profileRevision||0))return;
          this.players.set(player.id,this.mergePlayer(player,message.time,now));this.emitRoom();this.emitPeers();
        }
      } else if(message.type==='left'){
        if(this.players.delete(message.playerId)){this.emitRoom();this.emitPeers();}
      } else if(message.type==='collision') {
        const state=message.state;
        // Stale outgoing packets can elicit the same correction repeatedly.
        // Reapplying it would rewind motion already simulated since that hit.
        if(state&&['x','z','yaw','speed','collisionRevision'].every(k=>Number.isFinite(state[k]))&&Number.isSafeInteger(state.collisionRevision)&&state.collisionRevision>this.collisionRevision){
          this.collisionRevision=state.collisionRevision;this.onCollision(state);
        }
      } else if(message.type==='snapshot') {
        for(const state of message.players) {
          const player=this.players.get(state.id);
          if(player)this.players.set(state.id,this.mergeMotion(player,state,message.time,now));
        }
        this.emitPeers();
      } else if(message.type==='sound'&&validSound(message.soundId)&&message.playerId!==this.selfId&&this.players.has(message.playerId)) {
        this.onSound(message.soundId,message.playerId);
      } else if(message.type==='error') {this.onError(message.message);if(!this.code){this.onStatus('error');settle(new Error(message.message));socket.close();}}
    });
    socket.addEventListener('error',()=>{if(generation===this.generation){const message='Could not connect to the convoy server.';this.onError(message);this.onStatus('error');settle(new Error(message));}});
    socket.addEventListener('close',()=>{
      if(generation!==this.generation)return;
      const wasConnected=Boolean(this.code);
      settle(new Error('The convoy connection closed. Please try again.'));
      this.socket=null;this.code=null;this.players.clear();this.onPeers([]);this.onRoom(null);this.onStatus(wasConnected?'disconnected':'offline');
    });
    return connection;
  }
  mergeMotion(player,state,time,now){
    if(!['x','z','yaw'].every(key=>Number.isFinite(state[key])))return player;
    if(Number.isSafeInteger(state.stateSeq)&&Number.isSafeInteger(player.stateSeq)&&state.stateSeq<=player.stateSeq)return player;
    if(!Number.isSafeInteger(state.stateSeq)&&Number.isFinite(player._sampleTime)&&motionKeys.every(key=>state[key]===player[key]))return player;
    const stamp=Number.isFinite(state.stateTime)?state.stateTime:time;
    const sampleTime=Number.isFinite(stamp)&&this.serverClockOffset!==null?stamp+this.serverClockOffset:now;
    const motion={};
    for(const key of [...motionKeys,'y','stateTime','stateSeq','reset'])if(key in state)motion[key]=state[key];
    return {...player,...motion,_sampleTime:sampleTime,_receivedAt:now};
  }
  mergePlayer(player,time,now){
    const previous=this.players.get(player.id)||{id:player.id};
    let receivedSkin=player.skin;
    if(receivedSkin&&this.socket?.url){
      const origin=new URL(this.socket.url);origin.protocol=origin.protocol==='wss:'?'https:':'http:';
      receivedSkin=Object.fromEntries(Object.entries(receivedSkin).map(([key,value])=>[key,
        typeof value==='string'&&value.startsWith('/skin?')?new URL(value,origin).href:value]));
    }
    const skin=sameSkin(previous.skin,receivedSkin)?previous.skin:receivedSkin??previous.skin;
    const profile={...previous,name:player.name??previous.name,skin,profileRevision:player.profileRevision??previous.profileRevision};
    return this.mergeMotion(profile,player,time,now);
  }
  emitRoom(){if(this.code)this.onRoom({code:this.code,selfId:this.selfId,players:[...this.players.values()]});}
  emitPeers() {this.onPeers([...this.players.values()].filter(p=>p.id!==this.selfId));}
  send(message) {if(this.socket?.readyState===WebSocket.OPEN){this.socket.send(JSON.stringify(message));return true;}return false;}
  sendState(state) {
    // main owns the 75 ms cadence. A second interval gate discarded slightly
    // early callbacks. Do not enqueue old motion behind a congested connection.
    if(!this.code||this.socket?.readyState!==WebSocket.OPEN||(this.socket.bufferedAmount||0)>0)return false;
    const sampled=typeof state==='function'?state():state;
    // At low render rates a timer can read the same moving physics tick twice.
    // Retiming it would make the next real tick look like a teleport to the
    // server, and repeatedly restart remote extrapolation from a frozen pose.
    const packet={...sampled,sampleTime:Date.now(),collisionRevision:this.collisionRevision};
    if(this.lastStateSent&&!packet.reset&&!packet.impact&&!packet.paused&&Math.abs(packet.speed||0)>.1&&
      motionKeys.every(key=>packet[key]===this.lastStateSent[key]))return false;
    const sent=this.send({type:'state',state:packet});
    if(sent)this.lastStateSent=packet;
    return sent;
  }
  sendSound(soundId) {if(this.code&&validSound(soundId))this.send({type:'sound',soundId});}
  updateProfile(profile) {this.send({type:'profile',profile});}
  leave() {
    if(this.pendingConnection){clearTimeout(this.pendingConnection.timer);this.pendingConnection.reject(new Error('Connection cancelled.'));this.pendingConnection=null;}
    this.generation++;
    if(this.socket) {if(this.socket.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify({type:'leave'}));this.socket.close();}
    this.socket=null;this.code=null;this.selfId=null;this.collisionRevision=0;this.serverClockOffset=null;this.lastStateSent=null;this.players.clear();this.onPeers([]);this.onRoom(null);this.onStatus('offline');
  }
  getInviteURL() {const url=new URL(location.href);if(this.code)url.searchParams.set('room',this.code);return url.toString();}
}
