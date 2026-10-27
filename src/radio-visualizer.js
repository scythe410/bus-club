import {createSpectrumProcessor} from './radio-spectrum.js';

/** A small audio-reactive spectrum, updated at 30 Hz only while visible/playing. */
export function createRadioVisualizer(root) {
  const element = document.createElement('aside');
  element.id = 'radio-now-playing';
  element.className = 'radio-now-playing';
  element.hidden = true;
  element.innerHTML = `<div class="radio-spectrum" aria-hidden="true">${Array.from({length: 32}, () => '<i></i>').join('')}</div><div class="radio-marquee"><span class="radio-marquee-text"></span></div>`;
  root.append(element);
  const bars = [...element.querySelectorAll('.radio-spectrum i')];
  const title = element.querySelector('.radio-marquee-text');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width:700px)');
  let analyser, bins, spectrum, playing = false, driving = false, frame = 0, lastDraw = 0, trackId;

  function draw(now) {
    frame = 0;
    if (!playing || document.hidden || element.hidden || !analyser || motion.matches || (compact.matches && !driving)) return;
    if (now - lastDraw >= 32) {
      analyser.getByteFrequencyData(bins);
      const levels = spectrum.process(bins);
      for (let i = 0; i < bars.length; i++) {
        bars[i].style.transform = `scaleY(${(0.04 + levels[i] * 0.96).toFixed(3)})`;
      }
      lastDraw = now;
    }
    frame = requestAnimationFrame(draw);
  }
  function schedule() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (playing && !document.hidden && analyser && !motion.matches && (!compact.matches || driving)) frame = requestAnimationFrame(draw);
  }
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', schedule);
  compact.addEventListener('change', schedule);
  return {
    connect(node) {
      analyser = node;
      bins = new Uint8Array(node.frequencyBinCount);
      spectrum = createSpectrumProcessor({sampleRate:node.context.sampleRate, fftSize:node.fftSize, barCount:bars.length});
      schedule();
    },
    update(state) {
      if (trackId !== state.track.id) {
        trackId = state.track.id;
        const fullTitle = state.track.fullTitle || state.track.title;
        title.textContent = fullTitle;
        element.setAttribute('aria-label', `Now playing: ${fullTitle}`);
        title.style.setProperty('--marquee-duration', `${Math.max(14, (272 + fullTitle.length * 7) / 32)}s`);
        spectrum?.reset();
        // Restart the CSS marquee only when selecting another song.
        title.style.animation = 'none';
        void title.offsetWidth;
        title.style.animation = '';
      }
      const active = state.status === 'playing';
      if (playing !== active) {
        playing = active;
        element.hidden = !active;
        element.classList.toggle('is-playing', active);
        schedule();
      }
    },
    setDriving(value) { driving = Boolean(value); element.classList.toggle('is-driving', driving); schedule(); },
  };
}
