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
import {
  computePrintMetrics,
  exportGroupToBinarySTL,
  extractSlicerTriangles,
} from './stlExporter';
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

test('negative keyring arch cavity shading never bleeds onto exterior triangles on heart-name, keychain, or svg-keychain', () => {
  const matA = new THREE.MeshStandardMaterial();
  const matB = new THREE.MeshStandardMaterial();

  for (const tpl of ['heart-name', 'keychain', 'svg-keychain'] as const) {
    const cfg = createDefaultConfig(tpl);
    if (tpl === 'svg-keychain') cfg.svgAttachMode = 'arch';
    if (tpl === 'keychain') {
      cfg.svgAttachMode = 'arch';
      cfg.keyringArch = true;
    }
    const built = buildProjectModel(cfg, matA, matB);
    let checkedMeshCount = 0;

    built.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const col = obj.geometry.getAttribute('color');
      if (!col) return;
      checkedMeshCount++;

      const idx = obj.geometry.index;
      const triCount = idx ? idx.count / 3 : col.count / 3;
      const getIdx = (t: number, k: number) =>
        idx ? idx.getX(t * 3 + k) : t * 3 + k;

      let mixedTris = 0;
      let cavityTris = 0;
      let minChannel = Infinity;

      for (let t = 0; t < triCount; t++) {
        const c0 = col.getX(getIdx(t, 0));
        const c1 = col.getX(getIdx(t, 1));
        const c2 = col.getX(getIdx(t, 2));
        minChannel = Math.min(minChannel, c0, c1, c2);
        const exteriorCount =
          (c0 > 0.99 ? 1 : 0) + (c1 > 0.99 ? 1 : 0) + (c2 > 0.99 ? 1 : 0);
        if (exteriorCount === 1 || exteriorCount === 2) {
          mixedTris++;
        } else if (exteriorCount === 0) {
          cavityTris++;
        }
      }

      assert.equal(
        mixedTris,
        0,
        `${tpl}/${obj.name} must have zero mixed dark/light triangles bleeding across the hole rim (found ${mixedTris})`
      );
      assert.ok(
        minChannel >= 0.24,
        `${tpl}/${obj.name} cavity shading should stay natural (>= 0.24 linear), not near-black stain (got ${minChannel.toFixed(3)})`
      );
      if (
        obj.name === 'HeartLetters' ||
        obj.name === 'KeychainBase' ||
        obj.name === 'SvgKeychainBase'
      ) {
        assert.ok(
          cavityTris > 50,
          `${tpl}/${obj.name} must preserve interior cavity triangles (got ${cavityTris})`
        );
      }
    });

    assert.ok(
      checkedMeshCount > 0,
      `${tpl} should have at least one carved mesh with cavity AO`
    );
    built.disposeGeometries();
  }

  matA.dispose();
  matB.dispose();
});

function computeExactVolumeMm3(root: THREE.Object3D): number {
  const { triangles, triangleCount } = extractSlicerTriangles(root);
  let signedVolume6 = 0;
  for (let t = 0; t < triangleCount; t++) {
    const o = t * 9;
    const ax = triangles[o], ay = triangles[o + 1], az = triangles[o + 2];
    const bx = triangles[o + 3], by = triangles[o + 4], bz = triangles[o + 5];
    const cx = triangles[o + 6], cy = triangles[o + 7], cz = triangles[o + 8];
    signedVolume6 +=
      ax * (by * cz - bz * cy) -
      ay * (bx * cz - bz * cx) +
      az * (bx * cy - by * cx);
  }
  return Math.abs(signedVolume6 / 6);
}

test('disabling keyringEnabled removes all keyring attachments/arches across heart-name, keychain, and svg-keychain', () => {
  const matA = new THREE.MeshStandardMaterial();
  const matB = new THREE.MeshStandardMaterial();

  // heart-name: disabling removes negative arch carve (higher volume, fewer triangles, no vertex color AO)
  {
    const cfgOn = createDefaultConfig('heart-name');
    const cfgOff = { ...cfgOn, keyringArch: false, keyringEnabled: false };
    const builtOn = buildProjectModel(cfgOn, matA, matB);
    const builtOff = buildProjectModel(cfgOff, matA, matB);
    const volOn = computeExactVolumeMm3(builtOn.group);
    const volOff = computeExactVolumeMm3(builtOff.group);
    assert.ok(
      volOff > volOn + 5,
      `heart-name without arch (${volOff.toFixed(1)}mm3) should have larger volume than carved (${volOn.toFixed(1)}mm3)`
    );
    const lettersOff = builtOff.group.getObjectByName('HeartLetters') as THREE.Mesh;
    assert.equal(lettersOff.geometry.getAttribute('color'), undefined);
    builtOn.disposeGeometries();
    builtOff.disposeGeometries();
  }

  // keychain & svg-keychain across all 3 attach modes: keyringEnabled=false leaves zero tab/collar/loop and uncarved base
  for (const tpl of ['keychain', 'svg-keychain'] as const) {
    for (const mode of ['arch', 'hole', 'loop'] as const) {
      const cfgOn = {
        ...createDefaultConfig(tpl),
        svgAttachMode: mode,
        keyringArch: mode === 'arch',
        keyringEnabled: true,
      };
      const cfgOff = {
        ...cfgOn,
        keyringEnabled: false,
      };
      const builtOn = buildProjectModel(cfgOn, matA, matB);
      const builtOff = buildProjectModel(cfgOff, matA, matB);

      assert.equal(builtOff.group.getObjectByName('KeychainHoleTab'), undefined);
      assert.equal(builtOff.group.getObjectByName('KeychainEyeletCollar'), undefined);
      assert.equal(builtOff.group.getObjectByName('KeychainArchLoop'), undefined);
      assert.equal(builtOff.group.getObjectByName('SvgKeychainHoleTab'), undefined);
      assert.equal(builtOff.group.getObjectByName('SvgKeychainHoleCollar'), undefined);
      assert.equal(builtOff.group.getObjectByName('SvgKeychainArchLoop'), undefined);

      const volOn = computeExactVolumeMm3(builtOn.group);
      const volOff = computeExactVolumeMm3(builtOff.group);
      if (mode === 'arch') {
        assert.ok(
          volOff > volOn + 5,
          `${tpl} arch off (${volOff.toFixed(1)}mm3) should have greater volume than arch on (${volOn.toFixed(1)}mm3)`
        );
      } else {
        assert.ok(
          volOff < volOn - 10,
          `${tpl} ${mode} off (${volOff.toFixed(1)}mm3) should have smaller volume without protruding attachment (${volOn.toFixed(1)}mm3)`
        );
      }
      builtOn.disposeGeometries();
      builtOff.disposeGeometries();
    }
  }

  matA.dispose();
  matB.dispose();
});

test('adjusting keyringHoleMm updates keyring hole size cleanly on heart-name, keychain, and svg-keychain', () => {
  const matA = new THREE.MeshStandardMaterial();
  const matB = new THREE.MeshStandardMaterial();

  // heart-name: larger hole removes more material from the carved tunnel
  {
    const smallCfg = { ...createDefaultConfig('heart-name'), keyringHoleMm: 1.3 };
    const largeCfg = { ...createDefaultConfig('heart-name'), keyringHoleMm: 3.4 };
    const builtSmall = buildProjectModel(smallCfg, matA, matB);
    const builtLarge = buildProjectModel(largeCfg, matA, matB);
    const volSmall = computeExactVolumeMm3(builtSmall.group);
    const volLarge = computeExactVolumeMm3(builtLarge.group);
    assert.ok(
      volLarge < volSmall - 2,
      `heart-name larger hole (3.4mm -> ${volLarge.toFixed(2)}mm3) should carve more material than smaller hole (1.3mm -> ${volSmall.toFixed(2)}mm3)`
    );
    builtSmall.disposeGeometries();
    builtLarge.disposeGeometries();
  }

  // keychain & svg-keychain across arch, hole, loop
  for (const tpl of ['keychain', 'svg-keychain'] as const) {
    // 'arch': larger diameter carves more volume
    {
      const smallCfg = {
        ...createDefaultConfig(tpl),
        svgAttachMode: 'arch' as const,
        keyringHoleMm: 1.4,
      };
      const largeCfg = {
        ...createDefaultConfig(tpl),
        svgAttachMode: 'arch' as const,
        keyringHoleMm: 2.6,
      };
      const builtSmall = buildProjectModel(smallCfg, matA, matB);
      const builtLarge = buildProjectModel(largeCfg, matA, matB);
      const volSmall = computeExactVolumeMm3(builtSmall.group);
      const volLarge = computeExactVolumeMm3(builtLarge.group);
      assert.ok(
        volLarge < volSmall - 5,
        `${tpl} arch larger diameter (2.6mm) should carve more volume than 1.4mm (${volLarge.toFixed(2)}mm3 < ${volSmall.toFixed(2)}mm3)`
      );
      builtSmall.disposeGeometries();
      builtLarge.disposeGeometries();
    }

    // 'hole' and 'loop': larger hole increases outer footprint and inner opening matches exact diameter
    for (const mode of ['hole', 'loop'] as const) {
      const targetSmallDiam = 2.6;
      const targetLargeDiam = 7.6;
      const smallCfg = {
        ...createDefaultConfig(tpl),
        svgAttachMode: mode,
        keyringArch: false,
        keyringHoleMm: targetSmallDiam,
      };
      const largeCfg = {
        ...createDefaultConfig(tpl),
        svgAttachMode: mode,
        keyringArch: false,
        keyringHoleMm: targetLargeDiam,
      };
      const builtSmall = buildProjectModel(smallCfg, matA, matB);
      const builtLarge = buildProjectModel(largeCfg, matA, matB);
      const mSmall = computePrintMetrics(builtSmall.group);
      const mLarge = computePrintMetrics(builtLarge.group);
      assert.ok(
        mLarge.depthMm > mSmall.depthMm || mLarge.widthMm > mSmall.widthMm,
        `${tpl} ${mode} larger diameter should enlarge attachment bounds (small: ${mSmall.widthMm}x${mSmall.depthMm}, large: ${mLarge.widthMm}x${mLarge.depthMm})`
      );

      // Measure actual inner circle diameter directly from mesh vertices around attachment center
      const meshName =
        mode === 'hole'
          ? tpl === 'keychain'
            ? 'KeychainEyeletCollar'
            : 'SvgKeychainHoleCollar'
          : tpl === 'keychain'
          ? 'KeychainArchLoop'
          : 'SvgKeychainArchLoop';
      for (const [built, expectedDiam] of [
        [builtSmall, targetSmallDiam],
        [builtLarge, targetLargeDiam],
      ] as const) {
        const mesh = built.group.getObjectByName(meshName) as THREE.Mesh;
        assert.ok(mesh, `${meshName} should exist`);
        const box = new THREE.Box3().setFromBufferAttribute(
          mesh.geometry.getAttribute('position') as THREE.BufferAttribute
        );
        const cx = (box.min.x + box.max.x) * 0.5;
        const cz = (box.min.z + box.max.z) * 0.5;
        const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        let minRadial = Infinity;
        for (let i = 0; i < pos.count; i++) {
          const r = Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz);
          if (r > 0.1 && r < minRadial) minRadial = r;
        }
        const measuredInnerDiam = minRadial * 2;
        assert.ok(
          Math.abs(measuredInnerDiam - expectedDiam) < 0.15,
          `${tpl} ${mode} measured inner hole diameter ${measuredInnerDiam.toFixed(2)}mm should match target Ø ${expectedDiam.toFixed(2)}mm`
        );
      }

      builtSmall.disposeGeometries();
      builtLarge.disposeGeometries();
    }
  }

  matA.dispose();
  matB.dispose();
});
