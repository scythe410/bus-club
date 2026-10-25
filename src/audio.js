import {SOUNDS, validSound} from '../shared/soundboard.js';

/** Synthesized turbo diesel (not a recorded Leyland) and soundboard share a mute-aware mixer. */
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const BANDS=[0,12,25,42,62,84,120];
export function engineVoice(speed=0,throttle=0){
  const kmh=Math.abs(finite(speed)),load=clamp(Math.abs(finite(throttle)),0,1);
  let gear=0;while(gear<5&&kmh>=BANDS[gear+1])gear++;
  const progress=clamp((kmh-BANDS[gear])/(BANDS[gear+1]-BANDS[gear]),0,1);
  const rpm=kmh<4?650+kmh*95+load*230:1000+progress*1200+load*160;
  const pace=clamp(kmh/120,0,1);
  return {rpm,gear,frequency:rpm/20,volume:.075+load*.075+pace*.018,
    air:Math.pow(pace,.85)*.06,wind:Math.pow(pace,1.8)*.1,
    boost:load*clamp((rpm-850)/1400,0,1),pace};
}

export class BusAudio {
  constructor(){
    this.enabled=false;this.context=null;this.active=false;this.suspendTimer=null;
    this.soundBuffers=new Map();this.soundFiles=new Map();this.soundSources=new Set();this.soundEpoch=0;
    this.lastGear=0;this.lastBrake=0;this.lastHiss=-10;this.lastHorn=-10;
    this.boost=0;this.lastUpdate=null;
  }
  async enable(value=true){
    this.enabled=Boolean(value);
    if(value&&!this.context){
      const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
      this.context=new Context();this.build(this.context);
    }
    // Called by the sound/drive gesture, so mobile browsers can unlock audio here.
    if(value)await this.context?.resume();
    this.setActive(this.active);
    if(value&&this.context)void this.preloadSounds();
  }
  downloadSound(id){
    if(!validSound(id))return Promise.resolve(null);
    if(!this.soundFiles.has(id)){
      const pending=fetch(SOUNDS[id-1].file).then(response=>{
        if(!response.ok)throw Error('Sound download failed.');
        return response.arrayBuffer();
      }).catch(error=>{this.soundFiles.delete(id);throw error;});
      this.soundFiles.set(id,pending);
    }
    return this.soundFiles.get(id);
  }
  downloadSounds(){return Promise.all(SOUNDS.map(sound=>this.downloadSound(sound.key)));}
  loadSound(id){
    if(!validSound(id)||!this.context)return Promise.resolve(null);
    if(!this.soundBuffers.has(id)){
      // AudioContext still unlocks on Drive. Download bytes during startup and
      // copy before decoding, which can detach the input ArrayBuffer.
      const pending=this.downloadSound(id).then(bytes=>this.context.decodeAudioData(bytes.slice(0))).catch(error=>{this.soundBuffers.delete(id);throw error;});
      this.soundBuffers.set(id,pending);
    }
    return this.soundBuffers.get(id);
  }
  preloadSounds(){return Promise.allSettled(SOUNDS.map(sound=>this.loadSound(sound.key)));}
  async playSound(id){
    if(!validSound(id)||!this.enabled||!this.active||!this.context)return false;
    const epoch=this.soundEpoch;
    const buffer=await this.loadSound(id);
    if(!buffer||epoch!==this.soundEpoch||!this.enabled||!this.active)return false;
    // Replace the current clip so long samples and rapid selections cannot pile up.
    for(const source of this.soundSources)source.stop();
    this.soundSources.clear();
    const source=this.context.createBufferSource(),gain=this.context.createGain();
    source.buffer=buffer;gain.gain.value=.65;
    source.connect(gain);gain.connect(this.master);this.soundSources.add(source);
    source.onended=()=>{source.disconnect();gain.disconnect();this.soundSources.delete(source);};
    source.start();return true;
  }
  build(ctx){
    this.master=ctx.createGain();this.master.gain.value=0;
    const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-15;compressor.knee.value=18;compressor.ratio.value=4;
    this.master.connect(compressor);compressor.connect(ctx.destination);
    this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=800;this.filter.Q.value=.6;
    this.engineGain=ctx.createGain();this.engineGain.gain.value=.08;
    // Twelve individual combustion strokes over two four-stroke engine cycles.
    // A brief noisy ignition and a decaying low-frequency exhaust pulse remove
    // the pure harmonic buzz of a sawtooth oscillator, especially at idle.
    const duration=.24,buffer=ctx.createBuffer(1,Math.round(ctx.sampleRate*duration),ctx.sampleRate);
    const samples=buffer.getChannelData(0);
    for(let stroke=0;stroke<12;stroke++){
      const strength=[1,.92,.97,.88,1,.94][stroke%6],start=Math.round(stroke*.02*ctx.sampleRate);
      for(let j=0;j<ctx.sampleRate*.055;j++){
        const t=j/ctx.sampleRate,index=(start+j)%samples.length;
        const crack=(Math.random()*2-1)*Math.exp(-t*240)*.42;
        const exhaust=Math.sin(t*2*Math.PI*76)*Math.exp(-t*83)*.7;
        samples[index]+=(crack+exhaust)*strength;
      }
    }
    this.engine=ctx.createBufferSource();this.engine.buffer=buffer;this.engine.loop=true;this.engine.playbackRate.value=.65;
    this.engine.connect(this.filter);this.filter.connect(this.engineGain);this.engineGain.connect(this.master);this.engine.start();
    this.bass=ctx.createOscillator();this.bass.type='sine';this.bass.frequency.value=16.25;
    const bassGain=ctx.createGain();bassGain.gain.value=.048;this.bass.connect(bassGain);bassGain.connect(this.master);this.bass.start();
    this.noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const data=this.noise.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    this.air=ctx.createBufferSource();this.air.buffer=this.noise;this.air.loop=true;
    this.roadFilter=ctx.createBiquadFilter();this.roadFilter.type='lowpass';this.roadFilter.frequency.value=600;
    this.airGain=ctx.createGain();this.airGain.gain.value=0;
    this.air.connect(this.roadFilter);this.roadFilter.connect(this.airGain);this.airGain.connect(this.master);this.air.start();
    // Independent broad wind rush keeps speed audible when the engine drops RPM
    // on an upshift or the driver coasts. Tire rumble stays lower in the mix.
    this.wind=ctx.createBufferSource();this.wind.buffer=this.noise;this.wind.loop=true;
    this.windFilter=ctx.createBiquadFilter();this.windFilter.type='bandpass';this.windFilter.frequency.value=900;this.windFilter.Q.value=.45;
    this.windGain=ctx.createGain();this.windGain.gain.value=0;
    this.wind.connect(this.windFilter);this.windFilter.connect(this.windGain);this.windGain.connect(this.master);this.wind.start(0,.73);
    this.turbo=ctx.createOscillator();this.turbo.type='sine';this.turbo.frequency.value=500;
    this.turboGain=ctx.createGain();this.turboGain.gain.value=0;
    this.turbo.connect(this.turboGain);this.turboGain.connect(this.master);this.turbo.start();
    this.intake=ctx.createBufferSource();this.intake.buffer=this.noise;this.intake.loop=true;
    this.intakeFilter=ctx.createBiquadFilter();this.intakeFilter.type='bandpass';this.intakeFilter.frequency.value=1800;this.intakeFilter.Q.value=1.1;
    this.intakeGain=ctx.createGain();this.intakeGain.gain.value=0;
    this.intake.connect(this.intakeFilter);this.intakeFilter.connect(this.intakeGain);this.intakeGain.connect(this.master);this.intake.start(0,1.2);
  }
  setActive(active){
    this.active=Boolean(active);
    if(!this.enabled||!this.active){
      this.soundEpoch++;
      for(const source of this.soundSources)source.stop();
      this.soundSources.clear();
    }
    if(!this.context)return;
    const audible=this.enabled&&this.active,ctx=this.context;
    if(audible){
      clearTimeout(this.suspendTimer);this.suspendTimer=null;
      if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    }
    this.master.gain.setTargetAtTime(audible?1:0,ctx.currentTime,.06);
    // Suspending the context stops all continuous DSP while muted/in the garage.
    if(!audible&&!this.suspendTimer)this.suspendTimer=setTimeout(()=>{
      this.suspendTimer=null;if(!this.enabled||!this.active)ctx.suspend().catch(()=>{});
    },250);
  }
  update(speed,driving,throttle=0,options={}){
    this.setActive(driving);if(!this.context||!this.enabled||!driving){this.lastBrake=0;this.boost=0;this.lastUpdate=null;return;}
    const t=this.context.currentTime,voice=engineVoice(speed,throttle),load=clamp(Math.abs(finite(throttle)),0,1);
    const dt=this.lastUpdate===null?.1:clamp(t-this.lastUpdate,0,.25);this.lastUpdate=t;
    // Turbine inertia: pressure builds under load and decays gradually on lift.
    const spoolTime=voice.boost>this.boost?.65:.38;
    this.boost+=(voice.boost-this.boost)*(1-Math.exp(-dt/spoolTime));
    const braking=clamp(finite(options.braking),0,1),offroad=Boolean(options.offroad);
    if(voice.gear>this.lastGear&&load>.2&&Math.abs(speed)>4){
      this.engineGain.gain.cancelScheduledValues(t);this.engineGain.gain.setTargetAtTime(.035,t,.025);
      this.engineGain.gain.setTargetAtTime(voice.volume,t+.12,.08);
    }else this.engineGain.gain.setTargetAtTime(voice.volume,t,.1);
    this.engine.playbackRate.setTargetAtTime(voice.rpm/1000,t,.12);
    this.bass.frequency.setTargetAtTime(voice.frequency*.5,t,.13);
    this.filter.frequency.setTargetAtTime(500+voice.rpm*.24+load*380,t,.12);
    this.airGain.gain.setTargetAtTime(voice.air*(offroad?1.8:1),t,.2);
    this.roadFilter.frequency.setTargetAtTime(offroad?1200:300+voice.pace*800,t,.2);
    this.windGain.gain.setTargetAtTime(voice.wind,t,.25);
    this.windFilter.frequency.setTargetAtTime(650+voice.pace*1350,t,.25);
    this.turbo.frequency.setTargetAtTime(650+voice.rpm*.45+this.boost*1450,t,.16);
    this.turboGain.gain.setTargetAtTime(this.boost*.015,t,.12);
    this.intakeGain.gain.setTargetAtTime(this.boost*(.018+load*.023),t,.15);
    this.intakeFilter.frequency.setTargetAtTime(1200+this.boost*1700,t,.2);
    // Air escapes when the driver releases an applied service brake, rather than
    // continuously hissing on every telemetry tick while holding the brake.
    if(this.lastBrake>.25&&braking<.1&&t-this.lastHiss>.8)this.brakeRelease(this.lastBrake);
    this.lastBrake=braking;this.lastGear=voice.gear;
  }
  brakeRelease(strength=1){
    if(!this.enabled||!this.active||!this.context)return;
    const ctx=this.context,t=ctx.currentTime;this.lastHiss=t;
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=this.noise;filter.type='bandpass';filter.frequency.value=1900;filter.Q.value=.5;
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.075*clamp(strength,.2,1),t+.018);gain.gain.exponentialRampToValueAtTime(.0001,t+.46);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(t,.4);source.stop(t+.48);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  horn(){
    if(!this.enabled||!this.active||!this.context)return;
    const ctx=this.context,t=ctx.currentTime;if(t-this.lastHorn<.4)return;this.lastHorn=t;
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=2100;filter.Q.value=.5;filter.connect(this.master);
    let pending=2;
    for(const frequency of [174.61,220]){
      const oscillator=ctx.createOscillator(),gain=ctx.createGain();
      oscillator.type='sawtooth';oscillator.frequency.setValueAtTime(frequency*.96,t);oscillator.frequency.exponentialRampToValueAtTime(frequency,t+.07);
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.055,t+.035);gain.gain.setValueAtTime(.05,t+.34);gain.gain.exponentialRampToValueAtTime(.0001,t+.58);
      oscillator.connect(gain);gain.connect(filter);oscillator.start(t);oscillator.stop(t+.6);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();if(--pending===0)filter.disconnect();};
    }
  }
}
