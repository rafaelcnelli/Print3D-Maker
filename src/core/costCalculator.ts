import type {
  CostCalculatorSettings,
  FilamentFinishId,
  PrintMetrics,
} from '../types/project';

export const DEFAULT_COST_SETTINGS: CostCalculatorSettings = {
  filamentPricePerKg: 110,
  hourlyPrintCost: 5,
  infillPercent: 20,
};

export const INFILL_PRESETS = [10, 15, 20, 40, 100] as const;

/** Fraction of a solid 3D print occupied by outer walls + top/bottom shells. */
const SHELL_VOLUME_FRACTION = 0.35;

export function getFilamentMaterialInfo(finish: FilamentFinishId): {
  label: string;
  densityGcm3: number;
} {
  if (finish === 'petg-clear') {
    return { label: 'PETG', densityGcm3: 1.27 };
  }
  return { label: 'PLA', densityGcm3: 1.24 };
}

export function clampInfillPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_COST_SETTINGS.infillPercent;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function clampNonNegativePrice(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100000, Math.round(value * 100) / 100));
}

/**
 * Computes effective fill factor for an FDM print given infill percentage (0–100%).
 * At 20% infill -> 0.35 + 0.65 * 0.20 = 0.48 (typical 2–3 walls + 20% gyroid infill).
 * At 100% infill -> 1.00 (fully solid part).
 */
export function computeEffectiveFillFactor(infillPercent: number): number {
  const clamped = clampInfillPercent(infillPercent);
  return SHELL_VOLUME_FRACTION + (1 - SHELL_VOLUME_FRACTION) * (clamped / 100);
}

/**
 * Recalculates estimated filament grams and print duration from solid mesh volume
 * for a given infill percentage and material density.
 */
export function estimateMassAndTime(
  volumeCm3: number,
  infillPercent: number,
  densityGcm3 = 1.24
): {
  filamentGramsExact: number;
  filamentGrams: number;
  estimatedMinutes: number;
} {
  if (!Number.isFinite(volumeCm3) || volumeCm3 <= 0) {
    return {
      filamentGramsExact: 0,
      filamentGrams: 0,
      estimatedMinutes: 0,
    };
  }

  const fillFactor = computeEffectiveFillFactor(infillPercent);
  const rawGrams = volumeCm3 * fillFactor * densityGcm3;
  const filamentGramsExact = Math.max(0.5, Math.round(rawGrams * 10) / 10);
  const filamentGrams = Math.max(1, Math.round(rawGrams));
  // Modern FDM printer ~14–18 g/hr average (~3.4 min/g + 6 min warmup/first layer)
  const estimatedMinutes = Math.max(8, Math.round(rawGrams * 3.4 + 6));

  return {
    filamentGramsExact,
    filamentGrams,
    estimatedMinutes,
  };
}

/**
 * Returns updated PrintMetrics taking the chosen infill % and filament finish into account.
 */
export function applyInfillToMetrics(
  baseMetrics: PrintMetrics,
  infillPercent: number,
  finish: FilamentFinishId = 'pla-matte'
): PrintMetrics {
  if (baseMetrics.volumeCm3 <= 0) {
    return baseMetrics;
  }
  const { densityGcm3 } = getFilamentMaterialInfo(finish);
  const { filamentGrams, estimatedMinutes } = estimateMassAndTime(
    baseMetrics.volumeCm3,
    infillPercent,
    densityGcm3
  );
  return {
    ...baseMetrics,
    filamentGrams,
    estimatedMinutes,
  };
}

export interface PrintCostBreakdown {
  materialLabel: string;
  densityGcm3: number;
  infillPercent: number;
  filamentGrams: number;
  estimatedMinutes: number;
  estimatedHours: number;
  filamentPricePerGram: number;
  filamentCost: number;
  machineCost: number;
  totalCost: number;
}

/**
 * Calculates full print cost breakdown from mesh metrics, infill %, filament price (R$/kg),
 * and hourly printing cost (R$/h).
 */
export function calculatePrintCost(
  metrics: PrintMetrics,
  settings: CostCalculatorSettings,
  finish: FilamentFinishId = 'pla-matte'
): PrintCostBreakdown {
  const { label: materialLabel, densityGcm3 } = getFilamentMaterialInfo(finish);
  const infillPercent = clampInfillPercent(settings.infillPercent);
  const pricePerKg = clampNonNegativePrice(
    settings.filamentPricePerKg,
    DEFAULT_COST_SETTINGS.filamentPricePerKg
  );
  const hourlyCost = clampNonNegativePrice(
    settings.hourlyPrintCost,
    DEFAULT_COST_SETTINGS.hourlyPrintCost
  );

  let grams = metrics.filamentGrams;
  let minutes = metrics.estimatedMinutes;

  if (metrics.volumeCm3 > 0) {
    const est = estimateMassAndTime(metrics.volumeCm3, infillPercent, densityGcm3);
    grams = est.filamentGramsExact;
    minutes = est.estimatedMinutes;
  }

  const estimatedHours = minutes / 60;
  const filamentPricePerGram = pricePerKg / 1000;
  const filamentCost = grams * filamentPricePerGram;
  const machineCost = estimatedHours * hourlyCost;
  const totalCost = filamentCost + machineCost;

  return {
    materialLabel,
    densityGcm3,
    infillPercent,
    filamentGrams: grams,
    estimatedMinutes: minutes,
    estimatedHours,
    filamentPricePerGram,
    filamentCost,
    machineCost,
    totalCost,
  };
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrencyBRL(value: number): string {
  const safe = Number.isFinite(value) && value >= 0 ? value : 0;
  return BRL_FORMATTER.format(safe);
}

export function formatGramsPT(grams: number): string {
  if (!Number.isFinite(grams) || grams <= 0) return '0 g';
  if (grams >= 10) {
    return `${Math.round(grams)} g`;
  }
  return `${grams.toFixed(1).replace('.', ',')} g`;
}
