import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHeartContourPoints,
  getHeartYBounds,
  subdivideNonIndexedTrianglesByX,
} from './heartMath';

test('getHeartYBounds produces symmetric, Y-monotone heart silhouette with cleft dip', () => {
  const W = 120;
  const H = 100;

  const center = getHeartYBounds(0, W, H);
  assert.ok(Math.abs(center.yMin) < 0.01, 'bottom tip sits flush at y = 0');
  assert.ok(center.yMax > 81 && center.yMax < 86, 'center cleft dips around 83.7% of height');

  const leftLobe = getHeartYBounds(-W * 0.245, W, H);
  const rightLobe = getHeartYBounds(W * 0.245, W, H);

  // Symmetry
  assert.ok(Math.abs(leftLobe.yMin - rightLobe.yMin) < 1e-6);
  assert.ok(Math.abs(leftLobe.yMax - rightLobe.yMax) < 1e-6);

  // Upper lobes rise cleanly to ~100% height above the center cleft
  assert.ok(leftLobe.yMax > 99.0 && leftLobe.yMax <= 100.01, 'lobes peak at full height near u=0.49');
  assert.ok(leftLobe.yMin > 19 && leftLobe.yMin < 24, 'lower convex curve sits around 21% at u=0.49');

  // Strict positive thickness across the entire text region [-0.45W, +0.45W]
  for (let x = -W * 0.45; x <= W * 0.45; x += 5) {
    const b = getHeartYBounds(x, W, H);
    assert.ok(b.thickness > 20, `expected strong printable thickness at x=${x}, got ${b.thickness}`);
    assert.ok(b.yMin >= 0 && b.yMax <= H + 0.01);
  }
});

test('createHeartContourPoints spans full width and height accurately', () => {
  const pts = createHeartContourPoints(100, 88, 96);
  assert.equal(pts.length, 96);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  assert.ok(Math.abs(maxX - minX - 100) < 0.5, 'contour width matches target width');
  assert.ok(minY >= -0.05 && minY <= 0.2, 'bottom tip touches y=0');
  assert.ok(Math.abs(maxY - 88) < 0.8, 'lobe peak matches target height');

  // Verify inset contour stays strictly inside outer heart (never drops below y=0 or crosses over)
  const insetPts = createHeartContourPoints(100, 88, 96, 6);
  for (const p of insetPts) {
    assert.ok(p.y > 2.0, `inset point y=${p.y} must stay strictly above bottom tip`);
    assert.ok(Math.abs(p.x) < 46, `inset point |x|=${Math.abs(p.x)} must stay strictly inside half-width`);
  }
});

test('subdivideNonIndexedTrianglesByX splits wide triangles below maxStepX cleanly', () => {
  // Single wide triangle spanning x = 0 to x = 20
  const tri = new Float32Array([
    0, 0, 0,
    20, 0, 0,
    10, 1, 5,
  ]);

  const result = subdivideNonIndexedTrianglesByX(tri, 3.0, 5);
  assert.equal(result.length % 9, 0, 'output contains whole triangles');
  assert.ok(result.length > 9, 'wide triangle was subdivided');

  for (let i = 0; i < result.length; i += 9) {
    const ax = result[i];
    const bx = result[i + 3];
    const cx = result[i + 6];
    const maxDx = Math.max(Math.abs(ax - bx), Math.abs(bx - cx), Math.abs(cx - ax));
    assert.ok(maxDx <= 3.01, `subdivided triangle X span ${maxDx} exceeds maxStepX`);
  }
});
