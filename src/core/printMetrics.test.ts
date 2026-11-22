import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDefaultConfig } from './projectDefaults';
import {
  buildExportFilename,
  computePrintMetrics,
  exportGroupToBinarySTL,
  exportGroupToOBJ,
  extractSlicerTriangles,
  formatPrintDuration,
} from './stlExporter';
import { buildProjectModel } from '../three/modelBuilder';

test('exportGroupToBinarySTL produces valid IEEE-754 binary STL with Z-up minZ = 0', () => {
  const matA = new THREE.MeshStandardMaterial({ color: 0xd93848 });
  const matB = new THREE.MeshStandardMaterial({ color: 0xf3f5f8 });

  const config = createDefaultConfig('heart-name');
  config.text = 'VITORIA';

  const built = buildProjectModel(config, matA, matB);
  const { triangles, triangleCount, bounds } = extractSlicerTriangles(built.group);

  assert.ok(triangleCount > 200, 'heart-name model generates rich printable geometry');
  assert.ok(bounds.widthMm > 58 && bounds.widthMm < 72, `width ~65mm, got ${bounds.widthMm}`);
  assert.ok(bounds.heightMm > 48 && bounds.heightMm < 60, `height ~55mm, got ${bounds.heightMm}`);

  // Every exported vertex must have slicer Z >= 0 (resting flat on slicer build plate)
  let minZ = Infinity;
  for (let i = 2; i < triangles.length; i += 3) {
    if (triangles[i] < minZ) minZ = triangles[i];
  }
  assert.ok(Math.abs(minZ) < 1e-4, `expected slicer minZ === 0, got ${minZ}`);

  const stlBuffer = exportGroupToBinarySTL(built.group);
  assert.equal(stlBuffer.byteLength, 84 + triangleCount * 50);

  const view = new DataView(stlBuffer);
  assert.equal(view.getUint32(80, true), triangleCount);

  const objStr = exportGroupToOBJ(built.group, 'Coracao_Joao');
  assert.ok(objStr.includes('o Coracao_Joao'));
  assert.ok(objStr.includes('\nv '));
  assert.ok(objStr.includes('\nf 1 2 3'));

  const metrics = computePrintMetrics(built.group);
  assert.ok(metrics.filamentGrams >= 10 && metrics.filamentGrams <= 160);
  assert.ok(metrics.estimatedMinutes >= 20);

  built.disposeGeometries();
  matA.dispose();
  matB.dispose();
});

test('all 7 templates and special modes build valid non-empty printable meshes', () => {
  const matA = new THREE.MeshStandardMaterial();
  const matB = new THREE.MeshStandardMaterial();

  for (const template of [
    'heart-name',
    'monogram',
    'box-letter',
    'svg-keychain',
    'name-sign',
    'keychain',
    'plaque',
  ] as const) {
    const cfg = createDefaultConfig(template);
    const built = buildProjectModel(cfg, matA, matB);
    const metrics = computePrintMetrics(built.group);
    assert.ok(metrics.triangleCount > 100, `${template} should generate >100 triangles`);
    assert.ok(metrics.widthMm > 20, `${template} width should be >20mm`);
    assert.ok(metrics.filamentGrams >= 1, `${template} should estimate >=1g filament`);
    built.disposeGeometries();
  }

  // Box-letter separated print layout
  const boxSep = createDefaultConfig('box-letter');
  boxSep.boxLetterLayout = 'separated';
  const builtBoxSep = buildProjectModel(boxSep, matA, matB);
  const sepMetrics = computePrintMetrics(builtBoxSep.group);
  assert.ok(sepMetrics.depthMm > 90, `separated layout should span 2 rows, got depth ${sepMetrics.depthMm}`);
  builtBoxSep.disposeGeometries();

  // SVG keychain attachment modes (arch, hole, loop)
  for (const attachMode of ['arch', 'hole', 'loop'] as const) {
    const svgCfg = createDefaultConfig('svg-keychain');
    svgCfg.svgAttachMode = attachMode;
    const builtSvg = buildProjectModel(svgCfg, matA, matB);
    const svgMetrics = computePrintMetrics(builtSvg.group);
    assert.ok(svgMetrics.triangleCount > 200, `svg-keychain (${attachMode}) should generate >200 triangles`);
    builtSvg.disposeGeometries();
  }

  matA.dispose();
  matB.dispose();
});

test('formatPrintDuration and buildExportFilename handle Portuguese text cleanly', () => {
  assert.equal(formatPrintDuration(45), '45 min');
  assert.equal(formatPrintDuration(60), '1h');
  assert.equal(formatPrintDuration(135), '2h 15m');

  assert.equal(
    buildExportFilename('heart-name', 'CORAÇÃO', 'stl'),
    'print3d-maker-coracao-nome-coracao.stl'
  );
  assert.equal(
    buildExportFilename('keychain', 'João & Ana', 'obj'),
    'print3d-maker-chaveiro-joao-ana.obj'
  );
});

test('buildVectorTextShapes with fillExactBounds unites all letters into a single continuous piece without X gaps (including RAFAEL)', async () => {
  const { buildVectorTextShapes } = await import('./vectorFont');
  const names = ['RAFAEL', 'VITORIA', 'PATRICIA', 'FATIMA', 'OTAVIO', 'WALTER', 'LAURA', 'JOAO'];
  const styles = ['serif', 'geometric', 'condensed', 'wide'] as const;

  for (const style of styles) {
    for (const name of names) {
      const built = buildVectorTextShapes(name, style, 65, 20, -0.02, true, true);
      assert.ok(built.shapes.length > 0, `${name} (${style}) should produce shapes`);

      // Compute X intervals of each shape and verify they merge into 1 single connected interval
      const intervals: [number, number][] = built.shapes.map((sh) => {
        const pts = sh.getPoints(24);
        let minX = Infinity;
        let maxX = -Infinity;
        for (const p of pts) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
        }
        return [minX, maxX];
      });

      intervals.sort((a, b) => a[0] - b[0]);
      let currentEnd = intervals[0][1];
      for (let i = 1; i < intervals.length; i++) {
        const [nextStart, nextEnd] = intervals[i];
        // Every next shape must overlap the running connected component by at least 0.25mm
        assert.ok(
          nextStart <= currentEnd - 0.25,
          `Expected continuous 1-piece overlap in ${name} (${style}), but found gap/weak join between ${currentEnd.toFixed(2)} and ${nextStart.toFixed(2)}`
        );
        if (nextEnd > currentEnd) currentEnd = nextEnd;
      }
    }
  }
});

