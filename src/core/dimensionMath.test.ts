import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTemplateDimensionBounds,
  scaleDimensions,
  scaleDimensionsFromCorner,
} from './dimensionMath';

test('scaleDimensions unlocked modifies only the requested axis within bounds', () => {
  const bounds = getTemplateDimensionBounds('heart-name');
  const start = { widthMm: 120, heightMm: 100, depthMm: 40 };

  const res = scaleDimensions(start, 'widthMm', 150, false, bounds);
  assert.equal(res.widthMm, 150);
  assert.equal(res.heightMm, 100);
  assert.equal(res.depthMm, 40);

  const clamped = scaleDimensions(start, 'depthMm', 999, false, bounds);
  assert.equal(clamped.depthMm, bounds.maxDepthMm);
  assert.equal(clamped.widthMm, 120);
});

test('scaleDimensions locked preserves exact W:H:D aspect ratio and respects bounds', () => {
  const bounds = getTemplateDimensionBounds('heart-name');
  const start = { widthMm: 100, heightMm: 80, depthMm: 40 };

  const scaledUp = scaleDimensions(start, 'widthMm', 125, true, bounds);
  assert.equal(scaledUp.widthMm, 125);
  assert.equal(scaledUp.heightMm, 100);
  assert.equal(scaledUp.depthMm, 50);

  // Trying to scale beyond maxDepthMm (60mm) caps all 3 axes at 1.5x ratio
  const capped = scaleDimensions(start, 'widthMm', 180, true, bounds);
  assert.equal(capped.depthMm, 60);
  assert.equal(capped.widthMm, 150);
  assert.equal(capped.heightMm, 120);
});

test('scaleDimensionsFromCorner scales X and Z independently when unlocked or all 3 when locked', () => {
  const bounds = getTemplateDimensionBounds('heart-name');
  const start = { widthMm: 100, heightMm: 80, depthMm: 40 };

  const freeCorner = scaleDimensionsFromCorner(start, 130, 32, false, bounds);
  assert.equal(freeCorner.widthMm, 130);
  assert.equal(freeCorner.depthMm, 32);
  assert.equal(freeCorner.heightMm, 80);

  const lockedCorner = scaleDimensionsFromCorner(start, 120, 48, true, bounds);
  assert.equal(lockedCorner.widthMm, 120);
  assert.equal(lockedCorner.heightMm, 96);
  assert.equal(lockedCorner.depthMm, 48);
});
