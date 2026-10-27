import './radio.css';
import {icon} from './icons.js';
import {RadioPlayer} from './radio-player.js';
import {createRadioVisualizer} from './radio-visualizer.js';
import {RADIO_TRACKS} from '../shared/radio-catalog.js';
import allRight from './assets/radio/all-right-nonstop.mp3?url';
import jothi from './assets/radio/jothi-nonstop.mp3?url';

const sources = [allRight, jothi];
const tracks = RADIO_TRACKS.map((track, index) => ({...track, src: sources[index]}));
// Vite fingerprints the audio separately from JS. Production uses the range-
// capable route; Vite's development server already serves byte ranges.
if (import.meta.env.PROD) for (const track of tracks) track.src = track.src.replace('/assets/', '/radio/');
const radioIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 7 14-4M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="8" cy="14" r="2.5"/><path d="M14 12h4m-4 4h4"/></svg>';
const closeIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m7 7 10 10M7 17 17 7"/></svg>';
const time = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const ticks = count => Array.from({length: count}, (_, i) => `<i style="--i:${i}" aria-hidden="true"></i>`).join('');

export function createRadio(root) {
  const visualizer = createRadioVisualizer(root);
  const toggle = document.createElement('button');
  toggle.id = 'radio-toggle';
  toggle.className = 'status-pill radio-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'radio-panel');
  toggle.setAttribute('aria-label', 'Open radio');
  toggle.title = 'Radio';
  toggle.innerHTML = `${radioIcon}<span class="radio-button-label">Radio</span><span class="radio-indicator" aria-hidden="true"></span>`;
  root.querySelector('.top-actions').prepend(toggle);
  const panel = document.createElement('section');
  panel.id = 'radio-panel';
  panel.className = 'radio-panel';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'radio-title');
  panel.innerHTML = `
    <header class="radio-header"><h2 id="radio-title">Bus radio</h2><button class="radio-icon-button" id="radio-close" aria-label="Close radio">${closeIcon}</button></header>
    <span id="radio-status" class="sr-only" role="status"></span>
    <div class="radio-tracks" role="group" aria-label="Choose a radio track">${tracks.map((track, i) => `<button type="button" class="radio-track" data-track="${i}" aria-pressed="false" title="${track.title} · ${track.artist}"><span class="radio-track-number">0${i + 1}</span><span class="radio-track-copy"><strong>${track.title}</strong></span><span class="radio-track-tail">${time(track.duration)}</span></button>`).join('')}</div>
    <div class="radio-transport"><button class="radio-play" id="radio-play" aria-label="Play radio">${icon('play')}</button><div class="radio-seek-wrap"><div class="radio-times"><output id="radio-elapsed">0:00</output><span id="radio-duration">8:52</span></div><div class="radio-seek"><div class="radio-buffer" aria-hidden="true"></div><div class="radio-seek-ticks">${ticks(45)}</div><input id="radio-seek" type="range" min="0" max="532" step="1" value="0" aria-label="Seek in radio track" disabled /></div></div></div>
    <div class="radio-volume-row"><button class="radio-icon-button" id="radio-mute" aria-label="Mute radio">${icon('sound-high')}</button><div class="radio-volume"><div class="radio-volume-ticks">${ticks(31)}</div><input id="radio-volume" type="range" min="0" max="100" step="1" value="50" aria-label="Radio volume" /></div><output for="radio-volume" id="radio-volume-value">50<span>%</span></output></div>`;
  root.append(panel);
  const $ = selector => panel.querySelector(selector);
  const audio = document.createElement('audio');
  audio.preload = 'none';
  audio.setAttribute('playsinline', '');
  panel.append(audio);
  $('#radio-elapsed').setAttribute('aria-live', 'off');
  $('#radio-volume-value').setAttribute('aria-live', 'off');
  let storage;
  try { storage = localStorage; } catch {}
  let previousVolume = 0.5, scrubbing = false, volumeContext, gain, source;
  // iOS does not honor HTMLMediaElement.volume; a native streaming source and
  // GainNode keep the same slider functional there without decoding whole files.
  const setupVolume = () => {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      if (!volumeContext) {
        volumeContext = new Context();
        source = volumeContext.createMediaElementSource(audio);
        gain = volumeContext.createGain();
        const analyser = volumeContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.minDecibels = -85;
        analyser.maxDecibels = -10;
        analyser.smoothingTimeConstant = 0.32;
        source.connect(gain).connect(analyser).connect(volumeContext.destination);
        visualizer.connect(analyser);
      }
      audio.volume = 1;
      gain.gain.value = player.volume;
      if (volumeContext.state !== 'running') void volumeContext.resume().catch(() => {});
    } catch { /* Native volume still works when WebAudio is unavailable. */ }
  };
  const wake = value => {
    panel.style.setProperty('--volume', value);
    for (const [i, tick] of [...$('.radio-volume-ticks').children].entries()) {
      const proximity = Math.max(0, 1 - Math.abs(i / 30 - value) * 7);
      tick.style.setProperty('--lift', `${proximity * 10}px`);
      tick.classList.toggle('filled', i / 30 <= value);
    }
  };
  let lastStatus;
  function render(state) {
    visualizer.update(state);
    const status = {idle: '', paused: 'Radio paused', loading: 'Loading radio…', playing: `Playing ${state.track.title}`, error: 'Couldn’t load. Press play to retry.'}[state.status];
    if (state.status !== lastStatus) {
      $('#radio-status').textContent = status;
      $('#radio-status').className = state.status === 'error' ? 'radio-error' : 'sr-only';
      $('#radio-play').innerHTML = icon(state.active ? 'pause' : 'play');
      $('#radio-play').setAttribute('aria-label', state.active ? 'Pause radio' : state.status === 'error' ? 'Retry radio' : 'Play radio');
      panel.dataset.status = state.status;
      toggle.classList.toggle('is-playing', state.active);
      lastStatus = state.status;
    }
    const duration = state.duration || state.track.duration;
    $('#radio-duration').textContent = time(duration);
    $('#radio-seek').max = String(duration);
    $('#radio-seek').disabled = state.duration <= 0;
    if (!scrubbing) {
      $('#radio-elapsed').textContent = time(state.currentTime);
      $('#radio-seek').value = String(state.currentTime);
      $('#radio-seek').setAttribute('aria-valuetext', `${time(state.currentTime)} of ${time(duration)}`);
      panel.style.setProperty('--progress', state.currentTime / duration);
    }
    panel.style.setProperty('--buffered', state.buffered / duration);
    for (const button of panel.querySelectorAll('[data-track]')) button.setAttribute('aria-pressed', String(Number(button.dataset.track) === state.index));
    $('#radio-volume').value = String(Math.round(state.volume * 100));
    $('#radio-volume-value').innerHTML = `${Math.round(state.volume * 100)}<span>%</span>`;
    $('#radio-volume').setAttribute('aria-valuetext', `${Math.round(state.volume * 100)} percent`);
    $('#radio-mute').innerHTML = icon(state.volume ? 'sound-high' : 'sound-off');
    $('#radio-mute').setAttribute('aria-label', state.volume ? 'Mute radio' : 'Unmute radio');
    wake(state.volume);
    if (gain) { audio.volume = 1; gain.gain.setTargetAtTime(state.volume, volumeContext.currentTime, 0.025); }
  }
  const player = new RadioPlayer({tracks, audio, storage, onChange: render});
  render(player.snapshot());
  const setOpen = (open, restoreFocus = false) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close radio' : 'Open radio');
    if (open) $('#radio-play').focus({preventScroll: true});
    else if (restoreFocus) toggle.focus({preventScroll: true});
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  $('#radio-close').addEventListener('click', () => setOpen(false, true));
  $('#radio-play').addEventListener('click', () => { setupVolume(); void player.toggle(); });
  for (const button of panel.querySelectorAll('[data-track]')) button.addEventListener('click', () => { setupVolume(); void player.select(Number(button.dataset.track)); });
  $('#radio-volume').addEventListener('input', event => player.setVolume(Number(event.target.value) / 100));
  $('#radio-mute').addEventListener('click', () => { if (player.volume) { previousVolume = player.volume; player.setVolume(0); } else player.setVolume(previousVolume); });
  $('#radio-seek').addEventListener('pointerdown', () => { scrubbing = true; });
  $('#radio-seek').addEventListener('input', event => {
    $('#radio-elapsed').textContent = time(Number(event.target.value));
    panel.style.setProperty('--progress', Number(event.target.value) / Number(event.target.max));
    if (!scrubbing) player.seek(Number(event.target.value));
  });
  const commitSeek = () => { if (!scrubbing) return; scrubbing = false; player.seek(Number($('#radio-seek').value)); };
  $('#radio-seek').addEventListener('change', () => { scrubbing = false; player.seek(Number($('#radio-seek').value)); });
  document.addEventListener('pointerup', commitSeek);
  $('#radio-seek').addEventListener('pointercancel', () => { scrubbing = false; render(player.snapshot()); });
  document.addEventListener('pointerdown', event => { if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) setOpen(false); });
  // Capture Escape before the garage shortcut, including when focus is outside.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false, true); }
  }, true);
  panel.addEventListener('keydown', event => {
    // Keep native range arrows / Space without driving the bus underneath.
    if (event.key !== 'Tab') event.stopPropagation();
  });
  window.addEventListener('pagehide', () => player.pause());
  return {player, close: () => setOpen(false), setDriving: value => visualizer.setDriving(value)};
}
