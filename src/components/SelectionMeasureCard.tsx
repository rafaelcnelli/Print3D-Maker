import { useEffect, useState } from 'react';
import { Lock, LockOpen, Ruler, X } from 'lucide-react';
import type { DimensionAxis, DimensionBounds } from '../core/dimensionMath';
import type { PrintMetrics, ProjectConfig } from '../types/project';

interface SelectionMeasureCardProps {
  config: ProjectConfig;
  metrics: PrintMetrics;
  bounds: DimensionBounds;
  lockProportions: boolean;
  onToggleLock: () => void;
  onChangeAxis: (axis: DimensionAxis, value: number) => void;
  onClose: () => void;
}

interface AxisRowProps {
  id: string;
  label: string;
  axisTag: string;
  value: number;
  actualMm: number;
  min: number;
  max: number;
  onCommit: (nextVal: number) => void;
}

function AxisInputRow({
  id,
  label,
  axisTag,
  value,
  actualMm,
  min,
  max,
  onCommit,
}: AxisRowProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitDraft = () => {
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      onCommit(parsed);
    } else {
      setDraft(String(value));
    }
  };

  return (
    <div className="flex items-center justify-between gap-2.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-xs font-medium text-[#374151] dark:text-[#CBD5E1] whitespace-nowrap"
      >
        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[#EEF2F7] dark:bg-[#232B3B] text-[10px] font-mono font-bold text-[#1E293B] dark:text-[#E2E8F0]">
          {axisTag}
        </span>
        <span>{label}</span>
      </label>

      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const parsed = Number(e.target.value.replace(',', '.'));
            if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
              onCommit(parsed);
            }
          }}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitDraft();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-20 h-8 px-2 rounded-md border border-[#CBD5E1] dark:border-[#323E54] bg-[#F8FAFC] dark:bg-[#0F141D] text-right font-mono text-xs font-semibold tabular-nums text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none focus:bg-white dark:focus:bg-[#161D2A] focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20"
        />
        <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8] w-6">mm</span>
      </div>
      <span className="sr-only">Medida real na malha: {actualMm} mm</span>
    </div>
  );
}

export function SelectionMeasureCard({
  config,
  metrics,
  bounds,
  lockProportions,
  onToggleLock,
  onChangeAxis,
  onClose,
}: SelectionMeasureCardProps) {
  const isFlat =
    config.template === 'keychain' ||
    config.template === 'plaque' ||
    config.template === 'svg-keychain' ||
    (config.template === 'box-letter' && config.boxLetterLayout === 'separated');

  return (
    <aside
      aria-label="Medidas e redimensionamento da peça selecionada"
      data-testid="selection-measure-card"
      className="fixed top-[66px] right-4 sm:right-6 z-20 w-[266px] rounded-xl border border-[#CBD5E1] dark:border-[#273043] bg-[#FFFFFF]/96 dark:bg-[#161B26]/96 shadow-[0_14px_34px_-10px_rgba(15,23,42,0.2)] dark:shadow-[0_14px_34px_-10px_rgba(0,0,0,0.55)] overflow-hidden transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[#E5E9F0] dark:border-[#262E3E] bg-[#F8FAFC] dark:bg-[#111620]">
        <div className="flex items-center gap-2 min-w-0">
          <Ruler className="w-4 h-4 text-[#0284C7] dark:text-[#38BDF8] shrink-0" aria-hidden="true" />
          <h2 className="font-display text-xs font-bold text-[#171A21] dark:text-[#F1F5F9] truncate">
            Medidas da peça
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Desmarcar peça"
          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[#64748B] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F8FAFC] hover:bg-[#E2E8F0]/70 dark:hover:bg-[#232B3B] transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Body */}
      <div className="p-3.5 flex flex-col gap-2.5">
        {/* Lock / Unlock Proportions Toggle */}
        <button
          type="button"
          data-testid="toggle-lock-proportions"
          onClick={onToggleLock}
          aria-pressed={lockProportions}
          className={`w-full h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
            lockProportions
              ? 'border-[#0284C7]/40 dark:border-[#38BDF8]/40 bg-[#F0F9FF] dark:bg-[#0C2538] text-[#0369A1] dark:text-[#7DD3FC]'
              : 'border-[#CBD5E1] dark:border-[#323E54] bg-[#F8FAFC] dark:bg-[#1E2534] text-[#475569] dark:text-[#CBD5E1] hover:text-[#171A21] dark:hover:text-[#F8FAFC]'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            {lockProportions ? (
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <LockOpen className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{lockProportions ? 'Proporção trancada' : 'Proporção livre'}</span>
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider opacity-85">
            {lockProportions ? 'Trancado' : 'Livre'}
          </span>
        </button>

        {/* Editable Axis Inputs */}
        <div className="flex flex-col gap-2 pt-0.5">
          <AxisInputRow
            id="measure-width-input"
            label="Largura"
            axisTag="X"
            value={config.widthMm}
            actualMm={metrics.widthMm}
            min={bounds.minWidthMm}
            max={bounds.maxWidthMm}
            onCommit={(v) => onChangeAxis('widthMm', v)}
          />

          <AxisInputRow
            id="measure-height-input"
            label={isFlat ? 'Comprimento' : 'Altura'}
            axisTag={isFlat ? 'Z' : 'Y'}
            value={config.heightMm}
            actualMm={isFlat ? metrics.depthMm : metrics.heightMm}
            min={bounds.minHeightMm}
            max={bounds.maxHeightMm}
            onCommit={(v) => onChangeAxis('heightMm', v)}
          />

          <AxisInputRow
            id="measure-depth-input"
            label={isFlat ? 'Espessura' : 'Profundidade'}
            axisTag={isFlat ? 'Y' : 'Z'}
            value={config.depthMm}
            actualMm={isFlat ? metrics.heightMm : metrics.depthMm}
            min={bounds.minDepthMm}
            max={bounds.maxDepthMm}
            onCommit={(v) => onChangeAxis('depthMm', v)}
          />
        </div>

        {/* Real bounding box summary & interaction hint */}
        <div className="pt-2 border-t border-[#E5E9F0] dark:border-[#262E3E] flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#475569] dark:text-[#94A3B8]">
            <span>Malha final</span>
            <span className="font-semibold text-[#171A21] dark:text-[#F1F5F9]">
              {metrics.widthMm} × {metrics.heightMm} × {metrics.depthMm} mm
            </span>
          </div>
          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] leading-snug">
            Arraste os quadrados brancos ou pretos na peça para redimensionar.
          </p>
        </div>
      </div>
    </aside>
  );
}
