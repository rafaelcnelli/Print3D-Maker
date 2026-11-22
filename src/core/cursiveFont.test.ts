import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCursiveScriptShapes } from './cursiveFont';

test('buildCursiveScriptShapes produces connected cursive shapes for Portuguese names', () => {
  for (const name of ['gabriel', 'Sofia', 'Vitória', 'João', 'Maria']) {
    const res = buildCursiveScriptShapes(name, 130, 48);
    assert.ok(res.shapes.length >= name.length, `${name} should produce cursive stroke shapes`);
    assert.ok(res.totalWidth > 20 && res.totalWidth <= 135, `${name} width fits target`);
    assert.ok(res.maxY > res.minY, `${name} has positive vertical height`);
  }
});

test('buildCursiveScriptShapes returns empty safely on blank input', () => {
  const res = buildCursiveScriptShapes('   ', 100, 40);
  assert.equal(res.shapes.length, 0);
  assert.equal(res.totalWidth, 0);
});
