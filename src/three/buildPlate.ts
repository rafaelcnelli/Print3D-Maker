import * as THREE from 'three';

export interface BuildPlateRig {
  group: THREE.Group;
  contactShadow: THREE.Mesh;
  updateShadowForBounds: (widthMm: number, depthMm: number) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  dispose: () => void;
}

/**
 * Generates a high-resolution procedural PEI textured 3D printer bed albedo texture
 * with 10mm minor grid, 50mm major grid, and clean millimeter markings (240 x 240 mm).
 */
function createBuildPlateAlbedoTexture(
  maxAnisotropy: number,
  theme: 'light' | 'dark'
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

  const bedMm = 240;
  const pxPerMm = size / bedMm;

  // Minor 10mm grid
  ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(71, 85, 105, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let mm = 10; mm < bedMm; mm += 10) {
    if (mm % 50 === 0) continue;
    const p = mm * pxPerMm;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  // Major 50mm grid
  ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.30)' : 'rgba(51, 65, 85, 0.28)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let mm = 20; mm <= bedMm - 20; mm += 50) {
    const p = mm * pxPerMm;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  // Center crosshairs (X=0, Z=0)
  const center = size * 0.5;
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
  ctx.fillText('240 × 240 mm · PEI', center, size - 24);
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
  initialTheme: 'light' | 'dark' = 'light'
): BuildPlateRig {
  const group = new THREE.Group();
  group.name = 'PrinterBuildPlate';

  const disposables: { dispose: () => void }[] = [];

  const lightAlbedoTex = createBuildPlateAlbedoTexture(maxAnisotropy, 'light');
  const darkAlbedoTex = createBuildPlateAlbedoTexture(maxAnisotropy, 'dark');
  const albedoTex = initialTheme === 'dark' ? darkAlbedoTex : lightAlbedoTex;
  const bumpTex = createPeiBumpTexture(maxAnisotropy);
  const shadowTex = createContactShadowTexture();
  disposables.push(lightAlbedoTex, darkAlbedoTex, bumpTex, shadowTex);

  // 1. PEI Magnetic Top Sheet (240x240mm, top face flush at Y = 0)
  const peiGeo = new THREE.BoxGeometry(240, 2.2, 240);
  const peiTopMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: albedoTex,
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
  disposables.push(peiGeo, peiTopMat, peiEdgeMat);

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
  const subBedGeo = new THREE.BoxGeometry(250, 5.5, 250);
  const subBedMat = new THREE.MeshStandardMaterial({
    color: 0x262c36,
    roughness: 0.34,
    metalness: 0.78,
  });
  disposables.push(subBedGeo, subBedMat);

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
    color: 0xcbd4e1,
    roughness: 0.36,
    metalness: 0.62,
  });
  disposables.push(tabGeo, tabMat);

  const frontTab = new THREE.Mesh(tabGeo, tabMat);
  frontTab.position.set(0, -0.35, 119.5);
  frontTab.userData.excludeFromExport = true;
  group.add(frontTab);

  // 4. Four Corner Bed Leveling Knobs / Alignment Clips
  const clipGeo = new THREE.CylinderGeometry(5.2, 5.8, 3.2, 18);
  const clipMat = new THREE.MeshStandardMaterial({
    color: 0xd93848,
    roughness: 0.42,
    metalness: 0.25,
  });
  disposables.push(clipGeo, clipMat);

  const corners: [number, number][] = [
    [-117, -117],
    [117, -117],
    [-117, 117],
    [117, 117],
  ];
  for (const [cx, cz] of corners) {
    const clip = new THREE.Mesh(clipGeo, clipMat);
    clip.position.set(cx, -4.2, cz);
    clip.userData.excludeFromExport = true;
    group.add(clip);
  }

  // 5. Soft Radial Contact Shadow Plane directly on bed surface (Y = 0.08mm)
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI * 0.5);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  disposables.push(shadowGeo, shadowMat);

  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.set(0, 0.08, 0);
  contactShadow.scale.set(140, 1, 80);
  contactShadow.userData.excludeFromExport = true;
  group.add(contactShadow);

  // Subtle infinite matte studio floor far below the heated bed
  const studioFloorGeo = new THREE.PlaneGeometry(2400, 2400);
  studioFloorGeo.rotateX(-Math.PI * 0.5);
  const studioFloorMat = new THREE.MeshStandardMaterial({
    color: initialTheme === 'dark' ? 0x111620 : 0xeceff3,
    roughness: 0.95,
    metalness: 0.0,
  });
  disposables.push(studioFloorGeo, studioFloorMat);

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
      const isDark = theme === 'dark';
      peiTopMat.map = isDark ? darkAlbedoTex : lightAlbedoTex;
      peiTopMat.needsUpdate = true;
      tabMat.color.setHex(isDark ? 0x3b465a : 0xcbd4e1);
      studioFloorMat.color.setHex(isDark ? 0x111620 : 0xeceff3);
      shadowMat.opacity = isDark ? 0.55 : 0.9;
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
