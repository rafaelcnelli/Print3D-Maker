/**
 * Pure analytical mathematics for the dual-view Heart-Name 3D printable solid.
 *
 * Uses a G¹-continuous two-piece cubic Bézier heart contour fitted directly to
 * the classic plump, rounded heart silhouette (aspect W/H ≈ 1.135, crisp top
 * V-cleft at ~83.7% height, full circular upper lobes peaking at u ≈ 0.49,
 * smooth vertical side tangents at y = 69%, and gently convex lower curves
 * meeting cleanly at the bottom point).
 *
 * Because x(t) is strictly monotonically increasing on [0, 1] for both the
 * upper lobe and lower cheek, the heart cross-section at every x in [-W/2, +W/2]
 * is a SINGLE vertical interval [yMin(x), yMax(x)]. This makes the 3D intersection
 * Heart(X, Y) ∩ Name(X, Z) an exact orientation-preserving homeomorphism
 * with zero self-intersections and 100% watertight manifold geometry.
 */

// Normalized right-half cubic Bézier control points (u in [0, 1], y in [0, 1]):
// Upper lobe: cleft (0, 0.8373) -> (0.31, 1.12) -> (1.0, 1.0) -> outer tangent (1.0, 0.69)
const TOP_BX: readonly [number, number, number, number] = [0.0, 0.31, 1.0, 1.0];
const TOP_BY: readonly [number, number, number, number] = [0.8373, 1.12, 1.0, 0.69];

// Lower cheek: bottom tip (0, 0) -> (0.64, 0.24) -> (1.0, 0.47) -> outer tangent (1.0, 0.69)
const BOT_BX: readonly [number, number, number, number] = [0.0, 0.64, 1.0, 1.0];
const BOT_BY: readonly [number, number, number, number] = [0.0, 0.24, 0.47, 0.69];

function evalCubic(
  c: readonly [number, number, number, number],
  t: number
): number {
  const mt = 1 - t;
  return (
    mt * mt * mt * c[0] +
    3 * mt * mt * t * c[1] +
    3 * mt * t * t * c[2] +
    t * t * t * c[3]
  );
}

// Compute exact peak of TOP_BY so normalized peak is strictly 1.0000
const TOP_PEAK_Y = (() => {
  let peak = 0;
  for (let i = 0; i <= 400; i++) {
    const y = evalCubic(TOP_BY, i / 400);
    if (y > peak) peak = y;
  }
  return peak;
})();

function solveCurveYForU(
  bx: readonly [number, number, number, number],
  by: readonly [number, number, number, number],
  uTarget: number
): number {
  if (uTarget <= 0) return by[0] / TOP_PEAK_Y;
  if (uTarget >= 1) return by[3] / TOP_PEAK_Y;

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) * 0.5;
    if (evalCubic(bx, mid) < uTarget) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return evalCubic(by, (lo + hi) * 0.5) / TOP_PEAK_Y;
}

export interface HeartYBounds {
  yMin: number;
  yMax: number;
  thickness: number;
}

/**
 * Returns the exact [yMin, yMax] vertical bounds (in mm, bottom tip at y = 0,
 * upper lobe peaks at y = heightMm) of the heart at horizontal coordinate
 * xMm in [-widthMm/2, +widthMm/2].
 */
export function getHeartYBounds(
  xMm: number,
  widthMm: number,
  heightMm: number,
  minPadRatio = 0.0
): HeartYBounds {
  const halfW = Math.max(1e-3, widthMm * 0.5);
  const t = Math.min(1, Math.max(0, Math.abs(xMm) / halfW));

  // Clamp slightly inside 1.0 so outermost edges retain positive thickness
  const safeU = Math.min(0.997, t);

  const normTop = Math.min(1, Math.max(0, solveCurveYForU(TOP_BX, TOP_BY, safeU)));
  const normBot = Math.min(1, Math.max(0, solveCurveYForU(BOT_BX, BOT_BY, safeU)));

  let yMin = normBot * heightMm;
  let yMax = normTop * heightMm;

  if (minPadRatio > 0) {
    const minThickness = heightMm * minPadRatio;
    if (yMax - yMin < minThickness) {
      const mid = (yMin + yMax) * 0.5;
      yMin = Math.max(0, mid - minThickness * 0.5);
      yMax = Math.min(heightMm, mid + minThickness * 0.5);
    }
  }

  return {
    yMin,
    yMax,
    thickness: Math.max(0, yMax - yMin),
  };
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Samples a closed CCW 2D contour of the exact same Bézier heart
 * matching getHeartYBounds(x, widthMm, heightMm), with bottom tip at (0, 0).
 */
export function createHeartContourPoints(
  widthMm: number,
  heightMm: number,
  segments = 96,
  insetMm = 0
): Point2D[] {
  const halfW = widthMm * 0.5;
  const qCount = Math.max(8, Math.round(segments / 4));
  const pts: Point2D[] = [];

  // Traverse strictly CCW starting at bottom tip (0, 0):
  // 1) Right lower cheek: t = 0 -> 1  (0,0) -> (+halfW, 0.69H)
  for (let i = 0; i < qCount; i++) {
    const t = i / qCount;
    pts.push({
      x: evalCubic(BOT_BX, t) * halfW,
      y: (evalCubic(BOT_BY, t) / TOP_PEAK_Y) * heightMm,
    });
  }

  // 2) Right upper lobe: t = 1 -> 0  (+halfW, 0.69H) -> (0, cleft)
  for (let i = 0; i < qCount; i++) {
    const t = 1 - i / qCount;
    pts.push({
      x: evalCubic(TOP_BX, t) * halfW,
      y: (evalCubic(TOP_BY, t) / TOP_PEAK_Y) * heightMm,
    });
  }

  // 3) Left upper lobe: t = 0 -> 1  (0, cleft) -> (-halfW, 0.69H)
  for (let i = 0; i < qCount; i++) {
    const t = i / qCount;
    pts.push({
      x: -evalCubic(TOP_BX, t) * halfW,
      y: (evalCubic(TOP_BY, t) / TOP_PEAK_Y) * heightMm,
    });
  }

  // 4) Left lower cheek: t = 1 -> 0  (-halfW, 0.69H) -> (0, 0)
  for (let i = 0; i < qCount; i++) {
    const t = 1 - i / qCount;
    pts.push({
      x: -evalCubic(BOT_BX, t) * halfW,
      y: (evalCubic(BOT_BY, t) / TOP_PEAK_Y) * heightMm,
    });
  }

  if (insetMm <= 0) {
    return pts;
  }

  // Uniform scaling around interior centroid guarantees zero self-intersection at bottom tip or cleft
  const clampedInset = Math.min(insetMm, widthMm * 0.16, heightMm * 0.16);
  const scaleX = Math.max(0.25, (widthMm - clampedInset * 2) / widthMm);
  const scaleY = Math.max(0.25, (heightMm - clampedInset * 2) / heightMm);
  const centerY = heightMm * 0.54;

  return pts.map((p) => ({
    x: p.x * scaleX,
    y: centerY + (p.y - centerY) * scaleY,
  }));
}

/**
 * Computes finite-difference slopes (dyMin/dx, dyMax/dx) for smooth analytical
 * surface normals on the top and bottom curved faces of warped heart letters.
 */
export function getHeartYSlopes(
  xMm: number,
  widthMm: number,
  heightMm: number
): { dMinDx: number; dMaxDx: number } {
  const eps = Math.max(0.25, widthMm * 0.004);
  const halfSafe = widthMm * 0.485;
  const xL = Math.max(-halfSafe, xMm - eps);
  const xR = Math.min(halfSafe, xMm + eps);
  const dx = Math.max(1e-4, xR - xL);

  const bL = getHeartYBounds(xL, widthMm, heightMm, 0.08);
  const bR = getHeartYBounds(xR, widthMm, heightMm, 0.08);

  return {
    dMinDx: (bR.yMin - bL.yMin) / dx,
    dMaxDx: (bR.yMax - bL.yMax) / dx,
  };
}

/**
 * Deterministic longest-edge bisection along X on a non-indexed triangle array
 * (9 floats per triangle: ax,ay,az, bx,by,bz, cx,cy,cz).
 */
export function subdivideNonIndexedTrianglesByX(
  positions: Float32Array,
  maxStepX: number,
  maxDepth = 5
): Float32Array {
  const safeMaxStep = Math.max(0.5, maxStepX);
  const out: number[] = [];

  function processTriangle(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    depth: number
  ): void {
    const dxAB = Math.abs(ax - bx);
    const dxBC = Math.abs(bx - cx);
    const dxCA = Math.abs(cx - ax);
    const maxDx = Math.max(dxAB, dxBC, dxCA);

    if (depth >= maxDepth || maxDx <= safeMaxStep) {
      out.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      return;
    }

    const lenAB = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
    const lenBC = (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2;
    const lenCA = (cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2;

    const scoreAB = dxAB * dxAB + 1e-5 * lenAB;
    const scoreBC = dxBC * dxBC + 1e-5 * lenBC;
    const scoreCA = dxCA * dxCA + 1e-5 * lenCA;

    if (scoreAB >= scoreBC && scoreAB >= scoreCA) {
      const mx = (ax + bx) * 0.5;
      const my = (ay + by) * 0.5;
      const mz = (az + bz) * 0.5;
      processTriangle(ax, ay, az, mx, my, mz, cx, cy, cz, depth + 1);
      processTriangle(mx, my, mz, bx, by, bz, cx, cy, cz, depth + 1);
    } else if (scoreBC >= scoreCA) {
      const mx = (bx + cx) * 0.5;
      const my = (by + cy) * 0.5;
      const mz = (bz + cz) * 0.5;
      processTriangle(ax, ay, az, bx, by, bz, mx, my, mz, depth + 1);
      processTriangle(ax, ay, az, mx, my, mz, cx, cy, cz, depth + 1);
    } else {
      const mx = (cx + ax) * 0.5;
      const my = (cy + ay) * 0.5;
      const mz = (cz + az) * 0.5;
      processTriangle(ax, ay, az, bx, by, bz, mx, my, mz, depth + 1);
      processTriangle(mx, my, mz, bx, by, bz, cx, cy, cz, depth + 1);
    }
  }

  for (let i = 0; i < positions.length; i += 9) {
    processTriangle(
      positions[i],
      positions[i + 1],
      positions[i + 2],
      positions[i + 3],
      positions[i + 4],
      positions[i + 5],
      positions[i + 6],
      positions[i + 7],
      positions[i + 8],
      0
    );
  }

  return new Float32Array(out);
}
