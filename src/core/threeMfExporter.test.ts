import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createDefaultConfig, DEFAULT_BUILD_PLATE } from './projectDefaults.ts';
import { buildExportFilename } from './stlExporter.ts';
import {
  build3MFModelXml,
  computeCrc32,
  exportGroupTo3MF,
  extractSlicerMeshParts,
} from './threeMfExporter.ts';
import { buildProjectModel } from '../three/modelBuilder.ts';

function createTestMaterials(primaryHex: string, accentHex: string) {
  return {
    primary: new THREE.MeshStandardMaterial({ color: primaryHex }),
    accent: new THREE.MeshStandardMaterial({ color: accentHex }),
  };
}

test('build3MFModelXml preserves millimeter unit, filament colors, metadata, and multi-part components', () => {
  const config = {
    ...createDefaultConfig('svg-keychain'),
    primaryColor: '#D93848',
    accentColor: '#1E293B',
    useDualColor: true,
    finish: 'pla-silk' as const,
  };
  const mats = createTestMaterials(config.primaryColor, config.accentColor);
  const built = buildProjectModel(config, mats.primary, mats.accent);

  const parts = extractSlicerMeshParts(built.group, config.primaryColor);
  assert.ok(parts.length >= 2, 'Expected svg-keychain to have base and relief mesh parts');

  // Verify lowest Z across all extracted parts sits at Z = 0
  let minZ = Infinity;
  for (const part of parts) {
    for (let i = 2; i < part.vertices.length; i += 3) {
      if (part.vertices[i] < minZ) minZ = part.vertices[i];
    }
  }
  assert.ok(Math.abs(minZ) < 1e-3, `Expected minZ === 0, got ${minZ}`);

  const xml = build3MFModelXml(built.group, {
    objectName: 'Chaveiro Patinha 3MF',
    config,
    buildPlate: DEFAULT_BUILD_PLATE,
    createdAtIso: '2026-11-23',
  });

  assert.match(xml, /<model unit="millimeter" xml:lang="pt-BR"/);
  assert.match(xml, /<metadata name="Title">Chaveiro Patinha 3MF<\/metadata>/);
  assert.match(xml, /<metadata name="Print3DMaker:Template">svg-keychain<\/metadata>/);
  assert.match(xml, /<metadata name="Print3DMaker:Finish">PLA Seda<\/metadata>/);
  assert.match(xml, /<metadata name="Print3DMaker:PrimaryColor">#D93848<\/metadata>/);
  assert.match(xml, /<metadata name="Print3DMaker:AccentColor">#1E293B<\/metadata>/);
  assert.match(xml, /<metadata name="Print3DMaker:DualColor">true<\/metadata>/);
  assert.match(xml, /<basematerials id="1">/);
  assert.match(xml, /displaycolor="#D93848FF"/);
  assert.match(xml, /displaycolor="#1E293BFF"/);
  assert.match(xml, /<components>/);
  assert.match(xml, /<component objectid="2" \/>/);
  assert.match(xml, /<component objectid="3" \/>/);

  built.disposeGeometries();
});

test('exportGroupTo3MF produces a valid PKZIP OPC package containing [Content_Types].xml, _rels/.rels, and 3D/3dmodel.model', () => {
  const config = createDefaultConfig('keychain');
  const mats = createTestMaterials(config.primaryColor, config.accentColor);
  const built = buildProjectModel(config, mats.primary, mats.accent);

  const buffer = exportGroupTo3MF(built.group, {
    objectName: 'Chaveiro_Maria',
    config,
    buildPlate: DEFAULT_BUILD_PLATE,
  });

  assert.ok(buffer.byteLength > 500, 'Expected non-empty 3MF zip buffer');
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();

  // Parse local file headers from the ZIP archive
  const extractedFiles = new Map<string, string>();
  let offset = 0;
  while (offset + 4 <= buffer.byteLength) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // reached central directory
    const crc = view.getUint32(offset + 14, true);
    const compSize = view.getUint32(offset + 18, true);
    const uncompSize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);

    assert.equal(compSize, uncompSize);
    const nameStart = offset + 30;
    const fileName = decoder.decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const fileBytes = bytes.subarray(dataStart, dataStart + compSize);

    assert.equal(computeCrc32(fileBytes), crc, `CRC32 mismatch for ${fileName}`);
    extractedFiles.set(fileName, decoder.decode(fileBytes));
    offset = dataStart + compSize;
  }

  assert.ok(extractedFiles.has('[Content_Types].xml'));
  assert.ok(extractedFiles.has('_rels/.rels'));
  assert.ok(extractedFiles.has('3D/3dmodel.model'));

  // Verify Central Directory header signature at current offset
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  // Verify End of Central Directory signature at the end of the buffer
  assert.equal(view.getUint32(buffer.byteLength - 22, true), 0x06054b50);

  const filename = buildExportFilename('keychain', 'Maria', '3mf');
  assert.equal(filename, 'print3d-maker-chaveiro-maria.3mf');

  built.disposeGeometries();
});
