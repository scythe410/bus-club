import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RadioPlayer} from '../src/radio-player.js';
import {byteRange, sliceStream} from '../shared/http-range.js';
import {serveRadio} from '../worker/radio.js';
import {stat} from 'node:fs/promises';
import {RADIO_TRACKS} from '../shared/radio-catalog.js';

test('streaming manifest sizes match both supplied MP3 files', async () => {
  for (const track of RADIO_TRACKS) assert.equal((await stat(new URL(`../src/assets/radio/${track.file}.mp3`, import.meta.url))).size, track.bytes);
});

class Media extends EventTarget {
  constructor() { super(); this.currentTime = 0; this.duration = NaN; this.paused = true; this.buffered = {length: 0}; this.loads = 0; this.plays = 0; }
  play() { this.plays++; this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  removeAttribute(name) { delete this[name]; }
  load() { this.loads++; this.currentTime = 0; this.duration = NaN; }
}
const tracks = [{id: 'one', src: '/radio/one.mp3'}, {id: 'two', src: '/radio/two.mp3'}];

test('radio stays unloaded on startup, restores selection and volume, and starts on request', async () => {
  const audio = new Media(), storage = {getItem: () => '{"track":"two","volume":0.4}'};
  const player = new RadioPlayer({tracks, audio, storage});
  assert.equal(audio.src, undefined); assert.equal(audio.loads, 0); assert.equal(audio.plays, 0);
  assert.equal(audio.preload, 'none'); assert.equal(player.index, 1); assert.equal(audio.volume, 0.4);
  await player.play(); assert.equal(audio.src, tracks[1].src);
  audio.dispatchEvent(new Event('playing')); assert.equal(player.snapshot().status, 'playing');
  player.pause(); assert.equal(player.snapshot().active, false);
  player.dispose();
});

test('fast track selection or pause ignores rejection from superseded play requests', async () => {
  const audio = new Media(), player = new RadioPlayer({tracks, audio});
  let rejectOld;
  audio.play = () => new Promise((resolve, reject) => { rejectOld = reject; });
  const old = player.play();
  audio.play = () => Promise.resolve();
  await player.select(1);
  audio.dispatchEvent(new Event('playing'));
  rejectOld(new Error('interrupted')); await old;
  assert.equal(player.index, 1); assert.equal(player.status, 'playing');
  audio.play = () => new Promise((resolve, reject) => { rejectOld = reject; });
  const pending = player.play(); player.pause(); rejectOld(new Error('interrupted')); await pending;
  assert.equal(player.status, 'paused'); player.dispose();
});

test('radio retries failed media, clamps seeking, loops the playlist and saves finite preferences', async () => {
  const audio = new Media(), saved = [], player = new RadioPlayer({tracks, audio, storage: {setItem: (...args) => saved.push(args)}});
  audio.play = () => Promise.reject(new Error('offline'));
  await player.play(); assert.equal(player.status, 'error');
  audio.play = () => Promise.resolve(); await player.play();
  audio.dispatchEvent(new Event('playing')); assert.equal(player.status, 'playing');
  audio.duration = 100; player.seek(200); assert.equal(audio.currentTime, 100);
  player.seek(-10); assert.equal(audio.currentTime, 0);
  player.setVolume(0.5); assert.equal(audio.volume, 0.5);
  player.setVolume(NaN); assert.equal(player.volume, 0.5);
  assert.equal(JSON.parse(saved.at(-1)[1]).volume, 0.5);
  audio.dispatchEvent(new Event('ended')); assert.equal(player.index, 1);
  audio.dispatchEvent(new Event('ended')); assert.equal(player.index, 0); player.dispose();
});

test('byte ranges handle open ranges, suffixes, clipped ends and unsatisfiable requests', () => {
  assert.deepEqual(byteRange('bytes=10-19', 100), {start: 10, end: 19, length: 10});
  assert.deepEqual(byteRange('bytes=90-', 100), {start: 90, end: 99, length: 10});
  assert.deepEqual(byteRange('bytes=-10', 100), {start: 90, end: 99, length: 10});
  assert.deepEqual(byteRange('bytes=95-200', 100), {start: 95, end: 99, length: 5});
  assert.deepEqual(byteRange('bytes=-200', 100), {start: 0, end: 99, length: 100});
  for (const range of ['bytes=100-', 'bytes=9-2', 'bytes=-0']) assert.equal(byteRange(range, 100), false);
  for (const range of ['', 'bytes=', 'items=1-2', 'bytes=0-1,4-5']) assert.equal(byteRange(range, 100), null);
});

test('stream slicing returns exact bytes across chunk boundaries and cancels unused source data', async () => {
  let offset = 0, cancelled = false;
  const stream = new ReadableStream({pull(controller) {controller.enqueue(Uint8Array.from({length: 8}, () => offset++));}, cancel() {cancelled = true;}});
  const body = await new Response(sliceStream(stream, 11, 13)).arrayBuffer();
  assert.deepEqual([...new Uint8Array(body)], Array.from({length: 13}, (_, i) => i + 11));
  assert.equal(cancelled, true); assert.ok(offset <= 32, 'do not read the rest of the file');
});

test('production radio serves exact ranges, HEAD, validators, 416 and missing files', async () => {
  const calls = [], bytes = Uint8Array.from({length: 128}, (_, i) => i);
  const assets = {async fetch(request) {
    calls.push(request);
    if (!request.url.includes('all-right')) return new Response(null, {status: 404});
    return new Response(request.method === 'HEAD' ? null : bytes, {headers: {'Content-Length': '128', ETag: '"radio-v1"'}});
  }};
  const url = 'https://game.example/radio/all-right-nonstop-AbC123.mp3';
  const range = await serveRadio(new Request(url, {headers: {Range: 'bytes=60-69'}}), assets);
  assert.equal(range.status, 206); assert.equal(range.headers.get('Content-Range'), 'bytes 60-69/128');
  assert.equal(range.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(range.headers.get('Content-Length'), '10');
  assert.equal(range.headers.get('Accept-Ranges'), 'bytes');
  assert.deepEqual([...new Uint8Array(await range.arrayBuffer())], [...bytes.slice(60, 70)]);
  assert.ok(calls.every(request => new URL(request.url).pathname.startsWith('/assets/')));
  assert.ok(calls.every(request => !request.headers.has('Range')));
  const head = await serveRadio(new Request(url, {method: 'HEAD'}), assets);
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  const invalid = await serveRadio(new Request(url, {headers: {Range: 'bytes=128-'}}), assets);
  assert.equal(invalid.status, 416); assert.equal(invalid.headers.get('Content-Range'), 'bytes */128');
  const revalidated = await serveRadio(new Request(url, {headers: {'If-None-Match': '"radio-v1"'}}), assets);
  assert.equal(revalidated.status, 304);
  const stale = await serveRadio(new Request(url, {headers: {Range: 'bytes=60-69', 'If-Range': '"old"'}}), assets);
  assert.equal(stale.status, 200); assert.equal((await stale.arrayBuffer()).byteLength, 128);
  const missing = await serveRadio(new Request(url.replace('all-right', 'jothi')), assets);
  assert.equal(missing.status, 404);
  const method = await serveRadio(new Request(url, {method: 'POST'}), assets);
  assert.equal(method.status, 405);
});
