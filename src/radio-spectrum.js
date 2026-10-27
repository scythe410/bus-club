/** Independent frequency bands with adaptive contrast and fast musical transients. */
export function createSpectrumProcessor({sampleRate, fftSize, barCount = 32}) {
  const edges = new Uint16Array(barCount + 1);
  const floor = new Float32Array(barCount), peak = new Float32Array(barCount);
  const previous = new Float32Array(barCount), levels = new Float32Array(barCount);
  const maxFrequency = Math.min(12000, sampleRate * 0.45);
  for (let i = 0; i <= barCount; i++) {
    const bin = Math.round(60 * Math.pow(maxFrequency / 60, i / barCount) * fftSize / sampleRate);
    edges[i] = Math.max(i ? edges[i - 1] + 1 : 1, bin);
  }
  return {
    edges,
    reset() { floor.fill(0); peak.fill(0); previous.fill(0); levels.fill(0); },
    process(bins) {
      for (let i = 0; i < barCount; i++) {
        const from = Math.min(edges[i], bins.length - 1), to = Math.min(edges[i + 1], bins.length);
        let sum = 0;
        for (let bin = from; bin < to; bin++) sum += bins[bin];
        const energy = sum / Math.max(1, to - from) / 255;
        // A sustained bass note settles; fresh beats and quiet treble can still jump.
        floor[i] += (energy - floor[i]) * (energy < floor[i] ? 0.35 : 0.025);
        peak[i] = Math.max(energy, peak[i] * 0.985);
        const contrast = Math.max(0, energy - floor[i]) / Math.max(0.12, peak[i] - floor[i]);
        const onset = Math.max(0, energy - previous[i]) * 4;
        const target = energy < 0.025 ? 0 : Math.min(0.9, contrast * 0.78 + onset * 0.3 + energy * 0.06);
        levels[i] += (target - levels[i]) * (target > levels[i] ? 0.62 : 0.28);
        previous[i] = energy;
      }
      return levels;
    },
  };
}
