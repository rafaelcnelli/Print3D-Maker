import * as THREE from 'three';
import type { FilamentFinishId } from '../types/project';

/**
 * Generates a tileable grayscale procedural bump map simulating realistic
 * 0.20mm FDM 3D-printed layer striations so models catch studio light
 * like authentic printed PLA / Silk PLA / PETG parts.
 */
export function createLayerLineBumpTexture(maxAnisotropy = 4): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  // Draw fine horizontal FDM extrusion beads (every 4px)
  for (let y = 0; y < 256; y += 4) {
    const grad = ctx.createLinearGradient(0, y, 0, y + 4);
    grad.addColorStop(0, '#626262');
    grad.addColorStop(0.35, '#a2a2a2');
    grad.addColorStop(0.7, '#909090');
    grad.addColorStop(1, '#5c5c5c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 256, 4);
  }

  // Subtle micro filament extrusion variation
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 600; i++) {
    const x = (i * 53) % 256;
    const y = (i * 97) % 256;
    ctx.fillRect(x, y, 6, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = Math.min(8, maxAnisotropy);
  // Data map -> keep NoColorSpace (linear)
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface FilamentMaterialPair {
  primary: THREE.MeshPhysicalMaterial;
  accent: THREE.MeshPhysicalMaterial;
  dispose: () => void;
}

function getFinishParams(finish: FilamentFinishId): {
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  bumpScale: number;
  envMapIntensity: number;
  accentRoughnessDelta: number;
} {
  switch (finish) {
    case 'pla-matte':
      return {
        roughness: 0.68,
        metalness: 0.04,
        clearcoat: 0.05,
        clearcoatRoughness: 0.6,
        bumpScale: 0.14,
        envMapIntensity: 0.85,
        accentRoughnessDelta: -0.26,
      };
    case 'pla-silk':
      return {
        roughness: 0.24,
        metalness: 0.42,
        clearcoat: 0.65,
        clearcoatRoughness: 0.22,
        bumpScale: 0.11,
        envMapIntensity: 1.25,
        accentRoughnessDelta: 0.28,
      };
    case 'pla-gloss':
      return {
        roughness: 0.28,
        metalness: 0.08,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14,
        bumpScale: 0.09,
        envMapIntensity: 1.1,
        accentRoughnessDelta: 0.3,
      };
    case 'petg-clear':
      return {
        roughness: 0.18,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        bumpScale: 0.07,
        envMapIntensity: 1.2,
        accentRoughnessDelta: 0.34,
      };
  }
}

export function createFilamentMaterialPair(
  primaryHex: string,
  accentHex: string,
  useDualColor: boolean,
  finish: FilamentFinishId,
  bumpMap: THREE.CanvasTexture | null
): FilamentMaterialPair {
  const params = getFinishParams(finish);
  const effectiveAccentHex = useDualColor ? accentHex : primaryHex;
  const accentRoughness = THREE.MathUtils.clamp(
    params.roughness + params.accentRoughnessDelta,
    0.14,
    0.85
  );

  const primary = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(primaryHex),
    roughness: params.roughness,
    metalness: params.metalness,
    clearcoat: params.clearcoat,
    clearcoatRoughness: params.clearcoatRoughness,
    bumpMap: bumpMap ?? undefined,
    bumpScale: bumpMap ? params.bumpScale : 0,
    envMapIntensity: params.envMapIntensity,
  });

  const accent = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(effectiveAccentHex),
    roughness: accentRoughness,
    metalness: useDualColor ? Math.min(0.55, params.metalness + 0.08) : Math.max(0.02, params.metalness - 0.08),
    clearcoat: params.clearcoat * 0.75,
    clearcoatRoughness: Math.min(0.65, params.clearcoatRoughness + 0.15),
    bumpMap: bumpMap ?? undefined,
    bumpScale: bumpMap ? params.bumpScale * 0.85 : 0,
    envMapIntensity: params.envMapIntensity,
  });

  return {
    primary,
    accent,
    dispose: () => {
      primary.dispose();
      accent.dispose();
    },
  };
}
