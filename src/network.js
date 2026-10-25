import {validSound} from '../shared/soundboard.js';
/** The same room protocol is served by Node locally and Durable Objects online. */
export class RoomClient {
  constructor({onRoom=()=>{},onPeers=()=>{},onError=()=>{},onStatus=()=>{},onSound=()=>{},onCollision=()=>{}}={}) {
    Object.assign(this,{onRoom,onPeers,onError,onStatus,onSound,onCollision});
    this.socket=null;this.code=null;this.selfId=null;this.players=new Map();this.lastSent=0;this.generation=0;this.collisionRevision=0;
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
      if (message.type==='room') {
        const newlyConnected=!this.code;
        this.code=message.code;this.selfId=message.selfId;
        this.players=new Map(message.players.map(p=>[p.id,p]));
        this.collisionRevision=Math.max(this.collisionRevision,this.players.get(this.selfId)?.collisionRevision||0);
        const room={code:this.code,selfId:this.selfId,players:message.players};
        if(newlyConnected)this.onStatus('connected');this.onRoom(room);settle(null,room);
        this.emitPeers();
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
          if(player)this.players.set(state.id,{...player,...state});
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
  emitPeers() {this.onPeers([...this.players.values()].filter(p=>p.id!==this.selfId));}
  send(message) {if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message));}
  sendState(state) {
    const now=performance.now();if(!this.code || now-this.lastSent<75)return;
    this.lastSent=now;const sampled=typeof state==='function'?state():state;this.send({type:'state',state:{...sampled,collisionRevision:this.collisionRevision}});
  }
  sendSound(soundId) {if(this.code&&validSound(soundId))this.send({type:'sound',soundId});}
  updateProfile(profile) {this.send({type:'profile',profile});}
  leave() {
    if(this.pendingConnection){clearTimeout(this.pendingConnection.timer);this.pendingConnection.reject(new Error('Connection cancelled.'));this.pendingConnection=null;}
    this.generation++;
    if(this.socket) {if(this.socket.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify({type:'leave'}));this.socket.close();}
    this.socket=null;this.code=null;this.selfId=null;this.collisionRevision=0;this.players.clear();this.onPeers([]);this.onRoom(null);this.onStatus('offline');
  }
  getInviteURL() {const url=new URL(location.href);if(this.code)url.searchParams.set('room',this.code);return url.toString();}
}
