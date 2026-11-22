import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDefaultConfig, TEMPLATE_ORDER, validateProjectText } from './projectDefaults';
import { buildProjectModel } from '../three/modelBuilder';
import { computePrintMetrics } from './stlExporter';

test('validateProjectText accepts Portuguese accented names and simple symbols', () => {
  const res1 = validateProjectText('  João & Lúcia  ');
  assert.equal(res1.valid, true);
  assert.equal(res1.normalized, 'JOÃO & LÚCIA');
  assert.equal(res1.error, null);

  const res2 = validateProjectText('Coração ♥');
  assert.equal(res2.valid, true);
  assert.equal(res2.normalized, 'CORAÇÃO ♥');
});

test('validateProjectText rejects empty input without silent fallback', () => {
  const res = validateProjectText('   ');
  assert.equal(res.valid, false);
  assert.equal(res.normalized, '');
  assert.ok(res.error && res.error.length > 0);
});

test('validateProjectText rejects excessive length and unsupported characters', () => {
  const longRes = validateProjectText('ALEXANDRE MAGNO SILVA', 14);
  assert.equal(longRes.valid, false);
  assert.ok(longRes.error?.includes('14'));

  const badCharRes = validateProjectText('MARIA@123');
  assert.equal(badCharRes.valid, false);
  assert.ok(badCharRes.error !== null);
});

test('only heart-name and keychains enable keyring holes/arches by default and build identically without keyring on other templates', () => {
  const allowedWithKeyring = new Set(['heart-name', 'keychain', 'svg-keychain']);
  const matA = new THREE.MeshStandardMaterial();
  const matB = new THREE.MeshStandardMaterial();

  for (const id of TEMPLATE_ORDER) {
    const cfg = createDefaultConfig(id);
    assert.equal(
      cfg.keyringArch,
      allowedWithKeyring.has(id),
      `${id} keyringArch default mismatch`
    );

    if (!allowedWithKeyring.has(id)) {
      const cfgOff = { ...cfg, keyringArch: false };
      const cfgForcedOn = { ...cfg, keyringArch: true };
      const builtOff = buildProjectModel(cfgOff, matA, matB);
      const builtOn = buildProjectModel(cfgForcedOn, matA, matB);
      const mOff = computePrintMetrics(builtOff.group);
      const mOn = computePrintMetrics(builtOn.group);
      assert.equal(mOn.triangleCount, mOff.triangleCount, `${id} must ignore keyringArch`);
      assert.equal(mOn.volumeCm3, mOff.volumeCm3, `${id} volume must not be carved by keyringArch`);
      builtOff.disposeGeometries();
      builtOn.disposeGeometries();
    }
  }

  matA.dispose();
  matB.dispose();
});
