import { TEMPLATES } from './projectDefaults';
import type { ProjectConfig, TemplateId } from '../types/project';

export type DimensionAxis = 'widthMm' | 'heightMm' | 'depthMm';

export interface Dimensions3D {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

export interface DimensionBounds {
  minWidthMm: number;
  maxWidthMm: number;
  minHeightMm: number;
  maxHeightMm: number;
  minDepthMm: number;
  maxDepthMm: number;
}

export function getTemplateDimensionBounds(template: TemplateId): DimensionBounds {
  const m = TEMPLATES[template];
  return {
    minWidthMm: m.minWidthMm,
    maxWidthMm: m.maxWidthMm,
    minHeightMm: m.minHeightMm,
    maxHeightMm: m.maxHeightMm,
    minDepthMm: m.minDepthMm,
    maxDepthMm: m.maxDepthMm,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function roundHalf(v: number): number {
  return Math.round(v * 2) / 2;
}

/**
 * Updates one dimension axis (widthMm, heightMm, or depthMm).
 * When locked === true, scales all 3 axes by the exact same ratio clamped
 * safely inside every axis's [min, max] bounds so proportions never drift.
 */
export function scaleDimensions(
  current: Dimensions3D,
  axis: DimensionAxis,
  requestedValue: number,
  locked: boolean,
  bounds: DimensionBounds
): Dimensions3D {
  if (!Number.isFinite(requestedValue) || requestedValue <= 0) {
    return { ...current };
  }

  if (!locked) {
    return {
      widthMm:
        axis === 'widthMm'
          ? roundHalf(clamp(requestedValue, bounds.minWidthMm, bounds.maxWidthMm))
          : current.widthMm,
      heightMm:
        axis === 'heightMm'
          ? roundHalf(clamp(requestedValue, bounds.minHeightMm, bounds.maxHeightMm))
          : current.heightMm,
      depthMm:
        axis === 'depthMm'
          ? roundHalf(clamp(requestedValue, bounds.minDepthMm, bounds.maxDepthMm))
          : current.depthMm,
    };
  }

  const baseVal = Math.max(1, current[axis]);
  const rawRatio = requestedValue / baseVal;

  const minRatio = Math.max(
    bounds.minWidthMm / Math.max(1, current.widthMm),
    bounds.minHeightMm / Math.max(1, current.heightMm),
    bounds.minDepthMm / Math.max(1, current.depthMm)
  );
  const maxRatio = Math.min(
    bounds.maxWidthMm / Math.max(1, current.widthMm),
    bounds.maxHeightMm / Math.max(1, current.heightMm),
    bounds.maxDepthMm / Math.max(1, current.depthMm)
  );

  const safeRatio =
    minRatio <= maxRatio ? clamp(rawRatio, minRatio, maxRatio) : 1;

  return {
    widthMm: roundHalf(
      clamp(current.widthMm * safeRatio, bounds.minWidthMm, bounds.maxWidthMm)
    ),
    heightMm: roundHalf(
      clamp(current.heightMm * safeRatio, bounds.minHeightMm, bounds.maxHeightMm)
    ),
    depthMm: roundHalf(
      clamp(current.depthMm * safeRatio, bounds.minDepthMm, bounds.maxDepthMm)
    ),
  };
}

/**
 * Applies a uniform corner drag scale (X & Z simultaneously, plus Y when locked).
 */
export function scaleDimensionsFromCorner(
  current: Dimensions3D,
  requestedWidth: number,
  requestedDepth: number,
  locked: boolean,
  bounds: DimensionBounds
): Dimensions3D {
  if (locked) {
    const ratioW = requestedWidth / Math.max(1, current.widthMm);
    const ratioD = requestedDepth / Math.max(1, current.depthMm);
    const avgRatio = (ratioW + ratioD) * 0.5;
    return scaleDimensions(
      current,
      'widthMm',
      current.widthMm * avgRatio,
      true,
      bounds
    );
  }

  return {
    widthMm: roundHalf(clamp(requestedWidth, bounds.minWidthMm, bounds.maxWidthMm)),
    heightMm: current.heightMm,
    depthMm: roundHalf(clamp(requestedDepth, bounds.minDepthMm, bounds.maxDepthMm)),
  };
}

export function extractDimensions(config: ProjectConfig): Dimensions3D {
  return {
    widthMm: config.widthMm,
    heightMm: config.heightMm,
    depthMm: config.depthMm,
  };
}
