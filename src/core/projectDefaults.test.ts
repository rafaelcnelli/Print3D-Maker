import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectText } from './projectDefaults';

test('validateProjectText accepts Portuguese accented names and simple symbols', () => {
  const res1 = validateProjectText('  João & Lúcia  ');
  assert.equal(res1.valid, true);
  assert.equal(res1.normalized, 'JOÃO & LÚCIA');
  assert.equal(res1.error, null);

  const res2 = validateProjectText('Coração ♥');
  assert.equal(res2.valid, true);
  assert.equal(res2.normalized, 'CORAÇÃO ♥');
});

test('validateProjectText rejects empty input without silent fallback', () => {
  const res = validateProjectText('   ');
  assert.equal(res.valid, false);
  assert.equal(res.normalized, '');
  assert.ok(res.error && res.error.length > 0);
});

test('validateProjectText rejects excessive length and unsupported characters', () => {
  const longRes = validateProjectText('ALEXANDRE MAGNO SILVA', 14);
  assert.equal(longRes.valid, false);
  assert.ok(longRes.error?.includes('14'));

  const badCharRes = validateProjectText('MARIA@123');
  assert.equal(badCharRes.valid, false);
  assert.ok(badCharRes.error !== null);
});
