/** Procedural diesel, pneumatic brakes and road noise. No audio is fetched at runtime. */
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const BANDS=[0,12,25,42,62,84,120];
export function engineVoice(speed=0,throttle=0){
  const kmh=Math.abs(finite(speed)),load=clamp(Math.abs(finite(throttle)),0,1);
  let gear=0;while(gear<5&&kmh>=BANDS[gear+1])gear++;
  const progress=clamp((kmh-BANDS[gear])/(BANDS[gear+1]-BANDS[gear]),0,1);
  const rpm=kmh<4?650+kmh*95+load*230:1000+progress*1200+load*160;
  return {rpm,gear,frequency:rpm/20,volume:.075+load*.055+Math.min(kmh,100)*.00015,air:Math.min(kmh,100)*.00016};
}

export class BusAudio {
  constructor(){
    this.enabled=false;this.context=null;this.active=false;this.suspendTimer=null;
    this.lastGear=0;this.lastBrake=0;this.lastHiss=-10;this.lastHorn=-10;
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
    this.turbo=ctx.createOscillator();this.turbo.type='sine';this.turbo.frequency.value=500;
    this.turboGain=ctx.createGain();this.turboGain.gain.value=0;
    this.turbo.connect(this.turboGain);this.turboGain.connect(this.master);this.turbo.start();
  }
  setActive(active){
    this.active=Boolean(active);if(!this.context)return;
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
    this.setActive(driving);if(!this.context||!this.enabled||!driving){this.lastBrake=0;return;}
    const t=this.context.currentTime,voice=engineVoice(speed,throttle),load=clamp(Math.abs(finite(throttle)),0,1);
    const braking=clamp(finite(options.braking),0,1),offroad=Boolean(options.offroad);
    if(voice.gear>this.lastGear&&load>.2&&Math.abs(speed)>4){
      this.engineGain.gain.cancelScheduledValues(t);this.engineGain.gain.setTargetAtTime(.035,t,.025);
      this.engineGain.gain.setTargetAtTime(voice.volume,t+.12,.08);
    }else this.engineGain.gain.setTargetAtTime(voice.volume,t,.1);
    this.engine.playbackRate.setTargetAtTime(voice.rpm/1000,t,.12);
    this.bass.frequency.setTargetAtTime(voice.frequency*.5,t,.13);
    this.filter.frequency.setTargetAtTime(500+voice.rpm*.24+load*380,t,.12);
    this.airGain.gain.setTargetAtTime(voice.air*(offroad?2.2:1),t,.2);
    this.roadFilter.frequency.setTargetAtTime(offroad?1200:450+Math.min(Math.abs(finite(speed)),100)*9,t,.2);
    this.turbo.frequency.setTargetAtTime(420+voice.rpm*.6,t,.28);
    this.turboGain.gain.setTargetAtTime(load*Math.max(0,voice.rpm-950)*.0000028,t,.2);
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
