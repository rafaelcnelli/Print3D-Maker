import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import type { ImageTraceMode } from '../types/project';

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
 * + sub-pixel Marching Squares extraction. Produces guaranteed self-intersection-free,
 * silky-smooth rounded outer walls for Box Letters ("Letra Caixa") and SVG/Image Keychain bases!
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
  const sqDist = computeSquaredDistanceField(mask);
  const radiusPx = safeBorder / pixelSizeMm;
  const sdfField = new Float32Array(sqDist.length);
  for (let i = 0; i < sqDist.length; i++) {
    // Positive inside dilated silhouette, negative outside, 0 on exact circular offset boundary
    sdfField[i] = radiusPx - Math.sqrt(sqDist[i]);
  }
  return extractShapesFromScalarField(
    sdfField,
    mask.width,
    mask.height,
    0,
    minX,
    maxY,
    pixelSizeMm,
    1.5,
    2
  );
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

export interface ImageVectorizeOptions {
  /** Threshold 15..240 (higher = captures more mid-tones in luminance mode, or stricter alpha) */
  threshold: number;
  invert: boolean;
  traceMode: ImageTraceMode;
  /** 0 = crisp pixels/corners, 1 = light smoothing, 2 = smooth curves (default), 3 = extra silky */
  smoothness: number;
  /** 0..4 removes tiny speckles / dust / JPEG artifacts */
  despeckle: number;
}

export interface ImageVectorizeResult {
  shapes: THREE.Shape[];
  width: number;
  height: number;
  shapeCount: number;
  holeCount: number;
  detectedMode: 'alpha' | 'luminance';
  suggestedThreshold: number;
}

export interface SvgPreviewData {
  viewBox: string;
  pathData: string;
  borderPathData: string;
  widthMm: number;
  heightMm: number;
}

function resolveTraceMode(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  traceMode: ImageTraceMode
): 'alpha' | 'luminance' {
  if (traceMode === 'alpha' || traceMode === 'luminance') return traceMode;
  const total = width * height;
  if (total === 0) return 'luminance';
  let transparentCount = 0;
  let opaqueCount = 0;
  for (let i = 0; i < total; i++) {
    const a = rgba[i * 4 + 3];
    if (a < 200) transparentCount++;
    if (a >= 200) opaqueCount++;
  }
  return transparentCount > total * 0.03 && opaqueCount > total * 0.01
    ? 'alpha'
    : 'luminance';
}

/**
 * Computes an optimal Otsu threshold (clamped to 25..230) on the image's alpha or
 * luminance histogram so uploaded logos/photos start with crisp separation out of the box.
 */
export function computeAutoThreshold(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  traceMode: ImageTraceMode = 'auto'
): { threshold: number; detectedMode: 'alpha' | 'luminance' } {
  const mode = resolveTraceMode(rgba, width, height, traceMode);
  const total = width * height;
  if (total === 0) return { threshold: 140, detectedMode: mode };

  const hist = new Uint32Array(256);
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    let val: number;
    if (mode === 'alpha') {
      val = rgba[idx + 3];
    } else {
      const a = rgba[idx + 3] / 255;
      // Composite transparent pixels over white for clean luminance analysis
      const r = rgba[idx] * a + 255 * (1 - a);
      const g = rgba[idx + 1] * a + 255 * (1 - a);
      const b = rgba[idx + 2] * a + 255 * (1 - a);
      val = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    hist[Math.max(0, Math.min(255, val))]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let bestT = mode === 'alpha' ? 128 : 145;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const diff = mB - mF;
    const betweenVar = wB * wF * diff * diff;
    if (betweenVar > maxVar) {
      maxVar = betweenVar;
      bestT = t;
    }
  }

  const clamped = Math.max(25, Math.min(230, bestT));
  return { threshold: clamped, detectedMode: mode };
}

/**
 * Separable 3x3 Gaussian blur [1, 2, 1] / 4 on a Float32Array scalar field.
 * Gently softens staircased pixel edges so sub-pixel Marching Squares yields smooth arcs.
 */
function gaussianBlur3x3(src: Float32Array, w: number, h: number, passes: number): Float32Array {
  let cur = src;
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(w * h);
    const dst = new Float32Array(w * h);

    // Horizontal pass
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const xm = x > 0 ? x - 1 : 0;
        const xp = x < w - 1 ? x + 1 : w - 1;
        tmp[row + x] = (cur[row + xm] + 2 * cur[row + x] + cur[row + xp]) * 0.25;
      }
    }

    // Vertical pass
    for (let y = 0; y < h; y++) {
      const ym = (y > 0 ? y - 1 : 0) * w;
      const y0 = y * w;
      const yp = (y < h - 1 ? y + 1 : h - 1) * w;
      for (let x = 0; x < w; x++) {
        dst[y0 + x] = (tmp[ym + x] + 2 * tmp[y0 + x] + tmp[yp + x]) * 0.25;
      }
    }
    cur = dst;
  }
  return cur;
}

/**
 * 3x3 median filter on a Float32Array scalar field to kill 1px salt-and-pepper noise
 * while preserving crisp edges.
 */
function medianFilter3x3(src: Float32Array, w: number, h: number): Float32Array {
  const dst = new Float32Array(w * h);
  const win = new Float32Array(9);

  for (let y = 0; y < h; y++) {
    const ym = y > 0 ? y - 1 : 0;
    const yp = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const xm = x > 0 ? x - 1 : 0;
      const xp = x < w - 1 ? x + 1 : w - 1;

      win[0] = src[ym * w + xm];
      win[1] = src[ym * w + x];
      win[2] = src[ym * w + xp];
      win[3] = src[y * w + xm];
      win[4] = src[y * w + x];
      win[5] = src[y * w + xp];
      win[6] = src[yp * w + xm];
      win[7] = src[yp * w + x];
      win[8] = src[yp * w + xp];
      win.sort();
      dst[y * w + x] = win[4];
    }
  }
  return dst;
}

/**
 * Corner-preserving Chaikin subdivision for closed contours:
 * Keeps sharp corners (turning angle > ~54 deg) crisp while smoothly rounding curves.
 */
function chaikinSmoothCornerPreserving(
  pts: [number, number][],
  iterations: number
): [number, number][] {
  let current = pts;
  const cornerDotThreshold = 0.58; // cos(54.5 deg)

  for (let it = 0; it < iterations; it++) {
    const n = current.length;
    if (n < 3) break;

    const isCorner = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const prev = current[(i - 1 + n) % n];
      const curr = current[i];
      const next = current[(i + 1) % n];
      const v1x = curr[0] - prev[0];
      const v1y = curr[1] - prev[1];
      const v2x = next[0] - curr[0];
      const v2y = next[1] - curr[1];
      const l1 = Math.hypot(v1x, v1y);
      const l2 = Math.hypot(v2x, v2y);
      if (l1 > 1e-6 && l2 > 1e-6) {
        const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
        if (dot < cornerDotThreshold) {
          isCorner[i] = 1;
        }
      }
    }

    const nextPts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % n];
      if (isCorner[i]) {
        nextPts.push([p0[0], p0[1]]);
        if (!isCorner[(i + 1) % n]) {
          nextPts.push([p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75]);
        }
      } else if (isCorner[(i + 1) % n]) {
        nextPts.push([p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25]);
      } else {
        nextPts.push([p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25]);
        nextPts.push([p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75]);
      }
    }
    current = nextPts;
  }

  return current;
}

/**
 * Extracts smooth, sub-pixel accurate THREE.Shape[] + nested holes from a continuous
 * scalar field using interpolated Marching Squares + asymptotic saddle decider +
 * corner-preserving smoothing + adaptive RDP simplification.
 */
function extractShapesFromScalarField(
  field: Float32Array,
  w: number,
  h: number,
  iso: number,
  originX: number,
  originTopY: number,
  pixelSizeMm: number,
  minAreaMm2: number,
  smoothness: number
): THREE.Shape[] {
  // Pad by 1 background pixel strictly below iso on all sides so contours touching edges always close cleanly
  const pw = w + 2;
  const ph = h + 2;
  const padded = new Float32Array(pw * ph);
  padded.fill(iso - 1000);
  for (let y = 0; y < h; y++) {
    padded.set(field.subarray(y * w, (y + 1) * w), (y + 1) * pw + 1);
  }

  // Canonical grid-edge key: horizontal edges 'H:x,y' and vertical edges 'V:x,y'
  // Guarantees adjacent cells share exact topological keys while storing sub-pixel coords!
  const nextEdge = new Map<string, string>();
  const keyCoords = new Map<string, [number, number]>();

  const interpT = (v0: number, v1: number): number => {
    const denom = v1 - v0;
    if (Math.abs(denom) < 1e-6) return 0.5;
    return Math.max(0.02, Math.min(0.98, (iso - v0) / denom));
  };

  const getEdgeVertex = (
    cx: number,
    cy: number,
    edge: number,
    tl: number,
    tr: number,
    br: number,
    bl: number
  ): string => {
    let key: string;
    let px: number;
    let py: number;

    switch (edge) {
      case 0: {
        // top horizontal edge (cx, cy) -> (cx+1, cy)
        key = `H:${cx},${cy}`;
        const t = interpT(tl, tr);
        px = cx + t - 1;
        py = cy - 1;
        break;
      }
      case 1: {
        // right vertical edge (cx+1, cy) -> (cx+1, cy+1)
        key = `V:${cx + 1},${cy}`;
        const t = interpT(tr, br);
        px = cx + 1 - 1;
        py = cy + t - 1;
        break;
      }
      case 2: {
        // bottom horizontal edge (cx, cy+1) -> (cx+1, cy+1)
        key = `H:${cx},${cy + 1}`;
        const t = interpT(bl, br);
        px = cx + t - 1;
        py = cy + 1 - 1;
        break;
      }
      default: {
        // left vertical edge (cx, cy) -> (cx, cy+1)
        key = `V:${cx},${cy}`;
        const t = interpT(tl, bl);
        px = cx - 1;
        py = cy + t - 1;
        break;
      }
    }

    if (!keyCoords.has(key)) {
      keyCoords.set(key, [px, py]);
    }
    return key;
  };

  const BASE_CASES: Record<number, [number, number][]> = {
    1: [[3, 2]],
    2: [[2, 1]],
    3: [[3, 1]],
    4: [[1, 0]],
    6: [[2, 0]],
    7: [[3, 0]],
    8: [[0, 3]],
    9: [[0, 2]],
    11: [[0, 1]],
    12: [[1, 3]],
    13: [[1, 2]],
    14: [[2, 3]],
  };

  for (let y = 0; y < ph - 1; y++) {
    const r0 = y * pw;
    const r1 = (y + 1) * pw;
    for (let x = 0; x < pw - 1; x++) {
      const tl = padded[r0 + x];
      const tr = padded[r0 + x + 1];
      const br = padded[r1 + x + 1];
      const bl = padded[r1 + x];

      const idx =
        (tl >= iso ? 8 : 0) |
        (tr >= iso ? 4 : 0) |
        (br >= iso ? 2 : 0) |
        (bl >= iso ? 1 : 0);

      if (idx === 0 || idx === 15) continue;

      let segs: [number, number][];
      if (idx === 5) {
        // Saddle: tr & bl are solid. Use asymptotic center average to resolve connectivity.
        const center = (tl + tr + br + bl) * 0.25;
        segs = center >= iso ? [[3, 0], [1, 2]] : [[3, 2], [1, 0]];
      } else if (idx === 10) {
        // Saddle: tl & br are solid.
        const center = (tl + tr + br + bl) * 0.25;
        segs = center >= iso ? [[0, 1], [2, 3]] : [[0, 3], [2, 1]];
      } else {
        segs = BASE_CASES[idx];
      }

      for (const [eFrom, eTo] of segs) {
        const fKey = getEdgeVertex(x, y, eFrom, tl, tr, br, bl);
        const tKey = getEdgeVertex(x, y, eTo, tl, tr, br, bl);
        nextEdge.set(fKey, tKey);
      }
    }
  }

  // Trace closed contour loops
  const visited = new Set<string>();
  const loops: { pts: [number, number][]; absArea: number; depth: number }[] = [];
  const smoothIters = Math.max(0, Math.min(3, Math.round(smoothness)));
  const rdpTolerance = pixelSizeMm * (0.14 + smoothIters * 0.055);

  for (const startKey of nextEdge.keys()) {
    if (visited.has(startKey)) continue;
    const rawPts: [number, number][] = [];
    let cur: string | undefined = startKey;
    let guard = 0;

    while (cur && !visited.has(cur) && guard < 200000) {
      visited.add(cur);
      const c = keyCoords.get(cur);
      if (c) {
        rawPts.push([originX + c[0] * pixelSizeMm, originTopY - c[1] * pixelSizeMm]);
      }
      cur = nextEdge.get(cur);
      guard++;
    }

    if (rawPts.length < 4) continue;

    const smoothed =
      smoothIters > 0 ? chaikinSmoothCornerPreserving(rawPts, smoothIters) : rawPts;
    const simplified = simplifyClosedRDPStep(smoothed, rdpTolerance);
    if (simplified.length < 3) continue;

    const absArea = Math.abs(signedArea2D(simplified));
    if (absArea < minAreaMm2) continue;
    loops.push({ pts: simplified, absArea, depth: 0 });
  }

  if (loops.length === 0) return [];

  // Sort largest area first and classify even-odd nesting (outer solid vs inner hole)
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
      if (signedArea2D(pts) < 0) pts.reverse();
      const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
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
      if (signedArea2D(pts) > 0) pts.reverse();
      parentShape.holes.push(new THREE.Path(pts.map(([x, y]) => new THREE.Vector2(x, y))));
    }
  }

  return shapes;
}

/**
 * High-quality raster image vectorizer:
 * 1. Continuous scalar field extraction (alpha or luminance composite over white)
 * 2. Optional 3x3 median despeckling + separable Gaussian anti-alias pre-smoothing
 * 3. Tight bounding-box crop with 1px halo so sub-pixel edge gradients remain intact
 * 4. Sub-pixel interpolated Marching Squares + corner-preserving smoothing
 */
export function vectorizeImagePixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  targetMaxWidth: number,
  targetMaxHeight: number,
  options: Partial<ImageVectorizeOptions> = {}
): ImageVectorizeResult {
  const traceMode = options.traceMode ?? 'auto';
  const invert = options.invert ?? false;
  const smoothness = Math.max(0, Math.min(3, options.smoothness ?? 2));
  const despeckle = Math.max(0, Math.min(4, options.despeckle ?? 1));

  const auto = computeAutoThreshold(rgba, width, height, traceMode);
  const detectedMode = auto.detectedMode;
  const threshold = Math.max(15, Math.min(240, options.threshold ?? auto.threshold));

  const total = width * height;
  if (total === 0) {
    return {
      shapes: [],
      width: 0,
      height: 0,
      shapeCount: 0,
      holeCount: 0,
      detectedMode,
      suggestedThreshold: auto.threshold,
    };
  }

  // Build continuous foregroundness scalar field where field[i] >= iso means SOLID
  let field: Float32Array = new Float32Array(total);
  let iso: number;

  if (detectedMode === 'alpha') {
    if (!invert) {
      for (let i = 0; i < total; i++) field[i] = rgba[i * 4 + 3];
      iso = threshold;
    } else {
      for (let i = 0; i < total; i++) field[i] = 255 - rgba[i * 4 + 3];
      iso = 255 - threshold;
    }
  } else {
    if (!invert) {
      for (let i = 0; i < total; i++) {
        const idx = i * 4;
        const a = rgba[idx + 3] / 255;
        const r = rgba[idx] * a + 255 * (1 - a);
        const g = rgba[idx + 1] * a + 255 * (1 - a);
        const b = rgba[idx + 2] * a + 255 * (1 - a);
        field[i] = 255 - (0.299 * r + 0.587 * g + 0.114 * b);
      }
      iso = 255 - threshold;
    } else {
      for (let i = 0; i < total; i++) {
        const idx = i * 4;
        const a = rgba[idx + 3] / 255;
        const r = rgba[idx] * a;
        const g = rgba[idx + 1] * a;
        const b = rgba[idx + 2] * a;
        field[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      }
      iso = threshold;
    }
  }

  // Noise suppression (median kills isolated speckles cleanly without shrinking curves)
  if (despeckle >= 2) {
    field = medianFilter3x3(field, width, height);
  }
  if (despeckle >= 4) {
    field = medianFilter3x3(field, width, height);
  }

  // Pre-smoothing turns harsh staircased pixel edges into smooth sub-pixel gradients
  const blurPasses = smoothness >= 3 ? 2 : smoothness >= 1 ? 1 : 0;
  if (blurPasses > 0) {
    field = gaussianBlur3x3(field, width, height, blurPasses);
  }

  // Locate tight foreground bounding box
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const off = y * width;
    for (let x = 0; x < width; x++) {
      if (field[off + x] >= iso) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      shapes: [],
      width: 0,
      height: 0,
      shapeCount: 0,
      holeCount: 0,
      detectedMode,
      suggestedThreshold: auto.threshold,
    };
  }

  // Expand crop by 1px halo (clamped) so sub-pixel gradient around border is preserved
  const cMinX = Math.max(0, minX - 1);
  const cMaxX = Math.min(width - 1, maxX + 1);
  const cMinY = Math.max(0, minY - 1);
  const cMaxY = Math.min(height - 1, maxY + 1);

  const cropW = cMaxX - cMinX + 1;
  const cropH = cMaxY - cMinY + 1;
  const solidSpanW = Math.max(1, maxX - minX + 1);
  const solidSpanH = Math.max(1, maxY - minY + 1);

  const pixelSizeMm = Math.min(targetMaxWidth / solidSpanW, targetMaxHeight / solidSpanH);
  const realW = cropW * pixelSizeMm;
  const realH = cropH * pixelSizeMm;

  const cropped = new Float32Array(cropW * cropH);
  for (let y = 0; y < cropH; y++) {
    cropped.set(
      field.subarray((cMinY + y) * width + cMinX, (cMinY + y) * width + cMinX + cropW),
      y * cropW
    );
  }

  // Area filter scales cleanly with despeckle setting (0 = keep tiny detail, 4 = aggressive cleanup)
  const baseMinArea = realW * realH * (0.00018 + despeckle * despeckle * 0.00045);
  const minAreaMm2 = Math.max(0.18, baseMinArea);

  const shapes = extractShapesFromScalarField(
    cropped,
    cropW,
    cropH,
    iso,
    -realW * 0.5,
    realH * 0.5,
    pixelSizeMm,
    minAreaMm2,
    smoothness
  );

  let holeCount = 0;
  for (const sh of shapes) holeCount += sh.holes.length;

  return {
    shapes,
    width: solidSpanW * pixelSizeMm,
    height: solidSpanH * pixelSizeMm,
    shapeCount: shapes.length,
    holeCount,
    detectedMode,
    suggestedThreshold: auto.threshold,
  };
}

/**
 * Converts CAD Y-up THREE.Shape[] into an exact SVG path string (`fill-rule="evenodd"`)
 * for crisp 1:1 vector preview inside the pre-approval modal.
 */
export function shapesToSvgPreview(
  shapes: THREE.Shape[],
  widthMm: number,
  heightMm: number,
  borderMm = 0
): SvgPreviewData {
  const serializeShapes = (list: THREE.Shape[]): string => {
    const parts: string[] = [];
    for (const sh of list) {
      const outer = sh.getPoints(16);
      if (outer.length >= 3) {
        parts.push(
          `M ${outer[0].x.toFixed(2)} ${(-outer[0].y).toFixed(2)} ` +
            outer
              .slice(1)
              .map((p) => `L ${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`)
              .join(' ') +
            ' Z'
        );
      }
      for (const hole of sh.holes) {
        const hPts = hole.getPoints(12);
        if (hPts.length >= 3) {
          parts.push(
            `M ${hPts[0].x.toFixed(2)} ${(-hPts[0].y).toFixed(2)} ` +
              hPts
                .slice(1)
                .map((p) => `L ${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`)
                .join(' ') +
              ' Z'
          );
        }
      }
    }
    return parts.join(' ');
  };

  const pathData = serializeShapes(shapes);
  let borderPathData = '';
  if (borderMm > 0.2 && shapes.length > 0) {
    const dilated = dilateShapesWithSDF(shapes, borderMm, Math.max(0.4, Math.max(widthMm, heightMm) / 140));
    borderPathData = serializeShapes(dilated);
  }

  const pad = Math.max(4, borderMm + 3);
  const halfW = Math.max(12, widthMm * 0.5) + pad;
  const halfH = Math.max(12, heightMm * 0.5) + pad;

  return {
    viewBox: `${(-halfW).toFixed(2)} ${(-halfH).toFixed(2)} ${(halfW * 2).toFixed(2)} ${(halfH * 2).toFixed(2)}`,
    pathData,
    borderPathData,
    widthMm,
    heightMm,
  };
}

