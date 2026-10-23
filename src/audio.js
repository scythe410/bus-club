/** Locally synthesized sound: no media downloads or autoplay before interaction. */
export class BusAudio {
  constructor(){this.enabled=false;this.context=null;}
  async enable(value=true){
    this.enabled=value;
    if(value&&!this.context){
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return;
      this.context=new AudioContext();
      this.gain=this.context.createGain();this.gain.gain.value=0;
      this.filter=this.context.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=160;
      this.osc=this.context.createOscillator();this.osc.type='sawtooth';this.osc.frequency.value=34;
      this.osc.connect(this.filter);this.filter.connect(this.gain);this.gain.connect(this.context.destination);this.osc.start();
    }
    if(value)await this.context?.resume();
    else if(this.gain)this.gain.gain.setTargetAtTime(0,this.context.currentTime,.15);
  }
  update(speed,driving){
    if(!this.context)return;
    const t=this.context.currentTime;
    this.osc.frequency.setTargetAtTime(32+Math.min(110,Math.abs(speed))*.9,t,.15);
    this.filter.frequency.setTargetAtTime(110+Math.abs(speed)*2,t,.15);
    this.gain.gain.setTargetAtTime(this.enabled&&driving?.022+Math.min(.02,Math.abs(speed)*.0003):0,t,.15);
  }
  horn(){
    if(!this.enabled||!this.context)return;
    const t=this.context.currentTime;
    for(const frequency of [196,246.94]){
      const oscillator=this.context.createOscillator(),gain=this.context.createGain();
      oscillator.type='sawtooth';oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.045,t+.03);gain.gain.setValueAtTime(.045,t+.3);gain.gain.exponentialRampToValueAtTime(.001,t+.5);
      oscillator.connect(gain);gain.connect(this.context.destination);oscillator.start(t);oscillator.stop(t+.52);
    }
  }
}
