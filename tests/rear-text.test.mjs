import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRearText, REAR_TEXT_MAX_LENGTH } from '../src/rear-text.js';

test('rear messages preserve Sinhala and English casing', () => {
  assert.equal(formatRearText('සුභ ගමන්\nTake it easy'), 'සුභ ගමන්\nTake it easy');
  assert.equal(formatRearText(), '');
});

test('rear messages normalize pasted newlines into two lines and remove controls', () => {
  assert.equal(formatRearText('Hello\r\nසුභ ගමන්\rFriends\u0000'), 'Hello\nසුභ ගමන් Friends');
});

test('rear message length limit never splits a Sinhala grapheme or surrogate pair', () => {
  const cluster = 'ශ්‍රී';
  const text = `${'a'.repeat(78)}${cluster}`;
  assert.equal(formatRearText(text), 'a'.repeat(78));
  assert.equal(formatRearText(`${'a'.repeat(79)}🚌`), 'a'.repeat(79));
  assert.equal(formatRearText('x'.repeat(100)).length, REAR_TEXT_MAX_LENGTH);
});
