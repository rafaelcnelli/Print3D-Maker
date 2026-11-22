import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

export interface FirstLetterTopAnchor {
  /** Center X of the best solid horizontal run near the top edge of the chosen letter */
  x: number;
  /** Topmost Y in 2D glyph space where the solid stroke reaches */
  topY: number;
  /** Minimum horizontal solid width (mm) available across the entire arch tunnel depth */
  solidWidth: number;
  /** Leftmost X of the chosen letter */
  minX: number;
  /** Rightmost X of the chosen letter */
  maxX: number;
  /** Which letter was selected as the safest, strongest anchor (0 = 1st letter, 1 = 2nd letter) */
  letterIndex: 0 | 1;
  /** Recommended safe tunnel tube radius (mm) leaving generous side walls */
  recommendedTubeRadius: number;
  /** Recommended safe torus major radius (mm) */
  recommendedMajorRadius: number;
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

interface CandidateRunEvaluation {
  anchor: FirstLetterTopAnchor;
  score: number;
}

function computeRecommendedArchRadii(solidWidth: number): {
  recommendedTubeRadius: number;
  recommendedMajorRadius: number;
} {
  // Minimum 0.9mm side wall on BOTH sides of the hole (1.8mm total wall margin)
  // and at most 21% of the stroke's minimum solid width across the tunnel depth.
  // Capped to [0.85mm .. 1.15mm] (1.7mm .. 2.3mm hole diameter) so it fits standard
  // keyring jump rings comfortably while never looking oversized or breaking thin strokes.
  const maxSafeByWall = (solidWidth - 1.8) * 0.5;
  const proportional = solidWidth * 0.21;
  const recommendedTubeRadius = THREE.MathUtils.clamp(
    Math.min(maxSafeByWall, proportional),
    0.85,
    1.15
  );
  // Major radius proportional to tube radius and stroke thickness, leaving a strong bridge
  const recommendedMajorRadius = THREE.MathUtils.clamp(
    Math.max(recommendedTubeRadius * 2.25, Math.min(solidWidth * 0.42, 2.75)),
    2.1,
    2.75
  );
  return { recommendedTubeRadius, recommendedMajorRadius };
}

/**
 * Evaluates a single letter's shapes (1st or 2nd letter) across the full vertical depth
 * of the negative keyring arch (from the top edge down to 74% of letter height) so that
 * tapered letters (A, V, W, Y) and letters with internal counters (R, P, B, O, D) or
 * thin serif caps are measured by their TRUE narrowest solid stroke width across the tunnel.
 */
function evaluateLetterTopCandidates(
  letterShapes: THREE.Shape[],
  fallbackCapY: number,
  letterIndex: 0 | 1,
  scoreX?: (x: number) => number
): CandidateRunEvaluation | null {
  const polys = sampleShapes(letterShapes);
  if (polys.length === 0) return null;

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
  const samples = 112;

  interface Run {
    startX: number;
    endX: number;
    midX: number;
    width: number;
    localTopY: number;
  }

  const findLocalTopY = (x: number): number => {
    for (let s = 100; s >= 75; s--) {
      const y = topY * (s / 100);
      if (isPointInPolys(x, y, polys)) {
        return y;
      }
    }
    return topY * 0.96;
  };

  // Evaluate every candidate center X across the letter by measuring the continuous solid
  // horizontal interval [leftEdge(y), rightEdge(y)] at multiple Y depths of the tunnel.
  // Because the arch enters at the top edge (~95% of localTopY) and curves down to ~80% of localTopY,
  // we measure the worst-case horizontal clearance from candidateX to the nearest side edge
  // across the tunnel depth so curved letters (S, O, C, G, B, R) and angled letters (A, V, W, Y)
  // are placed where the stroke is widest and best centered!
  const stepX = glyphW / samples;

  const measureSymmetricWidthAt = (cx: number, yLevels: number[]): number => {
    let minHalfWidth = Infinity;
    for (const y of yLevels) {
      if (!isPointInPolys(cx, y, polys)) return 0;
      let leftDist = 0;
      for (let d = stepX * 0.5; cx - d >= minX - stepX; d += stepX * 0.5) {
        if (!isPointInPolys(cx - d, y, polys)) break;
        leftDist = d;
      }
      let rightDist = 0;
      for (let d = stepX * 0.5; cx + d <= maxX + stepX; d += stepX * 0.5) {
        if (!isPointInPolys(cx + d, y, polys)) break;
        rightDist = d;
      }
      const halfW = Math.min(leftDist, rightDist);
      if (halfW < minHalfWidth) minHalfWidth = halfW;
    }
    return Number.isFinite(minHalfWidth) ? minHalfWidth * 2 : 0;
  };

  let bestEval: CandidateRunEvaluation | null = null;

  for (let i = 1; i < samples; i++) {
    const candidateX = minX + (i / samples) * glyphW;
    const localTopY = findLocalTopY(candidateX);
    // Require the column to reach near the top of the letter (>= 88% of maxY)
    if (localTopY < topY * 0.88) continue;

    // Probe across the arch depth from right at the top entrance (98.5%) down to 82% of localTopY.
    // Including 98.5% ensures tapered apexes (like 'A') are measured by their narrow top entrance
    // rather than wider lower sections, preventing the top opening from coming near the sloped side walls.
    const yLevels = [
      localTopY * 0.985,
      localTopY * 0.95,
      localTopY * 0.9,
      localTopY * 0.85,
      localTopY * 0.82,
    ];
    let effectiveSolidWidth = measureSymmetricWidthAt(candidateX, yLevels);
    if (effectiveSolidWidth < 1.2) {
      // Fallback for shallower top bars (like E, F, T, Z top horizontal bar)
      effectiveSolidWidth = measureSymmetricWidthAt(candidateX, [
        localTopY * 0.98,
        localTopY * 0.94,
        localTopY * 0.89,
      ]);
    }
    if (effectiveSolidWidth < 1.0) continue;

    const { recommendedTubeRadius, recommendedMajorRadius } =
      computeRecommendedArchRadii(effectiveSolidWidth);

    const silHeight = scoreX ? scoreX(candidateX) : 22;
    const thinStrokePenalty =
      effectiveSolidWidth < 3.4 ? (3.4 - effectiveSolidWidth) * 7.5 : 0;
    const lowHeightPenalty =
      scoreX && silHeight < 14 ? (14 - silHeight) * 4.0 : 0;
    const firstLetterTieBreaker = letterIndex === 0 ? 0.6 : 0;

    const totalScore =
      effectiveSolidWidth * 2.8 +
      silHeight * 0.85 +
      firstLetterTieBreaker -
      thinStrokePenalty -
      lowHeightPenalty;

    if (!bestEval || totalScore > bestEval.score) {
      bestEval = {
        anchor: {
          x: candidateX,
          topY: localTopY,
          solidWidth: effectiveSolidWidth,
          minX,
          maxX,
          letterIndex,
          recommendedTubeRadius,
          recommendedMajorRadius,
        },
        score: totalScore,
      };
    }
  }

  if (!bestEval) {
    const fallbackWidth = glyphW * 0.42;
    const midX = (minX + maxX) * 0.5;
    const { recommendedTubeRadius, recommendedMajorRadius } =
      computeRecommendedArchRadii(fallbackWidth);
    const silScore = scoreX ? scoreX(midX) : 20;
    return {
      anchor: {
        x: midX,
        topY,
        solidWidth: fallbackWidth,
        minX,
        maxX,
        letterIndex,
        recommendedTubeRadius,
        recommendedMajorRadius,
      },
      score: fallbackWidth * 1.6 + silScore * 0.7,
    };
  }

  return bestEval;
}

/**
 * Finds the best solid anchor point right along the top edge of the 1st letter
 * (or automatically chooses the 2nd letter when `secondLetterShapes` is provided and
 * offers a stronger, wider, or better-positioned stroke on the piece).
 */
export function findFirstLetterTopAnchor(
  firstLetterShapes: THREE.Shape[],
  fallbackCapY: number,
  scoreX?: (x: number) => number,
  secondLetterShapes?: THREE.Shape[]
): FirstLetterTopAnchor {
  const firstCandidate = evaluateLetterTopCandidates(
    firstLetterShapes,
    fallbackCapY,
    0,
    scoreX
  );
  const secondCandidate =
    secondLetterShapes && secondLetterShapes.length > 0
      ? evaluateLetterTopCandidates(secondLetterShapes, fallbackCapY, 1, scoreX)
      : null;

  if (firstCandidate && secondCandidate) {
    return secondCandidate.score > firstCandidate.score
      ? secondCandidate.anchor
      : firstCandidate.anchor;
  }
  if (firstCandidate) return firstCandidate.anchor;
  if (secondCandidate) return secondCandidate.anchor;

  const { recommendedTubeRadius, recommendedMajorRadius } =
    computeRecommendedArchRadii(6);
  return {
    x: 0,
    topY: fallbackCapY,
    solidWidth: 6,
    minX: -3,
    maxX: 3,
    letterIndex: 0,
    recommendedTubeRadius,
    recommendedMajorRadius,
  };
}

/**
 * Convenience alias that evaluates both the 1st and 2nd letters of a word and returns
 * the anchor with the safest wall clearance and silhouette height.
 */
export function findBestWordTopAnchor(
  firstLetterShapes: THREE.Shape[],
  secondLetterShapes: THREE.Shape[],
  fallbackCapY: number,
  scoreX?: (x: number) => number
): FirstLetterTopAnchor {
  return findFirstLetterTopAnchor(
    firstLetterShapes,
    fallbackCapY,
    scoreX,
    secondLetterShapes
  );
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
