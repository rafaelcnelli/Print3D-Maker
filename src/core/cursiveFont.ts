import * as THREE from 'three';

type Pt = [number, number];

interface CursiveGlyph {
  advance: number;
  /** Connected or secondary spline strokes in 100-unit x-height coordinates:
   *  baseline = 0, x-height = 52, ascender = 100, descender = -38 */
  strokes: Pt[][];
  /** Optional circular dots (for i, j) as [cx, cy, radius] */
  dots?: [number, number, number][];
}

function buildSmoothRibbon(points: Pt[], halfWidth: number, ox: number, sx: number, sy: number): THREE.Shape | null {
  if (points.length < 2) return null;

  const vecs = points.map(([x, y]) => new THREE.Vector2(ox + x * sx, y * sy));
  const curve = new THREE.SplineCurve(vecs);
  const steps = Math.max(18, points.length * 6);
  const sampled = curve.getPoints(steps);

  const rx = halfWidth * sx;
  const ry = halfWidth * sy;
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];

  for (let i = 0; i < sampled.length; i++) {
    const prev = sampled[Math.max(0, i - 1)];
    const next = sampled[Math.min(sampled.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push(new THREE.Vector2(sampled[i].x + nx * rx, sampled[i].y + ny * ry));
    right.push(new THREE.Vector2(sampled[i].x - nx * rx, sampled[i].y - ny * ry));
  }

  // Smooth rounded end-cap at end
  const pEnd = sampled[sampled.length - 1];
  const pEndPrev = sampled[sampled.length - 2];
  const endAng = Math.atan2(pEnd.y - pEndPrev.y, pEnd.x - pEndPrev.x);
  const endCap: THREE.Vector2[] = [];
  for (let k = 1; k < 7; k++) {
    const a = endAng + Math.PI * 0.5 - (k / 7) * Math.PI;
    endCap.push(new THREE.Vector2(pEnd.x + Math.cos(a) * rx, pEnd.y + Math.sin(a) * ry));
  }

  // Smooth rounded end-cap at start
  const pStart = sampled[0];
  const pStartNext = sampled[1];
  const startAng = Math.atan2(pStart.y - pStartNext.y, pStart.x - pStartNext.x);
  const startCap: THREE.Vector2[] = [];
  for (let k = 1; k < 7; k++) {
    const a = startAng + Math.PI * 0.5 - (k / 7) * Math.PI;
    startCap.push(new THREE.Vector2(pStart.x + Math.cos(a) * rx, pStart.y + Math.sin(a) * ry));
  }

  const ring = [...left, ...endCap, ...right.reverse(), ...startCap];
  const shape = new THREE.Shape();
  ring.forEach((p, idx) => {
    if (idx === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();
  return shape;
}

function buildDotShape(cx: number, cy: number, radius: number, ox: number, sx: number, sy: number): THREE.Shape {
  const s = new THREE.Shape();
  const rx = radius * sx;
  const ry = radius * sy;
  const x0 = ox + cx * sx;
  const y0 = cy * sy;
  const segs = 20;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const px = x0 + Math.cos(a) * rx;
    const py = y0 + Math.sin(a) * ry;
    if (i === 0) s.moveTo(px, py);
    else s.lineTo(px, py);
  }
  s.closePath();
  return s;
}

/**
 * Connected handwritten lowercase cursive script glyph table.
 * Each glyph enters cleanly near (0, 14) and exits near (advance, 14)
 * so consecutive letters flow seamlessly together into a single printable word.
 */
const CURSIVE_GLYPHS: Record<string, CursiveGlyph> = {
  a: {
    advance: 52,
    strokes: [
      [[42, 42], [32, 52], [18, 49], [9, 34], [10, 14], [20, 4], [34, 10], [43, 30], [44, 48]],
      [[44, 46], [42, 24], [43, 8], [50, 7], [56, 15]],
    ],
  },
  b: {
    advance: 50,
    strokes: [
      [[0, 15], [14, 40], [28, 74], [34, 96], [28, 102], [20, 94], [14, 62], [11, 22], [14, 6], [27, 4], [42, 16], [46, 34], [38, 46], [26, 42], [30, 26], [42, 22], [53, 24]],
    ],
  },
  c: {
    advance: 44,
    strokes: [
      [[0, 16], [10, 34], [24, 50], [38, 50], [42, 42]],
      [[38, 48], [23, 50], [12, 36], [11, 16], [21, 4], [36, 8], [48, 16]],
    ],
  },
  d: {
    advance: 54,
    strokes: [
      [[40, 42], [30, 52], [16, 48], [8, 32], [10, 12], [22, 4], [36, 12], [44, 34], [50, 74], [54, 98], [48, 100], [42, 76], [39, 36], [40, 10], [48, 7], [57, 16]],
    ],
  },
  e: {
    advance: 44,
    strokes: [
      [[0, 16], [16, 26], [33, 38], [37, 48], [28, 53], [16, 46], [10, 28], [13, 10], [25, 4], [39, 9], [48, 17]],
    ],
  },
  f: {
    advance: 44,
    strokes: [
      [[0, 18], [14, 48], [28, 82], [35, 98], [28, 102], [21, 90], [16, 48], [12, -4], [10, -28], [16, -34], [24, -22], [24, 2], [20, 20], [34, 24], [48, 18]],
    ],
  },
  g: {
    advance: 52,
    strokes: [
      [[42, 42], [32, 52], [17, 48], [8, 32], [10, 12], [22, 4], [36, 12], [44, 34], [46, 48]],
      [[45, 46], [42, 18], [36, -12], [27, -34], [16, -37], [9, -29], [14, -14], [30, -2], [48, 10], [56, 17]],
    ],
  },
  h: {
    advance: 54,
    strokes: [
      [[0, 16], [13, 44], [25, 78], [30, 97], [24, 101], [17, 90], [12, 52], [9, 8]],
      [[11, 22], [22, 44], [34, 51], [42, 44], [41, 22], [42, 8], [50, 7], [58, 16]],
    ],
  },
  i: {
    advance: 32,
    strokes: [
      [[0, 16], [11, 32], [18, 49], [15, 30], [14, 10], [22, 6], [35, 16]],
    ],
    dots: [[21, 70, 6.4]],
  },
  j: {
    advance: 36,
    strokes: [
      [[0, 16], [14, 34], [22, 50], [20, 22], [16, -12], [10, -34], [2, -36], [-2, -26], [8, -10], [24, 4], [39, 16]],
    ],
    dots: [[25, 70, 6.4]],
  },
  k: {
    advance: 52,
    strokes: [
      [[0, 16], [13, 46], [24, 80], [29, 98], [23, 101], [16, 88], [11, 48], [9, 6]],
      [[12, 22], [24, 44], [38, 50], [43, 42], [34, 30], [22, 26], [33, 18], [43, 7], [55, 16]],
    ],
  },
  l: {
    advance: 36,
    strokes: [
      [[0, 16], [12, 44], [24, 78], [29, 97], [23, 101], [16, 90], [12, 54], [12, 16], [18, 5], [30, 8], [39, 16]],
    ],
  },
  m: {
    advance: 74,
    strokes: [
      [[0, 16], [10, 44], [14, 48], [12, 24], [10, 7]],
      [[12, 28], [22, 48], [32, 50], [37, 38], [35, 18], [34, 7]],
      [[36, 28], [46, 48], [56, 50], [61, 38], [60, 14], [65, 6], [77, 16]],
    ],
  },
  n: {
    advance: 54,
    strokes: [
      [[0, 16], [11, 44], [15, 48], [13, 24], [11, 7]],
      [[13, 28], [24, 48], [35, 50], [41, 38], [40, 14], [46, 6], [58, 16]],
    ],
  },
  o: {
    advance: 50,
    strokes: [
      [[38, 44], [28, 52], [15, 46], [9, 28], [12, 10], [24, 4], [38, 12], [43, 30], [38, 46], [28, 42], [35, 34], [53, 36]],
    ],
  },
  p: {
    advance: 52,
    strokes: [
      [[0, 16], [11, 38], [17, 50], [14, 16], [10, -24], [8, -36]],
      [[13, 28], [24, 48], [38, 50], [45, 36], [42, 16], [30, 5], [16, 10], [34, 8], [55, 16]],
    ],
  },
  q: {
    advance: 52,
    strokes: [
      [[42, 42], [31, 52], [17, 48], [8, 32], [10, 12], [22, 4], [36, 12], [44, 34], [45, 48]],
      [[44, 46], [40, 10], [37, -26], [39, -36], [47, -24], [43, -4], [47, 10], [56, 16]],
    ],
  },
  r: {
    advance: 42,
    strokes: [
      [[0, 16], [11, 36], [18, 50], [24, 46], [32, 48], [33, 32], [30, 12], [36, 6], [46, 16]],
    ],
  },
  s: {
    advance: 44,
    strokes: [
      [[0, 16], [12, 34], [24, 51], [28, 44], [36, 30], [36, 14], [26, 4], [14, 6], [12, 14], [26, 8], [47, 16]],
    ],
  },
  t: {
    advance: 40,
    strokes: [
      [[0, 16], [12, 44], [21, 76], [23, 86], [19, 54], [17, 14], [24, 5], [36, 10], [43, 16]],
      [[8, 60], [22, 62], [36, 61]],
    ],
  },
  u: {
    advance: 54,
    strokes: [
      [[0, 16], [10, 38], [15, 50], [13, 24], [15, 8], [26, 5], [38, 18], [43, 46], [41, 20], [44, 7], [57, 16]],
    ],
  },
  v: {
    advance: 50,
    strokes: [
      [[0, 16], [10, 40], [16, 48], [20, 24], [26, 6], [34, 14], [42, 40], [46, 48], [42, 34], [53, 32]],
    ],
  },
  w: {
    advance: 72,
    strokes: [
      [[0, 16], [10, 42], [14, 48], [16, 22], [20, 6], [30, 16], [37, 44], [38, 22], [43, 6], [54, 16], [62, 44], [65, 48], [62, 34], [75, 32]],
    ],
  },
  x: {
    advance: 48,
    strokes: [
      [[4, 44], [16, 48], [26, 28], [36, 7], [48, 14]],
      [[40, 48], [24, 28], [8, 6]],
    ],
  },
  y: {
    advance: 52,
    strokes: [
      [[0, 16], [10, 40], [15, 50], [13, 24], [17, 7], [28, 7], [38, 22], [44, 48]],
      [[44, 46], [40, 14], [34, -18], [25, -35], [14, -36], [10, -26], [18, -10], [36, 4], [55, 16]],
    ],
  },
  z: {
    advance: 46,
    strokes: [
      [[2, 38], [14, 50], [34, 50], [22, 28], [10, 8], [24, 10], [38, 7], [49, 16]],
    ],
  },
  ' ': {
    advance: 26,
    strokes: [],
  },
};

const LOWER_ACCENTS: Record<string, { base: string; accent: 'acute' | 'grave' | 'circumflex' | 'tilde' | 'cedilla' }> = {
  á: { base: 'a', accent: 'acute' },
  à: { base: 'a', accent: 'grave' },
  â: { base: 'a', accent: 'circumflex' },
  ã: { base: 'a', accent: 'tilde' },
  é: { base: 'e', accent: 'acute' },
  ê: { base: 'e', accent: 'circumflex' },
  í: { base: 'i', accent: 'acute' },
  ó: { base: 'o', accent: 'acute' },
  ô: { base: 'o', accent: 'circumflex' },
  õ: { base: 'o', accent: 'tilde' },
  ú: { base: 'u', accent: 'acute' },
  ç: { base: 'c', accent: 'cedilla' },
};

export interface BuiltCursiveShapes {
  shapes: THREE.Shape[];
  totalWidth: number;
  minY: number;
  maxY: number;
}

/**
 * Generates smooth connected cursive script 3D-extrudable shapes for lowercase names
 * (e.g. "gabriel", "sofia", "vitória") to overlay across a bold monogram initial.
 */
export function buildCursiveScriptShapes(
  rawText: string,
  targetMaxWidth: number,
  targetCapHeight: number
): BuiltCursiveShapes {
  const clean = rawText.trim().toLowerCase();
  if (!clean) {
    return { shapes: [], totalWidth: 0, minY: 0, maxY: 0 };
  }

  const chars = Array.from(clean);
  const resolved = chars.map((ch) => {
    const mapped = LOWER_ACCENTS[ch];
    if (mapped) {
      return {
        base: mapped.base,
        glyph: CURSIVE_GLYPHS[mapped.base] ?? CURSIVE_GLYPHS.a,
        accent: mapped.accent,
      };
    }
    return {
      base: ch,
      glyph: CURSIVE_GLYPHS[ch] ?? CURSIVE_GLYPHS[' '],
      accent: null as 'acute' | 'grave' | 'circumflex' | 'tilde' | 'cedilla' | null,
    };
  });

  // Slightly overlap adjacent letters by -4 units so baseline tails weld into 1 continuous cursive word
  const kerning = -4.5;
  let rawWidth = 0;
  resolved.forEach((entry, idx) => {
    rawWidth += entry.glyph.advance;
    if (idx < resolved.length - 1) rawWidth += kerning;
  });

  const rawHeightSpan = 138; // -38 descender to +100 ascender
  const scaleByH = targetCapHeight / rawHeightSpan;
  const scaleByW = rawWidth > 0 ? targetMaxWidth / rawWidth : scaleByH;
  const s = Math.min(scaleByH, scaleByW);

  // Subtle italic forward slant (+12 deg) gives authentic handwritten calligraphy feel
  const renderedWidth = rawWidth * s;
  const strokeHalfW = 5.4;
  const shapes: THREE.Shape[] = [];

  let cursorX = -renderedWidth * 0.5;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const entry of resolved) {
    for (const stroke of entry.glyph.strokes) {
      const slanted: Pt[] = stroke.map(([x, y]) => [x + y * 0.14, y]);
      const sh = buildSmoothRibbon(slanted, strokeHalfW, cursorX, s, s);
      if (sh) {
        shapes.push(sh);
        for (const pt of sh.getPoints(8)) {
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
      }
    }

    if (entry.glyph.dots) {
      for (const [cx, cy, r] of entry.glyph.dots) {
        const dot = buildDotShape(cx + cy * 0.14, cy, r, cursorX, s, s);
        shapes.push(dot);
      }
    }

    if (entry.accent) {
      const midX = entry.glyph.advance * 0.5;
      let accStroke: Pt[] | null = null;
      if (entry.accent === 'acute') {
        accStroke = [[midX - 5, 65], [midX + 10, 80]];
      } else if (entry.accent === 'grave') {
        accStroke = [[midX - 10, 80], [midX + 5, 65]];
      } else if (entry.accent === 'circumflex') {
        accStroke = [[midX - 10, 66], [midX, 80], [midX + 10, 66]];
      } else if (entry.accent === 'tilde') {
        accStroke = [[midX - 12, 68], [midX - 4, 76], [midX + 4, 68], [midX + 12, 76]];
      } else if (entry.accent === 'cedilla') {
        accStroke = [[midX + 2, 2], [midX + 6, -12], [midX - 4, -20]];
      }
      if (accStroke) {
        const slanted = accStroke.map(([x, y]): Pt => [x + y * 0.14, y]);
        const sh = buildSmoothRibbon(slanted, 3.8, cursorX, s, s);
        if (sh) shapes.push(sh);
      }
    }

    cursorX += (entry.glyph.advance + kerning) * s;
  }

  return {
    shapes,
    totalWidth: renderedWidth,
    minY: Number.isFinite(minY) ? minY : 0,
    maxY: Number.isFinite(maxY) ? maxY : targetCapHeight,
  };
}
