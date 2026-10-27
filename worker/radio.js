import {byteRange, sliceStream} from '../shared/http-range.js';
import {RADIO_TRACKS} from '../shared/radio-catalog.js';

// Only versioned, bundled radio files can be read through this endpoint.
export const radioPath = /^\/radio\/(?:all-right-nonstop|jothi-nonstop)-[A-Za-z0-9_-]+\.mp3$/;

export async function serveRadio(request, assets) {
  const url = new URL(request.url);
  if (!radioPath.test(url.pathname)) return new Response('Track not found', {status: 404});
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405, headers: {Allow: 'GET, HEAD'}});
  url.pathname = url.pathname.replace('/radio/', '/assets/');
  url.search = '';
  // The asset binding provides cached source bytes, but does not implement ranges.
  // Read its metadata first; never buffer a complete MP3 in Worker memory.
  const metadata = await assets.fetch(new Request(url, {method: 'HEAD'}));
  if (!metadata.ok) return new Response('Track not found', {status: 404, headers: {'Cache-Control': 'no-store'}});
  const size = Number(metadata.headers.get('Content-Length')) || RADIO_TRACKS.find(track => url.pathname.startsWith(`/assets/${track.file}-`))?.bytes;
  if (!Number.isSafeInteger(size) || size <= 0) return new Response('Track unavailable', {status: 502});
  const headers = new Headers(metadata.headers);
  headers.set('Content-Type', 'audio/mpeg');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Length', String(size));
  const etag = headers.get('ETag');
  if (request.headers.get('If-None-Match')?.split(',').some(value => value.trim() === '*' || (etag && value.trim().replace(/^W\//, '') === etag.replace(/^W\//, '')))) {
    headers.delete('Content-Length');
    return new Response(null, {status: 304, headers});
  }
  // RFC 9110: Range is evaluated only for GET, and If-Range must match strongly.
  if (request.method === 'HEAD') return new Response(null, {headers});
  const validator = request.headers.get('If-Range');
  const validatorMatches = !validator || (etag && !etag.startsWith('W/') && validator === etag) || (headers.has('Last-Modified') && validator === headers.get('Last-Modified'));
  const range = validatorMatches ? byteRange(request.headers.get('Range'), size) : null;
  if (range === false) {
    headers.set('Content-Range', `bytes */${size}`);
    headers.set('Content-Length', '0');
    return new Response(null, {status: 416, headers});
  }
  const asset = await assets.fetch(new Request(url));
  if (!asset.ok || !asset.body) return new Response('Track unavailable', {status: 502, headers: {'Cache-Control': 'no-store'}});
  if (!range) return new Response(asset.body, {headers});
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  headers.set('Content-Length', String(range.length));
  let body = sliceStream(asset.body, range.start, range.length);
  // workerd needs a fixed-length stream to preserve Content-Length on 206.
  if (typeof FixedLengthStream !== 'undefined') {
    const fixed = new FixedLengthStream(range.length);
    // Source failures propagate to the response; client cancellation is routine.
    void body.pipeTo(fixed.writable).catch(() => {});
    body = fixed.readable;
  }
  return new Response(body, {status: 206, headers});
}
