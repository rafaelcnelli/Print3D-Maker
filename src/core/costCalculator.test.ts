import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInfillToMetrics,
  calculatePrintCost,
  computeEffectiveFillFactor,
  DEFAULT_COST_SETTINGS,
  estimateMassAndTime,
  formatCurrencyBRL,
} from './costCalculator';
import type { PrintMetrics } from '../types/project';

const SAMPLE_METRICS: PrintMetrics = {
  widthMm: 65,
  heightMm: 55,
  depthMm: 20,
  triangleCount: 5200,
  volumeCm3: 37.0,
  filamentGrams: 22,
  estimatedMinutes: 81,
};

test('computeEffectiveFillFactor matches standard FDM shell + infill progression', () => {
  assert.ok(Math.abs(computeEffectiveFillFactor(0) - 0.35) < 1e-6);
  assert.ok(Math.abs(computeEffectiveFillFactor(20) - 0.48) < 1e-6);
  assert.ok(Math.abs(computeEffectiveFillFactor(100) - 1.0) < 1e-6);
  // Clamps out-of-range inputs safely
  assert.ok(Math.abs(computeEffectiveFillFactor(-25) - 0.35) < 1e-6);
  assert.ok(Math.abs(computeEffectiveFillFactor(150) - 1.0) < 1e-6);
});

test('higher infill increases filament grams and estimated print time monotonically', () => {
  const low = estimateMassAndTime(37.0, 10, 1.24);
  const mid = estimateMassAndTime(37.0, 20, 1.24);
  const high = estimateMassAndTime(37.0, 60, 1.24);
  const solid = estimateMassAndTime(37.0, 100, 1.24);

  assert.ok(low.filamentGrams < mid.filamentGrams);
  assert.ok(mid.filamentGrams < high.filamentGrams);
  assert.ok(high.filamentGrams < solid.filamentGrams);

  assert.ok(low.estimatedMinutes < mid.estimatedMinutes);
  assert.ok(mid.estimatedMinutes < high.estimatedMinutes);
  assert.ok(high.estimatedMinutes < solid.estimatedMinutes);

  // 100% infill PLA on 37 cm³ should be ~45.9 g
  assert.ok(Math.abs(solid.filamentGramsExact - 45.9) < 0.2);
});

test('calculatePrintCost computes filament cost, hourly print cost, and total accurately', () => {
  const breakdown = calculatePrintCost(
    SAMPLE_METRICS,
    {
      filamentPricePerKg: 100,
      hourlyPrintCost: 6,
      infillPercent: 20,
    },
    'pla-matte'
  );

  // 37 * 0.48 * 1.24 = 22.0224 g -> 22.0 g
  assert.equal(breakdown.materialLabel, 'PLA');
  assert.equal(breakdown.filamentGrams, 22.0);
  // 22.0224 * 3.4 + 6 = 80.876 -> 81 min = 1.35 h
  assert.equal(breakdown.estimatedMinutes, 81);
  assert.ok(Math.abs(breakdown.filamentCost - 2.2) < 0.01);
  assert.ok(Math.abs(breakdown.machineCost - 8.1) < 0.01);
  assert.ok(
    Math.abs(breakdown.totalCost - (breakdown.filamentCost + breakdown.machineCost)) < 1e-6
  );

  // PETG has slightly higher density (1.27 vs 1.24)
  const petg = calculatePrintCost(SAMPLE_METRICS, DEFAULT_COST_SETTINGS, 'petg-clear');
  assert.equal(petg.materialLabel, 'PETG');
  assert.ok(petg.filamentGrams > breakdown.filamentGrams);
});

test('applyInfillToMetrics preserves geometry dimensions and updates grams + duration', () => {
  const updated = applyInfillToMetrics(SAMPLE_METRICS, 80, 'pla-matte');
  assert.equal(updated.widthMm, SAMPLE_METRICS.widthMm);
  assert.equal(updated.heightMm, SAMPLE_METRICS.heightMm);
  assert.equal(updated.volumeCm3, SAMPLE_METRICS.volumeCm3);
  assert.ok(updated.filamentGrams > SAMPLE_METRICS.filamentGrams);
  assert.ok(updated.estimatedMinutes > SAMPLE_METRICS.estimatedMinutes);
});

test('formatCurrencyBRL formats values in pt-BR BRL safely', () => {
  assert.match(formatCurrencyBRL(12.5), /R\$\s*12,50/);
  assert.match(formatCurrencyBRL(0), /R\$\s*0,00/);
  assert.match(formatCurrencyBRL(Number.NaN), /R\$\s*0,00/);
});
