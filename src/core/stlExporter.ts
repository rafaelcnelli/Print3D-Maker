import * as THREE from 'three';
import type { PrintMetrics, TemplateId } from '../types/project';

/**
 * Collects world-space triangles from all Mesh children of a THREE.Object3D,
 * converting from Three.js Y-up coordinates into standard 3D slicer Z-up
 * coordinates: (x, y, z) -> (x, -z, y), then shifts Z so minZ === 0 (flat on bed).
 */
export function extractSlicerTriangles(root: THREE.Object3D): {
  triangles: Float32Array;
  triangleCount: number;
  bounds: { widthMm: number; heightMm: number; depthMm: number };
} {
  root.updateMatrixWorld(true);

  const rawCoords: number[] = [];
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!obj.visible || obj.userData?.excludeFromExport) return;

    const geometry = obj.geometry as THREE.BufferGeometry | undefined;
    if (!geometry) return;
    const pos = geometry.getAttribute('position');
    if (!pos) return;

    const index = geometry.getIndex();
    const matrixWorld = obj.matrixWorld;

    const pushVertexTri = (i0: number, i1: number, i2: number) => {
      vA.fromBufferAttribute(pos, i0).applyMatrix4(matrixWorld);
      vB.fromBufferAttribute(pos, i1).applyMatrix4(matrixWorld);
      vC.fromBufferAttribute(pos, i2).applyMatrix4(matrixWorld);

      // Convert Three.js Y-up -> Slicer Z-up (+90 deg rotation around X):
      // sx = x, sy = -z, sz = y (det = +1, preserves CCW outward normals!)
      const ax = vA.x;
      const ay = -vA.z;
      const az = vA.y;

      const bx = vB.x;
      const by = -vB.z;
      const bz = vB.y;

      const cx = vC.x;
      const cy = -vC.z;
      const cz = vC.y;

      rawCoords.push(ax, ay, az, bx, by, bz, cx, cy, cz);

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
  });

  if (rawCoords.length === 0) {
    return {
      triangles: new Float32Array(0),
      triangleCount: 0,
      bounds: { widthMm: 0, heightMm: 0, depthMm: 0 },
    };
  }

  // Center X/Y around origin and place bottom flat at slicer Z = 0
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const triangles = new Float32Array(rawCoords.length);

  for (let i = 0; i < rawCoords.length; i += 3) {
    triangles[i] = rawCoords[i] - centerX;
    triangles[i + 1] = rawCoords[i + 1] - centerY;
    triangles[i + 2] = rawCoords[i + 2] - minZ;
  }

  return {
    triangles,
    triangleCount: triangles.length / 9,
    bounds: {
      widthMm: Number((maxX - minX).toFixed(1)),
      depthMm: Number((maxY - minY).toFixed(1)),
      heightMm: Number((maxZ - minZ).toFixed(1)),
    },
  };
}

/**
 * Generates a standard IEEE-754 little-endian Binary STL buffer ready for
 * PrusaSlicer, Bambu Studio, OrcaSlicer, and Ultimaker Cura.
 */
export function exportGroupToBinarySTL(root: THREE.Object3D): ArrayBuffer {
  const { triangles, triangleCount } = extractSlicerTriangles(root);
  const bufferLength = 84 + triangleCount * 50;
  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);

  // 80-byte ASCII header
  const header = 'Print3D Maker Binary STL - Millimeters (Z-Up)';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0x20);
  }

  view.setUint32(80, triangleCount, true);

  let offset = 84;
  for (let i = 0; i < triangles.length; i += 9) {
    const ax = triangles[i];
    const ay = triangles[i + 1];
    const az = triangles[i + 2];
    const bx = triangles[i + 3];
    const by = triangles[i + 4];
    const bz = triangles[i + 5];
    const cx = triangles[i + 6];
    const cy = triangles[i + 7];
    const cz = triangles[i + 8];

    // Face normal = normalize((B - A) x (C - A))
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;

    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nLen = Math.hypot(nx, ny, nz);
    if (nLen > 1e-8) {
      nx /= nLen;
      ny /= nLen;
      nz /= nLen;
    } else {
      nx = 0;
      ny = 0;
      nz = 1;
    }

    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);

    view.setFloat32(offset + 12, ax, true);
    view.setFloat32(offset + 16, ay, true);
    view.setFloat32(offset + 20, az, true);

    view.setFloat32(offset + 24, bx, true);
    view.setFloat32(offset + 28, by, true);
    view.setFloat32(offset + 32, bz, true);

    view.setFloat32(offset + 36, cx, true);
    view.setFloat32(offset + 40, cy, true);
    view.setFloat32(offset + 44, cz, true);

    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }

  return buffer;
}

/**
 * Generates an ASCII Wavefront OBJ string in millimeters (Z-up) for CAD editing.
 */
export function exportGroupToOBJ(root: THREE.Object3D, objectName = 'Print3D_Maker'): string {
  const { triangles, triangleCount } = extractSlicerTriangles(root);
  const lines: string[] = [
    '# Print3D Maker Wavefront OBJ (mm, Z-up)',
    `o ${objectName.replace(/\s+/g, '_')}`,
  ];

  for (let i = 0; i < triangles.length; i += 3) {
    lines.push(
      `v ${triangles[i].toFixed(3)} ${triangles[i + 1].toFixed(3)} ${triangles[i + 2].toFixed(3)}`
    );
  }

  for (let t = 0; t < triangleCount; t++) {
    const base = t * 3 + 1;
    lines.push(`f ${base} ${base + 1} ${base + 2}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Computes exact bounding box, signed mesh volume (via divergence theorem),
 * estimated PLA filament mass (accounting for 20% infill + 3 walls),
 * and realistic FDM print time (0.2mm layer height, ~60mm/s average).
 */
export function computePrintMetrics(root: THREE.Object3D): PrintMetrics {
  const { triangles, triangleCount, bounds } = extractSlicerTriangles(root);

  let signedVolumeMm3 = 0;
  for (let i = 0; i < triangles.length; i += 9) {
    const ax = triangles[i];
    const ay = triangles[i + 1];
    const az = triangles[i + 2];
    const bx = triangles[i + 3];
    const by = triangles[i + 4];
    const bz = triangles[i + 5];
    const cx = triangles[i + 6];
    const cy = triangles[i + 7];
    const cz = triangles[i + 8];

    // V = (1/6) * dot(A, B x C)
    const crossX = by * cz - bz * cy;
    const crossY = bz * cx - bx * cz;
    const crossZ = bx * cy - by * cx;
    signedVolumeMm3 += (ax * crossX + ay * crossY + az * crossZ) / 6;
  }

  const volumeCm3 = Math.max(0.4, Math.abs(signedVolumeMm3) / 1000);
  // Typical FDM part with 2-3 walls + 20% gyroid infill uses ~48% of solid volume
  // PLA density = 1.24 g/cm^3
  const effectiveFillFactor = 0.48;
  const filamentGrams = Math.max(1, Math.round(volumeCm3 * effectiveFillFactor * 1.24));
  // Modern FDM printer ~14–18 g/hr average (~3.5 min per gram + 6 min warmup/first layer)
  const estimatedMinutes = Math.max(8, Math.round(filamentGrams * 3.4 + 6));

  return {
    widthMm: bounds.widthMm,
    heightMm: bounds.heightMm,
    depthMm: bounds.depthMm,
    triangleCount,
    volumeCm3: Number(volumeCm3.toFixed(1)),
    filamentGrams,
    estimatedMinutes,
  };
}

export function formatPrintDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function buildExportFilename(
  template: TemplateId,
  text: string,
  ext: 'stl' | 'obj' | '3mf'
): string {
  const slugPrefix: Record<TemplateId, string> = {
    'heart-name': 'coracao-nome',
    monogram: 'inicial-nome',
    'box-letter': 'letra-caixa',
    'svg-keychain': 'chaveiro-svg',
    'name-sign': 'letreiro',
    keychain: 'chaveiro',
    plaque: 'placa',
  };

  const cleanText = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'modelo';

  return `print3d-maker-${slugPrefix[template]}-${cleanText}.${ext}`;
}

export {
  build3MFModelXml,
  exportGroupTo3MF,
  extractSlicerMeshParts,
  type ThreeMfExportOptions,
} from './threeMfExporter';

