import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  dilateShapesWithSDF,
  extractMaskFromImagePixels,
  KEYCHAIN_SVG_PRESETS,
  maskToCenteredShapes,
  parseSvgStringToShapes,
} from './contourTracer';
import { buildVectorTextShapes } from './vectorFont';

test('dilateShapesWithSDF expands letter shapes smoothly by exact border thickness', () => {
  const text = buildVectorTextShapes('ELISA', 'geometric', 130, 48, 0.08);
  assert.ok(text.shapes.length >= 5);

  const dilated = dilateShapesWithSDF(text.shapes, 3.2, 0.5);
  assert.ok(dilated.length >= 1, 'dilated shell should produce closed shapes');

  let minX = Infinity;
  let maxX = -Infinity;
  for (const sh of dilated) {
    for (const p of sh.getPoints(12)) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
  }
  const dilatedW = maxX - minX;
  assert.ok(
    dilatedW > text.totalWidth + 4.0,
    `dilated width (${dilatedW.toFixed(1)}) should exceed text width (${text.totalWidth.toFixed(1)}) by ~2*border`
  );
});

test('all built-in SVG presets parse into valid normalized 2D shapes', () => {
  for (const preset of KEYCHAIN_SVG_PRESETS) {
    const parsed = parseSvgStringToShapes(preset.svg, 48, 48);
    assert.ok(parsed.shapes.length > 0, `preset ${preset.id} should parse shapes`);
    assert.ok(parsed.width > 10 && parsed.width <= 48.5);
    assert.ok(parsed.height > 10 && parsed.height <= 48.5);
  }
});

test('extractMaskFromImagePixels + maskToCenteredShapes traces a dark ring with hole on white background', () => {
  const w = 64;
  const h = 64;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - 32;
      const dy = y - 32;
      const d = Math.hypot(dx, dy);
      const isRing = d <= 22 && d >= 10;
      const c = isRing ? 20 : 250;
      const idx = (y * w + x) * 4;
      rgba[idx] = c;
      rgba[idx + 1] = c;
      rgba[idx + 2] = c;
      rgba[idx + 3] = 255;
    }
  }

  const mask = extractMaskFromImagePixels(rgba, w, h, 140, false);
  const traced = maskToCenteredShapes(mask, 48, 48);
  assert.equal(traced.shapes.length, 1, 'ring produces 1 outer shape');
  assert.equal(traced.shapes[0].holes.length, 1, 'ring preserves 1 inner hole');
  assert.ok(traced.shapes[0] instanceof THREE.Shape);
});
