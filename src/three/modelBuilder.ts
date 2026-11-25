import * as THREE from 'three';
import {
  dilateMaskByRadius,
  dilateShapesWithSDF,
  extractShapesFromMask,
  getPresetSvgById,
  parseSvgStringToShapes,
  rasterizeShapesToMask,
  vectorizeImagePixels,
} from '../core/contourTracer';
import { buildCursiveScriptShapes } from '../core/cursiveFont';
import {
  createHeartContourPoints,
  getHeartYBounds,
  getHeartYSlopes,
  subdivideNonIndexedTrianglesByX,
} from '../core/heartMath';
import {
  findDirectionalSilhouetteAnchor,
  findFirstLetterTopAnchor,
  subtractNegativeKeyringArch,
  subtractVerticalKeyringEntrance,
  type NegativeArchPlacement,
} from '../core/keyringArch';
import { buildVectorTextShapes } from '../core/vectorFont';
import { getKeychainArchMaxDiameterMm } from '../core/projectDefaults';
import type { ProjectConfig, SvgAttachMode } from '../types/project';

export interface BuiltModelResult {
  group: THREE.Group;
  disposeGeometries: () => void;
}

function makeRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const hw = w * 0.5;
  const hh = h * 0.5;
  const cr = Math.min(r, hw * 0.95, hh * 0.95);
  const s = new THREE.Shape();
  s.moveTo(-hw + cr, -hh);
  s.lineTo(hw - cr, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  s.lineTo(hw, hh - cr);
  s.quadraticCurveTo(hw, hh, hw - cr, hh);
  s.lineTo(-hw + cr, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  s.lineTo(-hw, -hh + cr);
  s.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  s.closePath();
  return s;
}

function makeHeartShape(widthMm: number, heightMm: number, segments = 88, insetMm = 0): THREE.Shape {
  const pts = createHeartContourPoints(widthMm, heightMm, segments, insetMm);
  const s = new THREE.Shape();
  pts.forEach((p, idx) => {
    if (idx === 0) s.moveTo(p.x, p.y);
    else s.lineTo(p.x, p.y);
  });
  s.closePath();
  return s;
}

function makeHeartHolePath(widthMm: number, heightMm: number, segments = 76, insetMm = 4): THREE.Path {
  const pts = createHeartContourPoints(widthMm, heightMm, segments, insetMm).reverse();
  const p = new THREE.Path();
  pts.forEach((pt, idx) => {
    if (idx === 0) p.moveTo(pt.x, pt.y);
    else p.lineTo(pt.x, pt.y);
  });
  p.closePath();
  return p;
}

function addCircularHole(shape: THREE.Shape, cx: number, cy: number, radius: number): void {
  const hole = new THREE.Path();
  hole.absarc(cx, cy, radius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
}

/**
 * Grounds a THREE.Group so its lowest vertex sits flush at Y = 0 and X/Z are centered.
 */
function groundGroupToPlate(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  const centerX = (box.min.x + box.max.x) * 0.5;
  const centerZ = (box.min.z + box.max.z) * 0.5;
  group.position.set(-centerX, -box.min.y, -centerZ);
  group.updateMatrixWorld(true);
}

function configurePrintableMesh(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (mesh.geometry.getAttribute('color') && mesh.material instanceof THREE.Material) {
    const clonedMat = mesh.material.clone() as THREE.MeshStandardMaterial;
    clonedMat.vertexColors = true;
    clonedMat.needsUpdate = true;
    mesh.material = clonedMat;
    mesh.userData.clonedMaterial = clonedMat;
  }
  return mesh;
}

/**
 * PROJECT 1 (FLAGSHIP): Coração com Nome Dupla Vista (Anamórfico)
 * - Looking from TOP (+Y down): reads the person's name clearly left-to-right!
 * - Looking from FRONT (+Z): sees the unmistakable crisp Heart silhouette formed
 *   directly by the fused 3D letters themselves (pure Heart(X,Y) ∩ Name(X,Z))!
 *
 * Supports 3 modes:
 * - 'pure' (default): Pure sculptural intersection — zero front slab, touching fused letters
 * - 'desk-stand': Pure sculptural intersection + chamfered bottom desk stand foot
 * - 'solid-front': Optional solid beveled heart front plate + sculpted name behind it
 */
function buildHeartNameModel(
  config: ProjectConfig,
  primaryMat: THREE.Material,
  accentMat: THREE.Material,
  geometries: THREE.BufferGeometry[],
  extraDisposables: { dispose: () => void }[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'CoracaoComNome';

  const W = config.widthMm;
  const H = config.heightMm;
  const D = config.depthMm;
  const isSolidFront = config.heartMode === 'solid-front';
  const frontThick = isSolidFront ? 2.8 : 0;
  const textDepth = Math.max(14, D - frontThick);
  const scaleFactor = config.textScale / 100;

  // In pure/desk-stand modes, span full heart width (99%) with tight touching tracking
  // so outermost letters form the rounded left & right heart cheeks with zero gaps.
  const maxTextW = isSolidFront ? W * 0.84 * scaleFactor : W * 0.99 * scaleFactor;
  const targetTextZ = isSolidFront ? textDepth * 0.86 : textDepth;
  const letterSpacing = isSolidFront
    ? 0.12
    : config.fontStyle === 'serif'
    ? -0.024
    : -0.014;

  const builtText = buildVectorTextShapes(
    config.text,
    config.fontStyle,
    maxTextW,
    targetTextZ,
    letterSpacing,
    !isSolidFront
  );

  const frontZ = D * 0.5;
  const plateBackZ = frontZ - frontThick;

  if (builtText.shapes.length > 0) {
    const rawExtrude = new THREE.ExtrudeGeometry(builtText.shapes, {
      depth: 1.0,
      bevelEnabled: false,
      curveSegments: 24,
      steps: 1,
    });

    // Rotate -90 deg around X:
    //   local X -> world X (left to right)
    //   local Z (0..1) -> world Y (u in 0..1)
    //   local Y (0..maxY) -> world -Z (baseline at z=0, top of letter toward -Z)
    rawExtrude.rotateX(-Math.PI * 0.5);

    const nonIndexed = rawExtrude.index ? rawExtrude.toNonIndexed() : rawExtrude;
    if (nonIndexed !== rawExtrude) rawExtrude.dispose();

    const posAttr = nonIndexed.getAttribute('position');
    const rawPos = new Float32Array(posAttr.array as ArrayLike<number>);
    nonIndexed.dispose();

    // High-resolution X subdivision so curved outer heart cheeks, top lobes, and bottom tip are silky smooth
    const stepX = Math.max(0.65, W / 96);
    const subPos = subdivideNonIndexedTrianglesByX(rawPos, stepX, 6);

    // Center letters along Z in pure mode, or embed +0.5mm into front plate in solid-front mode
    const baselineZ = isSolidFront ? plateBackZ + 0.5 : builtText.maxY * 0.5;
    const zBackOffset = isSolidFront ? -(targetTextZ - builtText.maxY) * 0.35 : 0;

    // Preserve original u in [0, 1] to assign exact analytical smooth normals on top/bottom caps
    const origU = new Float32Array(subPos.length / 3);
    const minPadRatio = isSolidFront ? 0.08 : 0.006;

    for (let i = 0; i < subPos.length; i += 3) {
      const x = subPos[i];
      const u = THREE.MathUtils.clamp(subPos[i + 1], 0, 1);
      const zLocal = subPos[i + 2]; // in [-maxY, 0]
      origU[i / 3] = u;

      const bounds = getHeartYBounds(x, W, H, minPadRatio);
      const yMin = isSolidFront ? bounds.yMin + 0.4 : bounds.yMin;
      const yMax = isSolidFront
        ? Math.max(yMin + 3.0, bounds.yMax - 0.4)
        : Math.max(yMin + 0.8, bounds.yMax);

      subPos[i] = x;
      subPos[i + 1] = yMin + u * (yMax - yMin);
      subPos[i + 2] = baselineZ + zLocal + zBackOffset;
    }

    const warpedGeo = new THREE.BufferGeometry();
    warpedGeo.setAttribute('position', new THREE.BufferAttribute(subPos, 3));
    warpedGeo.computeVertexNormals();

    // 1) Assign exact analytical smooth normals on curved top (u=1) & bottom (u=0) heart caps
    // 2) Smooth vertical side-wall normals across curved glyph arcs (dihedral angle < 42 deg)
    //    so O, R, C, S, U barrels look glass-smooth while 90-deg corners stay razor-sharp!
    const normAttr = warpedGeo.getAttribute('normal') as THREE.BufferAttribute;
    const wallBuckets = new Map<string, { vi: number; nx: number; ny: number; nz: number }[]>();

    for (let t = 0; t < subPos.length; t += 9) {
      const i0 = t / 3;
      const i1 = i0 + 1;
      const i2 = i0 + 2;
      const isTopCap = origU[i0] > 0.99 && origU[i1] > 0.99 && origU[i2] > 0.99;
      const isBotCap = origU[i0] < 0.01 && origU[i1] < 0.01 && origU[i2] < 0.01;

      if (isTopCap || isBotCap) {
        for (const vi of [i0, i1, i2]) {
          const vx = subPos[vi * 3];
          const { dMinDx, dMaxDx } = getHeartYSlopes(vx, W, H);
          if (isTopCap) {
            const len = Math.hypot(-dMaxDx, 1) || 1;
            normAttr.setXYZ(vi, -dMaxDx / len, 1 / len, 0);
          } else {
            const len = Math.hypot(dMinDx, -1) || 1;
            normAttr.setXYZ(vi, dMinDx / len, -1 / len, 0);
          }
        }
      } else {
        for (const vi of [i0, i1, i2]) {
          const kx = Math.round(subPos[vi * 3] * 25);
          const kz = Math.round(subPos[vi * 3 + 2] * 25);
          const key = `${kx},${kz}`;
          let arr = wallBuckets.get(key);
          if (!arr) {
            arr = [];
            wallBuckets.set(key, arr);
          }
          arr.push({
            vi,
            nx: normAttr.getX(vi),
            ny: normAttr.getY(vi),
            nz: normAttr.getZ(vi),
          });
        }
      }
    }

    const cosCrease = Math.cos(THREE.MathUtils.degToRad(42));
    for (const entries of wallBuckets.values()) {
      if (entries.length < 2) continue;
      for (const e of entries) {
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (const o of entries) {
          const dot = e.nx * o.nx + e.ny * o.ny + e.nz * o.nz;
          if (dot >= cosCrease) {
            sx += o.nx;
            sy += o.ny;
            sz += o.nz;
          }
        }
        const len = Math.hypot(sx, sy, sz);
        if (len > 1e-5) {
          normAttr.setXYZ(e.vi, sx / len, sy / len, sz / len);
        }
      }
    }
    normAttr.needsUpdate = true;

    let finalLettersGeo: THREE.BufferGeometry = warpedGeo;

    // Negative keyring arch ("arco negativo") carved at the top of the 1st or 2nd letter (whichever fits best)
    const heartKeyringOn = config.keyringArch && config.keyringEnabled !== false;
    if (heartKeyringOn && builtText.firstLetterShapes.length > 0) {
      const anchor = findFirstLetterTopAnchor(
        builtText.firstLetterShapes,
        builtText.firstLetterCapY,
        (x) => getHeartYBounds(x, W, H, minPadRatio).yMax,
        builtText.secondLetterShapes
      );
      const heartAtAnchor = getHeartYBounds(anchor.x, W, H, minPadRatio);
      const topSurfaceY = isSolidFront
        ? Math.max(heartAtAnchor.yMin + 3.0, heartAtAnchor.yMax - 0.4)
        : Math.max(heartAtAnchor.yMin + 0.8, heartAtAnchor.yMax);
      const topEdgeZ = baselineZ - anchor.topY + zBackOffset;

      const requestedHoleMm = THREE.MathUtils.clamp(config.keyringHoleMm ?? 2.0, 1.2, 3.6);
      const requestedTubeR = requestedHoleMm * 0.5;
      const maxSafeTubeR = Math.max(0.75, (anchor.solidWidth - 0.85) * 0.5);
      const tubeRadius = THREE.MathUtils.clamp(
        requestedTubeR,
        0.58,
        Math.min(1.75, maxSafeTubeR)
      );
      const maxSafeMajor = Math.min(D * 0.165, H * 0.068, 3.6);
      const targetMajor = Math.max(tubeRadius * 2.25, tubeRadius + 1.2, 1.85);
      const majorRadius = THREE.MathUtils.clamp(
        targetMajor,
        tubeRadius + 1.05,
        Math.max(tubeRadius + 1.15, maxSafeMajor)
      );

      // Shift center slightly outward (+0.18mm in Y, -0.18mm in Z) so the tunnel never
      // pinches the top/back corner ridge while keeping a thick internal arch bridge.
      finalLettersGeo = subtractNegativeKeyringArch(warpedGeo, {
        center: [anchor.x, topSurfaceY + 0.18, topEdgeZ - 0.18],
        majorRadius,
        tubeRadius,
        rotation: [0, Math.PI * 0.5, 0],
      });
      warpedGeo.dispose();
    }

    geometries.push(finalLettersGeo);

    const lettersMesh = configurePrintableMesh(new THREE.Mesh(finalLettersGeo, primaryMat));
    lettersMesh.name = 'HeartLetters';
    group.add(lettersMesh);
  }

  // Optional Solid Heart Front Plate Mode (for users who want a flat front face)
  const bevel = Math.min(config.bevelMm, 1.2);
  if (isSolidFront) {
    const heartPlateShape = makeHeartShape(W, H, 160, 0);
    const heartPlateGeo = new THREE.ExtrudeGeometry(heartPlateShape, {
      depth: frontThick,
      bevelEnabled: bevel > 0.05,
      bevelThickness: bevel * 0.85,
      bevelSize: bevel * 0.85,
      bevelSegments: 5,
      curveSegments: 24,
    });
    heartPlateGeo.translate(0, 0, plateBackZ);
    geometries.push(heartPlateGeo);

    const plateMesh = configurePrintableMesh(new THREE.Mesh(heartPlateGeo, primaryMat));
    plateMesh.name = 'HeartFrontPlate';
    group.add(plateMesh);

    const rimOuter = makeHeartShape(W, H, 140, 3.8);
    rimOuter.holes.push(makeHeartHolePath(W, H, 128, 6.8));
    const rimGeo = new THREE.ExtrudeGeometry(rimOuter, {
      depth: 1.0,
      bevelEnabled: true,
      bevelThickness: 0.35,
      bevelSize: 0.3,
      bevelSegments: 4,
      curveSegments: 20,
    });
    rimGeo.translate(0, 0, frontZ + bevel * 0.5);
    geometries.push(rimGeo);

    const rimMat = config.useDualColor ? accentMat : primaryMat;
    const rimMesh = configurePrintableMesh(new THREE.Mesh(rimGeo, rimMat));
    rimMesh.name = 'HeartFrontAccentRim';
    group.add(rimMesh);
  }

  // Optional Desk Stand Foot (cradles the bottom heart tip so it stands upright cleanly on a shelf)
  if (config.heartMode === 'desk-stand') {
    const standW = W * 0.54;
    const standD = D * 0.96;
    const standH = 5.2;

    const standShape = makeRoundedRectShape(standW, standD, 7.5);
    const standGeo = new THREE.ExtrudeGeometry(standShape, {
      depth: standH,
      bevelEnabled: true,
      bevelThickness: 0.85,
      bevelSize: 0.85,
      bevelSegments: 4,
      curveSegments: 24,
    });
    standGeo.rotateX(-Math.PI * 0.5);
    standGeo.translate(0, -1.6, 0);
    geometries.push(standGeo);

    const standMat = config.useDualColor ? accentMat : primaryMat;
    const standMesh = configurePrintableMesh(new THREE.Mesh(standGeo, standMat));
    standMesh.name = 'HeartDeskStand';
    group.add(standMesh);
  }

  // Optional Keyring Loop on Upper Left Heart Lobe (high-detail smooth torus)
  if (config.heartKeyring) {
    const ringGeo = new THREE.TorusGeometry(5.2, 1.9, 24, 48);
    const lobeX = -W * 0.25;
    const lobeBounds = getHeartYBounds(lobeX, W, H);
    const ringZ = isSolidFront ? plateBackZ + frontThick * 0.5 : 0;
    ringGeo.translate(lobeX, lobeBounds.yMax + 2.0, ringZ);
    geometries.push(ringGeo);

    const ringMat = config.useDualColor ? accentMat : primaryMat;
    const ringMesh = configurePrintableMesh(new THREE.Mesh(ringGeo, ringMat));
    ringMesh.name = 'HeartKeyringEyelet';
    group.add(ringMesh);
  }

  groundGroupToPlate(group);
  return group;
}

/**
 * PROJECT 2: Letreiro de Nome (Mesa)
 * Classic standing 3D-printed nameplate with architectural base, accent trim,
 * beveled 3D lettering, and optional embossed front subtitle.
 */
function buildNameSignModel(
  config: ProjectConfig,
  primaryMat: THREE.Material,
  accentMat: THREE.Material,
  geometries: THREE.BufferGeometry[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'LetreiroDeNome';

  const W = config.widthMm;
  const H = config.heightMm;
  const D = config.depthMm;
  const baseH = config.signBaseStyle === 'minimal' ? 5.5 : config.signBaseStyle === 'stepped' ? 10.5 : 8.2;
  const letterH = Math.max(14, H - baseH + 1.5);
  const letterDepth = Math.max(8, D * 0.56);
  const bevel = Math.min(config.bevelMm, 1.2);

  // 1. Primary Base Plinth
  const baseShape = makeRoundedRectShape(W, D, config.signBaseStyle === 'minimal' ? 3 : 6);
  const baseGeo = new THREE.ExtrudeGeometry(baseShape, {
    depth: baseH,
    bevelEnabled: config.signBaseStyle !== 'minimal',
    bevelThickness: config.signBaseStyle === 'beveled' ? 1.3 : 0.6,
    bevelSize: config.signBaseStyle === 'beveled' ? 1.4 : 0.6,
    bevelSegments: 2,
  });
  baseGeo.rotateX(-Math.PI * 0.5);
  geometries.push(baseGeo);

  const baseMesh = configurePrintableMesh(new THREE.Mesh(baseGeo, accentMat));
  baseMesh.name = 'SignBase';
  group.add(baseMesh);

  // 2. Stepped Upper Tier or Accent Channel
  if (config.signBaseStyle === 'stepped') {
    const tierShape = makeRoundedRectShape(W - 10, D - 5, 4);
    const tierGeo = new THREE.ExtrudeGeometry(tierShape, {
      depth: 3.4,
      bevelEnabled: true,
      bevelThickness: 0.5,
      bevelSize: 0.5,
      bevelSegments: 2,
    });
    tierGeo.rotateX(-Math.PI * 0.5);
    tierGeo.translate(0, baseH - 0.5, 0);
    geometries.push(tierGeo);

    const tierMesh = configurePrintableMesh(new THREE.Mesh(tierGeo, primaryMat));
    tierMesh.name = 'SignStepTier';
    group.add(tierMesh);
  } else {
    const stripGeo = new THREE.BoxGeometry(W - 10, 1.8, 1.6);
    stripGeo.translate(0, baseH * 0.52, D * 0.5 + 0.4);
    geometries.push(stripGeo);

    const stripMesh = configurePrintableMesh(new THREE.Mesh(stripGeo, primaryMat));
    stripMesh.name = 'SignAccentStrip';
    group.add(stripMesh);
  }

  // 3. Main 3D Standing Letters
  const builtText = buildVectorTextShapes(
    config.text,
    config.fontStyle,
    (W - 12) * (config.textScale / 100),
    letterH,
    0.13
  );

  if (builtText.shapes.length > 0) {
    const textGeo = new THREE.ExtrudeGeometry(builtText.shapes, {
      depth: letterDepth,
      bevelEnabled: bevel > 0.05,
      bevelThickness: bevel,
      bevelSize: bevel * 0.78,
      bevelSegments: 5,
      curveSegments: 22,
    });
    const baseTopY = config.signBaseStyle === 'stepped' ? baseH + 2.2 : baseH - 0.6;
    textGeo.translate(0, baseTopY, -letterDepth * 0.5);

    geometries.push(textGeo);

    const textMesh = configurePrintableMesh(new THREE.Mesh(textGeo, primaryMat));
    textMesh.name = 'SignMainLetters';
    group.add(textMesh);
  }

  // 4. Optional Raised Front Subtitle on Base (when subtitle is non-empty and base is tall enough)
  const cleanSub = config.subtitle.trim();
  if (cleanSub.length > 0 && config.signBaseStyle !== 'minimal') {
    const subShapes = buildVectorTextShapes(cleanSub, 'condensed', W * 0.65, baseH * 0.48, 0.16);
    if (subShapes.shapes.length > 0) {
      const subGeo = new THREE.ExtrudeGeometry(subShapes.shapes, {
        depth: 1.5,
        bevelEnabled: true,
        bevelThickness: 0.25,
        bevelSize: 0.2,
        bevelSegments: 2,
        curveSegments: 8,
      });
      subGeo.translate(0, baseH * 0.22, D * 0.5 + 0.6);
      geometries.push(subGeo);

      const subMesh = configurePrintableMesh(new THREE.Mesh(subGeo, primaryMat));
      subMesh.name = 'SignSubtitle';
      group.add(subMesh);
    }
  }

  groundGroupToPlate(group);
  return group;
}

/**
 * PROJECT 3: Chaveiro Personalizado
 * Flat-printing keychain with real punched eyelet hole, optional raised border,
 * and embossed dual-color name ready for M600 filament swap.
 */
function buildKeychainModel(
  config: ProjectConfig,
  primaryMat: THREE.Material,
  accentMat: THREE.Material,
  geometries: THREE.BufferGeometry[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ChaveiroPersonalizado';

  const W = config.widthMm;
  const H = config.heightMm;
  const totalThick = config.depthMm;
  const baseThick = Math.max(2.4, totalThick * 0.58);
  const reliefThick = Math.max(1.4, totalThick - baseThick);
  const bevel = Math.min(config.bevelMm, 0.65);

  const isHeart = config.keychainShape === 'heart';
  const radius =
    config.keychainShape === 'capsule' ? H * 0.49 : Math.min(5.5, H * 0.25);

  const hasKeyring = config.keyringEnabled !== false;
  const attachMode: SvgAttachMode =
    !config.keyringArch && config.svgAttachMode === 'arch'
      ? 'hole'
      : config.svgAttachMode;
  const maxArchDiam = getKeychainArchMaxDiameterMm(totalThick, bevel, false);
  const holeMm = THREE.MathUtils.clamp(
    config.keyringHoleMm ?? (attachMode === 'arch' ? 2.2 : 5.0),
    attachMode === 'arch' ? 1.2 : 1.5,
    attachMode === 'arch' ? maxArchDiam : 10.0
  );

  let baseShape: THREE.Shape;
  let heartH = H;
  let textAvailW = W - 14;
  let textAvailH = H * 0.58;
  const textCenterX = 0;
  const textCenterY = isHeart ? -H * 0.02 : -0.6;

  if (isHeart) {
    heartH = Math.max(H, W * 0.86);
    baseShape = makeHeartShape(W, heartH, 84, 0);
    const shiftedPts = baseShape
      .getPoints(80)
      .map((p) => new THREE.Vector2(p.x, p.y - heartH * 0.5));
    baseShape = new THREE.Shape(shiftedPts);
    textAvailW = W * 0.66;
    textAvailH = heartH * 0.3;
  } else {
    baseShape = makeRoundedRectShape(W, H, radius);
  }

  const anchor = findDirectionalSilhouetteAnchor(
    [baseShape],
    config.keyringDirection ?? 'top'
  );

  const builtText = buildVectorTextShapes(
    config.text,
    config.fontStyle,
    textAvailW * (config.textScale / 100),
    textAvailH * (config.textScale / 100),
    0.14
  );

  let keychainArchPlacement: NegativeArchPlacement | null = null;
  if (hasKeyring && attachMode === 'arch') {
    const baseBevelThick = bevel > 0.05 ? bevel * 0.78 : 0;
    const baseTopY = baseThick + baseBevelThick;
    const baseBottomY = -baseBevelThick;
    const baseHeight = baseTopY - baseBottomY;
    const tubeRadius = holeMm * 0.5;
    const maxMajor = Math.max(tubeRadius + 0.75, baseHeight - 0.42 - tubeRadius);
    const majorRadius = THREE.MathUtils.clamp(
      tubeRadius + Math.max(0.8, tubeRadius * 0.65),
      tubeRadius + 0.75,
      maxMajor
    );
    const archCenterY = Math.max(
      baseTopY + 0.05,
      baseBottomY + majorRadius + tubeRadius + 0.4
    );
    const dirX = anchor.ux;
    const dirZ = -anchor.uy;
    keychainArchPlacement = {
      center: [anchor.x + dirX * 0.35, archCenterY, -anchor.y + dirZ * 0.35],
      majorRadius,
      tubeRadius,
      rotation: [0, Math.atan2(anchor.uy, anchor.ux), 0],
      exitExtensionMm: 2.6,
    };
  }

  // 1. Keychain Base Body (high-detail rounded curves & smooth bevels)
  let baseGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(baseShape, {
    depth: baseThick,
    bevelEnabled: bevel > 0.05,
    bevelThickness: bevel * 0.78,
    bevelSize: bevel * 0.78,
    bevelSegments: 5,
    curveSegments: 28,
  });
  baseGeo.rotateX(-Math.PI * 0.5);
  if (keychainArchPlacement) {
    const carvedBase = subtractNegativeKeyringArch(baseGeo, keychainArchPlacement);
    baseGeo.dispose();
    baseGeo = carvedBase;
  }
  geometries.push(baseGeo);

  const baseMesh = configurePrintableMesh(new THREE.Mesh(baseGeo, accentMat));
  baseMesh.name = 'KeychainBase';
  group.add(baseMesh);

  // 2. Optional Raised Perimeter Border Rim (dual-color filament swap look!)
  if (config.keychainRaisedBorder && !isHeart) {
    const borderOuter = makeRoundedRectShape(W - 1.2, H - 1.2, Math.max(2, radius - 0.8));
    const borderInner = makeRoundedRectShape(W - 4.8, H - 4.8, Math.max(1.5, radius - 2.6));
    const innerHole = new THREE.Path(borderInner.getPoints(48).reverse());
    borderOuter.holes.push(innerHole);

    let borderGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(borderOuter, {
      depth: reliefThick * 0.88,
      bevelEnabled: true,
      bevelThickness: 0.3,
      bevelSize: 0.25,
      bevelSegments: 4,
      curveSegments: 24,
    });
    borderGeo.rotateX(-Math.PI * 0.5);
    borderGeo.translate(0, baseThick, 0);
    if (keychainArchPlacement) {
      const carvedBorder = subtractVerticalKeyringEntrance(
        borderGeo,
        keychainArchPlacement
      );
      borderGeo.dispose();
      borderGeo = carvedBorder;
    }
    geometries.push(borderGeo);

    const borderMesh = configurePrintableMesh(new THREE.Mesh(borderGeo, primaryMat));
    borderMesh.name = 'KeychainBorderRim';
    group.add(borderMesh);
  }

  // 3. Raised Name Letters on Top Face
  if (builtText.shapes.length > 0) {
    let textGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(builtText.shapes, {
      depth: reliefThick,
      bevelEnabled: bevel > 0.05,
      bevelThickness: Math.min(0.4, bevel * 0.65),
      bevelSize: Math.min(0.32, bevel * 0.55),
      bevelSegments: 4,
      curveSegments: 20,
    });
    textGeo.rotateX(-Math.PI * 0.5);
    textGeo.translate(textCenterX, baseThick, builtText.maxY * 0.5 - textCenterY);
    if (keychainArchPlacement) {
      const carvedText = subtractVerticalKeyringEntrance(
        textGeo,
        keychainArchPlacement
      );
      textGeo.dispose();
      textGeo = carvedText;
    }
    geometries.push(textGeo);

    const textMesh = configurePrintableMesh(new THREE.Mesh(textGeo, primaryMat));
    textMesh.name = 'KeychainLetters';
    group.add(textMesh);
  }

  // 4. Protruding Attachment Modes: 'hole' (punched rounded tab + collar) OR 'loop' (protruding 3D arch)
  if (hasKeyring && attachMode === 'hole') {
    const holeR = holeMm * 0.5;
    const wallMm = Math.max(2.6, Math.min(3.6, holeR * 0.65 + 1.8));
    const outerTabR = holeR + wallMm;
    const protrudeDist = holeR + 0.4;
    const tabCenterX = anchor.protrudeX + anchor.cardinalUx * protrudeDist;
    const tabCenterY = anchor.protrudeY + anchor.cardinalUy * protrudeDist;

    const tabBevelEnabled = bevel > 0.05;
    const tabBevelSize = tabBevelEnabled ? bevel * 0.65 : 0;
    const tabShape = new THREE.Shape();
    tabShape.absarc(tabCenterX, tabCenterY, outerTabR, 0, Math.PI * 2, false);
    // Offset inner hole path by +bevelSize so the final beveled inner wall sits at exact radius holeR
    addCircularHole(tabShape, tabCenterX, tabCenterY, holeR + tabBevelSize);

    const tabGeo = new THREE.ExtrudeGeometry(tabShape, {
      depth: baseThick,
      bevelEnabled: tabBevelEnabled,
      bevelThickness: tabBevelSize,
      bevelSize: tabBevelSize,
      bevelSegments: 4,
      curveSegments: 32,
    });
    tabGeo.rotateX(-Math.PI * 0.5);
    geometries.push(tabGeo);

    const tabMesh = configurePrintableMesh(new THREE.Mesh(tabGeo, accentMat));
    tabMesh.name = 'KeychainHoleTab';
    group.add(tabMesh);

    const collarWall = Math.min(2.0, wallMm * 0.56);
    const collarBevelSize = 0.22;
    const collarShape = new THREE.Shape();
    collarShape.absarc(tabCenterX, tabCenterY, holeR + collarWall, 0, Math.PI * 2, false);
    addCircularHole(collarShape, tabCenterX, tabCenterY, holeR + collarBevelSize);

    const collarGeo = new THREE.ExtrudeGeometry(collarShape, {
      depth: reliefThick * 0.85,
      bevelEnabled: true,
      bevelThickness: 0.25,
      bevelSize: collarBevelSize,
      bevelSegments: 3,
      curveSegments: 32,
    });
    collarGeo.rotateX(-Math.PI * 0.5);
    collarGeo.translate(0, baseThick - 0.1, 0);
    geometries.push(collarGeo);

    const collarMesh = configurePrintableMesh(new THREE.Mesh(collarGeo, primaryMat));
    collarMesh.name = 'KeychainEyeletCollar';
    group.add(collarMesh);
  } else if (hasKeyring && attachMode === 'loop') {
    const holeR = holeMm * 0.5;
    const loopTubeR = Math.min(1.85, Math.max(1.25, baseThick * 0.44));
    const loopMajorR = holeR + loopTubeR;
    const protrudeDist = Math.max(loopMajorR * 0.72, holeR + 0.35);
    const loopCenterX = anchor.protrudeX + anchor.cardinalUx * protrudeDist;
    const loopCenterY = anchor.protrudeY + anchor.cardinalUy * protrudeDist;

    const loopGeo = new THREE.TorusGeometry(loopMajorR, loopTubeR, 24, 48);
    loopGeo.rotateX(Math.PI * 0.5);
    loopGeo.translate(loopCenterX, baseThick * 0.52, -loopCenterY);
    geometries.push(loopGeo);

    const loopMesh = configurePrintableMesh(new THREE.Mesh(loopGeo, accentMat));
    loopMesh.name = 'KeychainArchLoop';
    group.add(loopMesh);
  }

  groundGroupToPlate(group);
  return group;
}

/**
 * PROJECT 4: Placa Decorativa (Porta ou Mesa)
 * Flat-printing door/workshop sign with chamfered frame, optional mounting holes,
 * raised primary name, divider accent bar, and optional second line.
 */
function buildPlaqueModel(
  config: ProjectConfig,
  primaryMat: THREE.Material,
  accentMat: THREE.Material,
  geometries: THREE.BufferGeometry[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'PlacaDecorativa';

  const W = config.widthMm;
  const H = config.heightMm;
  const totalThick = config.depthMm;
  const baseThick = Math.max(2.6, totalThick * 0.56);
  const reliefThick = Math.max(1.6, totalThick - baseThick);
  const cornerR = config.plaqueRounded ? Math.min(10, H * 0.22) : 2.2;
  const bevel = Math.min(config.bevelMm, 0.8);

  // Compute primary text shapes
  const cleanSub = config.subtitle.trim();
  const hasSub = cleanSub.length > 0;
  const usableW = (W - (config.plaqueMountHoles ? 32 : 20)) * (config.textScale / 100);
  const mainH = hasSub ? H * 0.34 : H * 0.46;
  const mainText = buildVectorTextShapes(config.text, config.fontStyle, usableW, mainH, 0.14);

  // 1. Plaque Base Slab (with optional left/right screw holes)
  const baseShape = makeRoundedRectShape(W, H, cornerR);
  if (config.plaqueMountHoles) {
    const hx = W * 0.5 - 8.5;
    addCircularHole(baseShape, -hx, 0, 2.2);
    addCircularHole(baseShape, hx, 0, 2.2);
  }

  const baseGeo = new THREE.ExtrudeGeometry(baseShape, {
    depth: baseThick,
    bevelEnabled: bevel > 0.05,
    bevelThickness: bevel * 0.72,
    bevelSize: bevel * 0.72,
    bevelSegments: 4,
    curveSegments: 24,
  });
  baseGeo.rotateX(-Math.PI * 0.5);
  geometries.push(baseGeo);

  const baseMesh = configurePrintableMesh(new THREE.Mesh(baseGeo, accentMat));
  baseMesh.name = 'PlaqueBase';
  group.add(baseMesh);

  // 2. Raised Outer Architectural Frame
  const frameOuter = makeRoundedRectShape(W - 3.6, H - 3.6, Math.max(1.5, cornerR - 1.5));
  const frameInner = makeRoundedRectShape(W - 9.6, H - 9.6, Math.max(1.0, cornerR - 4.0));
  frameOuter.holes.push(new THREE.Path(frameInner.getPoints(48).reverse()));

  const frameGeo = new THREE.ExtrudeGeometry(frameOuter, {
    depth: reliefThick * 0.9,
    bevelEnabled: true,
    bevelThickness: 0.32,
    bevelSize: 0.26,
    bevelSegments: 4,
    curveSegments: 24,
  });
  frameGeo.rotateX(-Math.PI * 0.5);
  frameGeo.translate(0, baseThick, 0);
  geometries.push(frameGeo);

  const frameMesh = configurePrintableMesh(new THREE.Mesh(frameGeo, primaryMat));
  frameMesh.name = 'PlaqueBorderFrame';
  group.add(frameMesh);

  // 3. Raised Primary Title + Optional Divider & Subtitle
  if (mainText.shapes.length > 0) {
    const mainGeo = new THREE.ExtrudeGeometry(mainText.shapes, {
      depth: reliefThick,
      bevelEnabled: bevel > 0.05,
      bevelThickness: Math.min(0.42, bevel * 0.68),
      bevelSize: Math.min(0.32, bevel * 0.52),
      bevelSegments: 4,
      curveSegments: 20,
    });
    mainGeo.rotateX(-Math.PI * 0.5);
    const zOffset = hasSub ? -H * 0.11 + mainText.maxY * 0.5 : mainText.maxY * 0.5;
    mainGeo.translate(0, baseThick, zOffset);
    geometries.push(mainGeo);

    const mainMesh = configurePrintableMesh(new THREE.Mesh(mainGeo, primaryMat));
    mainMesh.name = 'PlaqueMainText';
    group.add(mainMesh);
  }

  if (hasSub) {
    // Subtle raised horizontal divider line
    const divGeo = new THREE.BoxGeometry(usableW * 0.52, reliefThick * 0.72, 1.5);
    divGeo.translate(0, baseThick + reliefThick * 0.36, H * 0.07);
    geometries.push(divGeo);
    const divMesh = configurePrintableMesh(new THREE.Mesh(divGeo, primaryMat));
    divMesh.name = 'PlaqueDivider';
    group.add(divMesh);

    const subText = buildVectorTextShapes(cleanSub, 'condensed', usableW * 0.82, H * 0.17, 0.18);
    if (subText.shapes.length > 0) {
      const subGeo = new THREE.ExtrudeGeometry(subText.shapes, {
        depth: reliefThick * 0.85,
        bevelEnabled: true,
        bevelThickness: 0.22,
        bevelSize: 0.18,
        bevelSegments: 4,
        curveSegments: 18,
      });
      subGeo.rotateX(-Math.PI * 0.5);
      subGeo.translate(0, baseThick, H * 0.23 + subText.maxY * 0.5);
      geometries.push(subGeo);

      const subMesh = configurePrintableMesh(new THREE.Mesh(subGeo, primaryMat));
      subMesh.name = 'PlaqueSubtitleText';
      group.add(subMesh);
    }
  }

  groundGroupToPlate(group);
  return group;
}

/**
 * PROJECT 5: Inicial 3D com Nome Cursivo (Monograma)
 * Matches the bold standing Serif Initial + connected lowercase cursive name
 * overlaid across the front lower-middle (e.g., big blue-violet "G" + white "gabriel").
 */
function buildMonogramModel(
  config: ProjectConfig,
  primaryMat: THREE.Material,
  accentMat: THREE.Material,
  geometries: THREE.BufferGeometry[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'InicialComNome';

  const W = config.widthMm;
  const H = config.heightMm;
  const D = config.depthMm;
  const bevel = Math.min(config.bevelMm, 1.0);

  const cleanName = config.text.trim() || 'Gabriel';
  const customInit = config.monogramInitial.trim();
  const initialChar = (customInit.length > 0 ? customInit[0] : cleanName[0] || 'G').toUpperCase();

  // 1. Bold standing Serif (or selected font) Initial Letter
  const builtInitial = buildVectorTextShapes(
    initialChar,
    config.fontStyle,
    W * 0.86,
    H,
    0,
    false
  );

  if (builtInitial.shapes.length > 0) {
    let initGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(builtInitial.shapes, {
      depth: D,
      bevelEnabled: bevel > 0.05,
      bevelThickness: bevel * 0.72,
      bevelSize: bevel * 0.58,
      bevelSegments: 4,
      curveSegments: 26,
    });
    initGeo.translate(0, 0, -D * 0.5);

    // Subtle flat standing foot clamp on curved bottom initials (G, C, O, S, U, Q, J)
    // so the letter sits flat and stable on a shelf without rocking!
    const posAttr = initGeo.getAttribute('position') as THREE.BufferAttribute;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const flatFloorY = minY + (maxY - minY) * 0.024;
    for (let i = 0; i < posAttr.count; i++) {
      if (posAttr.getY(i) < flatFloorY) {
        posAttr.setY(i, flatFloorY);
      }
    }
    posAttr.needsUpdate = true;
    initGeo.computeVertexNormals();

    geometries.push(initGeo);
    const initMesh = configurePrintableMesh(new THREE.Mesh(initGeo, primaryMat));
    initMesh.name = 'MonogramInitial';
    group.add(initMesh);
  }

  // 2. Connected Lowercase Cursive Script Name across the lower-front face
  const scaleFactor = config.textScale / 100;
  const cursive = buildCursiveScriptShapes(
    cleanName,
    W * 1.06 * scaleFactor,
    H * 0.42 * scaleFactor
  );

  if (cursive.shapes.length > 0) {
    const nameThick = Math.max(4.4, D * 0.25);
    const nameBevel = Math.min(0.42, Math.max(0.18, bevel * 0.55));
    const nameGeo = new THREE.ExtrudeGeometry(cursive.shapes, {
      depth: nameThick,
      bevelEnabled: true,
      bevelThickness: nameBevel,
      bevelSize: nameBevel * 0.8,
      bevelSegments: 4,
      curveSegments: 18,
    });

    // Position vertically according to monogramNamePos (% of initial height)
    // and embed 1.4mm into the front face of the big initial for a solid print fusion
    const baselineTargetY = H * (THREE.MathUtils.clamp(config.monogramNamePos, 18, 66) / 100);
    const nameMidY = (cursive.minY + cursive.maxY) * 0.5;
    nameGeo.translate(0, baselineTargetY - nameMidY * 0.35, D * 0.5 - 1.4);
    geometries.push(nameGeo);

    const nameMat = config.useDualColor ? accentMat : primaryMat;
    const nameMesh = configurePrintableMesh(new THREE.Mesh(nameGeo, nameMat));
    nameMesh.name = 'MonogramCursiveName';
    group.add(nameMesh);
  }

  groundGroupToPlate(group);
  return group;
}

/**
 * PROJECT 6: Letra Caixa 2 Cores (Encaixe)
 * Thick standing letters with smooth rounded outer casing shell + recessed pocket +
 * matching contrasting front insert lids. Supports both:
 * - 'assembled': Standing upright assembled sign (ready for display preview)
 * - 'separated': Flat 2-row print plate layout — hollow recessed shells in back row
 *   and matching flat front insert lids in front row for 2-color single-extruder printing!
 */
function buildBoxLetterModel(
  config: ProjectConfig,
  primaryMat: THREE.Material,
  accentMat: THREE.Material,
  geometries: THREE.BufferGeometry[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'LetraCaixa';

  const W = config.widthMm;
  const H = config.heightMm;
  const D = config.depthMm;
  const borderMm = THREE.MathUtils.clamp(config.boxLetterBorderMm, 1.8, 6.5);
  const bevel = Math.min(config.bevelMm, 0.9);
  const isSeparated = config.boxLetterLayout === 'separated';

  // Use wider spacing when separated or unjoined so every letter is a distinct crisp block
  const spacing = isSeparated ? 0.28 : config.boxLetterJoined ? 0.08 : 0.24;
  const innerTargetH = Math.max(18, H - borderMm * 2);
  const innerTargetW = Math.max(30, (W - borderMm * 2) * (config.textScale / 100));

  const builtText = buildVectorTextShapes(
    config.text,
    config.fontStyle,
    innerTargetW,
    innerTargetH,
    spacing
  );

  if (builtText.shapes.length === 0) {
    groundGroupToPlate(group);
    return group;
  }

  // Compute shared SDF grid for smooth rounded outer casing + exact hollow recessed pocket wall
  const pixelSizeMm = 0.42;
  const padMm = borderMm + 3.0;
  const innerGrid = rasterizeShapesToMask(builtText.shapes, pixelSizeMm, padMm);
  const outerMask = dilateMaskByRadius(innerGrid.mask, borderMm / pixelSizeMm);
  const pocketClearanceMask = dilateMaskByRadius(innerGrid.mask, 0.22 / pixelSizeMm);

  // Wall ring mask = outer casing MINUS recessed pocket interior (100% self-intersection-free!)
  const wallData = new Uint8Array(outerMask.data.length);
  for (let i = 0; i < wallData.length; i++) {
    wallData[i] = outerMask.data[i] === 1 && pocketClearanceMask.data[i] === 0 ? 1 : 0;
  }
  const wallMask = {
    width: outerMask.width,
    height: outerMask.height,
    data: wallData,
  };

  const outerShapes = extractShapesFromMask(
    outerMask,
    innerGrid.minX,
    innerGrid.maxY,
    pixelSizeMm,
    1.2
  );
  const wallShapes = extractShapesFromMask(
    wallMask,
    innerGrid.minX,
    innerGrid.maxY,
    pixelSizeMm,
    0.8
  );

  const pocketDepth = THREE.MathUtils.clamp(D * 0.24, 3.2, 6.2);
  const backFloorDepth = Math.max(4.0, D - pocketDepth);
  const lidDepth = Math.max(2.4, pocketDepth + 0.45);

  const shellBevel = Math.min(0.45, bevel * 0.72);
  const lidBevel = Math.min(0.28, bevel * 0.48);

  // Build Back Floor + Hollow Front Rim Wall + White Insert Lid
  let backGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(outerShapes, {
    depth: backFloorDepth,
    bevelEnabled: shellBevel > 0.05,
    bevelThickness: shellBevel,
    bevelSize: shellBevel * 0.85,
    bevelSegments: 4,
    curveSegments: 18,
  });

  const rimGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
    wallShapes.length > 0 ? wallShapes : outerShapes,
    {
      depth: pocketDepth,
      bevelEnabled: shellBevel > 0.05,
      bevelThickness: shellBevel * 0.65,
      bevelSize: shellBevel * 0.55,
      bevelSegments: 3,
      curveSegments: 18,
    }
  );

  const lidGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(builtText.shapes, {
    depth: lidDepth,
    bevelEnabled: lidBevel > 0.05,
    bevelThickness: lidBevel,
    bevelSize: lidBevel * 0.8,
    bevelSegments: 4,
    curveSegments: 22,
  });

  const lidMat = config.useDualColor ? accentMat : primaryMat;

  if (!isSeparated) {
    // ASSEMBLED STANDING VIEW (ELISA standing upright on the build plate)
    const zStart = -D * 0.5;
    backGeo.translate(0, 0, zStart);
    rimGeo.translate(0, 0, zStart + backFloorDepth - 0.35);
    lidGeo.translate(0, 0, zStart + backFloorDepth - 0.25);

    geometries.push(backGeo, rimGeo, lidGeo);

    const backMesh = configurePrintableMesh(new THREE.Mesh(backGeo, primaryMat));
    backMesh.name = 'BoxLetterShellBack';
    group.add(backMesh);

    const rimMesh = configurePrintableMesh(new THREE.Mesh(rimGeo, primaryMat));
    rimMesh.name = 'BoxLetterShellRim';
    group.add(rimMesh);

    const lidMesh = configurePrintableMesh(new THREE.Mesh(lidGeo, lidMat));
    lidMesh.name = 'BoxLetterFrontLid';
    group.add(lidMesh);
  } else {
    // SEPARATED PRINT LAYOUT (Flat on bed: hollow shells in back row + white lids in front row)
    const rowGap = Math.max(14, H * 0.32);
    const backRowZ = -(H * 0.5 + rowGap * 0.5);
    const frontRowZ = H * 0.5 + rowGap * 0.5;

    // Rotate -90 deg around X so front pocket faces UP (+Y) on the build plate
    backGeo.rotateX(-Math.PI * 0.5);
    backGeo.translate(0, 0, backRowZ + builtText.maxY * 0.5);

    rimGeo.rotateX(-Math.PI * 0.5);
    rimGeo.translate(0, backFloorDepth - 0.35, backRowZ + builtText.maxY * 0.5);

    lidGeo.rotateX(-Math.PI * 0.5);
    lidGeo.translate(0, 0, frontRowZ + builtText.maxY * 0.5);

    geometries.push(backGeo, rimGeo, lidGeo);

    const backMesh = configurePrintableMesh(new THREE.Mesh(backGeo, primaryMat));
    backMesh.name = 'BoxLetterShellBackFlat';
    group.add(backMesh);

    const rimMesh = configurePrintableMesh(new THREE.Mesh(rimGeo, primaryMat));
    rimMesh.name = 'BoxLetterShellRimFlat';
    group.add(rimMesh);

    const lidMesh = configurePrintableMesh(new THREE.Mesh(lidGeo, lidMat));
    lidMesh.name = 'BoxLetterInsertLidFlat';
    group.add(lidMesh);
  }

  groundGroupToPlate(group);
  return group;
}

/**
 * PROJECT 7: Chaveiro de Imagem ou Vetor SVG
 * Imports a user SVG vector, raster image (PNG/JPG/WebP), or built-in preset,
 * generates a smooth rounded offset baseplate + raised 3D artwork relief, and
 * adds the chosen keyring attachment in any of the 8 cardinal directions:
 * - 'arch': Real BVH-CSG negative curved tunnel carved into the baseplate edge
 * - 'hole': Integrated rounded ear with real punched through-hole + collar
 * - 'loop': Sturdy protruding 3D torus arch ready for a keyring
 */
function buildSvgKeychainModel(
  config: ProjectConfig,
  primaryMat: THREE.Material,
  accentMat: THREE.Material,
  geometries: THREE.BufferGeometry[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ChaveiroSVG';

  const W = config.widthMm;
  const H = config.heightMm;
  const totalThick = config.depthMm;
  const baseThick = Math.max(2.4, totalThick * 0.6);
  const reliefThick = Math.max(1.3, totalThick - baseThick);
  const borderMm = THREE.MathUtils.clamp(config.svgBorderMm, 1.4, 6.5);
  const bevel = Math.min(config.bevelMm, 0.6);

  const availW = Math.max(16, (W - borderMm * 2) * (config.textScale / 100));
  const availH = Math.max(16, (H - borderMm * 2) * (config.textScale / 100));

  // 1. Resolve artwork 2D shapes from SVG, raster image, or preset
  let graphicShapes: THREE.Shape[] = [];

  if (config.svgSourceType === 'svg' && config.svgRawContent.trim().length > 0) {
    try {
      const parsed = parseSvgStringToShapes(config.svgRawContent, availW, availH);
      graphicShapes = parsed.shapes;
    } catch {
      graphicShapes = [];
    }
  } else if (config.svgSourceType === 'image' && config.imagePixels) {
    const traced = vectorizeImagePixels(
      config.imagePixels.rgba,
      config.imagePixels.width,
      config.imagePixels.height,
      availW,
      availH,
      {
        threshold: config.imageThreshold,
        invert: config.imageInvert,
        traceMode: config.imageTraceMode,
        smoothness: config.imageSmoothness,
        despeckle: config.imageDespeckle,
      }
    );
    graphicShapes = traced.shapes;
  }

  if (graphicShapes.length === 0) {
    const preset = getPresetSvgById(config.svgPresetId);
    graphicShapes = parseSvgStringToShapes(preset.svg, availW, availH).shapes;
  }

  // 2. Compute smooth rounded unified offset baseplate via exact SDF dilation
  const sdfPixelMm = Math.max(0.28, Math.max(W, H) / 260);
  const baseShapes = dilateShapesWithSDF(graphicShapes, borderMm, sdfPixelMm);
  const anchor = findDirectionalSilhouetteAnchor(
    baseShapes.length > 0 ? baseShapes : graphicShapes,
    config.keyringDirection ?? 'top'
  );

  const hasKeyring = config.keyringEnabled !== false;
  const maxArchDiam = getKeychainArchMaxDiameterMm(totalThick, bevel, true);
  const holeMm = THREE.MathUtils.clamp(
    config.keyringHoleMm ?? (config.svgAttachMode === 'arch' ? 2.2 : 5.0),
    config.svgAttachMode === 'arch' ? 1.2 : 1.5,
    config.svgAttachMode === 'arch' ? maxArchDiam : 10.0
  );

  let archPlacement: NegativeArchPlacement | null = null;
  if (hasKeyring && config.svgAttachMode === 'arch') {
    const baseBevelThick = bevel > 0.05 ? bevel * 0.72 : 0;
    const baseTopY = baseThick + baseBevelThick;
    const baseBottomY = -baseBevelThick;
    const baseHeight = baseTopY - baseBottomY;
    const tubeRadius = holeMm * 0.5;
    const maxMajor = Math.max(tubeRadius + 0.75, baseHeight - 0.42 - tubeRadius);
    const majorRadius = THREE.MathUtils.clamp(
      tubeRadius + Math.max(0.8, tubeRadius * 0.65),
      tubeRadius + 0.75,
      maxMajor
    );
    const archCenterY = Math.max(
      baseTopY + 0.05,
      baseBottomY + majorRadius + tubeRadius + 0.4
    );
    const dirX = anchor.ux;
    const dirZ = -anchor.uy;
    // Offset +0.38mm outward so the top entrance sits centered inside the baseplate border rim
    archPlacement = {
      center: [anchor.x + dirX * 0.38, archCenterY, -anchor.y + dirZ * 0.38],
      majorRadius,
      tubeRadius,
      rotation: [0, Math.atan2(anchor.uy, anchor.ux), 0],
      exitExtensionMm: 2.5,
    };
  }

  // 3. Extrude Baseplate (accent color)
  if (baseShapes.length > 0) {
    let baseGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(baseShapes, {
      depth: baseThick,
      bevelEnabled: bevel > 0.05,
      bevelThickness: bevel * 0.72,
      bevelSize: bevel * 0.72,
      bevelSegments: 4,
      curveSegments: 22,
    });
    baseGeo.rotateX(-Math.PI * 0.5);
    if (archPlacement) {
      const carvedBase = subtractNegativeKeyringArch(baseGeo, archPlacement);
      baseGeo.dispose();
      baseGeo = carvedBase;
    }
    geometries.push(baseGeo);

    const baseMesh = configurePrintableMesh(new THREE.Mesh(baseGeo, accentMat));
    baseMesh.name = 'SvgKeychainBase';
    group.add(baseMesh);
  }

  // 4. Extrude Raised Artwork Relief (primary color)
  if (graphicShapes.length > 0) {
    let reliefGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(graphicShapes, {
      depth: reliefThick,
      bevelEnabled: bevel > 0.05,
      bevelThickness: Math.min(0.35, bevel * 0.58),
      bevelSize: Math.min(0.28, bevel * 0.48),
      bevelSegments: 4,
      curveSegments: 20,
    });
    reliefGeo.rotateX(-Math.PI * 0.5);
    reliefGeo.translate(0, baseThick - 0.15, 0);
    if (archPlacement) {
      const carvedRelief = subtractVerticalKeyringEntrance(reliefGeo, archPlacement);
      reliefGeo.dispose();
      reliefGeo = carvedRelief;
    }
    geometries.push(reliefGeo);

    const reliefMesh = configurePrintableMesh(new THREE.Mesh(reliefGeo, primaryMat));
    reliefMesh.name = 'SvgKeychainRelief';
    group.add(reliefMesh);
  }

  // 5. Attachment Modes: 'hole' (punched rounded tab + collar) OR 'loop' (protruding 3D arch)
  if (hasKeyring && config.svgAttachMode === 'hole') {
    const holeR = holeMm * 0.5;
    const wallMm = Math.max(2.6, Math.min(3.6, holeR * 0.65 + 1.8));
    const outerTabR = holeR + wallMm;
    const protrudeDist = holeR + 0.4;
    const tabCenterX = anchor.protrudeX + anchor.cardinalUx * protrudeDist;
    const tabCenterY = anchor.protrudeY + anchor.cardinalUy * protrudeDist;

    const tabBevelEnabled = bevel > 0.05;
    const tabBevelSize = tabBevelEnabled ? bevel * 0.65 : 0;
    const tabShape = new THREE.Shape();
    tabShape.absarc(tabCenterX, tabCenterY, outerTabR, 0, Math.PI * 2, false);
    // Offset inner hole path by +bevelSize so the final beveled inner wall sits at exact radius holeR
    addCircularHole(tabShape, tabCenterX, tabCenterY, holeR + tabBevelSize);

    const tabGeo = new THREE.ExtrudeGeometry(tabShape, {
      depth: baseThick,
      bevelEnabled: tabBevelEnabled,
      bevelThickness: tabBevelSize,
      bevelSize: tabBevelSize,
      bevelSegments: 4,
      curveSegments: 32,
    });
    tabGeo.rotateX(-Math.PI * 0.5);
    geometries.push(tabGeo);

    const tabMesh = configurePrintableMesh(new THREE.Mesh(tabGeo, accentMat));
    tabMesh.name = 'SvgKeychainHoleTab';
    group.add(tabMesh);

    // Raised reinforcement collar around hole
    const collarWall = Math.min(2.0, wallMm * 0.56);
    const collarBevelSize = 0.22;
    const collarShape = new THREE.Shape();
    collarShape.absarc(tabCenterX, tabCenterY, holeR + collarWall, 0, Math.PI * 2, false);
    addCircularHole(collarShape, tabCenterX, tabCenterY, holeR + collarBevelSize);

    const collarGeo = new THREE.ExtrudeGeometry(collarShape, {
      depth: reliefThick * 0.85,
      bevelEnabled: true,
      bevelThickness: 0.25,
      bevelSize: collarBevelSize,
      bevelSegments: 3,
      curveSegments: 32,
    });
    collarGeo.rotateX(-Math.PI * 0.5);
    collarGeo.translate(0, baseThick - 0.1, 0);
    geometries.push(collarGeo);

    const collarMesh = configurePrintableMesh(new THREE.Mesh(collarGeo, primaryMat));
    collarMesh.name = 'SvgKeychainHoleCollar';
    group.add(collarMesh);
  } else if (hasKeyring && config.svgAttachMode === 'loop') {
    // Sturdy protruding 3D arch/ring loop fused into the chosen cardinal edge
    const holeR = holeMm * 0.5;
    const loopTubeR = Math.min(1.85, Math.max(1.25, baseThick * 0.44));
    const loopMajorR = holeR + loopTubeR;
    const protrudeDist = Math.max(loopMajorR * 0.72, holeR + 0.35);
    const loopCenterX = anchor.protrudeX + anchor.cardinalUx * protrudeDist;
    const loopCenterY = anchor.protrudeY + anchor.cardinalUy * protrudeDist;

    const loopGeo = new THREE.TorusGeometry(loopMajorR, loopTubeR, 24, 48);
    loopGeo.rotateX(Math.PI * 0.5);
    loopGeo.translate(loopCenterX, baseThick * 0.52, -loopCenterY);
    geometries.push(loopGeo);

    const loopMesh = configurePrintableMesh(new THREE.Mesh(loopGeo, accentMat));
    loopMesh.name = 'SvgKeychainArchLoop';
    group.add(loopMesh);
  }

  groundGroupToPlate(group);
  return group;
}

/**
 * Dispatcher that builds the active parametric 3D printable model group
 * and returns a disposal helper to keep GPU memory clean on every edit.
 */
export function buildProjectModel(
  config: ProjectConfig,
  primaryMat: THREE.Material,
  accentMat: THREE.Material
): BuiltModelResult {
  const geometries: THREE.BufferGeometry[] = [];
  const extraDisposables: { dispose: () => void }[] = [];
  let group: THREE.Group;

  switch (config.template) {
    case 'heart-name':
      group = buildHeartNameModel(config, primaryMat, accentMat, geometries, extraDisposables);
      break;
    case 'monogram':
      group = buildMonogramModel(config, primaryMat, accentMat, geometries);
      break;
    case 'box-letter':
      group = buildBoxLetterModel(config, primaryMat, accentMat, geometries);
      break;
    case 'svg-keychain':
      group = buildSvgKeychainModel(config, primaryMat, accentMat, geometries);
      break;
    case 'name-sign':
      group = buildNameSignModel(config, primaryMat, accentMat, geometries);
      break;
    case 'keychain':
      group = buildKeychainModel(config, primaryMat, accentMat, geometries);
      break;
    case 'plaque':
      group = buildPlaqueModel(config, primaryMat, accentMat, geometries);
      break;
  }

  return {
    group,
    disposeGeometries: () => {
      group.traverse((obj) => {
        if (obj.userData?.clonedMaterial) {
          obj.userData.clonedMaterial.dispose();
        }
      });
      for (const g of geometries) {
        g.dispose();
      }
      for (const d of extraDisposables) {
        d.dispose();
      }
    },
  };
}
