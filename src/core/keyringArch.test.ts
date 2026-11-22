import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  findFirstLetterTopAnchor,
  subtractNegativeKeyringArch,
} from './keyringArch';
import { buildVectorTextShapes } from './vectorFont';
import { computePrintMetrics, exportGroupToBinarySTL } from './stlExporter';

test('findFirstLetterTopAnchor lands on a solid top stroke for split-top and solid-top letters', () => {
  for (const name of ['VITORIA', 'LUCAS', 'ATELIÊ', 'MARIA', 'SOFIA', 'IGOR']) {
    const built = buildVectorTextShapes(name, 'serif', 116, 40, -0.02, true);
    const anchor = findFirstLetterTopAnchor(
      built.firstLetterShapes,
      built.firstLetterCapY
    );
    assert.ok(Number.isFinite(anchor.x), `${name} anchor X should be finite`);
    assert.ok(anchor.x >= anchor.minX && anchor.x <= anchor.maxX, `${name} anchor X inside first letter`);
    assert.ok(anchor.solidWidth > 1, `${name} should detect positive solid stroke width`);
    assert.ok(anchor.topY > 30, `${name} topY should reach letter top`);
  }
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
