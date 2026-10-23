import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BusAudio,engineVoice} from '../src/audio.js';

// Telemetry is sampled at 10 Hz: verify a held brake never retriggers a hiss,
// and a release is rate limited independently of those update ticks.
function audioHarness(){
  const audio=new BusAudio(),param=()=>({setTargetAtTime(){},cancelScheduledValues(){}});
  Object.assign(audio,{enabled:true,active:true,context:{currentTime:1},
    engineGain:{gain:param()},engine:{playbackRate:param()},bass:{frequency:param()},
    filter:{frequency:param()},airGain:{gain:param()},roadFilter:{frequency:param()},
    turbo:{frequency:param()},turboGain:{gain:param()},releases:[]});
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
