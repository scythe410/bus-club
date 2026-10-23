const defaults = { name: 'Road wanderer', destination: 'THE SCENIC ROUTE', skin: { color: '#e9d7ad', accent: '#e86d48', pattern: 'stripe', image: null }, environment: 'coast', time: 'day', quality: 'auto' };
const presets = [ ['Sunset express', '#e9d7ad', '#e86d48'], ['Forest service', '#52745d', '#d9ee89'], ['Ocean liner', '#a3cbd0', '#f4eee1'], ['Berry nice', '#b57a91', '#f1d897'] ];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createUI(callbacks = {}) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('bus-club-profile') || '{}'); } catch {}
  const profile = { ...defaults, ...saved, skin: { ...defaults.skin, ...saved.skin } };
  profile.skin.color ||= profile.skin.body || defaults.skin.color;
  profile.skin.name = profile.name;
  profile.skin.destination = profile.destination;
  let driving = false, paused = false, roomState = {}, toastTimer, sound = false;
  const root = document.querySelector('#ui');
  root.innerHTML = `
    <header class="topbar">
      <div class="brand"><div class="brand-mark" aria-hidden="true"></div><div><div class="brand-title">BUS CLUB<span style="color:var(--lime)">.</span></div><div class="brand-caption">Scenic multiplayer</div></div></div>
      <div class="top-actions"><button class="status-pill" id="convoy-toggle" title="Invite friends or manage your convoy"><span class="invite-label">Invite friends ↗</span></button><div class="status-pill"><span class="status-dot"></span><span class="status-label" id="session-status">Solo · your own pace</span></div><button class="icon-button sound-button" id="sound" aria-label="Enable sound" title="Toggle sound">♪</button><button class="icon-button" id="fullscreen" aria-label="Toggle fullscreen" title="Fullscreen">⛶</button></div>
    </header>
    <section class="panel" id="garage" aria-label="Bus garage"><div class="panel-inner">
      <div class="eyebrow">A little less hurry.</div><h1 class="garage-title">Good roads.<br>Better company.</h1><p class="intro">Pick your colors. Bring your people.<br>Take the long way home.</p>
      <div class="section-heading"><span>Your bus, your rules</span><span class="section-number">01 / GARAGE</span></div>
      <label class="field"><span>Driver name</span><input id="driver-name" type="text" maxlength="24" autocomplete="nickname" value="${escape(profile.name)}" /></label>
      <label class="field"><span>Destination sign</span><input id="destination" type="text" maxlength="28" value="${escape(profile.destination)}" /></label>
      <span class="field-label" style="margin-top:14px">Choose a livery</span><div class="presets">${presets.map(([name,color,accent],i)=>`<button class="preset" data-preset="${i}" style="--body:${color};--accent:${accent}" aria-label="${name}" title="${name}" aria-pressed="${profile.skin.color===color}"></button>`).join('')}</div>
      <div class="colors"><label class="color-field"><input id="body-color" type="color" value="${escape(profile.skin.color)}" />Body</label><label class="color-field"><input id="accent-color" type="color" value="${escape(profile.skin.accent)}" />Accent</label><label class="field" style="flex:1;margin:0"><span class="sr-only" hidden>Pattern</span><select id="pattern" aria-label="Bus livery pattern"><option value="stripe">Classic stripe</option><option value="wave">Coastal wave</option><option value="retro">Retro bands</option><option value="solid">Solid color</option></select></label></div>
      <div class="upload-row"><label class="upload" for="skin-upload">↥ &nbsp; Upload a side skin <span style="opacity:.5">· PNG / JPG</span></label><input id="skin-upload" type="file" accept="image/png,image/jpeg,image/webp" hidden /><button class="text-button" id="remove-skin" ${profile.skin.image?'':'hidden'}>Remove</button></div>
      <hr class="divider" /><div class="section-heading" style="margin-top:0"><span>Find your kind of road</span><span class="section-number">02 / WORLD</span></div>
      <div class="segmented" data-group="environment"><button data-value="coast">↝ &nbsp; The coast</button><button data-value="highlands">△ &nbsp; The highlands</button></div>
      <div class="segmented time-row" data-group="time"><button data-value="day">Daylight</button><button data-value="sunset">Golden hour</button><button data-value="night">Nightfall</button></div>
      <button class="drive-button" id="drive"><span>Let’s take a drive</span><span class="arrow">↗</span></button>
      <hr class="divider" /><div id="room-lobby"><h2 class="room-title">Better with a convoy.</h2><p class="room-sub">Create a private room and invite your friends.<br>Up to 8 buses. One open road.</p><div class="room-actions"><button class="secondary-button" id="create-room">Create room ↗</button><input id="room-code" type="text" placeholder="Room code" aria-label="Room code" maxlength="12" autocomplete="off" /><button class="secondary-button join-button" id="join-room">Join</button></div><p class="solo-note">Or just drive solo. There’s no rush.</p></div>
      <div id="room-active" hidden><div class="eyebrow">Your convoy</div><div class="room-code" id="active-code"></div><p class="room-sub" id="room-summary">Waiting for your friends…</p><div class="friend-list" id="friend-list"></div><div class="room-actions"><button class="secondary-button" id="copy-invite">Copy invite link ↗</button><button class="text-button" id="leave-room">Leave room</button></div></div>
      <div class="ui-footer"><button class="text-button" id="help">How to play ↗</button><select id="quality" class="quality-select" aria-label="Graphics quality"><option value="auto">Graphics: auto</option><option value="high">Graphics: high</option><option value="low">Graphics: low</option></select></div>
    </div></section>
    <div class="world-caption" id="world-caption"><h2>The scenic<br>route awaits.</h2><p>Your bus. Your friends. No wrong turns.</p></div>
    <button class="garage-toggle" id="garage-toggle" hidden><span>☷</span> Your garage <span style="opacity:.5">Esc</span></button>
    <div class="drive-hud" id="drive-hud" hidden><div class="route-card"><div class="eyebrow">NOW WANDERING</div><div class="route-name" id="route-name">The coastal route</div><div class="route-meta"><span id="distance">0.0 km</span> explored <span style="opacity:.5"> / </span><span id="stop-distance">Next stop ahead</span></div></div><div class="mini-actions"><button id="camera" title="Change camera (C)">Camera ⤾</button><button id="horn" title="Horn (H)">Beep ♫</button><button id="reset" title="Return to road (R)">On the road ↺</button><button id="pause" aria-label="Pause driving">Ⅱ</button></div></div>
    <div class="speedometer" id="speedometer" hidden><div class="speed-value" id="speed">0</div><div class="speed-unit">KM / H</div></div>
    <div class="controls-legend" id="controls" hidden>Drive <span class="key">W A S D</span> <span class="key">↑ ← ↓ →</span><br>Brake <span class="key">SPACE</span> &nbsp; Camera <span class="key">C</span><br>Reset <span class="key">R</span> &nbsp; Garage <span class="key">ESC</span></div>
    <div class="touch-controls" id="touch-controls" hidden><div class="touch-group"><button data-action="left" aria-label="Steer left">←</button><button data-action="right" aria-label="Steer right">→</button></div><div class="touch-group"><button data-action="brake" aria-label="Brake">Ⅱ</button><button data-action="throttle" aria-label="Accelerate">↑</button></div></div>
    <div class="modal-backdrop" id="pause-modal" hidden><section class="modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="eyebrow">A MOMENT TO BREATHE</div><h2 id="pause-title">Enjoy the view.</h2><p>Your bus is paused. Your friends can keep exploring while you take a break.</p><button class="drive-button" id="resume">Back to the road ↗</button><button class="text-button" id="pause-garage" style="width:100%;margin-top:16px">Open the garage</button></section></div>
    <div class="modal-backdrop" id="help-modal" hidden><section class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><div class="eyebrow">THE OPEN ROAD, EXPLAINED</div><h2 id="help-title">Easy does it.</h2><p>Drive, discover bus stops, and make a convoy with your friends. Your livery travels with you.</p><div class="help-row"><span>Accelerate / reverse</span><span>W / S or ↑ / ↓</span></div><div class="help-row"><span>Steer</span><span>A / D or ← / →</span></div><div class="help-row"><span>Brake / camera</span><span>Space / C</span></div><div class="help-row"><span>Horn / return to road</span><span>H / R</span></div><div class="help-row"><span>Garage</span><span>Esc</span></div><button class="drive-button" id="close-help">Got it. Let’s go ↗</button></section></div>
    <div class="toast" id="toast" role="status" hidden></div>`;
  const $ = selector => root.querySelector(selector);
  const all = selector => [...root.querySelectorAll(selector)];
  const invoke = (name, ...args) => { try { return callbacks[name]?.(...args); } catch (error) { toast(error.message || 'Something went wrong. Please try again.'); } };
  const save = () => { try { const stored={...profile,skin:{...profile.skin}};localStorage.setItem('bus-club-profile',JSON.stringify(stored)); } catch {} };
  const emitSkin = () => { profile.skin.name=profile.name;profile.skin.destination=profile.destination;save();invoke('onSkin',{...profile.skin}); };
  const bind = (id, fn) => $(id).addEventListener('click',fn);
  const markGroup = group => all(`[data-group="${group}"] button`).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.value===profile[group])));
  const markPresets = () => all('[data-preset]').forEach(button=>button.setAttribute('aria-pressed',String(presets[Number(button.dataset.preset)][1]===profile.skin.color && presets[Number(button.dataset.preset)][2]===profile.skin.accent)));
  $('#pattern').value=profile.skin.pattern;$('#quality').value=profile.quality;
  ['environment','time'].forEach(group=>{markGroup(group);all(`[data-group="${group}"] button`).forEach(button=>button.addEventListener('click',()=>{profile[group]=button.dataset.value;markGroup(group);save();invoke(group==='time'?'onTime':'onEnvironment',profile[group]);}));});
  $('#driver-name').addEventListener('input',event=>{profile.name=event.target.value.slice(0,24);emitSkin();});
  $('#destination').addEventListener('input',event=>{profile.destination=event.target.value.slice(0,28);emitSkin();});
  $('#body-color').addEventListener('input',event=>{profile.skin.color=event.target.value;markPresets();emitSkin();});
  $('#accent-color').addEventListener('input',event=>{profile.skin.accent=event.target.value;markPresets();emitSkin();});
  $('#pattern').addEventListener('change',event=>{profile.skin.pattern=event.target.value;emitSkin();});
  all('[data-preset]').forEach(button=>button.addEventListener('click',()=>{const [,color,accent]=presets[Number(button.dataset.preset)];Object.assign(profile.skin,{color,accent});$('#body-color').value=color;$('#accent-color').value=accent;markPresets();emitSkin();}));
  $('#quality').addEventListener('change',event=>{profile.quality=event.target.value;save();invoke('onQuality',profile.quality);});
  $('#skin-upload').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('Choose a PNG, JPG or WebP image.');return;}
    if(file.size>8*1024*1024){toast('Keep your skin image under 8 MB.');return;}
    try{const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);let encoded=canvas.toDataURL('image/jpeg',.8);let quality=.8;while(encoded.length>190000){if(quality>.45){quality-=.12;}else{canvas.width=Math.max(32,Math.round(canvas.width*.75));canvas.height=Math.max(32,Math.round(canvas.height*.75));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);quality=.7;}encoded=canvas.toDataURL('image/jpeg',quality);}bitmap.close();profile.skin.image=encoded;$('#remove-skin').hidden=false;emitSkin();toast('Looking good. Your custom skin is on.');}catch{toast('Couldn’t open that image. Try another file.');}
  });
  bind('#remove-skin',()=>{profile.skin.image=null;$('#skin-upload').value='';$('#remove-skin').hidden=true;emitSkin();});
  bind('#drive',()=>{if(!profile.name.trim()){profile.name='Road wanderer';$('#driver-name').value=profile.name;emitSkin();}setDriving(true);setPaused(false);invoke('onDrive',getProfile());});
  bind('#garage-toggle',()=>{setDriving(false);invoke('onPause',true,{garage:true});});
  bind('#convoy-toggle',()=>{setDriving(false);setPaused(false);invoke('onPause',true,{garage:true});requestAnimationFrame(()=>$(roomState?.code?'#room-active':'#room-lobby').scrollIntoView({behavior:'smooth',block:'center'}));});
  bind('#pause',()=>{setPaused(true);invoke('onPause',true);});
  bind('#resume',()=>{setPaused(false);invoke('onPause',false);});
  bind('#pause-garage',()=>{setPaused(false);setDriving(false);invoke('onPause',true,{garage:true});$('#driver-name').focus();});
  bind('#camera',()=>invoke('onCamera'));bind('#reset',()=>invoke('onReset'));bind('#horn',()=>invoke('onHorn'));bind('#fullscreen',()=>invoke('onFullscreen'));
  bind('#sound',()=>{setSound(!sound);invoke('onSound',sound);});
  bind('#help',()=>{$('#help-modal').hidden=false;$('#close-help').focus();});bind('#close-help',()=>{$('#help-modal').hidden=true;$('#help').focus();});
  const roomAction = async (selector,callback,...args) => {const button=$(selector);button.disabled=true;try{await callbacks[callback]?.(...args);}catch(error){toast(error.message || 'Couldn’t connect. Please try again.');}finally{button.disabled=false;}};
  bind('#create-room',()=>roomAction('#create-room','onRoomCreate'));
  const join=()=>{const code=$('#room-code').value.trim().toUpperCase();if(!code){$('#room-code').focus();toast('Enter a room code to join your friends.');return;}roomAction('#join-room','onRoomJoin',code);};
  bind('#join-room',join);$('#room-code').addEventListener('keydown',event=>{if(event.key==='Enter')join();});
  bind('#copy-invite',()=>roomAction('#copy-invite','onCopyInvite'));bind('#leave-room',()=>invoke('onLeaveRoom'));
  all('[data-action]').forEach(button=>{const action=button.dataset.action;const release=event=>{event.preventDefault();invoke('onInput',action,false);};button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);invoke('onInput',action,true);});button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',()=>invoke('onInput',action,false));});
  window.addEventListener('blur',()=>{['left','right','brake','throttle'].forEach(action=>invoke('onInput',action,false));});
  window.addEventListener('keydown',event=>{const modal=!$('#help-modal').hidden?$('#help-modal'):!$('#pause-modal').hidden?$('#pause-modal'):null;if(event.key==='Tab'&&modal){const focusable=[...modal.querySelectorAll('button,input,select,[tabindex="0"]')].filter(element=>!element.disabled);const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){event.preventDefault();first?.focus();}return;}if(event.key!=='Escape')return;if(!$('#help-modal').hidden){$('#help-modal').hidden=true;$('#help').focus();return;}if(paused){setPaused(false);invoke('onPause',false);return;}if(driving){setDriving(false);invoke('onPause',true,{garage:true});}else{setDriving(true);invoke('onDrive',getProfile());}});
  function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('#toast').hidden=true;},4000);}
  function setDriving(value){driving=Boolean(value);$('#garage').hidden=driving;$('#world-caption').hidden=driving;['#garage-toggle','#drive-hud','#speedometer','#controls','#touch-controls'].forEach(id=>$(id).hidden=!driving);}
  function setPaused(value){const wasPaused=paused;paused=Boolean(value);$('#pause-modal').hidden=!paused;if(paused)$('#resume').focus();else if(wasPaused&&driving)$('#garage-toggle').focus();}
  function setSound(value){sound=Boolean(value);$('#sound').setAttribute('aria-label',sound?'Mute sound':'Enable sound');$('#sound').setAttribute('aria-pressed',String(sound));$('#sound').style.color=sound?'var(--lime)':'';}
  function getProfile(){return {...profile,skin:{...profile.skin,name:profile.name,destination:profile.destination}};}
  function telemetry(data={}){if(Number.isFinite(data.speed))$('#speed').textContent=Math.round(Math.abs(data.speed));if(Number.isFinite(data.distance))$('#distance').textContent=`${data.distance.toFixed(1)} km`;if(Number.isFinite(data.stopDistance))$('#stop-distance').textContent=`Stop in ${data.stopDistance<1000?`${Math.round(data.stopDistance)} m`:`${(data.stopDistance/1000).toFixed(1)} km`}`;if(data.route)$('#route-name').textContent=data.route;else $('#route-name').textContent=profile.environment==='highlands'?'The highland route':'The coastal route';}
  function room(data={}){data ||= {};roomState=data;const active=Boolean(data.code);$('#room-lobby').hidden=active;$('#room-active').hidden=!active;$('#active-code').textContent=data.code || '';const players=Array.isArray(data.players)?data.players:[];$('#friend-list').innerHTML=players.map(player=>`<span class="friend-chip">${escape(player.name || player.skin?.name || 'Bus driver')}${player.isSelf?' · you':''}</span>`).join('');$('#room-summary').textContent=players.length>1?`${players.length} buses in your convoy`:'Your road is ready. Invite your friends.';$('#session-status').textContent=active?`${data.code} · ${players.length || 1} ${players.length>1?'buses':'bus'}`:'Solo · your own pace';}
  const incoming=new URLSearchParams(location.search).get('room');if(incoming)$('#room-code').value=incoming.slice(0,12).toUpperCase();
  return {telemetry,room,toast,getProfile,setDriving,setPaused,setSound};
}
