import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  findFirstLetterTopAnchor,
  subtractNegativeKeyringArch,
} from './keyringArch';
import { buildVectorTextShapes } from './vectorFont';
import { computePrintMetrics, exportGroupToBinarySTL } from './stlExporter';

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
    // Ensure safe horizontal wall margin around hole: solidWidth >= 2 * tubeRadius + 1.0mm
    assert.ok(
      anchor.solidWidth >= anchor.recommendedTubeRadius * 2 + 1.0,
      `${name} (picked letter ${anchor.letterIndex + 1}) solidWidth ${anchor.solidWidth.toFixed(2)}mm must leave safe wall margin around hole diameter ${(anchor.recommendedTubeRadius * 2).toFixed(2)}mm`
    );
  }

  // Verify that when the 2nd letter offers a significantly wider top stroke (like 'T' in 'ATELIÊ' vs tapered 'A'),
  // it automatically selects the 2nd letter; whereas when the 1st letter is wider (like 'R' in 'RAFAEL' vs 'A'),
  // it selects the 1st letter.
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
