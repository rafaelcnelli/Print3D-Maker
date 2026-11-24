import * as THREE from 'three';
import {
  FILAMENT_COLORS,
  FILAMENT_FINISHES,
  TEMPLATES,
} from './projectDefaults';
import type { BuildPlateSize, ProjectConfig } from '../types/project';

export interface ThreeMfExportOptions {
  objectName?: string;
  config?: ProjectConfig;
  buildPlate?: BuildPlateSize;
  createdAtIso?: string;
}

export interface ExtractedSlicerMeshPart {
  name: string;
  colorHex: string;
  vertices: Float32Array;
  triangles: Uint32Array;
}

export interface ZipEntryInput {
  path: string;
  data: Uint8Array;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    const idx = (crc ^ bytes[i]) & 0xff;
    crc = (crc >>> 8) ^ CRC32_TABLE[idx];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Packs files into a standard PKZIP / Open Packaging Conventions archive
 * (method 0 = STORE) suitable for .3mf packages.
 */
export function createZipArchive(entries: ZipEntryInput[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const prepared = entries.map((entry) => {
    const nameBytes = encoder.encode(entry.path);
    const crc = computeCrc32(entry.data);
    return {
      nameBytes,
      data: entry.data,
      crc,
    };
  });

  let localSectionSize = 0;
  let centralDirSize = 0;
  for (const item of prepared) {
    localSectionSize += 30 + item.nameBytes.length + item.data.length;
    centralDirSize += 46 + item.nameBytes.length;
  }

  const totalSize = localSectionSize + centralDirSize + 22;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const outBytes = new Uint8Array(buffer);

  // Fixed DOS date/time (2026-01-01 12:00:00) for deterministic archives
  const dosTime = (12 << 11) | (0 << 5) | 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  const localOffsets: number[] = [];
  let offset = 0;

  for (const item of prepared) {
    localOffsets.push(offset);
    // Local file header signature (0x04034b50)
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true); // version needed to extract (2.0)
    view.setUint16(offset + 6, 0x0800, true); // general purpose bit flag (bit 11 = UTF-8)
    view.setUint16(offset + 8, 0, true); // compression method 0 = STORE
    view.setUint16(offset + 10, dosTime, true);
    view.setUint16(offset + 12, dosDate, true);
    view.setUint32(offset + 14, item.crc, true);
    view.setUint32(offset + 18, item.data.length, true);
    view.setUint32(offset + 22, item.data.length, true);
    view.setUint16(offset + 26, item.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true); // extra field length

    outBytes.set(item.nameBytes, offset + 30);
    offset += 30 + item.nameBytes.length;

    outBytes.set(item.data, offset);
    offset += item.data.length;
  }

  const centralDirStart = offset;
  for (let i = 0; i < prepared.length; i += 1) {
    const item = prepared[i];
    const localOffset = localOffsets[i];

    // Central directory file header signature (0x02014b50)
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true); // version made by
    view.setUint16(offset + 6, 20, true); // version needed to extract
    view.setUint16(offset + 8, 0x0800, true); // UTF-8 flag
    view.setUint16(offset + 10, 0, true); // compression method 0 = STORE
    view.setUint16(offset + 12, dosTime, true);
    view.setUint16(offset + 14, dosDate, true);
    view.setUint32(offset + 16, item.crc, true);
    view.setUint32(offset + 20, item.data.length, true);
    view.setUint32(offset + 24, item.data.length, true);
    view.setUint16(offset + 28, item.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // extra field length
    view.setUint16(offset + 32, 0, true); // file comment length
    view.setUint16(offset + 34, 0, true); // disk number start
    view.setUint16(offset + 36, 0, true); // internal file attributes
    view.setUint32(offset + 38, 0, true); // external file attributes
    view.setUint32(offset + 42, localOffset, true);

    outBytes.set(item.nameBytes, offset + 46);
    offset += 46 + item.nameBytes.length;
  }

  // End of Central Directory Record (0x06054b50)
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true); // number of this disk
  view.setUint16(offset + 6, 0, true); // disk where central directory starts
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, centralDirSize, true);
  view.setUint32(offset + 16, centralDirStart, true);
  view.setUint16(offset + 20, 0, true); // comment length

  return buffer;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeHexDisplayColor(hex: string): string {
  const cleaned = hex.trim().replace(/^#/, '').toUpperCase();
  if (/^[0-9A-F]{6}$/.test(cleaned)) {
    return `#${cleaned}FF`;
  }
  if (/^[0-9A-F]{8}$/.test(cleaned)) {
    return `#${cleaned}`;
  }
  return '#D93848FF';
}

function extractMeshColorHex(mesh: THREE.Mesh, fallbackHex = '#D93848'): string {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (mat && 'color' in mat && mat.color instanceof THREE.Color) {
    return `#${mat.color.getHexString().toUpperCase()}`;
  }
  return fallbackHex.toUpperCase();
}

/**
 * Extracts all printable Mesh children in slicer Z-up coordinates (mm),
 * preserving individual mesh parts, their names, their filament colors,
 * and shared global alignment (centered on X/Y, lowest point of assembly at Z = 0).
 */
export function extractSlicerMeshParts(
  root: THREE.Object3D,
  fallbackColorHex = '#D93848'
): ExtractedSlicerMeshPart[] {
  root.updateMatrixWorld(true);

  interface RawMeshTris {
    name: string;
    colorHex: string;
    coords: number[];
  }

  const rawParts: RawMeshTris[] = [];
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  let partCounter = 1;

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!obj.visible || obj.userData?.excludeFromExport) return;

    const geometry = obj.geometry as THREE.BufferGeometry | undefined;
    if (!geometry) return;
    const pos = geometry.getAttribute('position');
    if (!pos) return;

    const index = geometry.getIndex();
    const matrixWorld = obj.matrixWorld;
    const coords: number[] = [];

    const pushVertexTri = (i0: number, i1: number, i2: number) => {
      vA.fromBufferAttribute(pos, i0).applyMatrix4(matrixWorld);
      vB.fromBufferAttribute(pos, i1).applyMatrix4(matrixWorld);
      vC.fromBufferAttribute(pos, i2).applyMatrix4(matrixWorld);

      // Convert Three.js Y-up -> Slicer Z-up (+90 deg rotation around X):
      // sx = x, sy = -z, sz = y (det = +1, preserves CCW outward normals)
      const ax = vA.x;
      const ay = -vA.z;
      const az = vA.y;

      const bx = vB.x;
      const by = -vB.z;
      const bz = vB.y;

      const cx = vC.x;
      const cy = -vC.z;
      const cz = vC.y;

      // Skip degenerate zero-area triangles
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const vx = cx - ax;
      const vy = cy - ay;
      const vz = cz - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      if (nx * nx + ny * ny + nz * nz <= 1e-12) {
        return;
      }

      coords.push(ax, ay, az, bx, by, bz, cx, cy, cz);

      if (ax < minX) minX = ax;
      if (ax > maxX) maxX = ax;
      if (bx < minX) minX = bx;
      if (bx > maxX) maxX = bx;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;

      if (ay < minY) minY = ay;
      if (ay > maxY) maxY = ay;
      if (by < minY) minY = by;
      if (by > maxY) maxY = by;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      if (az < minZ) minZ = az;
      if (az > maxZ) maxZ = az;
      if (bz < minZ) minZ = bz;
      if (bz > maxZ) maxZ = bz;
      if (cz < minZ) minZ = cz;
      if (cz > maxZ) maxZ = cz;
    };

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        pushVertexTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        pushVertexTri(i, i + 1, i + 2);
      }
    }

    if (coords.length > 0) {
      const partName = obj.name?.trim() || `Parte_${partCounter}`;
      partCounter += 1;
      rawParts.push({
        name: partName,
        colorHex: extractMeshColorHex(obj, fallbackColorHex),
        coords,
      });
    }
  });

  if (rawParts.length === 0) {
    return [];
  }

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;

  return rawParts.map((part) => {
    const vertexMap = new Map<string, number>();
    const uniqueVerts: number[] = [];
    const triIndices: number[] = [];

    const getOrAddVertex = (x: number, y: number, z: number): number => {
      const qx = Math.round(x * 10000);
      const qy = Math.round(y * 10000);
      const qz = Math.round(z * 10000);
      const key = `${qx},${qy},${qz}`;
      const existing = vertexMap.get(key);
      if (existing !== undefined) {
        return existing;
      }
      const nextIdx = uniqueVerts.length / 3;
      uniqueVerts.push(qx / 10000, qy / 10000, qz / 10000);
      vertexMap.set(key, nextIdx);
      return nextIdx;
    };

    const { coords } = part;
    for (let i = 0; i < coords.length; i += 9) {
      const v1 = getOrAddVertex(
        coords[i] - centerX,
        coords[i + 1] - centerY,
        coords[i + 2] - minZ
      );
      const v2 = getOrAddVertex(
        coords[i + 3] - centerX,
        coords[i + 4] - centerY,
        coords[i + 5] - minZ
      );
      const v3 = getOrAddVertex(
        coords[i + 6] - centerX,
        coords[i + 7] - centerY,
        coords[i + 8] - minZ
      );
      if (v1 !== v2 && v2 !== v3 && v1 !== v3) {
        triIndices.push(v1, v2, v3);
      }
    }

    return {
      name: part.name,
      colorHex: part.colorHex,
      vertices: new Float32Array(uniqueVerts),
      triangles: new Uint32Array(triIndices),
    };
  });
}

function resolveMaterialName(hex: string, finishLabel: string): string {
  const norm = hex.trim().toUpperCase();
  const colorMeta = FILAMENT_COLORS.find((c) => c.hex.toUpperCase() === norm);
  const colorLabel = colorMeta ? colorMeta.name : norm;
  return `${finishLabel} - ${colorLabel}`;
}

/**
 * Generates the 3MF Core Specification XML (`3D/3dmodel.model`) preserving
 * millimeter units, metadata, filament base materials/colors, and multi-part meshes.
 */
export function build3MFModelXml(
  root: THREE.Object3D,
  options: ThreeMfExportOptions = {}
): string {
  const config = options.config;
  const fallbackColor = config?.primaryColor ?? '#D93848';
  const parts = extractSlicerMeshParts(root, fallbackColor);

  const finishMeta = FILAMENT_FINISHES.find((f) => f.id === config?.finish);
  const finishLabel = finishMeta?.label ?? 'PLA Matte';
  const templateMeta = config ? TEMPLATES[config.template] : undefined;

  const title =
    options.objectName?.trim() ||
    (templateMeta
      ? `${templateMeta.title} (${config?.text || 'Print3D Maker'})`
      : 'Print3D Maker Model');
  const createdAt = options.createdAtIso ?? new Date().toISOString().slice(0, 10);

  // Collect unique material colors in deterministic order
  const colorList: string[] = [];
  const ensureColorIndex = (hex: string): number => {
    const upper = hex.trim().toUpperCase();
    const idx = colorList.indexOf(upper);
    if (idx !== -1) return idx;
    colorList.push(upper);
    return colorList.length - 1;
  };

  if (config?.primaryColor) {
    ensureColorIndex(config.primaryColor);
  }
  if (config?.useDualColor && config?.accentColor) {
    ensureColorIndex(config.accentColor);
  }
  for (const part of parts) {
    ensureColorIndex(part.colorHex);
  }
  if (colorList.length === 0) {
    ensureColorIndex('#D93848');
  }

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `  <metadata name="Title">${escapeXml(title)}</metadata>`,
    '  <metadata name="Application">Print3D Maker</metadata>',
    `  <metadata name="CreationDate">${escapeXml(createdAt)}</metadata>`,
  ];

  if (config) {
    const description = `${templateMeta?.title ?? config.template} · ${config.widthMm}x${config.heightMm}x${config.depthMm} mm · ${finishLabel}`;
    lines.push(`  <metadata name="Description">${escapeXml(description)}</metadata>`);
    lines.push(
      `  <metadata name="Print3DMaker:Template">${escapeXml(config.template)}</metadata>`
    );
    lines.push(
      `  <metadata name="Print3DMaker:Finish">${escapeXml(finishLabel)}</metadata>`
    );
    lines.push(
      `  <metadata name="Print3DMaker:PrimaryColor">${escapeXml(config.primaryColor.toUpperCase())}</metadata>`
    );
    lines.push(
      `  <metadata name="Print3DMaker:AccentColor">${escapeXml(config.accentColor.toUpperCase())}</metadata>`
    );
    lines.push(
      `  <metadata name="Print3DMaker:DualColor">${config.useDualColor ? 'true' : 'false'}</metadata>`
    );
    lines.push(
      `  <metadata name="Print3DMaker:DimensionsMm">${config.widthMm}x${config.heightMm}x${config.depthMm}</metadata>`
    );
  }

  if (options.buildPlate) {
    lines.push(
      `  <metadata name="Print3DMaker:BuildPlateMm">${options.buildPlate.widthMm}x${options.buildPlate.depthMm}x${options.buildPlate.heightMm}</metadata>`
    );
  }

  lines.push('  <resources>');
  lines.push('    <basematerials id="1">');
  for (const hex of colorList) {
    const matName = resolveMaterialName(hex, finishLabel);
    const displayColor = normalizeHexDisplayColor(hex);
    lines.push(
      `      <base name="${escapeXml(matName)}" displaycolor="${displayColor}" />`
    );
  }
  lines.push('    </basematerials>');

  const partObjectIds: number[] = [];
  let nextObjectId = 2;

  for (const part of parts) {
    const objId = nextObjectId;
    nextObjectId += 1;
    partObjectIds.push(objId);
    const pindex = ensureColorIndex(part.colorHex);

    lines.push(
      `    <object id="${objId}" name="${escapeXml(part.name)}" type="model" pid="1" pindex="${pindex}">`
    );
    lines.push('      <mesh>');
    lines.push('        <vertices>');
    const { vertices, triangles } = part;
    for (let i = 0; i < vertices.length; i += 3) {
      lines.push(
        `          <vertex x="${vertices[i].toFixed(4)}" y="${vertices[i + 1].toFixed(4)}" z="${vertices[i + 2].toFixed(4)}" />`
      );
    }
    lines.push('        </vertices>');
    lines.push('        <triangles>');
    for (let i = 0; i < triangles.length; i += 3) {
      lines.push(
        `          <triangle v1="${triangles[i]}" v2="${triangles[i + 1]}" v3="${triangles[i + 2]}" pid="1" pindex="${pindex}" />`
      );
    }
    lines.push('        </triangles>');
    lines.push('      </mesh>');
    lines.push('    </object>');
  }

  let buildItemObjectId = partObjectIds[0] ?? 2;
  if (partObjectIds.length > 1) {
    const assemblyId = nextObjectId;
    buildItemObjectId = assemblyId;
    lines.push(
      `    <object id="${assemblyId}" name="${escapeXml(title)}" type="model">`
    );
    lines.push('      <components>');
    for (const partId of partObjectIds) {
      lines.push(`        <component objectid="${partId}" />`);
    }
    lines.push('      </components>');
    lines.push('    </object>');
  }

  lines.push('  </resources>');
  lines.push('  <build>');
  if (partObjectIds.length > 0) {
    lines.push(`    <item objectid="${buildItemObjectId}" />`);
  }
  lines.push('  </build>');
  lines.push('</model>');

  return lines.join('\n') + '\n';
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>
`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>
`;

/**
 * Exports a Three.js Object3D hierarchy into a complete 3MF package (.3mf ArrayBuffer)
 * ready for Bambu Studio, OrcaSlicer, PrusaSlicer, and Ultimaker Cura.
 */
export function exportGroupTo3MF(
  root: THREE.Object3D,
  options: ThreeMfExportOptions = {}
): ArrayBuffer {
  const encoder = new TextEncoder();
  const modelXml = build3MFModelXml(root, options);

  return createZipArchive([
    {
      path: '[Content_Types].xml',
      data: encoder.encode(CONTENT_TYPES_XML),
    },
    {
      path: '_rels/.rels',
      data: encoder.encode(RELS_XML),
    },
    {
      path: '3D/3dmodel.model',
      data: encoder.encode(modelXml),
    },
  ]);
}
