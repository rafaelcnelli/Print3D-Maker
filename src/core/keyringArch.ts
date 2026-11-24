import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { KeyringDirection } from '../types/project';

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

export interface DirectionalSilhouetteAnchor {
  /** Exact contour boundary X in 2D shape space (mm) for negative arch carving */
  x: number;
  /** Exact contour boundary Y in 2D shape space (mm) for negative arch carving */
  y: number;
  /** Outward unit vector X oriented so (-ux, -uy) enters deep into solid material */
  ux: number;
  /** Outward unit vector Y oriented so (-ux, -uy) enters deep into solid material */
  uy: number;
  /** Protruding anchor X advanced to clear any local dual-lobe valley (for 'hole' and 'loop') */
  protrudeX: number;
  /** Protruding anchor Y advanced to clear any local dual-lobe valley (for 'hole' and 'loop') */
  protrudeY: number;
  /** Nominal cardinal unit vector X */
  cardinalUx: number;
  /** Nominal cardinal unit vector Y */
  cardinalUy: number;
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
  /** Optional outward horizontal extension (mm) ensuring the side exit punches cleanly through outer bevels */
  exitExtensionMm?: number;
}

export function getCardinalDirectionVector(direction: KeyringDirection): {
  ux: number;
  uy: number;
} {
  switch (direction) {
    case 'top':
      return { ux: 0, uy: 1 };
    case 'top-right':
      return { ux: Math.SQRT1_2, uy: Math.SQRT1_2 };
    case 'right':
      return { ux: 1, uy: 0 };
    case 'bottom-right':
      return { ux: Math.SQRT1_2, uy: -Math.SQRT1_2 };
    case 'bottom':
      return { ux: 0, uy: -1 };
    case 'bottom-left':
      return { ux: -Math.SQRT1_2, uy: -Math.SQRT1_2 };
    case 'left':
      return { ux: -1, uy: 0 };
    case 'top-left':
      return { ux: -Math.SQRT1_2, uy: Math.SQRT1_2 };
  }
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
    const outer = sh.getPoints(36);
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
 * Finds the optimal outer contour anchor point on 2D keychain shapes for any of the
 * 8 cardinal/intercardinal directions ('top', 'top-right', 'right', 'bottom-right',
 * 'bottom', 'bottom-left', 'left', 'top-left').
 *
 * Subdivides straight and curved polygon edges densely so polygons like stars, bolts,
 * crowns, capsules, hearts, and rectangles all yield accurate boundary coordinates,
 * and verifies that stepping inward along (-ux, -uy) lands inside thick solid material
 * while stepping outward along (+ux, +uy) exits cleanly outside the perimeter.
 */
export function findDirectionalSilhouetteAnchor(
  shapes: THREE.Shape[],
  direction: KeyringDirection = 'top'
): DirectionalSilhouetteAnchor {
  const { ux: cux, uy: cuy } = getCardinalDirectionVector(direction);
  const polys = sampleShapes(shapes);
  const pts: THREE.Vector2[] = [];
  const stepMm = 0.35;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const poly of polys) {
    const raw = poly.outer;
    if (raw.length < 2) continue;
    for (let i = 0; i < raw.length; i++) {
      const a = raw[i];
      const b = raw[(i + 1) % raw.length];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(dist / stepMm));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        pts.push(new THREE.Vector2(px, py));
      }
    }
  }

  if (pts.length === 0 || !Number.isFinite(minX)) {
    return {
      x: cux * 18,
      y: cuy * 18,
      ux: cux,
      uy: cuy,
      protrudeX: cux * 18,
      protrudeY: cuy * 18,
      cardinalUx: cux,
      cardinalUy: cuy,
    };
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;

  const getProj = (p: { x: number; y: number }) => (p.x - cx) * cux + (p.y - cy) * cuy;
  const getPerp = (p: { x: number; y: number }) => -(p.x - cx) * cuy + (p.y - cy) * cux;

  let maxProj = -Infinity;
  for (const p of pts) {
    const pr = getProj(p);
    if (pr > maxProj) maxProj = pr;
  }

  // Average perpendicular coordinate in the extreme 2.2mm band to detect symmetric dual-lobe crowns
  const bandPts = pts.filter((p) => getProj(p) >= maxProj - 2.2);
  let sumPerp = 0;
  for (const p of bandPts) sumPerp += getPerp(p);
  const meanPerp = bandPts.length > 0 ? sumPerp / bandPts.length : 0;

  // Prefer the actual contour point right on the centerline (|perp - meanPerp| <= 1.2mm)
  // unless there is a deep concavity (> 4.5mm) at the centerline (like between bottom star legs)
  let bestPt = bandPts[0] ?? pts[0];
  let centerMaxProj = -Infinity;
  let centerCandidate: THREE.Vector2 | null = null;

  for (const p of pts) {
    const pr = getProj(p);
    if (pr <= 0) continue;
    const pe = Math.abs(getPerp(p) - meanPerp);
    if (pe <= 1.1 && pr > centerMaxProj) {
      centerMaxProj = pr;
      centerCandidate = p;
    }
  }

  if (centerCandidate && maxProj - centerMaxProj <= 4.5) {
    bestPt = centerCandidate;
  } else {
    let bestDist = Infinity;
    for (const p of bandPts) {
      const d = Math.abs(getPerp(p) - meanPerp);
      if (d < bestDist) {
        bestDist = d;
        bestPt = p;
      }
    }
  }

  // Refine local contour point and outward direction within a small neighborhood (<= 3.2mm, +-35 deg)
  // so that stepping inward by 2.15mm lands in the widest solid cross-section of the lobe/edge
  // and stepping outward by 0.45mm is strictly outside the shape.
  const baseAngle = Math.atan2(cuy, cux);
  const localCandidates = pts.filter(
    (p) => Math.hypot(p.x - bestPt.x, p.y - bestPt.y) <= 3.2
  );

  let chosenX = bestPt.x;
  let chosenY = bestPt.y;
  let chosenUx = cux;
  let chosenUy = cuy;
  let bestScore = -Infinity;

  for (const cand of localCandidates) {
    for (let da = -35; da <= 35; da += 7) {
      const ang = baseAngle + (da * Math.PI) / 180;
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const inX = cand.x - ux * 2.15;
      const inY = cand.y - uy * 2.15;
      const outX = cand.x + ux * 0.45;
      const outY = cand.y + uy * 0.45;

      if (!isPointInPolys(inX, inY, polys) || isPointInPolys(outX, outY, polys)) {
        continue;
      }

      // Measure lateral solid clearance perpendicular to (ux, uy) at the tunnel entrance (inX, inY)
      const px = -uy;
      const py = ux;
      let leftClear = 0;
      let rightClear = 0;
      for (let step = 0.25; step <= 3.5; step += 0.25) {
        if (isPointInPolys(inX + px * step, inY + py * step, polys)) leftClear = step;
        else break;
      }
      for (let step = 0.25; step <= 3.5; step += 0.25) {
        if (isPointInPolys(inX - px * step, inY - py * step, polys)) rightClear = step;
        else break;
      }

      const minClear = Math.min(leftClear, rightClear);
      const distPenalty = Math.hypot(cand.x - bestPt.x, cand.y - bestPt.y) * 0.45;
      const anglePenalty = (Math.abs(da) / 35) * 0.65;
      const score = minClear * 3.0 - distPenalty - anglePenalty;

      if (score > bestScore) {
        bestScore = score;
        chosenX = cand.x;
        chosenY = cand.y;
        chosenUx = ux;
        chosenUy = uy;
      }
    }
  }

  // For protruding tabs ('hole' and 'loop'), check the maximum projection within +-4.2mm perpendicular
  // to chosen point so dual-lobe valleys (like paw toes) advance the protruding hole clear of adjacent lobes
  const chosenProj = getProj({ x: chosenX, y: chosenY });
  const chosenPerp = getPerp({ x: chosenX, y: chosenY });
  let localBandMaxProj = chosenProj;
  for (const p of pts) {
    if (Math.abs(getPerp(p) - chosenPerp) <= 4.2) {
      const pr = getProj(p);
      if (pr > localBandMaxProj) localBandMaxProj = pr;
    }
  }
  const extraAdvance = THREE.MathUtils.clamp(localBandMaxProj - chosenProj, 0, 2.8);
  const protrudeX = chosenX + cux * extraAdvance;
  const protrudeY = chosenY + cuy * extraAdvance;

  return {
    x: chosenX,
    y: chosenY,
    ux: chosenUx,
    uy: chosenUy,
    protrudeX,
    protrudeY,
    cardinalUx: cux,
    cardinalUy: cuy,
  };
}

interface CandidateRunEvaluation {
  anchor: FirstLetterTopAnchor;
  score: number;
}

function computeRecommendedArchRadii(solidWidth: number): {
  recommendedTubeRadius: number;
  recommendedMajorRadius: number;
} {
  const maxSafeByWall = (solidWidth - 1.8) * 0.5;
  const proportional = solidWidth * 0.21;
  const recommendedTubeRadius = THREE.MathUtils.clamp(
    Math.min(maxSafeByWall, proportional),
    0.85,
    1.15
  );
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

  const findLocalTopY = (x: number): number => {
    for (let s = 100; s >= 75; s--) {
      const y = topY * (s / 100);
      if (isPointInPolys(x, y, polys)) {
        return y;
      }
    }
    return topY * 0.96;
  };

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
    if (localTopY < topY * 0.88) continue;

    const yLevels = [
      localTopY * 0.985,
      localTopY * 0.95,
      localTopY * 0.9,
      localTopY * 0.85,
      localTopY * 0.82,
    ];
    let effectiveSolidWidth = measureSymmetricWidthAt(candidateX, yLevels);
    if (effectiveSolidWidth < 1.2) {
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
 * Ensures geometry has exact position + normal + color attributes and no stale groups
 * before passing into three-bvh-csg Brush.
 *
 * Keeping vertex `color` in CSG attributes guarantees that exterior solid triangles
 * always retain pure `(1, 1, 1)` with ZERO bleeding across the sharp rim of the hole,
 * while interior tunnel triangles inherit smooth, realistic cavity AO directly from
 * the subtracted cutter mesh.
 */
function prepareSolidForCSG(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const clean = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const key of Object.keys(clean.attributes)) {
    if (key !== 'position' && key !== 'normal' && key !== 'color') {
      clean.deleteAttribute(key);
    }
  }
  if (!clean.getAttribute('normal')) {
    clean.computeVertexNormals();
  }
  if (!clean.getAttribute('color')) {
    const count = clean.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    colors.fill(1);
    clean.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  clean.clearGroups();
  return clean;
}

/**
 * Prepares a subtracted cutter geometry with smooth natural cavity ambient occlusion
 * baked into its vertex `color` attribute BEFORE CSG subtraction.
 * Because `three-bvh-csg` interpolates attributes strictly within each source brush,
 * exterior faces of the solid mesh are never darkened or smeared, and real inward
 * normals from the subtracted cutter are preserved intact.
 */
function prepareCutterForCSG(
  geo: THREE.BufferGeometry,
  shadeAtLocalVertex: (x: number, y: number, z: number) => number
): THREE.BufferGeometry {
  const clean = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const key of Object.keys(clean.attributes)) {
    if (key !== 'position' && key !== 'normal') {
      clean.deleteAttribute(key);
    }
  }
  if (!clean.getAttribute('normal')) {
    clean.computeVertexNormals();
  }
  const pos = clean.getAttribute('position');
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const shade = THREE.MathUtils.clamp(
      shadeAtLocalVertex(pos.getX(i), pos.getY(i), pos.getZ(i)),
      0.24,
      0.92
    );
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  clean.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  clean.clearGroups();
  return clean;
}

const _csgEvaluator = new Evaluator();
_csgEvaluator.useGroups = false;
_csgEvaluator.attributes = ['position', 'normal', 'color'];

/**
 * Carves a real 3D curved negative torus arch ("arco negativo") out of `solidGeo`
 * using watertight BVH-CSG boolean subtraction.
 */
export function subtractNegativeKeyringArch(
  solidGeo: THREE.BufferGeometry,
  placement: NegativeArchPlacement
): THREE.BufferGeometry {
  const preparedSolid = prepareSolidForCSG(solidGeo);

  const torusGeo = new THREE.TorusGeometry(
    placement.majorRadius,
    placement.tubeRadius,
    24,
    48
  );
  // Smooth natural cavity AO inside the curved tunnel:
  // Lighter (0.58 linear) near both openings (-PI top entrance & -PI/2 exit),
  // softly deeper (0.30 linear) inside the curved mid-tunnel bend (-3*PI/4).
  const preparedTorus = prepareCutterForCSG(torusGeo, (lx, ly) => {
    const ang = Math.atan2(ly, lx);
    // Angular distance to the deepest point of the tunnel arc (-3*PI/4)
    let diff = Math.abs(ang - -0.75 * Math.PI);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const depth = Math.cos(Math.min(diff, Math.PI * 0.25) * 2);
    return 0.58 - depth * 0.28;
  });
  torusGeo.dispose();

  let solidBrush = new Brush(preparedSolid);
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
    solidBrush = _csgEvaluator.evaluate(solidBrush, holeBrush, SUBTRACTION);
    preparedTorus.dispose();

    if (placement.exitExtensionMm && placement.exitExtensionMm > 0) {
      const rotY = placement.rotation[1];
      const dirX = Math.cos(rotY);
      const dirZ = -Math.sin(rotY);
      const extLen = placement.exitExtensionMm;
      const exitCyl = new THREE.CylinderGeometry(
        placement.tubeRadius,
        placement.tubeRadius,
        extLen,
        24
      );
      exitCyl.rotateZ(Math.PI * 0.5);
      const preparedExit = prepareCutterForCSG(exitCyl, (lx) => {
        // Cylinder runs from -extLen/2 (inner end meeting torus) to +extLen/2 (outer exit mouth)
        const t = THREE.MathUtils.clamp((lx + extLen * 0.5) / Math.max(extLen, 0.1), 0, 1);
        return 0.44 + t * 0.16;
      });
      exitCyl.dispose();

      const exitBrush = new Brush(preparedExit);
      exitBrush.position.set(
        placement.center[0] + dirX * extLen * 0.5,
        placement.center[1] - placement.majorRadius,
        placement.center[2] + dirZ * extLen * 0.5
      );
      exitBrush.rotation.set(0, rotY, 0);
      exitBrush.updateMatrixWorld(true);

      solidBrush.updateMatrixWorld(true);
      solidBrush = _csgEvaluator.evaluate(solidBrush, exitBrush, SUBTRACTION);
      preparedExit.dispose();
    }

    const outGeo = solidBrush.geometry;
    preparedSolid.dispose();
    return outGeo;
  } catch {
    preparedTorus.dispose();
    return preparedSolid;
  }
}

/**
 * Carves a vertical entrance clearance shaft directly above the top opening of a
 * negative keyring arch so raised relief layers or perimeter borders sitting on top
 * of a keychain baseplate never cover or block the top entrance of the arch tunnel,
 * while preserving the raised border over the outer arch bridge.
 */
export function subtractVerticalKeyringEntrance(
  solidGeo: THREE.BufferGeometry,
  placement: NegativeArchPlacement
): THREE.BufferGeometry {
  const preparedSolid = prepareSolidForCSG(solidGeo);
  const rotY = placement.rotation[1];
  const dirX = Math.cos(rotY);
  const dirZ = -Math.sin(rotY);

  const entranceX = placement.center[0] - dirX * placement.majorRadius;
  const entranceZ = placement.center[2] - dirZ * placement.majorRadius;
  const shaftHeight = 10;

  const cylGeo = new THREE.CylinderGeometry(
    placement.tubeRadius + 0.06,
    placement.tubeRadius + 0.06,
    shaftHeight,
    28
  );
  const preparedCyl = prepareCutterForCSG(cylGeo, (_lx, ly) => {
    // Cylinder runs vertically from -shaftHeight/2 (lower mouth) to +shaftHeight/2 (upper rim)
    const t = THREE.MathUtils.clamp((ly + shaftHeight * 0.5) / shaftHeight, 0, 1);
    return 0.46 + t * 0.16;
  });
  cylGeo.dispose();

  const solidBrush = new Brush(preparedSolid);
  solidBrush.updateMatrixWorld(true);

  const cylBrush = new Brush(preparedCyl);
  cylBrush.position.set(
    entranceX,
    placement.center[1] + shaftHeight * 0.5 - 0.6,
    entranceZ
  );
  cylBrush.updateMatrixWorld(true);

  try {
    const resultBrush = _csgEvaluator.evaluate(solidBrush, cylBrush, SUBTRACTION);
    const outGeo = resultBrush.geometry;
    preparedSolid.dispose();
    preparedCyl.dispose();
    return outGeo;
  } catch {
    preparedCyl.dispose();
    return preparedSolid;
  }
}
