import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  findDirectionalSilhouetteAnchor,
  findFirstLetterTopAnchor,
  subtractNegativeKeyringArch,
} from './keyringArch';
import { KEYRING_DIRECTIONS, createDefaultConfig } from './projectDefaults';
import { buildVectorTextShapes } from './vectorFont';
import { computePrintMetrics, exportGroupToBinarySTL } from './stlExporter';
import { buildProjectModel } from '../three/modelBuilder';

test('findFirstLetterTopAnchor lands on a solid top stroke with safe wall margin and selects 1st or 2nd letter as best fits', () => {
  for (const name of [
    'VITORIA',
    'RAFAEL',
    'LUCAS',
    'ATELIÊ',
    'MARIA',
    'SOFIA',
    'IGOR',
    'ANA',
    'JOAO',
    'YASMIN',
  ]) {
    const built = buildVectorTextShapes(name, 'serif', 65, 20, -0.024, true, true);
    const anchor = findFirstLetterTopAnchor(
      built.firstLetterShapes,
      built.firstLetterCapY,
      undefined,
      built.secondLetterShapes
    );
    assert.ok(Number.isFinite(anchor.x), `${name} anchor X should be finite`);
    assert.ok(
      anchor.letterIndex === 0 || anchor.letterIndex === 1,
      `${name} anchor must pick 1st or 2nd letter`
    );
    assert.ok(
      anchor.x >= anchor.minX && anchor.x <= anchor.maxX,
      `${name} anchor X inside chosen letter`
    );
    assert.ok(
      anchor.recommendedTubeRadius >= 0.85 && anchor.recommendedTubeRadius <= 1.15,
      `${name} tube radius ${anchor.recommendedTubeRadius} must be in safe functional range [0.85, 1.15]`
    );
    assert.ok(
      anchor.recommendedMajorRadius >= 2.1 && anchor.recommendedMajorRadius <= 2.75,
      `${name} major radius ${anchor.recommendedMajorRadius} must be in safe functional range [2.1, 2.75]`
    );
    assert.ok(
      anchor.solidWidth >= anchor.recommendedTubeRadius * 2 + 1.0,
      `${name} (picked letter ${anchor.letterIndex + 1}) solidWidth ${anchor.solidWidth.toFixed(2)}mm must leave safe wall margin around hole diameter ${(anchor.recommendedTubeRadius * 2).toFixed(2)}mm`
    );
  }

  const builtAtelie = buildVectorTextShapes('ATELIÊ', 'serif', 65, 20, -0.024, true, true);
  const atelieAnchor = findFirstLetterTopAnchor(
    builtAtelie.firstLetterShapes,
    builtAtelie.firstLetterCapY,
    undefined,
    builtAtelie.secondLetterShapes
  );
  assert.equal(
    atelieAnchor.letterIndex,
    1,
    'ATELIÊ should automatically place the hole on the 2nd letter (T) which has a wider top bar than the tapered apex of A'
  );

  const builtRafael = buildVectorTextShapes('RAFAEL', 'serif', 65, 20, -0.024, true, true);
  const rafaelAnchor = findFirstLetterTopAnchor(
    builtRafael.firstLetterShapes,
    builtRafael.firstLetterCapY,
    undefined,
    builtRafael.secondLetterShapes
  );
  assert.equal(
    rafaelAnchor.letterIndex,
    0,
    'RAFAEL should automatically place the hole on the 1st letter (R) which has a wider top arch than A'
  );
});

test('subtractNegativeKeyringArch carves a real curved tunnel reducing volume and producing valid STL', () => {
  const box = new THREE.BoxGeometry(24, 30, 24);
  const beforeGroup = new THREE.Group();
  beforeGroup.add(new THREE.Mesh(box, new THREE.MeshStandardMaterial()));
  const beforeMetrics = computePrintMetrics(beforeGroup);

  const carved = subtractNegativeKeyringArch(box, {
    center: [0, 14.4, -12.4],
    majorRadius: 4.8,
    tubeRadius: 1.75,
    rotation: [0, Math.PI * 0.5, 0],
  });

  const afterGroup = new THREE.Group();
  afterGroup.add(new THREE.Mesh(carved, new THREE.MeshStandardMaterial()));
  const afterMetrics = computePrintMetrics(afterGroup);

  assert.ok(
    afterMetrics.triangleCount > beforeMetrics.triangleCount,
    `CSG carving should add tunnel geometry triangles (${afterMetrics.triangleCount} > ${beforeMetrics.triangleCount})`
  );
  assert.ok(
    afterMetrics.volumeCm3 < beforeMetrics.volumeCm3,
    `CSG subtraction should reduce solid volume (${afterMetrics.volumeCm3} < ${beforeMetrics.volumeCm3})`
  );

  const stl = exportGroupToBinarySTL(afterGroup);
  const view = new DataView(stl);
  const triCount = view.getUint32(80, true);
  assert.equal(triCount, afterMetrics.triangleCount);

  box.dispose();
  carved.dispose();
});

test('findDirectionalSilhouetteAnchor resolves all 8 cardinal directions accurately and svg-keychain carves negative arch in all 8 directions', () => {
  const disk = new THREE.Shape();
  disk.absarc(0, 0, 22, 0, Math.PI * 2, false);

  for (const dir of KEYRING_DIRECTIONS) {
    const anchor = findDirectionalSilhouetteAnchor([disk], dir.id);
    const dot = anchor.x * anchor.cardinalUx + anchor.y * anchor.cardinalUy;
    assert.ok(
      dot > 18,
      `Direction ${dir.id} anchor (${anchor.x.toFixed(1)}, ${anchor.y.toFixed(1)}) should project strongly along (${anchor.cardinalUx.toFixed(2)}, ${anchor.cardinalUy.toFixed(2)})`
    );
  }

  const matA = new THREE.MeshStandardMaterial();
  const matB = new THREE.MeshStandardMaterial();

  for (const dir of KEYRING_DIRECTIONS) {
    const cfg = createDefaultConfig('svg-keychain');
    cfg.svgAttachMode = 'arch';
    cfg.keyringDirection = dir.id;
    const built = buildProjectModel(cfg, matA, matB);
    const baseMesh = built.group.getObjectByName('SvgKeychainBase') as THREE.Mesh;
    assert.ok(baseMesh, `SvgKeychainBase must exist for direction ${dir.id}`);
    const triCount = baseMesh.geometry.getAttribute('position').count / 3;
    // Uncarved paw baseplate has ~1452 triangles; carved negative arch adds ~500+ tunnel triangles
    assert.ok(
      triCount > 1750,
      `svg-keychain negative arch at ${dir.id} must carve full 3D tunnel into baseplate (got ${triCount} triangles)`
    );
    built.disposeGeometries();
  }

  matA.dispose();
  matB.dispose();
});
