import './style.css';
import {BusGame} from './game.js';
import {createUI} from './ui.js';
import {RoomClient} from './network.js';
import {BusAudio} from './audio.js';

let game,network,ui,driving=false,paused=false,sound=true,profileTimer,spawnedId=null;
try{sound=localStorage.getItem('bus-club-sound')!=='off';}catch{}
const audio=new BusAudio();
const input={left:false,right:false,throttle:false,brake:false};
const toast=message=>ui?.toast(message);
const syncProfile=()=>{
  const profile=ui.getProfile();
  game?.setSkin({...profile.skin,name:profile.name,destination:profile.destination||profile.skin.destination});
  clearTimeout(profileTimer);profileTimer=setTimeout(()=>network?.updateProfile(profile),400);
};
const setPause=(value,{garage=false}={})=>{
  if(garage)driving=false;
  paused=value;game?.setPaused(value||!driving);if(garage)game?.setGarage(true);ui.setPaused(value&&!garage);
  if(value){for(const key in input)input[key]=false;game?.setInput({throttle:0,brake:0,steer:0});}
};
const go=()=>{driving=true;paused=false;game?.start();game?.setPaused(false);ui.setDriving(true);ui.setPaused(false);if(sound)audio.enable(true).catch(()=>{});};

ui=createUI({
  onDrive:go,
  onPause:(value,options)=>setPause(typeof value==='boolean'?value:!paused,options),
  onSkin:()=>syncProfile(),
  onRoomCreate:()=>network.create(ui.getProfile()),
  onRoomJoin:code=>network.join(code,ui.getProfile()),
  onCopyInvite:async()=>{
    const url=network.getInviteURL();
    try{await navigator.clipboard.writeText(url);toast('Invite link copied. Send it to your friends.');}
    catch{toast(`Room code: ${network.code}. Share the address with ?room=${network.code}`);}
  },
  onLeaveRoom:()=>{network.leave();const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);},
  onCamera:()=>{const camera=game?.setCamera();if(camera)toast(`${camera} camera`);},
  onReset:()=>{game?.reset();toast('Back on the road.');},
  onHorn:()=>audio.horn(),
  onEnvironment:value=>game?.setEnvironment(value),
  onTime:value=>game?.setTime(value),
  onQuality:value=>game?.setQuality(value),
  onInput:(action,pressed)=>{
    input[action]=pressed;
    game?.setInput({throttle:Number(input.throttle),brake:Number(input.brake),steer:Number(input.right)-Number(input.left)});
  },
  onFullscreen:async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
    catch{toast('Fullscreen is unavailable in this browser.');}
  },
  onSound:async value=>{
    const previous=sound;
    try{await audio.enable(value);sound=value;try{localStorage.setItem('bus-club-sound',sound?'on':'off');}catch{}ui.setSound(sound);}
    catch{sound=previous;audio.enabled=previous;audio.setActive(driving&&!paused);ui.setSound(previous);toast('Sound could not start. Try enabling it again.');}
  },
});

ui.setSound(sound);

network=new RoomClient({
  onRoom:room=>{
    ui.room(room?{...room,players:room.players.map(p=>({...p,isSelf:p.id===room.selfId})),connected:true,inviteUrl:network.getInviteURL()}:{});
    if(room&&room.selfId!==spawnedId){const self=room.players.find(p=>p.id===room.selfId);if(self)game?.setState(self);spawnedId=room.selfId;}
    if(!room)spawnedId=null;
    if(room){const url=new URL(location.href);url.searchParams.set('room',room.code);history.replaceState(null,'',url);}
  },
  onPeers:peers=>game?.setPeers(peers),
  onError:message=>toast(message),
  onStatus:status=>{
    if(status==='connecting')toast('Connecting to your convoy…');
    if(status==='connected')toast('Convoy ready. Copy the invite link to bring your friends.');
    if(status==='disconnected')toast('Convoy disconnected. You can keep driving solo and rejoin.');
  },
});

try{
  game=new BusGame(document.querySelector('#game'),{
    onTelemetry:data=>{ui.telemetry(data);audio.update(data.speed,driving&&!paused,data.throttle,{braking:data.braking,offroad:data.offroad,passengers:data.passengers,camera:data.camera});},
    onPickup:data=>toast(`Bus stop reached · ${data.passengers||1} passengers aboard`),
  });
  const profile=ui.getProfile();syncProfile();game.setEnvironment(profile.environment||'coast');game.setTime(profile.time||'sunset');game.setQuality(profile.quality||'auto');
  game.bus.ready.then(loaded=>{
    document.querySelector('#loading-status')?.setAttribute('hidden','');
    if(!loaded)toast('The Sri Lanka bus could not load. You can keep driving the classic bus; reload to try again.');
  });
  setInterval(()=>{if(driving)network.sendState(game.getState());},75);
  const invited=new URL(location.href).searchParams.get('room');
  if(invited)network.join(invited,profile).catch(error=>toast(error.message));
}catch(error){
  console.error(error);
  const target=document.querySelector('#error-status');
  if(target){target.hidden=false;target.textContent='The 3D world could not start. Enable hardware acceleration in Chrome, then reload.';}
  const loading=document.querySelector('#loading-status');if(loading)loading.hidden=true;
}

document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||!driving||paused||!document.querySelector('#help-modal')?.hidden)return;
  if(/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)||document.activeElement?.isContentEditable)return;
  if(event.code==='KeyH'&&!event.repeat)audio.horn();
});
window.addEventListener('blur',()=>{if(driving&&!paused)setPause(true);});
window.addEventListener('pagehide',()=>network.leave());
