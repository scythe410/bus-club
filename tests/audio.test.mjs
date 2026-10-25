import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BusAudio,engineVoice} from '../src/audio.js';

test('startup downloads sounds without unlocking audio and playback reuses those bytes',async()=>{
  const oldFetch=globalThis.fetch;let fetches=0,decodes=0;
  globalThis.fetch=async()=>{fetches++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};
  try{
    const audio=new BusAudio();await audio.downloadSounds();assert.equal(fetches,9);assert.equal(audio.context,null);
    audio.context={decodeAudioData:async bytes=>{decodes++;assert.equal(bytes.byteLength,8);return {};}};
    await audio.loadSound(1);await audio.loadSound(1);assert.equal(fetches,9);assert.equal(decodes,1);
  }finally{globalThis.fetch=oldFetch;}
});
test('a failed startup sound download can be retried',async()=>{
  const oldFetch=globalThis.fetch;let attempts=0;
  globalThis.fetch=async()=>({ok:++attempts>1,arrayBuffer:async()=>new ArrayBuffer(8)});
  try{const audio=new BusAudio();await assert.rejects(audio.downloadSound(1));await audio.downloadSound(1);assert.equal(attempts,2);}
  finally{globalThis.fetch=oldFetch;}
});

// Telemetry is sampled at 10 Hz: verify a held brake never retriggers a hiss,
// and a release is rate limited independently of those update ticks.
function audioHarness(){
  const audio=new BusAudio(),param=()=>({setTargetAtTime(value){this.target=value;},cancelScheduledValues(){}});
  Object.assign(audio,{enabled:true,active:true,context:{currentTime:1},
    engineGain:{gain:param()},engine:{playbackRate:param()},bass:{frequency:param()},
    filter:{frequency:param()},airGain:{gain:param()},roadFilter:{frequency:param()},
    turbo:{frequency:param()},turboGain:{gain:param()},windGain:{gain:param()},windFilter:{frequency:param()},
    intakeGain:{gain:param()},intakeFilter:{frequency:param()},releases:[]});
  audio.setActive=active=>{audio.active=Boolean(active);};
  audio.brakeRelease=strength=>{audio.releases.push(strength);audio.lastHiss=audio.context.currentTime;};
  return audio;
}
test('air brakes hiss once on release, never repeatedly while held',()=>{
  const audio=audioHarness();
  for(let i=0;i<8;i++)audio.update(20,true,0,{braking:.8});
  assert.deepEqual(audio.releases,[]);
  for(let i=0;i<8;i++)audio.update(0,true,0,{braking:0});
  assert.deepEqual(audio.releases,[.8]);
  audio.update(0,true,0,{braking:1});audio.update(0,true,0,{braking:0});
  assert.deepEqual(audio.releases,[.8]);
  audio.context.currentTime=2;
  audio.update(0,true,0,{braking:1});audio.update(0,true,0,{braking:0});
  assert.deepEqual(audio.releases,[.8,1]);
});
test('muting or pausing forgets the held brake without a spurious hiss on resume',()=>{
  const audio=audioHarness();
  audio.update(20,true,0,{braking:1});audio.update(20,false,0,{braking:1});
  audio.update(20,true,0,{braking:0});assert.deepEqual(audio.releases,[]);
  audio.enabled=false;audio.update(20,true,0,{braking:1});
  assert.equal(audio.lastBrake,0);
});
test('audio controls remain finite for invalid telemetry and all gears',()=>{
  for(const speed of [-100,0,12,25,42,62,84,200,NaN,Infinity]){
    for(const throttle of [-1,0,1,NaN,Infinity]){
      const voice=engineVoice(speed,throttle);
      assert.ok(Object.values(voice).every(Number.isFinite));
      assert.ok(voice.gear>=0&&voice.gear<=5);
      assert.ok(voice.rpm>=650&&voice.rpm<=2400);
    }
  }
});

test('road and wind keep building through 120 km/h independently of throttle and gear shifts',()=>{
  let previous=engineVoice(0,0);
  for(const speed of [12,25,42,62,84,100,110,120]){
    const voice=engineVoice(speed,0);
    assert.ok(voice.air>previous.air);
    assert.ok(voice.wind>previous.wind);
    assert.equal(voice.wind,engineVoice(speed,1).wind,'coasting must retain the speed cue');
    previous=voice;
  }
  assert.equal(engineVoice(120,1).wind,engineVoice(240,1).wind,'the speed mix stays bounded');
});

test('turbo spools under engine load, trails off on lift, and resets on pause',()=>{
  const audio=audioHarness();
  audio.update(115,true,1);const first=audio.boost;
  assert.ok(first>0&&first<engineVoice(115,1).boost);
  for(let i=0;i<20;i++){audio.context.currentTime+=.1;audio.update(115,true,1);}
  const loaded=audio.boost;
  assert.ok(loaded>first);
  audio.context.currentTime+=.1;audio.update(115,true,0);
  assert.ok(audio.boost>0&&audio.boost<loaded,'spool decays rather than cutting out');
  assert.equal(audio.windGain.gain.target,engineVoice(115,0).wind);
  audio.update(115,false,0);assert.equal(audio.boost,0);
});

test('soundboard replaces clips and clears playback when paused or muted',async()=>{
 const audio=new BusAudio(),sources=[];
 audio.enabled=true;audio.active=true;
 audio.context={currentTime:0,state:'running',createBufferSource(){const source={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(source);return source;},createGain(){return {gain:{value:0},connect(){},disconnect(){}};},suspend:async()=>{}};
 audio.master={gain:{setTargetAtTime(){}}};audio.loadSound=async()=>({});
 assert.equal(await audio.playSound(1),true);assert.equal(sources[0].started,true);
 await audio.playSound(9);assert.equal(sources[0].stopped,true);
 audio.setActive(false);assert.equal(sources[1].stopped,true);
 assert.equal(await audio.playSound(1),false);clearTimeout(audio.suspendTimer);
 audio.active=true;audio.enabled=false;assert.equal(await audio.playSound(1),false);
 audio.enabled=true;assert.equal(await audio.playSound(10),false);
 let resolve;audio.loadSound=()=>new Promise(r=>{resolve=r;});
 const pending=audio.playSound(2);audio.setActive(false);audio.setActive(true);resolve({});
 assert.equal(await pending,false,'a clip loaded during pause must not play on resume');clearTimeout(audio.suspendTimer);
});
