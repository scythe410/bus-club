import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSpectrumProcessor} from '../src/radio-spectrum.js';

test('all spectrum bars use distinct musical bands instead of repeating bass bins', () => {
  for (const sampleRate of [44100, 48000]) {
    const spectrum = createSpectrumProcessor({sampleRate, fftSize:2048});
    assert.equal(spectrum.edges.length, 33);
    assert.ok(spectrum.edges[0] > 0, 'exclude DC');
    for (let i = 1; i < spectrum.edges.length; i++) assert.ok(spectrum.edges[i] > spectrum.edges[i - 1]);
    assert.ok(spectrum.edges.at(-1) < 1024);
  }
});

test('sustained bass settles while beats rise smoothly and silence settles', () => {
  const spectrum = createSpectrumProcessor({sampleRate:48000, fftSize:2048});
  const bins = new Uint8Array(1024).fill(160);
  for (let i = 0; i < 360; i++) spectrum.process(bins);
  const settled = [...spectrum.process(bins)];
  assert.ok(settled.every(value => value < 0.1), 'steady volume must not pin bars high');
  bins.fill(240);
  const firstBeat = [...spectrum.process(bins)];
  assert.ok(firstBeat.every(value => value > 0.4 && value < 0.65), 'attack should be visible without snapping to full height');
  for (let i = 0; i < 3; i++) spectrum.process(bins);
  assert.ok([...spectrum.process(bins)].every(value => value > 0.7 && value <= 0.9), 'peaks rise over several frames and stay bounded');
  bins.fill(0);
  for (let i = 0; i < 30; i++) spectrum.process(bins);
  assert.ok([...spectrum.process(bins)].every(value => value < 0.001));
});

test('quiet treble changes remain visible and silence does not invent movement', () => {
  const spectrum = createSpectrumProcessor({sampleRate:48000, fftSize:2048});
  const bins = new Uint8Array(1024);
  assert.ok([...spectrum.process(bins)].every(value => value === 0));
  bins.fill(40, spectrum.edges[24], spectrum.edges[25]);
  for (let i = 0; i < 180; i++) spectrum.process(bins);
  const before = spectrum.process(bins)[24];
  bins.fill(90, spectrum.edges[24], spectrum.edges[25]);
  const after = spectrum.process(bins);
  assert.ok(after[24] - before > 0.35);
  assert.equal(after[0], 0);
  assert.ok([...after].every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  spectrum.reset();
  assert.ok([...spectrum.process(new Uint8Array(1024))].every(value => value === 0));
});
