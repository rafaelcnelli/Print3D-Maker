import { useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import {
  calculatePrintCost,
  clampInfillPercent,
  clampNonNegativePrice,
  formatCurrencyBRL,
  formatGramsPT,
  INFILL_PRESETS,
} from '../core/costCalculator';
import { formatPrintDuration } from '../core/stlExporter';
import type {
  CostCalculatorSettings,
  FilamentFinishId,
  PrintMetrics,
} from '../types/project';

interface CostCalculatorProps {
  metrics: PrintMetrics;
  finish: FilamentFinishId;
  settings: CostCalculatorSettings;
  onChangeSettings: (next: CostCalculatorSettings) => void;
}

function parseLocalizedDecimal(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s+/g, '').replace(',', '.');
  if (cleaned === '') return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatEditableDecimal(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace('.', ',');
}

export function CostCalculator({
  metrics,
  finish,
  settings,
  onChangeSettings,
}: CostCalculatorProps) {
  const [open, setOpen] = useState(false);
  const [draftFilament, setDraftFilament] = useState(() =>
    formatEditableDecimal(settings.filamentPricePerKg)
  );
  const [draftHourly, setDraftHourly] = useState(() =>
    formatEditableDecimal(settings.hourlyPrintCost)
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  const breakdown = useMemo(
    () => calculatePrintCost(metrics, settings, finish),
    [metrics, settings, finish]
  );

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleFilamentInput = (raw: string) => {
    setDraftFilament(raw);
    const parsed = parseLocalizedDecimal(raw);
    if (parsed !== null) {
      onChangeSettings({
        ...settings,
        filamentPricePerKg: clampNonNegativePrice(
          parsed,
          settings.filamentPricePerKg
        ),
      });
    }
  };

  const handleFilamentBlur = () => {
    const parsed = parseLocalizedDecimal(draftFilament);
    const safe =
      parsed !== null
        ? clampNonNegativePrice(parsed, settings.filamentPricePerKg)
        : settings.filamentPricePerKg;
    setDraftFilament(formatEditableDecimal(safe));
    if (safe !== settings.filamentPricePerKg) {
      onChangeSettings({ ...settings, filamentPricePerKg: safe });
    }
  };

  const handleHourlyInput = (raw: string) => {
    setDraftHourly(raw);
    const parsed = parseLocalizedDecimal(raw);
    if (parsed !== null) {
      onChangeSettings({
        ...settings,
        hourlyPrintCost: clampNonNegativePrice(parsed, settings.hourlyPrintCost),
      });
    }
  };

  const handleHourlyBlur = () => {
    const parsed = parseLocalizedDecimal(draftHourly);
    const safe =
      parsed !== null
        ? clampNonNegativePrice(parsed, settings.hourlyPrintCost)
        : settings.hourlyPrintCost;
    setDraftHourly(formatEditableDecimal(safe));
    if (safe !== settings.hourlyPrintCost) {
      onChangeSettings({ ...settings, hourlyPrintCost: safe });
    }
  };

  const handleInfillChange = (nextInfill: number) => {
    onChangeSettings({
      ...settings,
      infillPercent: clampInfillPercent(nextInfill),
    });
  };

  const formattedTotal = formatCurrencyBRL(breakdown.totalCost);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        data-testid="cost-calc-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Calculadora de custos: ${formattedTotal}`}
        title="Expandir ou recolher calculadora de custos"
        className={`inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848] ${
          open
            ? 'border-[#D93848] dark:border-[#E84C5C] bg-[#FDF2F3] dark:bg-[#2B171D] text-[#171A21] dark:text-[#F8FAFC]'
            : 'border-[#D5DCE6] dark:border-[#2C3649] bg-[#F7F9FC] dark:bg-[#1C2332] hover:bg-[#EDF1F7] dark:hover:bg-[#252F42] text-[#171A21] dark:text-[#E2E8F0]'
        }`}
      >
        <Calculator
          className="w-3.5 h-3.5 text-[#D93848] dark:text-[#E84C5C] shrink-0"
          aria-hidden="true"
        />
        <span className="hidden xl:inline text-[#5A6375] dark:text-[#94A3B8]">
          Custo
        </span>
        <span
          data-testid="cost-calc-navbar-total"
          className="font-mono tabular-nums font-semibold"
        >
          {formattedTotal}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#64748B] dark:text-[#94A3B8] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Calculadora de custos de impressão 3D"
          data-testid="cost-calc-popover"
          className="fixed inset-x-3 top-16 sm:inset-x-auto sm:top-auto sm:absolute sm:right-0 sm:mt-2 sm:w-[344px] rounded-xl border border-[#D5DCE6] dark:border-[#2B3548] bg-white dark:bg-[#161B26] shadow-[0_18px_44px_-12px_rgba(15,23,42,0.28)] dark:shadow-[0_20px_48px_-12px_rgba(0,0,0,0.65)] p-4 z-40"
        >
          {/* Header with collapse control */}
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#E5E9F0] dark:border-[#262E3E]">
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-[#171A21] dark:text-[#F8FAFC]">
                Calculadora de custos
              </h3>
              <p className="mt-0.5 text-[11px] font-mono tabular-nums text-[#5A6375] dark:text-[#94A3B8] flex items-center gap-1.5 flex-wrap">
                <span>{breakdown.materialLabel}</span>
                <span aria-hidden="true">·</span>
                <span data-testid="cost-calc-grams">
                  ~{formatGramsPT(breakdown.filamentGrams)}
                </span>
                <span aria-hidden="true">·</span>
                <span data-testid="cost-calc-duration">
                  {formatPrintDuration(breakdown.estimatedMinutes)}
                </span>
              </p>
            </div>
            <button
              type="button"
              data-testid="cost-calc-collapse"
              onClick={() => setOpen(false)}
              aria-label="Recolher calculadora de custos"
              title="Recolher"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[#64748B] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F8FAFC] hover:bg-[#EFF2F7] dark:hover:bg-[#232B3B] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848]"
            >
              <ChevronUp className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Part Infill (Preenchimento) Control */}
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="cost-infill-range"
                className="font-semibold text-[#374151] dark:text-[#CBD5E1]"
              >
                Preenchimento da peça
              </label>
              <span
                data-testid="cost-infill-value"
                className="font-mono tabular-nums font-bold text-[#171A21] dark:text-[#F8FAFC]"
              >
                {breakdown.infillPercent}%
              </span>
            </div>

            <input
              id="cost-infill-range"
              type="range"
              data-testid="cost-infill-slider"
              min={0}
              max={100}
              step={5}
              value={breakdown.infillPercent}
              onChange={(e) => handleInfillChange(Number(e.target.value))}
              className="studio-slider w-full"
            />

            <div
              role="group"
              aria-label="Presets de preenchimento"
              className="flex items-center gap-1 p-0.5 rounded-lg bg-[#EFF2F7] dark:bg-[#0E121A]"
            >
              {INFILL_PRESETS.map((pct) => {
                const active = breakdown.infillPercent === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    data-testid={`cost-infill-preset-${pct}`}
                    aria-pressed={active}
                    onClick={() => handleInfillChange(pct)}
                    className={`flex-1 h-7 rounded-md font-mono tabular-nums text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-[#232B3B] text-[#171A21] dark:text-[#F8FAFC] shadow-xs'
                        : 'text-[#525C6E] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F1F5F9]'
                    }`}
                  >
                    {pct}%
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cost Inputs: Filament (R$/kg) + Hourly Print Cost (R$/h) */}
          <div className="mt-3.5 pt-3 border-t border-[#E5E9F0] dark:border-[#262E3E] grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[#475569] dark:text-[#CBD5E1]">
                Filamento (R$/kg)
              </span>
              <div className="relative flex items-center">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8]"
                >
                  R$
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  data-testid="cost-filament-input"
                  value={draftFilament}
                  onChange={(e) => handleFilamentInput(e.target.value)}
                  onBlur={handleFilamentBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFilamentBlur();
                  }}
                  className="w-full h-9 pl-8 pr-2.5 rounded-lg border border-[#D1D8E3] dark:border-[#323E54] bg-[#F7F9FC] dark:bg-[#0F141D] font-mono text-xs font-semibold tabular-nums text-[#171A21] dark:text-[#F1F5F9] focus:outline-none focus:border-[#D93848] focus:bg-white dark:focus:bg-[#161D2A] transition-colors"
                />
              </div>
              <span className="text-[10px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                {formatCurrencyBRL(breakdown.filamentPricePerGram)}/g
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[#475569] dark:text-[#CBD5E1]">
                Hora de impressão
              </span>
              <div className="relative flex items-center">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8]"
                >
                  R$
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  data-testid="cost-hourly-input"
                  value={draftHourly}
                  onChange={(e) => handleHourlyInput(e.target.value)}
                  onBlur={handleHourlyBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleHourlyBlur();
                  }}
                  className="w-full h-9 pl-8 pr-2.5 rounded-lg border border-[#D1D8E3] dark:border-[#323E54] bg-[#F7F9FC] dark:bg-[#0F141D] font-mono text-xs font-semibold tabular-nums text-[#171A21] dark:text-[#F1F5F9] focus:outline-none focus:border-[#D93848] focus:bg-white dark:focus:bg-[#161D2A] transition-colors"
                />
              </div>
              <span className="text-[10px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                {breakdown.estimatedHours.toFixed(2).replace('.', ',')} h estimadas
              </span>
            </label>
          </div>

          {/* Live Breakdown Summary */}
          <div className="mt-3.5 pt-3 border-t border-[#E5E9F0] dark:border-[#262E3E] flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between gap-2 text-[#475569] dark:text-[#94A3B8]">
              <span>
                Filamento ({formatGramsPT(breakdown.filamentGrams)})
              </span>
              <span
                data-testid="cost-filament-subtotal"
                className="font-mono tabular-nums font-medium text-[#171A21] dark:text-[#E2E8F0]"
              >
                {formatCurrencyBRL(breakdown.filamentCost)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 text-[#475569] dark:text-[#94A3B8]">
              <span>
                Tempo ({formatPrintDuration(breakdown.estimatedMinutes)})
              </span>
              <span
                data-testid="cost-time-subtotal"
                className="font-mono tabular-nums font-medium text-[#171A21] dark:text-[#E2E8F0]"
              >
                {formatCurrencyBRL(breakdown.machineCost)}
              </span>
            </div>

            <div className="mt-1 pt-2 border-t border-[#E5E9F0] dark:border-[#262E3E] flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-[#171A21] dark:text-[#F8FAFC]">
                Custo total estimado
              </span>
              <span
                data-testid="cost-total-value"
                className="font-mono tabular-nums text-base font-bold text-[#D93848] dark:text-[#F46B7A]"
              >
                {formattedTotal}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
