/** Synthesized six-cylinder diesel: no downloads; audio starts on a driving gesture. */
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export function engineVoice(speed=0,throttle=0){
  const kmh=Math.abs(Number.isFinite(speed)?speed:0),load=clamp(Math.abs(throttle||0),0,1);
  const bands=[0,12,25,42,62,84,120];
  const gear=Math.min(5,bands.findIndex((limit,i)=>i>0&&kmh<limit)-1);
  const index=gear<0?5:gear,progress=clamp((kmh-bands[index])/(bands[index+1]-bands[index]),0,1);
  const rpm=kmh<4?650+kmh*95+load*170:1000+progress*1200+load*160;
  return {rpm,frequency:rpm/20,volume:.065+load*.035+Math.min(kmh,100)*.00015,air:Math.min(kmh,100)*.00011};
}
export class BusAudio {
  constructor(){this.enabled=false;this.context=null;this.active=false;}
  async enable(value=true){
    this.enabled=Boolean(value);
    if(value&&!this.context){
      const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
      this.context=new Context();const ctx=this.context;
      this.master=ctx.createGain();this.master.gain.value=0;
      const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-12;compressor.ratio.value=4;
      this.master.connect(compressor);compressor.connect(ctx.destination);
      this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=620;this.filter.Q.value=.65;
      this.engineGain=ctx.createGain();this.engineGain.gain.value=.07;
      this.engine=ctx.createOscillator();
      this.engine.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(9),new Float32Array([0,1,.48,.32,.2,.12,.09,.05,.03])));
      this.engine.frequency.value=32.5;this.engine.connect(this.filter);this.filter.connect(this.engineGain);this.engineGain.connect(this.master);this.engine.start();
      this.bass=ctx.createOscillator();this.bass.type='sine';this.bass.frequency.value=32.5;
      const bassGain=ctx.createGain();bassGain.gain.value=.055;this.bass.connect(bassGain);bassGain.connect(this.master);this.bass.start();
      // A little combustion flutter keeps idle from sounding like a pure electronic tone.
      this.flutter=ctx.createOscillator();this.flutter.frequency.value=21.7;
      const flutterGain=ctx.createGain();flutterGain.gain.value=.009;this.flutter.connect(flutterGain);flutterGain.connect(this.engineGain.gain);this.flutter.start();
      const noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=noise.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      this.air=ctx.createBufferSource();this.air.buffer=noise;this.air.loop=true;
      const airFilter=ctx.createBiquadFilter();airFilter.type='lowpass';airFilter.frequency.value=900;
      this.airGain=ctx.createGain();this.airGain.gain.value=0;this.air.connect(airFilter);airFilter.connect(this.airGain);this.airGain.connect(this.master);this.air.start();
    }
    if(value)await this.context?.resume();
    this.setActive(this.active);
  }
  setActive(active){
    this.active=active;
    if(this.context)this.master.gain.setTargetAtTime(this.enabled&&active?1:0,this.context.currentTime,.08);
  }
  update(speed,driving,throttle=0){
    this.active=Boolean(driving);if(!this.context)return;
    const t=this.context.currentTime,voice=engineVoice(speed,throttle);
    this.engine.frequency.setTargetAtTime(voice.frequency,t,.13);
    this.bass.frequency.setTargetAtTime(voice.frequency*.5,t,.15);
    this.flutter.frequency.setTargetAtTime(voice.rpm/30,t,.15);
    this.filter.frequency.setTargetAtTime(430+voice.rpm*.19+Math.abs(throttle||0)*200,t,.15);
    this.engineGain.gain.setTargetAtTime(voice.volume,t,.12);
    this.airGain.gain.setTargetAtTime(voice.air,t,.3);
    this.setActive(this.active);
  }
  horn(){
    if(!this.enabled||!this.context)return;
    const t=this.context.currentTime;
    for(const frequency of [196,246.94]){
      const oscillator=this.context.createOscillator(),gain=this.context.createGain();
      oscillator.type='sawtooth';oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.045,t+.03);gain.gain.setValueAtTime(.045,t+.3);gain.gain.exponentialRampToValueAtTime(.001,t+.5);
      oscillator.connect(gain);gain.connect(this.master);oscillator.start(t);oscillator.stop(t+.52);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }
  }
}
