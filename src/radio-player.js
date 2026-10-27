const preferenceKey = 'bus-club-radio';

/** One streaming media element; no full-file fetch or decoding on the game thread. */
export class RadioPlayer {
  constructor({tracks, audio = new Audio(), storage, onChange = () => {}}) {
    this.tracks = tracks;
    this.audio = audio;
    this.storage = storage;
    this.onChange = onChange;
    this.index = 0;
    this.volume = 0.5;
    this.status = 'idle';
    this.loaded = false;
    this.revision = 0;
    try {
      const saved = JSON.parse(storage?.getItem(preferenceKey) || '{}');
      const index = tracks.findIndex(track => track.id === saved.track);
      if (index >= 0) this.index = index;
      if (Number.isFinite(saved.volume)) this.volume = Math.max(0, Math.min(1, saved.volume));
    } catch {}
    audio.preload = 'none';
    audio.volume = this.volume;
    this.listeners = new Map();
    for (const type of ['timeupdate', 'durationchange', 'loadedmetadata', 'progress', 'seeking', 'seeked']) {
      this.listen(type, () => this.emit());
    }
    this.listen('playing', () => { this.status = 'playing'; this.emit(); });
    this.listen('waiting', () => { if (!audio.paused) { this.status = 'loading'; this.emit(); } });
    this.listen('pause', () => { if (!audio.ended && this.status !== 'error') { this.status = 'paused'; this.emit(); } });
    this.listen('error', () => { this.status = 'error'; this.emit(); });
    this.listen('ended', () => { void this.select((this.index + 1) % tracks.length, true); });
  }

  listen(type, handler) { this.audio.addEventListener(type, handler); this.listeners.set(type, handler); }
  save() {
    try { this.storage?.setItem(preferenceKey, JSON.stringify({track: this.tracks[this.index].id, volume: this.volume})); } catch {}
  }
  emit() { this.onChange(this.snapshot()); }
  snapshot() {
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    let buffered = 0;
    for (let i = 0; i < this.audio.buffered.length; i++) {
      if (this.audio.buffered.start(i) <= this.audio.currentTime + 0.25) buffered = this.audio.buffered.end(i);
    }
    return {index: this.index, track: this.tracks[this.index], status: this.status, volume: this.volume,
      currentTime: this.audio.currentTime || 0, duration, buffered, active: ['loading', 'playing'].includes(this.status)};
  }
  async select(index, autoplay = true) {
    if (!Number.isInteger(index) || !this.tracks[index]) return;
    if (index !== this.index) {
      this.pause();
      this.index = index;
      this.loaded = false;
      this.audio.removeAttribute('src');
      this.audio.load();
      this.status = 'idle';
      this.save();
      this.emit();
    }
    if (autoplay) await this.play();
  }
  async play() {
    const revision = ++this.revision;
    if (!this.loaded || this.status === 'error') {
      this.audio.src = this.tracks[this.index].src;
      this.loaded = true;
    }
    this.status = 'loading';
    this.emit();
    try {
      // Called directly from a click, preserving browser audio activation.
      const playback = this.audio.play();
      await playback;
    } catch (error) {
      if (revision !== this.revision) return;
      this.status = error?.name === 'NotAllowedError' ? 'paused' : 'error';
      this.emit();
    }
  }
  pause() { this.revision++; this.audio.pause(); this.status = 'paused'; this.emit(); }
  toggle() { return this.snapshot().active ? this.pause() : this.play(); }
  setVolume(value) {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(1, value));
    this.audio.volume = this.volume;
    this.save();
    this.emit();
  }
  seek(seconds) {
    if (!Number.isFinite(seconds) || !Number.isFinite(this.audio.duration) || this.audio.duration <= 0) return;
    this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, seconds));
    this.emit();
  }
  dispose() {
    this.revision++;
    for (const [type, handler] of this.listeners) this.audio.removeEventListener(type, handler);
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}
