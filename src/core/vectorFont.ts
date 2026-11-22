import * as THREE from 'three';
import type { FontStyleId } from '../types/project';

/**
 * Self-contained 3D-print-optimized bold geometric vector typeface.
 *
 * Every glyph is defined on a 0..100 (height) coordinate grid with thick,
 * FDM-printable strokes (>= 18 units stroke width) and clean outer/inner
 * contours (THREE.Shape + THREE.Path holes) using real quadratic/cubic curves.
 * Supports A-Z, 0-9, Portuguese accented characters (ÁÀÂÃÉÊÍÓÔÕÚÇ),
 * and common symbols (&, -, +, ., !, ♥) with zero external font fetches.
 */

interface GlyphSpec {
  advance: number;
  build: (offsetX: number, scaleX: number, scaleY: number) => THREE.Shape[];
}

type Pt = [number, number];

function polyShape(pts: Pt[], ox: number, sx: number, sy: number): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, y], idx) => {
    const px = ox + x * sx;
    const py = y * sy;
    if (idx === 0) s.moveTo(px, py);
    else s.lineTo(px, py);
  });
  s.closePath();
  return s;
}

function polyHole(pts: Pt[], ox: number, sx: number, sy: number): THREE.Path {
  const p = new THREE.Path();
  pts.forEach(([x, y], idx) => {
    const px = ox + x * sx;
    const py = y * sy;
    if (idx === 0) p.moveTo(px, py);
    else p.lineTo(px, py);
  });
  p.closePath();
  return p;
}

/**
 * Builds a rounded stadium / capsule ring or arc polygon helper for crisp curved glyphs
 * (C, G, O, Q, S, U, 0, 2, 3, 5, 6, 8, 9, B, D, P, R).
 */
function sampleEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  startRad: number,
  endRad: number,
  steps: number
): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = startRad + (endRad - startRad) * (i / steps);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/**
 * Smoothly resamples an open centerline with Catmull-Rom interpolation and
 * thickens it into a closed CCW ribbon with rounded end-caps so curved glyphs
 * (S, 2, 3, 5, 6, 8, 9, &) look fluid and genuinely rounded in 3D.
 */
function strokeRibbon(centerline: Pt[], halfW: number): Pt[] {
  const vecs = centerline.map(([x, y]) => new THREE.Vector2(x, y));
  const spline = new THREE.SplineCurve(vecs);
  const smoothSamples = spline.getPoints(Math.max(36, centerline.length * 4));

  const left: Pt[] = [];
  const right: Pt[] = [];
  const n = smoothSamples.length;

  for (let i = 0; i < n; i++) {
    const prev = smoothSamples[Math.max(0, i - 1)];
    const next = smoothSamples[Math.min(n - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    left.push([smoothSamples[i].x + nx * halfW, smoothSamples[i].y + ny * halfW]);
    right.push([smoothSamples[i].x - nx * halfW, smoothSamples[i].y - ny * halfW]);
  }

  // Add smooth semicircular end caps at start and end of ribbon
  const startPt = smoothSamples[0];
  const startTan = new THREE.Vector2(
    smoothSamples[1].x - startPt.x,
    smoothSamples[1].y - startPt.y
  ).normalize();
  const startAngle = Math.atan2(startTan.y, startTan.x);
  const startCap: Pt[] = [];
  for (let i = 1; i <= 5; i++) {
    const a = startAngle + Math.PI * 0.5 + (Math.PI * i) / 6;
    startCap.push([startPt.x + Math.cos(a) * halfW, startPt.y + Math.sin(a) * halfW]);
  }

  const endPt = smoothSamples[n - 1];
  const endTan = new THREE.Vector2(
    endPt.x - smoothSamples[n - 2].x,
    endPt.y - smoothSamples[n - 2].y
  ).normalize();
  const endAngle = Math.atan2(endTan.y, endTan.x);
  const endCap: Pt[] = [];
  for (let i = 1; i <= 5; i++) {
    const a = endAngle - Math.PI * 0.5 + (Math.PI * i) / 6;
    endCap.push([endPt.x + Math.cos(a) * halfW, endPt.y + Math.sin(a) * halfW]);
  }

  return [...right, ...endCap, ...left.reverse(), ...startCap];
}

function makeDShape(
  ox: number,
  sx: number,
  sy: number,
  w = 74,
  h = 100,
  sw = 21
): THREE.Shape {
  const rOuter = h * 0.5;
  const cx = w - rOuter;
  const outer: Pt[] = [
    [0, 0],
    [cx, 0],
    ...sampleEllipse(cx, h * 0.5, rOuter, rOuter, -Math.PI * 0.5, Math.PI * 0.5, 36),
    [0, h],
  ];
  const s = polyShape(outer, ox, sx, sy);

  const rInner = Math.max(8, h * 0.5 - sw);
  const ix = Math.max(sw + 4, w - sw - rInner);
  const holePts: Pt[] = [
    [sw, sw],
    [ix, sw],
    ...sampleEllipse(ix, h * 0.5, rInner, rInner, -Math.PI * 0.5, Math.PI * 0.5, 28),
    [sw, h - sw],
  ];
  holePts.reverse();
  s.holes.push(polyHole(holePts, ox, sx, sy));
  return s;
}

function makeOShape(
  ox: number,
  sx: number,
  sy: number,
  w = 78,
  h = 100,
  sw = 21
): THREE.Shape {
  const rx = w * 0.5;
  const ry = h * 0.5;
  const outer = sampleEllipse(rx, ry, rx, ry, 0, Math.PI * 2, 64);
  outer.pop();
  const s = polyShape(outer, ox, sx, sy);

  const inner = sampleEllipse(rx, ry, rx - sw, ry - sw, Math.PI * 2, 0, 48);
  inner.pop();
  s.holes.push(polyHole(inner, ox, sx, sy));
  return s;
}

function makeArcBand(
  cx: number,
  cy: number,
  rxOut: number,
  ryOut: number,
  rxIn: number,
  ryIn: number,
  startRad: number,
  endRad: number,
  steps: number
): Pt[] {
  const outer = sampleEllipse(cx, cy, rxOut, ryOut, startRad, endRad, steps);
  const inner = sampleEllipse(cx, cy, rxIn, ryIn, endRad, startRad, steps);
  return [...outer, ...inner];
}

const GLYPHS: Record<string, GlyphSpec> = {
  A: {
    advance: 78,
    build: (ox, sx, sy) => {
      const s = polyShape(
        [
          [0, 0],
          [22, 0],
          [28, 22],
          [50, 22],
          [56, 0],
          [78, 0],
          [50, 100],
          [28, 100],
        ],
        ox,
        sx,
        sy
      );
      s.holes.push(
        polyHole(
          [
            [39, 73],
            [46, 42],
            [32, 42],
          ],
          ox,
          sx,
          sy
        )
      );
      return [s];
    },
  },
  B: {
    advance: 74,
    build: (ox, sx, sy) => {
      const outer: Pt[] = [
        [0, 0],
        [46, 0],
        ...sampleEllipse(46, 26, 28, 26, -Math.PI * 0.5, Math.PI * 0.44, 12),
        [56, 51],
        ...sampleEllipse(44, 75, 25, 25, -Math.PI * 0.44, Math.PI * 0.5, 12),
        [0, 100],
      ];
      const s = polyShape(outer, ox, sx, sy);
      // Lower hole
      const lowHole: Pt[] = [
        [20, 17],
        [43, 17],
        ...sampleEllipse(43, 28, 11, 11, -Math.PI * 0.5, Math.PI * 0.5, 8),
        [20, 39],
      ];
      lowHole.reverse();
      // Upper hole
      const topHole: Pt[] = [
        [20, 61],
        [41, 61],
        ...sampleEllipse(41, 72, 10, 11, -Math.PI * 0.5, Math.PI * 0.5, 8),
        [20, 83],
      ];
      topHole.reverse();
      s.holes.push(polyHole(lowHole, ox, sx, sy));
      s.holes.push(polyHole(topHole, ox, sx, sy));
      return [s];
    },
  },
  C: {
    advance: 74,
    build: (ox, sx, sy) => {
      const pts = makeArcBand(39, 50, 39, 50, 19, 29, 0.56, Math.PI * 2 - 0.56, 48);
      return [polyShape(pts, ox, sx, sy)];
    },
  },
  D: {
    advance: 75,
    build: (ox, sx, sy) => [makeDShape(ox, sx, sy, 75, 100, 21)],
  },
  E: {
    advance: 64,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [0, 0],
          [64, 0],
          [64, 20],
          [22, 20],
          [22, 41],
          [58, 41],
          [58, 60],
          [22, 60],
          [22, 80],
          [64, 80],
          [64, 100],
          [0, 100],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  F: {
    advance: 60,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [0, 0],
          [22, 0],
          [22, 40],
          [56, 40],
          [56, 60],
          [22, 60],
          [22, 80],
          [60, 80],
          [60, 100],
          [0, 100],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  G: {
    advance: 78,
    build: (ox, sx, sy) => {
      const outerArc = sampleEllipse(39, 50, 39, 50, 0.55, Math.PI * 2 - 0.04, 26);
      const innerArc = sampleEllipse(39, 50, 19, 29, Math.PI * 2 - 0.35, 0.55, 22);
      const pts: Pt[] = [
        ...outerArc,
        [78, 53],
        [40, 53],
        [40, 35],
        [57, 35],
        ...innerArc,
      ];
      return [polyShape(pts, ox, sx, sy)];
    },
  },
  H: {
    advance: 72,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [0, 0],
          [22, 0],
          [22, 40],
          [50, 40],
          [50, 0],
          [72, 0],
          [72, 100],
          [50, 100],
          [50, 60],
          [22, 60],
          [22, 100],
          [0, 100],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  I: {
    advance: 28,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [3, 0],
          [25, 0],
          [25, 100],
          [3, 100],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  J: {
    advance: 62,
    build: (ox, sx, sy) => {
      const outer: Pt[] = [
        ...sampleEllipse(31, 31, 31, 31, Math.PI + 0.15, Math.PI * 2, 16),
        [62, 100],
        [40, 100],
        ...sampleEllipse(31, 31, 11, 12, 0, Math.PI + 0.15, 12),
      ];
      return [polyShape(outer, ox, sx, sy)];
    },
  },
  K: {
    advance: 72,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [0, 0],
          [22, 0],
          [22, 38],
          [48, 0],
          [74, 0],
          [40, 51],
          [72, 100],
          [47, 100],
          [22, 60],
          [22, 100],
          [0, 100],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  L: {
    advance: 60,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [0, 0],
          [60, 0],
          [60, 21],
          [22, 21],
          [22, 100],
          [0, 100],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  M: {
    advance: 88,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [0, 0],
          [21, 0],
          [21, 61],
          [37, 25],
          [51, 25],
          [67, 61],
          [67, 0],
          [88, 0],
          [88, 100],
          [65, 100],
          [44, 54],
          [23, 100],
          [0, 100],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  N: {
    advance: 74,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [0, 0],
          [21, 0],
          [21, 61],
          [53, 0],
          [74, 0],
          [74, 100],
          [53, 100],
          [53, 39],
          [21, 100],
          [0, 100],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  O: {
    advance: 78,
    build: (ox, sx, sy) => [makeOShape(ox, sx, sy, 78, 100, 21)],
  },
  P: {
    advance: 70,
    build: (ox, sx, sy) => {
      const outer: Pt[] = [
        [0, 0],
        [22, 0],
        [22, 37],
        [42, 37],
        ...sampleEllipse(42, 68.5, 28, 31.5, -Math.PI * 0.5, Math.PI * 0.5, 16),
        [0, 100],
      ];
      const s = polyShape(outer, ox, sx, sy);
      const hole: Pt[] = [
        [22, 56],
        [40, 56],
        ...sampleEllipse(40, 68.5, 11, 12.5, -Math.PI * 0.5, Math.PI * 0.5, 10),
        [22, 81],
      ];
      hole.reverse();
      s.holes.push(polyHole(hole, ox, sx, sy));
      return [s];
    },
  },
  Q: {
    advance: 80,
    build: (ox, sx, sy) => {
      const ring = makeOShape(ox, sx, sy, 78, 100, 21);
      const tail = polyShape(
        [
          [46, 24],
          [60, 36],
          [82, 4],
          [66, -4],
        ],
        ox,
        sx,
        sy
      );
      return [ring, tail];
    },
  },
  R: {
    advance: 72,
    build: (ox, sx, sy) => {
      const outer: Pt[] = [
        [0, 0],
        [22, 0],
        [22, 38],
        [36, 38],
        [52, 0],
        [75, 0],
        [56, 42],
        ...sampleEllipse(42, 70, 28, 30, -Math.PI * 0.35, Math.PI * 0.5, 32),
        [0, 100],
      ];
      const s = polyShape(outer, ox, sx, sy);
      const hole: Pt[] = [
        [22, 57],
        [40, 57],
        ...sampleEllipse(40, 69, 11, 12, -Math.PI * 0.5, Math.PI * 0.5, 22),
        [22, 81],
      ];
      hole.reverse();
      s.holes.push(polyHole(hole, ox, sx, sy));
      return [s];
    },
  },
  S: {
    advance: 68,
    build: (ox, sx, sy) => {
      const path: Pt[] = [
        [59, 80],
        [53, 87],
        [43, 90],
        [30, 90],
        [19, 85],
        [14, 76],
        [16, 65],
        [27, 57],
        [45, 50],
        [57, 42],
        [60, 29],
        [55, 17],
        [44, 11],
        [28, 10],
        [15, 15],
        [9, 23],
      ];
      return [polyShape(strokeRibbon(path, 10.5), ox, sx, sy)];
    },
  },
  T: {
    advance: 68,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [23, 0],
          [45, 0],
          [45, 79],
          [68, 79],
          [68, 100],
          [0, 100],
          [0, 79],
          [23, 79],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  U: {
    advance: 74,
    build: (ox, sx, sy) => {
      const outer: Pt[] = [
        [0, 100],
        [0, 37],
        ...sampleEllipse(37, 37, 37, 37, Math.PI, Math.PI * 2, 18),
        [74, 100],
        [52, 100],
        [52, 37],
        ...sampleEllipse(37, 37, 15, 17, 0, -Math.PI, 14),
        [22, 100],
      ];
      return [polyShape(outer, ox, sx, sy)];
    },
  },
  V: {
    advance: 74,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [26, 0],
          [48, 0],
          [74, 100],
          [51, 100],
          [37, 36],
          [23, 100],
          [0, 100],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  W: {
    advance: 98,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [16, 0],
          [36, 0],
          [49, 52],
          [62, 0],
          [82, 0],
          [98, 100],
          [77, 100],
          [69, 44],
          [57, 100],
          [41, 100],
          [29, 44],
          [21, 100],
          [0, 100],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  X: {
    advance: 74,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [0, 0],
          [25, 0],
          [37, 29],
          [49, 0],
          [74, 0],
          [50, 50],
          [73, 100],
          [48, 100],
          [37, 71],
          [26, 100],
          [1, 100],
          [24, 50],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  Y: {
    advance: 72,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [25, 0],
          [47, 0],
          [47, 42],
          [72, 100],
          [49, 100],
          [36, 65],
          [23, 100],
          [0, 100],
          [25, 42],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  Z: {
    advance: 68,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [0, 0],
          [68, 0],
          [68, 21],
          [29, 21],
          [67, 79],
          [67, 100],
          [1, 100],
          [1, 79],
          [39, 79],
          [0, 21],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  '0': {
    advance: 70,
    build: (ox, sx, sy) => [makeOShape(ox, sx, sy, 70, 100, 19)],
  },
  '1': {
    advance: 48,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [19, 0],
          [41, 0],
          [41, 100],
          [23, 100],
          [3, 81],
          [13, 66],
          [19, 73],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  '2': {
    advance: 66,
    build: (ox, sx, sy) => {
      const path: Pt[] = [
        [10, 74],
        [16, 85],
        [31, 90],
        [46, 86],
        [54, 74],
        [50, 59],
        [36, 44],
        [14, 22],
        [10, 11],
        [62, 11],
      ];
      return [polyShape(strokeRibbon(path, 10.5), ox, sx, sy)];
    },
  },
  '3': {
    advance: 66,
    build: (ox, sx, sy) => {
      const path: Pt[] = [
        [12, 82],
        [24, 90],
        [42, 89],
        [53, 80],
        [53, 66],
        [42, 55],
        [28, 52],
        [45, 48],
        [56, 36],
        [55, 21],
        [44, 11],
        [25, 10],
        [10, 19],
      ];
      return [polyShape(strokeRibbon(path, 10.2), ox, sx, sy)];
    },
  },
  '4': {
    advance: 72,
    build: (ox, sx, sy) => {
      const s = polyShape(
        [
          [42, 0],
          [63, 0],
          [63, 24],
          [72, 24],
          [72, 43],
          [63, 43],
          [63, 100],
          [39, 100],
          [0, 42],
          [0, 24],
          [42, 24],
        ],
        ox,
        sx,
        sy
      );
      s.holes.push(
        polyHole(
          [
            [42, 74],
            [42, 43],
            [21, 43],
          ],
          ox,
          sx,
          sy
        )
      );
      return [s];
    },
  },
  '5': {
    advance: 66,
    build: (ox, sx, sy) => {
      const path: Pt[] = [
        [56, 89],
        [18, 89],
        [16, 56],
        [34, 58],
        [50, 51],
        [56, 36],
        [51, 20],
        [38, 11],
        [21, 11],
        [10, 19],
      ];
      return [polyShape(strokeRibbon(path, 10.5), ox, sx, sy)];
    },
  },
  '6': {
    advance: 68,
    build: (ox, sx, sy) => {
      const path: Pt[] = [
        [52, 86],
        [34, 90],
        [18, 79],
        [12, 54],
        [14, 28],
        [24, 13],
        [41, 11],
        [54, 21],
        [56, 39],
        [46, 51],
        [28, 52],
        [16, 44],
      ];
      return [polyShape(strokeRibbon(path, 10.2), ox, sx, sy)];
    },
  },
  '7': {
    advance: 66,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [14, 0],
          [38, 0],
          [66, 82],
          [66, 100],
          [2, 100],
          [2, 79],
          [42, 79],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  '8': {
    advance: 68,
    build: (ox, sx, sy) => {
      const lower = makeOShape(ox, sx, sy, 68, 58, 17);
      const upper = makeOShape(ox + 3 * sx, sx, sy, 62, 54, 16);
      // Translate upper ring up by 46*sy
      const shiftedUpper = new THREE.Shape(
        upper.getPoints(20).map((p) => new THREE.Vector2(p.x, p.y + 46 * sy))
      );
      for (const h of upper.holes) {
        shiftedUpper.holes.push(
          new THREE.Path(h.getPoints(16).map((p) => new THREE.Vector2(p.x, p.y + 46 * sy)))
        );
      }
      return [lower, shiftedUpper];
    },
  },
  '9': {
    advance: 68,
    build: (ox, sx, sy) => {
      const path: Pt[] = [
        [16, 14],
        [34, 10],
        [50, 21],
        [56, 46],
        [54, 72],
        [44, 87],
        [27, 89],
        [14, 79],
        [12, 61],
        [22, 49],
        [40, 48],
        [52, 56],
      ];
      return [polyShape(strokeRibbon(path, 10.2), ox, sx, sy)];
    },
  },
  '-': {
    advance: 46,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [4, 40],
          [42, 40],
          [42, 58],
          [4, 58],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  '+': {
    advance: 60,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [21, 18],
          [39, 18],
          [39, 41],
          [58, 41],
          [58, 59],
          [39, 59],
          [39, 82],
          [21, 82],
          [21, 59],
          [2, 59],
          [2, 41],
          [21, 41],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  '.': {
    advance: 28,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [4, 0],
          [24, 0],
          [24, 21],
          [4, 21],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  '!': {
    advance: 30,
    build: (ox, sx, sy) => [
      polyShape(
        [
          [5, 0],
          [25, 0],
          [25, 20],
          [5, 20],
        ],
        ox,
        sx,
        sy
      ),
      polyShape(
        [
          [5, 31],
          [25, 31],
          [26, 100],
          [4, 100],
        ],
        ox,
        sx,
        sy
      ),
    ],
  },
  '&': {
    advance: 78,
    build: (ox, sx, sy) => {
      const path: Pt[] = [
        [68, 12],
        [40, 44],
        [20, 68],
        [18, 82],
        [30, 90],
        [44, 86],
        [47, 74],
        [37, 59],
        [17, 42],
        [12, 26],
        [20, 13],
        [37, 11],
        [53, 21],
        [66, 40],
      ];
      return [polyShape(strokeRibbon(path, 9.8), ox, sx, sy)];
    },
  },
  '♥': {
    advance: 84,
    build: (ox, sx, sy) => {
      const pts: Pt[] = [];
      const steps = 40;
      for (let i = 0; i < steps; i++) {
        const s = (1 - i / steps) * Math.PI * 2;
        const sinS = Math.sin(s);
        const rx = 16 * sinS * sinS * sinS;
        const ry =
          13 * Math.cos(s) -
          5 * Math.cos(2 * s) -
          2 * Math.cos(3 * s) -
          Math.cos(4 * s);
        pts.push([42 + (rx / 16) * 38, ((ry + 17) / 29) * 94 + 2]);
      }
      return [polyShape(pts, ox, sx, sy)];
    },
  },
  ' ': {
    advance: 34,
    build: () => [],
  },
};

type AccentType = 'acute' | 'grave' | 'circumflex' | 'tilde' | 'cedilla';

const ACCENTED_MAP: Record<string, { base: string; accent: AccentType }> = {
  Á: { base: 'A', accent: 'acute' },
  À: { base: 'A', accent: 'grave' },
  Â: { base: 'A', accent: 'circumflex' },
  Ã: { base: 'A', accent: 'tilde' },
  É: { base: 'E', accent: 'acute' },
  Ê: { base: 'E', accent: 'circumflex' },
  Í: { base: 'I', accent: 'acute' },
  Ó: { base: 'O', accent: 'acute' },
  Ô: { base: 'O', accent: 'circumflex' },
  Õ: { base: 'O', accent: 'tilde' },
  Ú: { base: 'U', accent: 'acute' },
  Ç: { base: 'C', accent: 'cedilla' },
};

function buildAccentShapes(
  accent: AccentType,
  advance: number,
  ox: number,
  sx: number,
  sy: number
): THREE.Shape[] {
  const cx = advance * 0.5;
  switch (accent) {
    case 'acute':
      return [
        polyShape(
          [
            [cx - 8, 108],
            [cx + 3, 108],
            [cx + 16, 126],
            [cx + 3, 126],
          ],
          ox,
          sx,
          sy
        ),
      ];
    case 'grave':
      return [
        polyShape(
          [
            [cx - 3, 108],
            [cx + 8, 108],
            [cx - 3, 126],
            [cx - 16, 126],
          ],
          ox,
          sx,
          sy
        ),
      ];
    case 'circumflex':
      return [
        polyShape(
          [
            [cx - 18, 108],
            [cx - 7, 108],
            [cx, 118],
            [cx + 7, 108],
            [cx + 18, 108],
            [cx + 5, 128],
            [cx - 5, 128],
          ],
          ox,
          sx,
          sy
        ),
      ];
    case 'tilde': {
      const path: Pt[] = [
        [cx - 19, 112],
        [cx - 10, 122],
        [cx, 117],
        [cx + 10, 112],
        [cx + 19, 122],
      ];
      return [polyShape(strokeRibbon(path, 5.2), ox, sx, sy)];
    }
    case 'cedilla':
      return [
        polyShape(
          [
            [cx - 4, 2],
            [cx + 8, 2],
            [cx + 12, -16],
            [cx - 10, -18],
            [cx - 10, -8],
            [cx + 1, -7],
          ],
          ox,
          sx,
          sy
        ),
      ];
  }
}

/**
 * Adds crisp horizontal serif bars (top/bottom feet) to a letter when using the
 * 'serif' style so adjacent characters naturally bridge and fuse for 3D printing,
 * matching classic Tinkercad/LetraMaker heart-name typography.
 */
function buildSerifCapsForChar(
  baseChar: string,
  advance: number,
  ox: number,
  sx: number,
  sy: number
): THREE.Shape[] {
  const barH = 11.5;
  const shapes: THREE.Shape[] = [];
  // Gently tapered / bracketed serif bar for refined classical silhouette
  const addBar = (x0: number, x1: number, y0: number, y1: number) => {
    const isBottom = y0 < 50;
    const h = y1 - y0;
    const taper = Math.min(3.2, (x1 - x0) * 0.1);
    const pts: Pt[] = isBottom
      ? [
          [x0, y0],
          [x1, y0],
          [x1, y0 + h * 0.55],
          [x1 - taper, y1],
          [x0 + taper, y1],
          [x0, y0 + h * 0.55],
        ]
      : [
          [x0 + taper, y0],
          [x1 - taper, y0],
          [x1, y1 - h * 0.55],
          [x1, y1],
          [x0, y1],
          [x0, y1 - h * 0.55],
        ];
    shapes.push(polyShape(pts, ox, sx, sy));
  };

  switch (baseChar) {
    case 'I':
      addBar(-9, advance + 9, 0, barH);
      addBar(-9, advance + 9, 100 - barH, 100);
      break;
    case 'T':
      addBar(8, 60, 0, barH);
      break;
    case 'A':
      addBar(-5, 30, 0, barH);
      addBar(48, advance + 5, 0, barH);
      break;
    case 'V':
      addBar(-5, 29, 100 - barH, 100);
      addBar(45, advance + 5, 100 - barH, 100);
      break;
    case 'W':
      addBar(-5, 27, 100 - barH, 100);
      addBar(71, advance + 5, 100 - barH, 100);
      break;
    case 'Y':
      addBar(-5, 28, 100 - barH, 100);
      addBar(44, advance + 5, 100 - barH, 100);
      addBar(14, 58, 0, barH);
      break;
    case 'H':
    case 'M':
    case 'N':
    case 'K':
    case 'X':
      addBar(-5, 29, 0, barH);
      addBar(advance - 29, advance + 5, 0, barH);
      addBar(-5, 29, 100 - barH, 100);
      addBar(advance - 29, advance + 5, 100 - barH, 100);
      break;
    case 'R':
      addBar(-5, 30, 0, barH);
      addBar(46, advance + 5, 0, barH);
      addBar(-5, 36, 100 - barH, 100);
      break;
    case 'P':
    case 'F':
      addBar(-5, 38, 0, barH);
      addBar(-5, 34, 100 - barH, 100);
      break;
    case 'B':
    case 'D':
    case 'E':
    case 'L':
      addBar(-5, 34, 0, barH);
      addBar(-5, 34, 100 - barH, 100);
      break;
    case 'U':
      addBar(-5, 29, 100 - barH, 100);
      addBar(advance - 29, advance + 5, 100 - barH, 100);
      break;
    case 'J':
      addBar(32, advance + 5, 100 - barH, 100);
      break;
  }

  return shapes;
}

const PROFILE_BANDS = 50; // Each band is 2 units tall on the 0..100 vertical glyph grid

interface GlyphScanProfile {
  leftX: Float64Array;
  rightX: Float64Array;
  minX: number;
  maxX: number;
}

/**
 * Computes exact horizontal scanline bounds [leftX[b], rightX[b]] across 50 vertical bands
 * (y in 0..100) for a glyph's 2D shapes. Used to optically kern and structurally fuse
 * every adjacent letter pair into a single indivisible 3D piece.
 */
function computeGlyphScanProfile(shapes: THREE.Shape[]): GlyphScanProfile {
  const leftX = new Float64Array(PROFILE_BANDS).fill(Infinity);
  const rightX = new Float64Array(PROFILE_BANDS).fill(-Infinity);
  let minX = Infinity;
  let maxX = -Infinity;

  const rings: THREE.Vector2[][] = [];
  for (const sh of shapes) {
    const pts = sh.getPoints(28);
    if (pts.length >= 3) {
      rings.push(pts);
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
    }
  }

  for (let b = 0; b < PROFILE_BANDS; b++) {
    const y = (b + 0.5) * (100 / PROFILE_BANDS);
    for (const ring of rings) {
      const n = ring.length;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const p1 = ring[j];
        const p2 = ring[i];
        if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
          const t = (y - p1.y) / (p2.y - p1.y);
          const xHit = p1.x + t * (p2.x - p1.x);
          if (xHit < leftX[b]) leftX[b] = xHit;
          if (xHit > rightX[b]) rightX[b] = xHit;
        }
      }
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 40;
  }

  return { leftX, rightX, minX, maxX };
}

function cloneAndTransformShape(
  sh: THREE.Shape,
  dx: number,
  scaleX: number,
  scaleY: number,
  dy: number
): THREE.Shape {
  const outer = sh
    .getPoints(28)
    .map((p) => new THREE.Vector2((p.x + dx) * scaleX, p.y * scaleY + dy));
  const out = new THREE.Shape(outer);
  for (const h of sh.holes) {
    const holePts = h
      .getPoints(22)
      .map((p) => new THREE.Vector2((p.x + dx) * scaleX, p.y * scaleY + dy));
    out.holes.push(new THREE.Path(holePts));
  }
  return out;
}

export interface BuiltTextShapes {
  shapes: THREE.Shape[];
  firstLetterShapes: THREE.Shape[];
  firstLetterCapY: number;
  totalWidth: number;
  minY: number;
  maxY: number;
}

/**
 * Generates centered 2D THREE.Shape[] for a string, fitting cleanly into
 * targetMaxWidth and targetHeight (preserving aspect ratio) for 3D extrusion.
 *
 * When `fillExactBounds` or `joinAllLetters` is true (e.g. Coração Nome), every
 * adjacent pair of letters is contour-kerned and structurally bridged so the entire
 * word forms a single continuous, 1-piece solid (peça única inteiriça).
 */
export function buildVectorTextShapes(
  rawText: string,
  fontStyle: FontStyleId,
  targetMaxWidth: number,
  targetHeight: number,
  letterSpacingRatio = 0.14,
  fillExactBounds = false,
  joinAllLetters = fillExactBounds
): BuiltTextShapes {
  const clean = rawText.trim().toUpperCase();
  if (!clean) {
    return {
      shapes: [],
      firstLetterShapes: [],
      firstLetterCapY: 0,
      totalWidth: 0,
      minY: 0,
      maxY: 0,
    };
  }

  const styleWidthMul =
    fontStyle === 'serif'
      ? 0.78
      : fontStyle === 'condensed'
      ? 0.82
      : fontStyle === 'wide'
      ? 1.14
      : 1.0;

  // In joined 1-piece mode (Coração Nome), ignore spaces so multi-word input never splits into 2 pieces
  const rawChars = Array.from(clean);
  const chars = joinAllLetters ? rawChars.filter((c) => c !== ' ') : rawChars;
  if (chars.length === 0) {
    return {
      shapes: [],
      firstLetterShapes: [],
      firstLetterCapY: 0,
      totalWidth: 0,
      minY: 0,
      maxY: 0,
    };
  }

  const tracking = 100 * letterSpacingRatio * styleWidthMul;

  let hasUpperAccent = false;
  let hasCedilla = false;

  const resolved = chars.map((ch) => {
    const mapped = ACCENTED_MAP[ch];
    if (mapped) {
      if (mapped.accent === 'cedilla') hasCedilla = true;
      else hasUpperAccent = true;
      return {
        baseChar: mapped.base,
        glyph: GLYPHS[mapped.base] ?? GLYPHS.A,
        accent: mapped.accent,
      };
    }
    return {
      baseChar: ch,
      glyph: GLYPHS[ch] ?? GLYPHS[' '],
      accent: null as AccentType | null,
    };
  });

  const rawTopY = hasUpperAccent ? 128 : 100;
  const rawBotY = hasCedilla ? -18 : 0;
  const rawTotalH = rawTopY - rawBotY;

  // Build normalized (100-unit height, styleWidthMul width) shapes for each character
  const unitCharShapes: THREE.Shape[][] = [];
  const unitAccentShapes: THREE.Shape[][] = [];
  const unitProfiles: GlyphScanProfile[] = [];
  const unitAdvances: number[] = [];

  for (const entry of resolved) {
    const adv =
      fontStyle === 'serif' && entry.baseChar === 'I'
        ? 38
        : entry.glyph.advance;
    const localShiftX =
      fontStyle === 'serif' && entry.baseChar === 'I'
        ? 5 * styleWidthMul
        : 0;

    const charShapes = entry.glyph.build(localShiftX, styleWidthMul, 1);
    if (fontStyle === 'serif') {
      charShapes.push(
        ...buildSerifCapsForChar(
          entry.baseChar,
          entry.glyph.advance,
          localShiftX,
          styleWidthMul,
          1
        )
      );
    }

    const accShapes = entry.accent
      ? buildAccentShapes(
          entry.accent,
          entry.glyph.advance,
          localShiftX,
          styleWidthMul,
          1
        )
      : [];

    unitCharShapes.push(charShapes);
    unitAccentShapes.push(accShapes);
    unitProfiles.push(computeGlyphScanProfile(charShapes));
    unitAdvances.push(adv * styleWidthMul);
  }

  // Compute horizontal offsets for each character and any structural join bridges
  const charOffsets: number[] = new Array(resolved.length).fill(0);
  const bridgeShapesUnit: THREE.Shape[] = [];

  const addUnitBridgeBar = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 <= x0 + 0.1 || y1 <= y0 + 0.1) return;
    bridgeShapesUnit.push(
      polyShape(
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ],
        0,
        1,
        1
      )
    );
  };

  for (let i = 0; i < resolved.length - 1; i++) {
    const profA = unitProfiles[i];
    const profB = unitProfiles[i + 1];
    const nominalStep = unitAdvances[i] + tracking;

    if (!joinAllLetters) {
      charOffsets[i + 1] = charOffsets[i] + nominalStep;
      continue;
    }

    // 1. Find exact contour-touch relative offset across all 50 vertical scanline bands.
    //     To ensure a thick vertical contact zone (not just a single corner vertex touching),
    //    compute the best 4-band (8-unit tall) contact offset where all 4 bands overlap!
    const contactBands = 4;
    let bestWindowTouch = -Infinity;
    for (let b0 = 0; b0 <= PROFILE_BANDS - contactBands; b0++) {
      let windowMinTouch = Infinity;
      let valid = true;
      for (let k = 0; k < contactBands; k++) {
        const b = b0 + k;
        if (profA.rightX[b] > -Infinity && profB.leftX[b] < Infinity) {
          const touch = profA.rightX[b] - profB.leftX[b];
          if (touch < windowMinTouch) windowMinTouch = touch;
        } else {
          valid = false;
          break;
        }
      }
      if (valid && windowMinTouch > bestWindowTouch) {
        bestWindowTouch = windowMinTouch;
      }
    }

    let maxSingleTouch = -Infinity;
    for (let b = 0; b < PROFILE_BANDS; b++) {
      if (profA.rightX[b] > -Infinity && profB.leftX[b] < Infinity) {
        const touch = profA.rightX[b] - profB.leftX[b];
        if (touch > maxSingleTouch) {
          maxSingleTouch = touch;
        }
      }
    }
    if (!Number.isFinite(maxSingleTouch)) {
      maxSingleTouch = profA.maxX - profB.minX;
    }
    if (!Number.isFinite(bestWindowTouch)) {
      bestWindowTouch = maxSingleTouch;
    }

    // Target a solid 5.6-unit horizontal overlap across the 4-band contact zone,
    // while never letting any single band overlap by more than 8.5 units
    const targetOverlap = 5.6 * styleWidthMul;
    const maxSingleOverlap = 8.5 * styleWidthMul;
    const minOverlap = 4.2 * styleWidthMul;
    const minStep = Math.max(
      20 * styleWidthMul,
      Math.min(unitAdvances[i], unitAdvances[i + 1]) * 0.56,
      maxSingleTouch - maxSingleOverlap
    );
    const idealStep = bestWindowTouch - targetOverlap;
    const step = THREE.MathUtils.clamp(idealStep, minStep, nominalStep);
    charOffsets[i + 1] = charOffsets[i] + step;

    // 2. Count how many vertical scanline bands now have at least minOverlap of solid intersection
    const oxA = charOffsets[i];
    const oxB = charOffsets[i + 1];
    let solidOverlapBands = 0;
    for (let b = 0; b < PROFILE_BANDS; b++) {
      if (profA.rightX[b] > -Infinity && profB.leftX[b] < Infinity) {
        const ov = oxA + profA.rightX[b] - (oxB + profB.leftX[b]);
        if (ov >= minOverlap) {
          solidOverlapBands++;
        }
      }
    }

    // If fewer than 4 vertical bands (~8 units tall) have solid overlap (e.g. clamped by minStep),
    // weld the closest 6-band window so the pair is guaranteed to be a single continuous solid.
    if (solidOverlapBands < 4) {
      const winSize = 6;
      let bestStartB = 0;
      let bestScore = -Infinity;

      for (let b0 = 0; b0 <= PROFILE_BANDS - winSize; b0++) {
        let sumOv = 0;
        let validCount = 0;
        for (let k = 0; k < winSize; k++) {
          const b = b0 + k;
          if (profA.rightX[b] > -Infinity && profB.leftX[b] < Infinity) {
            sumOv += oxA + profA.rightX[b] - (oxB + profB.leftX[b]);
            validCount++;
          }
        }
        if (validCount === winSize && sumOv > bestScore) {
          bestScore = sumOv;
          bestStartB = b0;
        }
      }

      let winRightA = Infinity;
      let winLeftB = -Infinity;
      for (let k = 0; k < winSize; k++) {
        const b = bestStartB + k;
        if (profA.rightX[b] > -Infinity && profA.rightX[b] < winRightA) {
          winRightA = profA.rightX[b];
        }
        if (profB.leftX[b] < Infinity && profB.leftX[b] > winLeftB) {
          winLeftB = profB.leftX[b];
        }
      }

      if (!Number.isFinite(winRightA) || !Number.isFinite(winLeftB)) {
        winRightA = profA.maxX;
        winLeftB = profB.minX;
      }

      const worldRightA = oxA + winRightA;
      const worldLeftB = oxB + winLeftB;
      const pad = 5.0 * styleWidthMul;
      const bx0 = Math.max(oxA + profA.minX, Math.min(worldRightA, worldLeftB) - pad);
      const bx1 = Math.min(oxB + profB.maxX, Math.max(worldRightA, worldLeftB) + pad);
      const y0 = bestStartB * (100 / PROFILE_BANDS);
      const y1 = (bestStartB + winSize) * (100 / PROFILE_BANDS);
      addUnitBridgeBar(bx0, bx1, y0, y1);
    }
  }

  // Measure exact horizontal bounding interval [wordMinX, wordMaxX] across all positioned characters
  let wordMinX = Infinity;
  let wordMaxX = -Infinity;
  for (let i = 0; i < resolved.length; i++) {
    const ox = charOffsets[i];
    const prof = unitProfiles[i];
    if (ox + prof.minX < wordMinX) wordMinX = ox + prof.minX;
    if (ox + prof.maxX > wordMaxX) wordMaxX = ox + prof.maxX;
  }
  if (!Number.isFinite(wordMinX) || wordMaxX <= wordMinX) {
    wordMinX = 0;
    wordMaxX = 100;
  }

  const rawSpanW = wordMaxX - wordMinX;
  const wordCenterX = (wordMinX + wordMaxX) * 0.5;

  // Scale to fit width & height. When fillExactBounds is true (pure heart-name mode),
  // stretch cleanly to span the exact heart width and depth so outer letters form the heart lobes!
  const scaleByH = targetHeight / rawTotalH;
  const scaleByW = rawSpanW > 0 ? targetMaxWidth / rawSpanW : scaleByH;

  const sy = fillExactBounds ? scaleByH : Math.min(scaleByH, scaleByW * 1.18);
  const scaleUnitX = fillExactBounds
    ? targetMaxWidth / Math.max(1, rawSpanW)
    : Math.min(sy, targetMaxWidth / Math.max(1, rawSpanW));

  const renderedWidth = rawSpanW * scaleUnitX;
  const yShift = -rawBotY * sy;

  const shapes: THREE.Shape[] = [];
  const firstLetterShapes: THREE.Shape[] = [];
  let capturedFirstLetter = false;

  for (let i = 0; i < resolved.length; i++) {
    const entry = resolved[i];
    const dx = charOffsets[i] - wordCenterX;
    const isFirstGlyph = !capturedFirstLetter && entry.baseChar !== ' ';
    if (isFirstGlyph) {
      capturedFirstLetter = true;
    }

    for (const sh of unitCharShapes[i]) {
      const transformed = cloneAndTransformShape(sh, dx, scaleUnitX, sy, yShift);
      shapes.push(transformed);
      if (isFirstGlyph) {
        firstLetterShapes.push(transformed);
      }
    }

    for (const acc of unitAccentShapes[i]) {
      shapes.push(cloneAndTransformShape(acc, dx, scaleUnitX, sy, yShift));
    }
  }

  for (const bridge of bridgeShapesUnit) {
    shapes.push(cloneAndTransformShape(bridge, -wordCenterX, scaleUnitX, sy, yShift));
  }

  return {
    shapes,
    firstLetterShapes,
    firstLetterCapY: 100 * sy + yShift,
    totalWidth: renderedWidth,
    minY: 0,
    maxY: rawTotalH * sy,
  };
}
