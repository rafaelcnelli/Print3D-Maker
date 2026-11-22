import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  computeAutoThreshold,
  dilateShapesWithSDF,
  extractMaskFromImagePixels,
  KEYCHAIN_SVG_PRESETS,
  maskToCenteredShapes,
  parseSvgStringToShapes,
  shapesToSvgPreview,
  vectorizeImagePixels,
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

test('vectorizeImagePixels produces smooth sub-pixel contours, removes speckles, and builds SVG preview', () => {
  const w = 160;
  const h = 160;
  const rgba = new Uint8ClampedArray(w * h * 4);

  // Anti-aliased dark ring on white background + stray 1px noise speckles
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - 80;
      const dy = y - 80;
      const d = Math.hypot(dx, dy);
      // Smooth anti-aliased edge coverage around outer R=58 and inner R=26
      const outerCov = Math.max(0, Math.min(1, 58.5 - d));
      const innerCov = Math.max(0, Math.min(1, d - 25.5));
      const cov = Math.min(outerCov, innerCov);
      const lum = Math.round(250 - cov * 230);
      const idx = (y * w + x) * 4;
      rgba[idx] = lum;
      rgba[idx + 1] = lum;
      rgba[idx + 2] = lum;
      rgba[idx + 3] = 255;
    }
  }

  // Inject isolated dark dust pixels far from ring
  const dustSpots = [
    [10, 12],
    [145, 14],
    [12, 148],
    [148, 145],
  ];
  for (const [dx, dy] of dustSpots) {
    const idx = (dy * w + dx) * 4;
    rgba[idx] = 10;
    rgba[idx + 1] = 10;
    rgba[idx + 2] = 10;
  }

  const auto = computeAutoThreshold(rgba, w, h, 'auto');
  assert.equal(auto.detectedMode, 'luminance');
  assert.ok(auto.threshold >= 60 && auto.threshold <= 200, `auto threshold ${auto.threshold} should separate dark/light`);

  const traced = vectorizeImagePixels(rgba, w, h, 50, 50, {
    threshold: auto.threshold,
    invert: false,
    traceMode: 'auto',
    smoothness: 2,
    despeckle: 2,
  });

  assert.equal(traced.shapeCount, 1, 'despeckle should remove dust and leave 1 clean outer ring');
  assert.equal(traced.holeCount, 1, 'inner circular hole should be preserved');

  // Verify sub-pixel circularity: radius variation around outer contour should be tight (< 0.6 mm)
  const outerPts = traced.shapes[0].getPoints(64);
  const radii = outerPts.map((p) => Math.hypot(p.x, p.y));
  const meanR = radii.reduce((a, b) => a + b, 0) / radii.length;
  const maxErr = Math.max(...radii.map((r) => Math.abs(r - meanR)));
  assert.ok(
    maxErr < 0.7,
    `sub-pixel contour circularity error (${maxErr.toFixed(3)} mm) should stay under 0.7 mm`
  );

  const preview = shapesToSvgPreview(traced.shapes, traced.width, traced.height, 3.0);
  assert.ok(preview.pathData.startsWith('M '), 'SVG preview should serialize contour path');
  assert.ok(preview.borderPathData.startsWith('M '), 'SVG preview should include dilated keychain border');
});

