import { createAsciiReveal } from 'ascii-reveal/core';

// Keep live data, editable fields, and actions outside the character animation.
const TEXT_TARGETS = [
  '.brand-title', '.brand-caption', '.garage-title', '.garage-intro',
  '.section-heading > span:first-child', '.room-title', '.room-sub:not([id])',
  '.world-caption h2', '.modal h2', '.modal > p:not(.soundboard-help)',
  '.eyebrow', '#game-about h2', '#game-about p',
].join(',');
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const noop = () => {};
const active = new WeakMap();
const isVisible = element => element.isConnected &&
  !element.closest('[hidden], [inert]') && element.getClientRects().length > 0;

/** A short, text-only decode. Returns a cancellation function that restores text. */
export function revealSection(element, options = {}) {
  if (!element || window.matchMedia?.(REDUCED_MOTION).matches || !isVisible(element)) return noop;
  active.get(element)?.();
  let controller;
  let timer;
  let stopped = false;
  const position = element.style.position;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    controller?.destroy();
    element.style.position = position;
    active.delete(element);
  };
  try {
    controller = createAsciiReveal(element, {
      preset: 'decode', duration: 'fast', speed: 1.25, origin: 'top-left',
      lazy: false, fallback: true,
      selector: options.selector,
      // Never rasterize bus previews or touch interactive controls.
      media: ':not(*)', surfaces: ':not(*)', fades: ':not(*)',
    });
    active.set(element, cleanup);
    // Hard deadline also restores the DOM if a browser pauses the animation.
    timer = setTimeout(cleanup, Math.min(600, Math.max(100, options.duration || 580)));
    Promise.resolve(controller.reveal()).then(cleanup, cleanup);
  } catch {
    cleanup();
  }
  return cleanup;
}

/** Set up once after UI markup exists. Initial reveal waits until loading releases inert. */
export function setupReveals(root) {
  if (!root) return noop;
  const motion = window.matchMedia?.(REDUCED_MOTION);
  const running = new Map();
  const seen = new WeakSet();
  const queued = new Set();
  let disposed = false;
  let frame;
  const candidates = scope => {
    const elements = [...scope.querySelectorAll(TEXT_TARGETS)];
    if (scope.matches?.(TEXT_TARGETS)) elements.unshift(scope);
    return elements.filter(element => !element.closest('button, input, textarea, select, [aria-live]'));
  };
  const run = element => {
    if (disposed || !isVisible(element)) return;
    observer?.unobserve(element);
    queued.delete(element);
    seen.add(element);
    running.get(element)?.();
    running.set(element, revealSection(element));
  };
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting && isVisible(entry.target)) run(entry.target);
  }, { threshold: 0.15 });
  const prepare = (scope, replay = false) => {
    if (disposed || motion?.matches || root.inert) return;
    for (const element of candidates(scope)) {
      if (!isVisible(element) || (!replay && seen.has(element))) continue;
      if (observer) {
        if (!queued.has(element)) { queued.add(element); observer.observe(element); }
      } else run(element);
    }
  };
  // Attribute-only observers: telemetry text changes never enqueue animation work.
  const attributes = new MutationObserver(records => {
    if (root.inert) return;
    if (records.some(record => record.target === root && record.attributeName === 'inert')) prepare(root);
    for (const record of records) {
      if (record.attributeName !== 'hidden') continue;
      if (record.target.hidden) {
        for (const element of candidates(record.target)) {
          running.get(element)?.();
          running.delete(element);
          queued.delete(element);
          observer?.unobserve(element);
        }
      } else prepare(record.target, true);
    }
  });
  attributes.observe(root, { attributes: true, attributeFilter: ['inert'] });
  for (const region of root.querySelectorAll('#garage, #world-caption, #drive-hud, #room-lobby, #room-active, .modal-backdrop')) {
    attributes.observe(region, { attributes: true, attributeFilter: ['hidden'] });
  }
  const stopAnimations = () => {
    if (!motion?.matches) { prepare(root); return; }
    observer?.disconnect();
    queued.clear();
    for (const stop of running.values()) stop();
    running.clear();
  };
  motion?.addEventListener?.('change', stopAnimations);
  frame = requestAnimationFrame(() => prepare(root));
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    attributes.disconnect();
    observer?.disconnect();
    motion?.removeEventListener?.('change', stopAnimations);
    window.removeEventListener('pagehide', dispose);
    for (const stop of running.values()) stop();
    running.clear();
    queued.clear();
  };
  window.addEventListener('pagehide', dispose);
  return dispose;
}
