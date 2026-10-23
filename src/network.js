/** The same room protocol is served by Node locally and Durable Objects online. */
export class RoomClient {
  constructor({onRoom=()=>{},onPeers=()=>{},onError=()=>{},onStatus=()=>{}}={}) {
    Object.assign(this,{onRoom,onPeers,onError,onStatus});
    this.socket=null;this.code=null;this.selfId=null;this.players=new Map();this.lastSent=0;this.generation=0;
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
    socket.addEventListener('open',()=>{if(generation===this.generation)socket.send(JSON.stringify({type:intent,code,profile}));});
    socket.addEventListener('message',event=>{
      if (generation!==this.generation) return;
      let message;try {message=JSON.parse(event.data);}catch{return;}
      if (message.type==='room') {
        this.code=message.code;this.selfId=message.selfId;
        this.players=new Map(message.players.map(p=>[p.id,p]));
        this.onStatus('connected');this.onRoom({code:this.code,selfId:this.selfId,players:message.players});
        this.emitPeers();
      } else if(message.type==='snapshot') {
        for(const state of message.players) {
          const player=this.players.get(state.id);
          if(player)this.players.set(state.id,{...player,...state});
        }
        this.emitPeers();
      } else if(message.type==='error') {this.onError(message.message);if(!this.code)this.onStatus('error');}
    });
    socket.addEventListener('error',()=>{if(generation===this.generation){this.onError('Could not connect to the convoy server.');this.onStatus('error');}});
    socket.addEventListener('close',()=>{
      if(generation!==this.generation)return;
      this.socket=null;this.code=null;this.players.clear();this.onPeers([]);this.onRoom(null);this.onStatus('disconnected');
    });
  }
  emitPeers() {this.onPeers([...this.players.values()].filter(p=>p.id!==this.selfId));}
  send(message) {if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message));}
  sendState(state) {
    const now=performance.now();if(!this.code || now-this.lastSent<75)return;
    this.lastSent=now;this.send({type:'state',state});
  }
  updateProfile(profile) {this.send({type:'profile',profile});}
  leave() {
    this.generation++;
    if(this.socket) {if(this.socket.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify({type:'leave'}));this.socket.close();}
    this.socket=null;this.code=null;this.selfId=null;this.players.clear();this.onPeers([]);this.onRoom(null);this.onStatus('offline');
  }
  getInviteURL() {const url=new URL(location.href);if(this.code)url.searchParams.set('room',this.code);return url.toString();}
}
