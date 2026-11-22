import * as THREE from 'three';
import { DEFAULT_BUILD_PLATE } from '../core/projectDefaults';
import type { BuildPlateSize } from '../types/project';

export interface BuildPlateRig {
  group: THREE.Group;
  contactShadow: THREE.Mesh;
  updateShadowForBounds: (widthMm: number, depthMm: number) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setSize: (size: BuildPlateSize) => void;
  dispose: () => void;
}

/**
 * Generates a high-resolution procedural PEI textured 3D printer bed albedo texture
 * with 10mm minor grid, 50mm major grid aligned to center, and live millimeter markings.
 */
function createBuildPlateAlbedoTexture(
  maxAnisotropy: number,
  theme: 'light' | 'dark',
  widthMm: number,
  depthMm: number
): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const isDark = theme === 'dark';

  // Studio PEI sheet base tone: light satin-slate vs low-light anthracite PEI
  ctx.fillStyle = isDark ? '#1e2533' : '#dde3ec';
  ctx.fillRect(0, 0, size, size);

  // Subtle PEI powder-coat micro-speckle
  for (let i = 0; i < 6500; i++) {
    const x = (i * 197 + (i % 13) * 31) % size;
    const y = (i * 353 + (i % 17) * 23) % size;
    ctx.fillStyle = isDark
      ? i % 2 === 0
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(0,0,0,0.16)'
      : i % 2 === 0
      ? 'rgba(255,255,255,0.22)'
      : 'rgba(100,116,139,0.08)';
    ctx.fillRect(x, y, 2, 2);
  }

  const pxPerMmX = size / Math.max(40, widthMm);
  const pxPerMmZ = size / Math.max(40, depthMm);
  const halfW = widthMm * 0.5;
  const halfD = depthMm * 0.5;
  const center = size * 0.5;

  // Minor 10mm grid centered on (0, 0)
  ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(71, 85, 105, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let mm = 10; mm < halfW; mm += 10) {
    if (mm % 50 === 0) continue;
    const dx = mm * pxPerMmX;
    ctx.moveTo(center + dx, 0);
    ctx.lineTo(center + dx, size);
    ctx.moveTo(center - dx, 0);
    ctx.lineTo(center - dx, size);
  }
  for (let mm = 10; mm < halfD; mm += 10) {
    if (mm % 50 === 0) continue;
    const dz = mm * pxPerMmZ;
    ctx.moveTo(0, center + dz);
    ctx.lineTo(size, center + dz);
    ctx.moveTo(0, center - dz);
    ctx.lineTo(size, center - dz);
  }
  ctx.stroke();

  // Major 50mm grid centered on (0, 0)
  ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.30)' : 'rgba(51, 65, 85, 0.28)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let mm = 50; mm < halfW; mm += 50) {
    const dx = mm * pxPerMmX;
    ctx.moveTo(center + dx, 0);
    ctx.lineTo(center + dx, size);
    ctx.moveTo(center - dx, 0);
    ctx.lineTo(center - dx, size);
  }
  for (let mm = 50; mm < halfD; mm += 50) {
    const dz = mm * pxPerMmZ;
    ctx.moveTo(0, center + dz);
    ctx.lineTo(size, center + dz);
    ctx.moveTo(0, center - dz);
    ctx.lineTo(size, center - dz);
  }
  ctx.stroke();

  // Center crosshairs (X=0, Z=0)
  ctx.strokeStyle = isDark ? 'rgba(232, 76, 92, 0.44)' : 'rgba(217, 56, 72, 0.34)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(center, 18);
  ctx.lineTo(center, size - 18);
  ctx.moveTo(18, center);
  ctx.lineTo(size - 18, center);
  ctx.stroke();

  // Perimeter calibration frame
  ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.42)' : 'rgba(30, 41, 59, 0.42)';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, size - 28, size - 28);

  // Millimeter markings along front edge
  ctx.fillStyle = isDark ? 'rgba(203, 213, 225, 0.72)' : 'rgba(30, 41, 59, 0.65)';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(widthMm)} × ${Math.round(depthMm)} mm · PEI`, center, size - 24);
  ctx.textAlign = 'left';
  ctx.fillText('FRENTE (+Z)', 28, size - 24);
  ctx.textAlign = 'right';
  ctx.fillText('ESCALA 10 mm', size - 28, size - 24);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(16, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function createPeiBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 4000; i++) {
    const x = (i * 73) % size;
    const y = (i * 139) % size;
    const shade = 105 + ((i * 29) % 45);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.06,
    size * 0.5,
    size * 0.5,
    size * 0.5
  );
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.34)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.14)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Multi-part procedural 3D printer build plate assembly:
 * 1. Textured PEI magnetic steel top sheet (at Y = 0)
 * 2. Brushed dark anodized aluminum heated sub-bed
 * 3. Front magnetic alignment grip tab
 * 4. 4 corner precision alignment pins / clips
 * 5. Soft radial contact shadow plane directly beneath the printed model
 */
export function createBuildPlateRig(
  maxAnisotropy = 8,
  initialTheme: 'light' | 'dark' = 'dark',
  initialSize: BuildPlateSize = DEFAULT_BUILD_PLATE
): BuildPlateRig {
  const group = new THREE.Group();
  group.name = 'PrinterBuildPlate';

  let currentTheme: 'light' | 'dark' = initialTheme;
  let currentWidth = initialSize.widthMm;
  let currentDepth = initialSize.depthMm;

  let lightAlbedoTex = createBuildPlateAlbedoTexture(
    maxAnisotropy,
    'light',
    currentWidth,
    currentDepth
  );
  let darkAlbedoTex = createBuildPlateAlbedoTexture(
    maxAnisotropy,
    'dark',
    currentWidth,
    currentDepth
  );
  const bumpTex = createPeiBumpTexture(maxAnisotropy);
  bumpTex.repeat.set(currentWidth / 30, currentDepth / 30);
  const shadowTex = createContactShadowTexture();

  // 1. PEI Magnetic Top Sheet (top face flush at Y = 0)
  let peiGeo = new THREE.BoxGeometry(currentWidth, 2.2, currentDepth);
  const peiTopMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: currentTheme === 'dark' ? darkAlbedoTex : lightAlbedoTex,
    bumpMap: bumpTex,
    bumpScale: 0.08,
    roughness: 0.72,
    metalness: 0.08,
  });
  const peiEdgeMat = new THREE.MeshStandardMaterial({
    color: 0x3b4454,
    roughness: 0.42,
    metalness: 0.65,
  });

  const peiMesh = new THREE.Mesh(peiGeo, [
    peiEdgeMat,
    peiEdgeMat,
    peiTopMat,
    peiEdgeMat,
    peiEdgeMat,
    peiEdgeMat,
  ]);
  peiMesh.position.y = -1.1;
  peiMesh.receiveShadow = true;
  peiMesh.userData.excludeFromExport = true;
  group.add(peiMesh);

  // 2. Brushed Aluminum Heated Sub-Bed Frame
  let subBedGeo = new THREE.BoxGeometry(currentWidth + 10, 5.5, currentDepth + 10);
  const subBedMat = new THREE.MeshStandardMaterial({
    color: 0x262c36,
    roughness: 0.34,
    metalness: 0.78,
  });

  const subBed = new THREE.Mesh(subBedGeo, subBedMat);
  subBed.position.y = -4.95;
  subBed.receiveShadow = true;
  subBed.userData.excludeFromExport = true;
  group.add(subBed);

  // 3. Front PEI Pull Handle Tab (rounded extruded steel tab)
  const tabShape = new THREE.Shape();
  tabShape.moveTo(-26, 0);
  tabShape.lineTo(26, 0);
  tabShape.lineTo(21, 11);
  tabShape.quadraticCurveTo(20, 14, 16, 14);
  tabShape.lineTo(-16, 14);
  tabShape.quadraticCurveTo(-20, 14, -21, 11);
  tabShape.closePath();

  const tabGeo = new THREE.ExtrudeGeometry(tabShape, {
    depth: 1.8,
    bevelEnabled: true,
    bevelThickness: 0.35,
    bevelSize: 0.35,
    bevelSegments: 2,
  });
  tabGeo.rotateX(Math.PI * 0.5);
  const tabMat = new THREE.MeshStandardMaterial({
    color: currentTheme === 'dark' ? 0x3b465a : 0xcbd4e1,
    roughness: 0.36,
    metalness: 0.62,
  });

  const frontTab = new THREE.Mesh(tabGeo, tabMat);
  frontTab.position.set(0, -0.35, currentDepth * 0.5 - 0.5);
  frontTab.userData.excludeFromExport = true;
  group.add(frontTab);

  // 4. Four Corner Bed Leveling Knobs / Alignment Clips
  const clipGeo = new THREE.CylinderGeometry(5.2, 5.8, 3.2, 18);
  const clipMat = new THREE.MeshStandardMaterial({
    color: 0xd93848,
    roughness: 0.42,
    metalness: 0.25,
  });

  const cornerSigns: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  const cornerClips: THREE.Mesh[] = cornerSigns.map(([sx, sz]) => {
    const clip = new THREE.Mesh(clipGeo, clipMat);
    clip.position.set(
      sx * (currentWidth * 0.5 - 3),
      -4.2,
      sz * (currentDepth * 0.5 - 3)
    );
    clip.userData.excludeFromExport = true;
    group.add(clip);
    return clip;
  });

  // 5. Soft Radial Contact Shadow Plane directly on bed surface (Y = 0.08mm)
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI * 0.5);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: currentTheme === 'dark' ? 0.55 : 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.set(0, 0.08, 0);
  contactShadow.scale.set(140, 1, 80);
  contactShadow.userData.excludeFromExport = true;
  group.add(contactShadow);

  // Subtle infinite matte studio floor far below the heated bed
  const studioFloorGeo = new THREE.PlaneGeometry(2800, 2800);
  studioFloorGeo.rotateX(-Math.PI * 0.5);
  const studioFloorMat = new THREE.MeshStandardMaterial({
    color: currentTheme === 'dark' ? 0x111620 : 0xeceff3,
    roughness: 0.95,
    metalness: 0.0,
  });

  const studioFloor = new THREE.Mesh(studioFloorGeo, studioFloorMat);
  studioFloor.position.y = -8.2;
  studioFloor.receiveShadow = true;
  studioFloor.userData.excludeFromExport = true;
  group.add(studioFloor);

  return {
    group,
    contactShadow,
    updateShadowForBounds: (widthMm: number, depthMm: number) => {
      const sx = Math.max(45, widthMm * 1.45);
      const sz = Math.max(36, depthMm * 1.65);
      contactShadow.scale.set(sx, 1, sz);
    },
    setTheme: (theme: 'light' | 'dark') => {
      currentTheme = theme;
      const isDark = theme === 'dark';
      peiTopMat.map = isDark ? darkAlbedoTex : lightAlbedoTex;
      peiTopMat.needsUpdate = true;
      tabMat.color.setHex(isDark ? 0x3b465a : 0xcbd4e1);
      studioFloorMat.color.setHex(isDark ? 0x111620 : 0xeceff3);
      shadowMat.opacity = isDark ? 0.55 : 0.9;
    },
    setSize: (size: BuildPlateSize) => {
      const nextW = Math.max(100, Math.min(450, Math.round(size.widthMm)));
      const nextD = Math.max(100, Math.min(450, Math.round(size.depthMm)));
      if (nextW === currentWidth && nextD === currentDepth) return;

      currentWidth = nextW;
      currentDepth = nextD;

      const prevLight = lightAlbedoTex;
      const prevDark = darkAlbedoTex;
      lightAlbedoTex = createBuildPlateAlbedoTexture(maxAnisotropy, 'light', nextW, nextD);
      darkAlbedoTex = createBuildPlateAlbedoTexture(maxAnisotropy, 'dark', nextW, nextD);
      peiTopMat.map = currentTheme === 'dark' ? darkAlbedoTex : lightAlbedoTex;
      peiTopMat.needsUpdate = true;
      prevLight.dispose();
      prevDark.dispose();

      bumpTex.repeat.set(nextW / 30, nextD / 30);

      const prevPeiGeo = peiGeo;
      peiGeo = new THREE.BoxGeometry(nextW, 2.2, nextD);
      peiMesh.geometry = peiGeo;
      prevPeiGeo.dispose();

      const prevSubGeo = subBedGeo;
      subBedGeo = new THREE.BoxGeometry(nextW + 10, 5.5, nextD + 10);
      subBed.geometry = subBedGeo;
      prevSubGeo.dispose();

      frontTab.position.set(0, -0.35, nextD * 0.5 - 0.5);
      cornerClips.forEach((clip, idx) => {
        const [sx, sz] = cornerSigns[idx];
        clip.position.set(sx * (nextW * 0.5 - 3), -4.2, sz * (nextD * 0.5 - 3));
      });
    },
    dispose: () => {
      lightAlbedoTex.dispose();
      darkAlbedoTex.dispose();
      bumpTex.dispose();
      shadowTex.dispose();
      peiGeo.dispose();
      peiTopMat.dispose();
      peiEdgeMat.dispose();
      subBedGeo.dispose();
      subBedMat.dispose();
      tabGeo.dispose();
      tabMat.dispose();
      clipGeo.dispose();
      clipMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      studioFloorGeo.dispose();
      studioFloorMat.dispose();
    },
  };
}

