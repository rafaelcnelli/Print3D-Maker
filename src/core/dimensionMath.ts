import { TEMPLATES } from './projectDefaults';
import type {
  BoxLetterLayout,
  BuildPlateSize,
  ProjectConfig,
  SvgAttachMode,
  TemplateId,
} from '../types/project';

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

/** Safety margin (mm total, 3mm per side) kept clear around the PEI bed perimeter */
export const BUILD_PLATE_MARGIN_MM = 6;

export function getTemplateDimensionBounds(
  template: TemplateId,
  bedSize?: BuildPlateSize,
  options?: {
    boxLetterLayout?: BoxLetterLayout;
    svgAttachMode?: SvgAttachMode;
    keyringEnabled?: boolean;
  }
): DimensionBounds {
  const m = TEMPLATES[template];

  if (!bedSize) {
    return {
      minWidthMm: m.minWidthMm,
      maxWidthMm: m.maxWidthMm,
      minHeightMm: m.minHeightMm,
      maxHeightMm: m.maxHeightMm,
      minDepthMm: m.minDepthMm,
      maxDepthMm: m.maxDepthMm,
    };
  }

  const usableX = Math.max(40, Math.floor(bedSize.widthMm - BUILD_PLATE_MARGIN_MM));
  const usableY = Math.max(40, Math.floor(bedSize.depthMm - BUILD_PLATE_MARGIN_MM));
  const usableZ = Math.max(30, Math.floor(bedSize.heightMm - 4));

  const isSeparatedBox =
    template === 'box-letter' && options?.boxLetterLayout === 'separated';
  const isFlatTemplate =
    template === 'keychain' ||
    template === 'plaque' ||
    template === 'svg-keychain' ||
    isSeparatedBox;

  const hasProtrudingTab =
    (template === 'svg-keychain' || template === 'keychain') &&
    options?.keyringEnabled !== false &&
    (options?.svgAttachMode === 'hole' || options?.svgAttachMode === 'loop');

  // Allow width to expand up to the build plate (and strictly never exceed usableX)
  const maxWidthMm = hasProtrudingTab ? Math.max(24, usableX - 12) : usableX;
  const minWidthMm = Math.min(m.minWidthMm, Math.max(20, maxWidthMm - 10));

  let maxHeightMm: number;
  let maxDepthMm: number;

  if (isFlatTemplate) {
    // On flat templates, heightMm lies along the bed Y (Three.js Z) and depthMm is vertical thickness
    if (isSeparatedBox) {
      // Separated Box Letters lay out TWO rows (shell + front lid + 14mm gap + borders)
      maxHeightMm = Math.max(24, Math.floor((usableY - 24) / 2));
    } else if (hasProtrudingTab) {
      // Reserve 12mm for the protruding keyring ear/loop
      maxHeightMm = Math.max(24, usableY - 12);
    } else {
      maxHeightMm = usableY;
    }
    // Vertical thickness stays within printable template thickness & printer Z height
    maxDepthMm = Math.min(m.maxDepthMm, usableZ);
  } else {
    // On standing templates: heightMm is vertical Z height, depthMm lies along bed Y
    maxHeightMm = usableZ;
    maxDepthMm = Math.min(Math.max(m.maxDepthMm, Math.min(usableY, 120)), usableY);
  }

  const minHeightMm = Math.min(m.minHeightMm, Math.max(16, maxHeightMm - 6));
  const minDepthMm = Math.min(m.minDepthMm, Math.max(3, maxDepthMm - 2));

  return {
    minWidthMm,
    maxWidthMm,
    minHeightMm,
    maxHeightMm,
    minDepthMm,
    maxDepthMm,
  };
}

/**
 * Ensures current dimensions fit strictly inside `bounds` (e.g., when switching to a smaller build plate).
 * When `preserveAspect` is true and any axis exceeds its max bound, scales down proportionally first.
 */
export function clampDimensionsToBounds(
  current: Dimensions3D,
  bounds: DimensionBounds,
  preserveAspect = true
): Dimensions3D {
  const overW = current.widthMm > bounds.maxWidthMm;
  const overH = current.heightMm > bounds.maxHeightMm;
  const overD = current.depthMm > bounds.maxDepthMm;

  if (preserveAspect && (overW || overH || overD)) {
    const ratio = Math.min(
      bounds.maxWidthMm / Math.max(1, current.widthMm),
      bounds.maxHeightMm / Math.max(1, current.heightMm),
      bounds.maxDepthMm / Math.max(1, current.depthMm)
    );
    return {
      widthMm: roundHalf(
        clamp(current.widthMm * ratio, bounds.minWidthMm, bounds.maxWidthMm)
      ),
      heightMm: roundHalf(
        clamp(current.heightMm * ratio, bounds.minHeightMm, bounds.maxHeightMm)
      ),
      depthMm: roundHalf(
        clamp(current.depthMm * ratio, bounds.minDepthMm, bounds.maxDepthMm)
      ),
    };
  }

  return {
    widthMm: roundHalf(clamp(current.widthMm, bounds.minWidthMm, bounds.maxWidthMm)),
    heightMm: roundHalf(clamp(current.heightMm, bounds.minHeightMm, bounds.maxHeightMm)),
    depthMm: roundHalf(clamp(current.depthMm, bounds.minDepthMm, bounds.maxDepthMm)),
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
