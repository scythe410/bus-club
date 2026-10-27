/** A single HTTP byte range. Invalid syntax/multipart is ignored per RFC 9110. */
export function byteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || (!match[1] && Number(match[2]) === 0)) return false;
  return {start, end, length: end - start + 1};
}

/** Backpressure-aware slicing: retain only the current chunk, cancel after end. */
export function sliceStream(body, start, length) {
  const reader = body.getReader();
  let offset = 0, remaining = length;
  return new ReadableStream({
    async pull(controller) {
      try {
        while (remaining > 0) {
          const {value, done} = await reader.read();
          if (done) { controller.error(new Error('Audio stream ended early')); return; }
          const skip = Math.max(0, start - offset);
          offset += value.byteLength;
          if (skip >= value.byteLength) continue;
          const chunk = value.subarray(skip, skip + remaining);
          remaining -= chunk.byteLength;
          controller.enqueue(chunk);
          if (!remaining) { controller.close(); await reader.cancel(); }
          return;
        }
      } catch (error) { controller.error(error); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}
