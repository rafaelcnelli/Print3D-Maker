import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultConfig, DEFAULT_BUILD_PLATE } from './projectDefaults.ts';
import {
  deserializeSavedProject,
  findSavedProjectByName,
  serializeSavedProject,
  suggestProjectName,
  upsertSavedProjectInList,
  type SavedProject,
} from './savedProjectsStore.ts';

test('upsertSavedProjectInList creates new named project and updates existing by normalized name', () => {
  const configA = { ...createDefaultConfig('heart-name'), text: 'ANA' };
  const first = upsertSavedProjectInList([], {
    name: '  Presente   da Ana  ',
    config: configA,
    buildPlate: DEFAULT_BUILD_PLATE,
    now: 1000,
    id: 'id-1',
  });

  assert.equal(first.updatedExisting, false);
  assert.equal(first.saved.name, 'Presente da Ana');
  assert.equal(first.list.length, 1);

  // Saving again with matching name (case-insensitive) updates existing entry instead of duplicating
  const configB = { ...createDefaultConfig('keychain'), text: 'JOAO', primaryColor: '#D93848' };
  const second = upsertSavedProjectInList(first.list, {
    name: 'presente da ana',
    config: configB,
    buildPlate: DEFAULT_BUILD_PLATE,
    now: 2000,
  });

  assert.equal(second.updatedExisting, true);
  assert.equal(second.list.length, 1);
  assert.equal(second.saved.id, 'id-1');
  assert.equal(second.saved.config.template, 'keychain');
  assert.equal(second.saved.config.primaryColor, '#D93848');
  assert.equal(second.saved.createdAt, 1000);
  assert.equal(second.saved.updatedAt, 2000);
});

test('serializeSavedProject and deserializeSavedProject preserve Uint8ClampedArray raster pixels losslessly', () => {
  const rgba = new Uint8ClampedArray([255, 0, 128, 255, 10, 20, 30, 200]);
  const project: SavedProject = {
    id: 'svg-1',
    name: 'Logo Empresa',
    createdAt: 500,
    updatedAt: 900,
    buildPlate: DEFAULT_BUILD_PLATE,
    config: {
      ...createDefaultConfig('svg-keychain'),
      svgSourceType: 'image',
      svgFileName: 'logo.png',
      keyringDirection: 'top-right',
      imagePixels: {
        width: 2,
        height: 1,
        rgba,
      },
    },
  };

  const jsonRoundTrip = JSON.parse(JSON.stringify(serializeSavedProject(project)));
  const restored = deserializeSavedProject(jsonRoundTrip);

  assert.equal(restored.name, 'Logo Empresa');
  assert.equal(restored.config.keyringDirection, 'top-right');
  assert.ok(restored.config.imagePixels);
  assert.equal(restored.config.imagePixels.width, 2);
  assert.equal(restored.config.imagePixels.height, 1);
  assert.deepEqual(Array.from(restored.config.imagePixels.rgba), Array.from(rgba));
});

test('suggestProjectName and findSavedProjectByName work across templates', () => {
  const svgConfig = {
    ...createDefaultConfig('svg-keychain'),
    svgSourceType: 'preset' as const,
    svgPresetId: 'crown' as const,
  };
  assert.equal(suggestProjectName(svgConfig), 'Chaveiro SVG - crown');

  const heartConfig = { ...createDefaultConfig('heart-name'), text: 'LUCAS' };
  assert.equal(suggestProjectName(heartConfig), 'Coração Nome - LUCAS');

  const sample: SavedProject = {
    id: '1',
    name: 'Chaveiro Lucas',
    createdAt: 1,
    updatedAt: 1,
    buildPlate: DEFAULT_BUILD_PLATE,
    config: heartConfig,
  };
  assert.equal(findSavedProjectByName([sample], '  CHAVEIRO   lucas ')?.id, '1');
});
