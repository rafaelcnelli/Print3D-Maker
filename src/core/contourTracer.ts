import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

export interface BinaryMask2D {
  width: number;
  height: number;
  /** 1 = foreground solid, 0 = background empty (row-major, y = 0 is top row) */
  data: Uint8Array;
}

export interface TracedSvgPreset {
  id: 'paw' | 'crown' | 'star' | 'bolt';
  label: string;
  svg: string;
}

export const KEYCHAIN_SVG_PRESETS: TracedSvgPreset[] = [
  {
    id: 'paw',
    label: 'Patinha',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <ellipse cx="50" cy="64" rx="22" ry="18" fill="#111"/>
      <ellipse cx="22" cy="40" rx="9" ry="12" transform="rotate(-18 22 40)" fill="#111"/>
      <ellipse cx="41" cy="26" rx="9" ry="13" transform="rotate(-6 41 26)" fill="#111"/>
      <ellipse cx="59" cy="26" rx="9" ry="13" transform="rotate(6 59 26)" fill="#111"/>
      <ellipse cx="78" cy="40" rx="9" ry="12" transform="rotate(18 78 40)" fill="#111"/>
    </svg>`,
  },
  {
    id: 'crown',
    label: 'Coroa',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M12 76 L8 32 L32 52 L50 22 L68 52 L92 32 L88 76 Z" fill="#111"/>
      <rect x="12" y="80" width="76" height="9" rx="4" fill="#111"/>
      <circle cx="8" cy="27" r="5" fill="#111"/>
      <circle cx="50" cy="17" r="6" fill="#111"/>
      <circle cx="92" cy="27" r="5" fill="#111"/>
    </svg>`,
  },
  {
    id: 'star',
    label: 'Estrela',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <polygon points="50,8 62,36 93,38 69,58 77,89 50,72 23,89 31,58 7,38 38,36" fill="#111"/>
    </svg>`,
  },
  {
    id: 'bolt',
    label: 'Raio',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <polygon points="58,6 20,56 46,56 38,94 80,42 54,42" fill="#111"/>
    </svg>`,
  },
];

export function getPresetSvgById(id: TracedSvgPreset['id']): TracedSvgPreset {
  return KEYCHAIN_SVG_PRESETS.find((p) => p.id === id) ?? KEYCHAIN_SVG_PRESETS[0];
}

function parseSvgPrimitivesFallback(svgText: string): THREE.Shape[] {
  const shapes: THREE.Shape[] = [];

  const getAttr = (attrs: string, name: string): string | null => {
    const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attrs);
    return m ? m[1] : null;
  };

  const applyRotate = (pts: THREE.Vector2[], attrs: string): THREE.Vector2[] => {
    const tr = getAttr(attrs, 'transform');
    if (!tr) return pts;
    const m = /rotate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+)[\s,]+([-\d.]+))?\s*\)/i.exec(tr);
    if (!m) return pts;
    const rad = (Number(m[1]) * Math.PI) / 180;
    const cx = m[2] ? Number(m[2]) : 0;
    const cy = m[3] ? Number(m[3]) : 0;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return pts.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      return new THREE.Vector2(cx + dx * c - dy * s, cy + dx * s + dy * c);
    });
  };

  const tagRegex = /<(ellipse|circle|rect|polygon|path)\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(svgText)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    if (getAttr(attrs, 'fill') === 'none') continue;

    if (tag === 'ellipse' || tag === 'circle') {
      const cx = Number(getAttr(attrs, 'cx') ?? 0);
      const cy = Number(getAttr(attrs, 'cy') ?? 0);
      const rx = Number(getAttr(attrs, tag === 'circle' ? 'r' : 'rx') ?? 0);
      const ry = Number(getAttr(attrs, tag === 'circle' ? 'r' : 'ry') ?? rx);
      if (rx <= 0 || ry <= 0) continue;
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        pts.push(new THREE.Vector2(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
      }
      shapes.push(new THREE.Shape(applyRotate(pts, attrs)));
    } else if (tag === 'rect') {
      const x = Number(getAttr(attrs, 'x') ?? 0);
      const y = Number(getAttr(attrs, 'y') ?? 0);
      const w = Number(getAttr(attrs, 'width') ?? 0);
      const h = Number(getAttr(attrs, 'height') ?? 0);
      if (w <= 0 || h <= 0) continue;
      const pts = [
        new THREE.Vector2(x, y),
        new THREE.Vector2(x + w, y),
        new THREE.Vector2(x + w, y + h),
        new THREE.Vector2(x, y + h),
      ];
      shapes.push(new THREE.Shape(applyRotate(pts, attrs)));
    } else if (tag === 'polygon') {
      const raw = (getAttr(attrs, 'points') ?? '').trim();
      const nums = raw.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        pts.push(new THREE.Vector2(nums[i], nums[i + 1]));
      }
      if (pts.length >= 3) {
        shapes.push(new THREE.Shape(applyRotate(pts, attrs)));
      }
    } else if (tag === 'path') {
      const d = getAttr(attrs, 'd') ?? '';
      const tokens = d.match(/[MLZmlz]|-?\d*\.?\d+/g) ?? [];
      const pts: THREE.Vector2[] = [];
      let cmd = 'M';
      let i = 0;
      let cx = 0;
      let cy = 0;
      while (i < tokens.length) {
        const tk = tokens[i];
        if (/^[MLZmlz]$/.test(tk)) {
          cmd = tk;
          i++;
          if (cmd === 'Z' || cmd === 'z') {
            if (pts.length >= 3) {
              shapes.push(new THREE.Shape(applyRotate([...pts], attrs)));
            }
            pts.length = 0;
          }
          continue;
        }
        const x = Number(tokens[i]);
        const y = Number(tokens[i + 1]);
        i += 2;
        if (!Number.isFinite(x) || !Number.isFinite(y)) break;
        if (cmd === 'm' || cmd === 'l') {
          cx += x;
          cy += y;
        } else {
          cx = x;
          cy = y;
        }
        pts.push(new THREE.Vector2(cx, cy));
      }
      if (pts.length >= 3) {
        shapes.push(new THREE.Shape(applyRotate(pts, attrs)));
      }
    }
  }
  return shapes;
}

/**
 * Parses an SVG string into normalized centered THREE.Shape[] (Y-up, centered at 0,0)
 * scaled cleanly to fit inside [targetMaxWidth, targetMaxHeight].
 */
export function parseSvgStringToShapes(
  svgText: string,
  targetMaxWidth: number,
  targetMaxHeight: number
): { shapes: THREE.Shape[]; width: number; height: number } {
  const rawShapes: THREE.Shape[] = [];

  if (typeof DOMParser !== 'undefined') {
    const loader = new SVGLoader();
    const parsed = loader.parse(svgText);

    for (const path of parsed.paths) {
      // Skip explicit fill="none" invisible paths unless stroke-only SVG
      const style = path.userData?.style as Record<string, string> | undefined;
      if (style && style.fill === 'none' && style.stroke === 'none') continue;
      const shapes = path.toShapes();
      for (const sh of shapes) {
        rawShapes.push(sh);
      }
    }
  } else {
    rawShapes.push(...parseSvgPrimitivesFallback(svgText));
  }

  if (rawShapes.length === 0) {
    return { shapes: [], width: 0, height: 0 };
  }

  // Compute bounding box across all curves
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const sampledAll = rawShapes.map((sh) => ({
    outer: sh.getPoints(28),
    holes: sh.holes.map((h) => h.getPoints(20)),
  }));

  for (const item of sampledAll) {
    for (const p of item.outer) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }

  const rawW = Math.max(1e-3, maxX - minX);
  const rawH = Math.max(1e-3, maxY - minY);
  const scale = Math.min(targetMaxWidth / rawW, targetMaxHeight / rawH);
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;

  // Flip SVG Y-down -> CAD Y-up while preserving proper winding
  const normalized: THREE.Shape[] = [];
  for (const item of sampledAll) {
    const outerPts = item.outer.map(
      (p) => new THREE.Vector2((p.x - cx) * scale, -(p.y - cy) * scale)
    );
    if (THREE.ShapeUtils.isClockWise(outerPts)) {
      outerPts.reverse();
    }
    const sh = new THREE.Shape(outerPts);
    for (const hole of item.holes) {
      const hPts = hole.map(
        (p) => new THREE.Vector2((p.x - cx) * scale, -(p.y - cy) * scale)
      );
      if (!THREE.ShapeUtils.isClockWise(hPts)) {
        hPts.reverse();
      }
      sh.holes.push(new THREE.Path(hPts));
    }
    normalized.push(sh);
  }

  return {
    shapes: normalized,
    width: rawW * scale,
    height: rawH * scale,
  };
}

/**
 * Exact 1D squared Euclidean distance transform (Felzenszwalb & Huttenlocher, O(n)).
 */
function edt1D(f: Float32Array, n: number, out: Float32Array, v: Int32Array, z: Float32Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -1e18;
  z[1] = 1e18;

  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e18;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const d = q - v[k];
    out[q] = d * d + f[v[k]];
  }
}

/**
 * Computes exact 2D squared Euclidean distance to the nearest foreground pixel (`data[i] === 1`).
 */
export function computeSquaredDistanceField(mask: BinaryMask2D): Float32Array {
  const { width: w, height: h, data } = mask;
  const INF = 1e12;
  const temp = new Float32Array(w * h);
  const out = new Float32Array(w * h);

  const maxDim = Math.max(w, h);
  const fBuf = new Float32Array(maxDim);
  const dBuf = new Float32Array(maxDim);
  const vBuf = new Int32Array(maxDim);
  const zBuf = new Float32Array(maxDim + 1);

  // Column pass
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      fBuf[y] = data[y * w + x] ? 0 : INF;
    }
    edt1D(fBuf, h, dBuf, vBuf, zBuf);
    for (let y = 0; y < h; y++) {
      temp[y * w + x] = dBuf[y];
    }
  }

  // Row pass
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      fBuf[x] = temp[rowOff + x];
    }
    edt1D(fBuf, w, dBuf, vBuf, zBuf);
    for (let x = 0; x < w; x++) {
      out[rowOff + x] = dBuf[x];
    }
  }

  return out;
}

/**
 * Dilates a binary mask by an exact circular radius (in pixels), producing silky-smooth
 * rounded outer borders around ANY arbitrary shape with zero self-intersections!
 */
export function dilateMaskByRadius(mask: BinaryMask2D, radiusPx: number): BinaryMask2D {
  if (radiusPx <= 0.01) {
    return { width: mask.width, height: mask.height, data: new Uint8Array(mask.data) };
  }
  const sqDist = computeSquaredDistanceField(mask);
  const r2 = radiusPx * radiusPx;
  const out = new Uint8Array(mask.width * mask.height);
  for (let i = 0; i < sqDist.length; i++) {
    out[i] = sqDist[i] <= r2 ? 1 : 0;
  }
  return { width: mask.width, height: mask.height, data: out };
}

/**
 * Pure scanline rasterizer for THREE.Shape[] -> BinaryMask2D (works in Node & browser!).
 */
export function rasterizeShapesToMask(
  shapes: THREE.Shape[],
  pixelSizeMm: number,
  padMm: number
): { mask: BinaryMask2D; minX: number; maxY: number; pixelSizeMm: number } {
  const polys = shapes.map((sh) => ({
    outer: sh.getPoints(24),
    holes: sh.holes.map((h) => h.getPoints(18)),
  }));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const poly of polys) {
    for (const p of poly.outer) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!Number.isFinite(minX)) {
    return {
      mask: { width: 4, height: 4, data: new Uint8Array(16) },
      minX: 0,
      maxY: 0,
      pixelSizeMm,
    };
  }

  const originX = minX - padMm;
  const originTopY = maxY + padMm;
  const spanX = maxX - minX + padMm * 2;
  const spanY = maxY - minY + padMm * 2;

  const w = Math.max(8, Math.ceil(spanX / pixelSizeMm) + 2);
  const h = Math.max(8, Math.ceil(spanY / pixelSizeMm) + 2);
  const data = new Uint8Array(w * h);

  // Collect all rings (outer + holes) — even-odd scanline rule handles nested holes automatically!
  const allRings: THREE.Vector2[][] = [];
  for (const poly of polys) {
    if (poly.outer.length >= 3) allRings.push(poly.outer);
    for (const hole of poly.holes) {
      if (hole.length >= 3) allRings.push(hole);
    }
  }

  const intersections: number[] = [];

  for (let row = 0; row < h; row++) {
    const wy = originTopY - (row + 0.5) * pixelSizeMm;
    intersections.length = 0;

    for (const ring of allRings) {
      const n = ring.length;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = ring[i].y;
        const yj = ring[j].y;
        if ((yi <= wy && yj > wy) || (yj <= wy && yi > wy)) {
          const t = (wy - yi) / (yj - yi);
          intersections.push(ring[i].x + t * (ring[j].x - ring[i].x));
        }
      }
    }

    if (intersections.length < 2) continue;
    intersections.sort((a, b) => a - b);

    const rowOff = row * w;
    for (let k = 0; k + 1 < intersections.length; k += 2) {
      const xStart = Math.max(0, Math.floor((intersections[k] - originX) / pixelSizeMm));
      const xEnd = Math.min(w - 1, Math.ceil((intersections[k + 1] - originX) / pixelSizeMm));
      for (let col = xStart; col <= xEnd; col++) {
        data[rowOff + col] = 1;
      }
    }
  }

  return { mask: { width: w, height: h, data }, minX: originX, maxY: originTopY, pixelSizeMm };
}

function chaikinSmoothClosed(pts: [number, number][], iterations = 2): [number, number][] {
  let current = pts;
  for (let it = 0; it < iterations; it++) {
    if (current.length < 3) break;
    const next: [number, number][] = [];
    const n = current.length;
    for (let i = 0; i < n; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % n];
      next.push([p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25]);
      next.push([p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75]);
    }
    current = next;
  }
  return current;
}

function simplifyClosedRDPStep(
  pts: [number, number][],
  eps: number
): [number, number][] {
  if (pts.length <= 4) return pts;

  const rdp = (arr: [number, number][]): [number, number][] => {
    if (arr.length <= 2) return arr;
    const a = arr[0];
    const b = arr[arr.length - 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;

    let maxD = -1;
    let maxIdx = 0;
    for (let i = 1; i < arr.length - 1; i++) {
      const px = arr[i][0] - a[0];
      const py = arr[i][1] - a[1];
      let d: number;
      if (len2 < 1e-9) {
        d = Math.hypot(px, py);
      } else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        d = Math.hypot(px - t * dx, py - t * dy);
      }
      if (d > maxD) {
        maxD = d;
        maxIdx = i;
      }
    }

    if (maxD > eps) {
      const left = rdp(arr.slice(0, maxIdx + 1));
      const right = rdp(arr.slice(maxIdx));
      return [...left.slice(0, -1), ...right];
    }
    return [a, b];
  };

  // Split closed loop at farthest pair of points so RDP preserves smooth closed shapes
  const half = Math.floor(pts.length / 2);
  const part1 = rdp(pts.slice(0, half + 1));
  const part2 = rdp([...pts.slice(half), pts[0]]);
  const merged = [...part1.slice(0, -1), ...part2.slice(0, -1)];
  return merged.length >= 3 ? merged : pts;
}

function signedArea2D(pts: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return a * 0.5;
}

function pointInPolygon(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Extracts crisp, smooth, closed outer THREE.Shape[] + nested holes from a BinaryMask2D
 * using Marching Squares + Chaikin smoothing + RDP simplification + nesting classification.
 *
 * Output coordinates are mapped into CAD Y-up space:
 *   worldX = originX + col * pixelSizeMm
 *   worldY = originTopY - row * pixelSizeMm
 */
export function extractShapesFromMask(
  mask: BinaryMask2D,
  originX: number,
  originTopY: number,
  pixelSizeMm: number,
  minAreaMm2 = 1.2,
  smoothIterations = 2
): THREE.Shape[] {
  const { width: w, height: h, data } = mask;

  // Pad mask by 1 empty pixel on every border so contours touching edges always close cleanly
  const pw = w + 2;
  const ph = h + 2;
  const padded = new Uint8Array(pw * ph);
  for (let y = 0; y < h; y++) {
    padded.set(data.subarray(y * w, (y + 1) * w), (y + 1) * pw + 1);
  }

  // Marching squares cell edges mapped by quantized midpoint keys
  // Edge midpoints:
  //   0 (top):    (x + 0.5, y)
  //   1 (right):  (x + 1,   y + 0.5)
  //   2 (bottom): (x + 0.5, y + 1)
  //   3 (left):   (x,       y + 0.5)
  // Using consistent orientation so foreground is always on the LEFT of directed segment!
  const CASE_SEGMENTS: Record<number, [number, number][]> = {
    1: [[3, 2]],
    2: [[2, 1]],
    3: [[3, 1]],
    4: [[1, 0]],
    5: [[3, 0], [1, 2]],
    6: [[2, 0]],
    7: [[3, 0]],
    8: [[0, 3]],
    9: [[0, 2]],
    10: [[0, 1], [2, 3]],
    11: [[0, 1]],
    12: [[1, 3]],
    13: [[1, 2]],
    14: [[2, 3]],
  };

  const nextEdge = new Map<string, { toKey: string; x: number; y: number }>();
  const keyCoords = new Map<string, [number, number]>();

  const edgeCoord = (cx: number, cy: number, edge: number): [number, number] => {
    switch (edge) {
      case 0: return [cx * 2 + 1, cy * 2];
      case 1: return [cx * 2 + 2, cy * 2 + 1];
      case 2: return [cx * 2 + 1, cy * 2 + 2];
      default: return [cx * 2, cy * 2 + 1];
    }
  };

  for (let y = 0; y < ph - 1; y++) {
    const r0 = y * pw;
    const r1 = (y + 1) * pw;
    for (let x = 0; x < pw - 1; x++) {
      const tl = padded[r0 + x];
      const tr = padded[r0 + x + 1];
      const br = padded[r1 + x + 1];
      const bl = padded[r1 + x];
      const idx = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (idx === 0 || idx === 15) continue;

      const segs = CASE_SEGMENTS[idx];
      if (!segs) continue;
      for (const [eFrom, eTo] of segs) {
        const [fx, fy] = edgeCoord(x, y, eFrom);
        const [tx, ty] = edgeCoord(x, y, eTo);
        const fKey = `${fx},${fy}`;
        const tKey = `${tx},${ty}`;
        keyCoords.set(fKey, [fx * 0.5 - 1, fy * 0.5 - 1]);
        keyCoords.set(tKey, [tx * 0.5 - 1, ty * 0.5 - 1]);
        nextEdge.set(fKey, { toKey: tKey, x: tx * 0.5 - 1, y: ty * 0.5 - 1 });
      }
    }
  }

  // Trace closed loops
  const visited = new Set<string>();
  const loops: { pts: [number, number][]; absArea: number; depth: number }[] = [];

  for (const startKey of nextEdge.keys()) {
    if (visited.has(startKey)) continue;
    const rawPts: [number, number][] = [];
    let cur: string | undefined = startKey;
    let guard = 0;

    while (cur && !visited.has(cur) && guard < 100000) {
      visited.add(cur);
      const c = keyCoords.get(cur);
      if (c) {
        rawPts.push([originX + c[0] * pixelSizeMm, originTopY - c[1] * pixelSizeMm]);
      }
      cur = nextEdge.get(cur)?.toKey;
      guard++;
    }

    if (rawPts.length < 4) continue;

    // Smooth then simplify gently so curves stay round without staircase noise
    const smoothed = smoothIterations > 0 ? chaikinSmoothClosed(rawPts, smoothIterations) : rawPts;
    const simplified = simplifyClosedRDPStep(smoothed, pixelSizeMm * 0.35);
    if (simplified.length < 3) continue;

    const absArea = Math.abs(signedArea2D(simplified));
    if (absArea < minAreaMm2) continue;
    loops.push({ pts: simplified, absArea, depth: 0 });
  }

  if (loops.length === 0) return [];

  // Sort largest area first and compute containment depth (even = outer solid, odd = hole)
  loops.sort((a, b) => b.absArea - a.absArea);
  const parentIdx = new Int32Array(loops.length).fill(-1);

  for (let i = 0; i < loops.length; i++) {
    const samplePt = loops[i].pts[0];
    let depth = 0;
    let directParent = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (pointInPolygon(samplePt[0], samplePt[1], loops[j].pts)) {
        depth++;
        if (directParent === -1) directParent = j;
      }
    }
    loops[i].depth = depth;
    parentIdx[i] = directParent;
  }

  const shapeByLoopIdx = new Map<number, THREE.Shape>();
  const shapes: THREE.Shape[] = [];

  for (let i = 0; i < loops.length; i++) {
    if (loops[i].depth % 2 === 0) {
      const pts = loops[i].pts.slice();
      // Ensure CCW winding for outer shape
      if (signedArea2D(pts) < 0) pts.reverse();
      const vecs = pts.map(([x, y]) => new THREE.Vector2(x, y));
      const sh = new THREE.Shape(vecs);
      shapeByLoopIdx.set(i, sh);
      shapes.push(sh);
    }
  }

  for (let i = 0; i < loops.length; i++) {
    if (loops[i].depth % 2 === 1) {
      const pIdx = parentIdx[i];
      const parentShape = shapeByLoopIdx.get(pIdx);
      if (!parentShape) continue;
      const pts = loops[i].pts.slice();
      // Ensure CW winding for holes
      if (signedArea2D(pts) > 0) pts.reverse();
      const vecs = pts.map(([x, y]) => new THREE.Vector2(x, y));
      parentShape.holes.push(new THREE.Path(vecs));
    }
  }

  return shapes;
}

/**
 * Dilates any THREE.Shape[] by an exact rounded radius in mm using 2D Euclidean SDF
 * + Marching Squares extraction. Produces guaranteed self-intersection-free rounded
 * outer walls for Box Letters ("Letra Caixa") and SVG/Image Keychain bases!
 */
export function dilateShapesWithSDF(
  shapes: THREE.Shape[],
  borderMm: number,
  pixelSizeMm = 0.45
): THREE.Shape[] {
  if (shapes.length === 0) return [];
  const safeBorder = Math.max(0.2, borderMm);
  const { mask, minX, maxY } = rasterizeShapesToMask(
    shapes,
    pixelSizeMm,
    safeBorder + pixelSizeMm * 4
  );
  const dilated = dilateMaskByRadius(mask, safeBorder / pixelSizeMm);
  return extractShapesFromMask(dilated, minX, maxY, pixelSizeMm, 1.5, 2);
}

/**
 * Converts a browser-loaded image (PNG/JPG/WebP) into a clean BinaryMask2D using
 * alpha transparency (when present) or luminance threshold + optional inversion.
 */
export function extractMaskFromImagePixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 140,
  invert = false
): BinaryMask2D {
  const total = width * height;
  let transparentCount = 0;
  for (let i = 0; i < total; i++) {
    if (rgba[i * 4 + 3] < 200) transparentCount++;
  }
  // If image has meaningful transparency (> 5% transparent pixels), use alpha silhouette!
  const useAlpha = transparentCount > total * 0.05;
  const data = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];

    let solid: boolean;
    if (useAlpha) {
      solid = a >= threshold;
    } else {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // Default: dark ink/logo on light background is foreground
      solid = lum <= threshold;
    }

    data[i] = (invert ? !solid : solid) ? 1 : 0;
  }

  return { width, height, data };
}

/**
 * Normalizes a BinaryMask2D into centered CAD shapes fitting inside [targetW, targetH].
 */
export function maskToCenteredShapes(
  mask: BinaryMask2D,
  targetMaxWidth: number,
  targetMaxHeight: number
): { shapes: THREE.Shape[]; width: number; height: number } {
  const { width: w, height: h, data } = mask;
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    const off = y * w;
    for (let x = 0; x < w; x++) {
      if (data[off + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { shapes: [], width: 0, height: 0 };
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const pixelSizeMm = Math.min(targetMaxWidth / cropW, targetMaxHeight / cropH);
  const realW = cropW * pixelSizeMm;
  const realH = cropH * pixelSizeMm;

  const cropped = new Uint8Array(cropW * cropH);
  for (let y = 0; y < cropH; y++) {
    cropped.set(
      data.subarray((minY + y) * w + minX, (minY + y) * w + minX + cropW),
      y * cropW
    );
  }

  const shapes = extractShapesFromMask(
    { width: cropW, height: cropH, data: cropped },
    -realW * 0.5,
    realH * 0.5,
    pixelSizeMm,
    Math.max(0.8, realW * realH * 0.0015),
    2
  );

  return { shapes, width: realW, height: realH };
}
