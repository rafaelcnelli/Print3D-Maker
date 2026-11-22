import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

export interface FirstLetterTopAnchor {
  /** Center X of the best solid horizontal run near the top edge of the first letter */
  x: number;
  /** Topmost Y in 2D glyph space where the solid stroke reaches */
  topY: number;
  /** Horizontal solid width (mm) available at that top band */
  solidWidth: number;
  /** Leftmost X of the first letter */
  minX: number;
  /** Rightmost X of the first letter */
  maxX: number;
}

export interface NegativeArchPlacement {
  /** World-space center of the negative torus */
  center: [number, number, number];
  /** Major radius of the torus ring (mm) */
  majorRadius: number;
  /** Tube radius of the tunnel cross-section (mm) */
  tubeRadius: number;
  /** Euler rotation [rx, ry, rz] orienting the torus ring */
  rotation: [number, number, number];
}

function pointInRing2D(px: number, py: number, ring: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

interface SampledShapePoly {
  outer: THREE.Vector2[];
  holes: THREE.Vector2[][];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function sampleShapes(shapes: THREE.Shape[]): SampledShapePoly[] {
  return shapes.map((sh) => {
    const outer = sh.getPoints(28);
    const holes = sh.holes.map((h) => h.getPoints(20));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of outer) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { outer, holes, minX, maxX, minY, maxY };
  });
}

function isPointInPolys(x: number, y: number, polys: SampledShapePoly[]): boolean {
  for (const poly of polys) {
    if (x < poly.minX || x > poly.maxX || y < poly.minY || y > poly.maxY) continue;
    if (!pointInRing2D(x, y, poly.outer)) continue;
    let inHole = false;
    for (const hole of poly.holes) {
      if (pointInRing2D(x, y, hole)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

/**
 * Finds the best solid anchor point right along the top edge of the first letter.
 * Handles split-top letters cleanly (e.g. V, W, U, H, K, M, N, X, Y) as well as
 * single-top letters (A, O, S, T, I, L, E, R, etc.).
 *
 * When `scoreX` is provided (e.g., Heart height yMax(x)), prefers the solid top arm
 * that sits on the strongest, tallest portion of the silhouette.
 */
export function findFirstLetterTopAnchor(
  firstLetterShapes: THREE.Shape[],
  fallbackCapY: number,
  scoreX?: (x: number) => number
): FirstLetterTopAnchor {
  const polys = sampleShapes(firstLetterShapes);
  if (polys.length === 0) {
    return {
      x: 0,
      topY: fallbackCapY,
      solidWidth: 8,
      minX: -4,
      maxX: 4,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polys) {
    if (p.minX < minX) minX = p.minX;
    if (p.maxX > maxX) maxX = p.maxX;
    if (p.maxY > maxY) maxY = p.maxY;
  }

  const glyphW = Math.max(1, maxX - minX);
  const topY = maxY > 0 ? maxY : fallbackCapY;
  // Probe BOTH near the rear top edge (96%) AND ~14% inward (85%) where the top
  // opening of the curved arch emerges so diagonal arms (V, A, W, K, Y) stay fully solid.
  const probeOuterY = topY * 0.96;
  const probeInnerY = topY * 0.85;
  const samples = 96;

  interface Run {
    startX: number;
    endX: number;
    midX: number;
    width: number;
  }

  const collectRuns = (checkFn: (x: number) => boolean): Run[] => {
    const out: Run[] = [];
    let inRun = false;
    let runStart = minX;
    for (let i = 0; i <= samples; i++) {
      const x = minX + (i / samples) * glyphW;
      const solid = i < samples && checkFn(x);
      if (solid && !inRun) {
        inRun = true;
        runStart = x;
      } else if (!solid && inRun) {
        inRun = false;
        const runEnd = minX + ((i - 1) / samples) * glyphW;
        const w = runEnd - runStart;
        if (w > 0.25) {
          out.push({
            startX: runStart,
            endX: runEnd,
            midX: (runStart + runEnd) * 0.5,
            width: w,
          });
        }
      }
    }
    return out;
  };

  let runs = collectRuns(
    (x) => isPointInPolys(x, probeOuterY, polys) && isPointInPolys(x, probeInnerY, polys)
  );
  if (runs.length === 0) {
    runs = collectRuns((x) => isPointInPolys(x, topY * 0.93, polys));
  }

  if (runs.length === 0) {
    return {
      x: (minX + maxX) * 0.5,
      topY,
      solidWidth: glyphW * 0.45,
      minX,
      maxX,
    };
  }

  // Pick the strongest run: combine solid width + optional silhouette height score
  let best = runs[0];
  let bestScore = -Infinity;
  for (const r of runs) {
    // If a run is wide (e.g. a full horizontal serif/top bar), pick the best x inside it
    const candidateX = scoreX
      ? r.width > 8
        ? (() => {
            // Sample along the wide run while keeping >= 2.8mm margin from run edges
            const margin = Math.min(3.0, r.width * 0.35);
            let bestX = r.midX;
            let bestS = scoreX(r.midX);
            for (let k = 0; k <= 8; k++) {
              const cx = r.startX + margin + (k / 8) * Math.max(0.1, r.width - margin * 2);
              const s = scoreX(cx);
              if (s > bestS) {
                bestS = s;
                bestX = cx;
              }
            }
            return bestX;
          })()
        : r.midX
      : r.midX;

    const silhouetteBonus = scoreX ? scoreX(candidateX) * 1.6 : 0;
    const score = r.width * 1.4 + silhouetteBonus;
    if (score > bestScore) {
      bestScore = score;
      best = { ...r, midX: candidateX };
    }
  }

  return {
    x: best.midX,
    topY,
    solidWidth: best.width,
    minX,
    maxX,
  };
}

/**
 * Ensures geometry has exact position + normal attributes and no stale groups
 * before passing into three-bvh-csg Brush.
 */
function prepareForCSG(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const clean = geo.index ? geo.toNonIndexed() : geo.clone();
  // Remove UV or extraneous attributes so solid & cutter have identical attribute layouts
  for (const key of Object.keys(clean.attributes)) {
    if (key !== 'position' && key !== 'normal') {
      clean.deleteAttribute(key);
    }
  }
  if (!clean.getAttribute('normal')) {
    clean.computeVertexNormals();
  }
  clean.clearGroups();
  return clean;
}

const _csgEvaluator = new Evaluator();
_csgEvaluator.useGroups = false;
_csgEvaluator.attributes = ['position', 'normal'];

/**
 * Carves a real 3D curved negative torus arch ("arco negativo") out of `solidGeo`
 * using watertight BVH-CSG boolean subtraction.
 *
 * The torus straddles the top-rear edge of the first letter:
 *  - Enters through the top horizontal surface (+Y)
 *  - Curves smoothly inside the solid material with safe wall thickness
 *  - Exits through the rear vertical wall (-Z)
 *
 * Returns a brand-new BufferGeometry with the curved tunnel physically carved out
 * (visible in the 3D viewport AND exported hollow in Binary STL / OBJ!).
 */
export function subtractNegativeKeyringArch(
  solidGeo: THREE.BufferGeometry,
  placement: NegativeArchPlacement
): THREE.BufferGeometry {
  const preparedSolid = prepareForCSG(solidGeo);

  const torusGeo = new THREE.TorusGeometry(
    placement.majorRadius,
    placement.tubeRadius,
    20,
    40
  );
  const preparedTorus = prepareForCSG(torusGeo);
  torusGeo.dispose();

  const solidBrush = new Brush(preparedSolid);
  solidBrush.updateMatrixWorld(true);

  const holeBrush = new Brush(preparedTorus);
  holeBrush.position.set(
    placement.center[0],
    placement.center[1],
    placement.center[2]
  );
  holeBrush.rotation.set(
    placement.rotation[0],
    placement.rotation[1],
    placement.rotation[2]
  );
  holeBrush.updateMatrixWorld(true);

  try {
    const resultBrush = _csgEvaluator.evaluate(solidBrush, holeBrush, SUBTRACTION);
    const outGeo = resultBrush.geometry;
    // Dispose temporary inputs
    preparedSolid.dispose();
    preparedTorus.dispose();
    return outGeo;
  } catch {
    // Graceful safety fallback: never crash if degenerate geometry occurs
    preparedTorus.dispose();
    return preparedSolid;
  }
}
