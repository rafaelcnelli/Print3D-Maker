import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Grid2x2 } from 'lucide-react';
import { BUILD_PLATE_PRESETS } from '../core/projectDefaults';
import type { BuildPlateSize } from '../types/project';

interface BuildPlateSelectorProps {
  buildPlate: BuildPlateSize;
  onChangeBuildPlate: (next: BuildPlateSize) => void;
}

const MIN_BED_MM = 100;
const MAX_BED_MM = 450;

function clampBedMm(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(MIN_BED_MM, Math.min(MAX_BED_MM, Math.round(value)));
}

export function BuildPlateSelector({
  buildPlate,
  onChangeBuildPlate,
}: BuildPlateSelectorProps) {
  const [open, setOpen] = useState(false);
  const [draftX, setDraftX] = useState(String(buildPlate.widthMm));
  const [draftY, setDraftY] = useState(String(buildPlate.depthMm));
  const [draftZ, setDraftZ] = useState(String(buildPlate.heightMm));
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraftX(String(buildPlate.widthMm));
    setDraftY(String(buildPlate.depthMm));
    setDraftZ(String(buildPlate.heightMm));
  }, [buildPlate.widthMm, buildPlate.depthMm, buildPlate.heightMm]);

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

  const commitCustomSize = (rawX = draftX, rawY = draftY, rawZ = draftZ) => {
    const widthMm = clampBedMm(Number(rawX), buildPlate.widthMm);
    const depthMm = clampBedMm(Number(rawY), buildPlate.depthMm);
    const heightMm = clampBedMm(Number(rawZ), buildPlate.heightMm);
    const matchedPreset = BUILD_PLATE_PRESETS.find(
      (p) =>
        p.widthMm === widthMm &&
        p.depthMm === depthMm &&
        p.heightMm === heightMm
    );
    onChangeBuildPlate(
      matchedPreset ?? {
        presetId: 'custom',
        label: `${widthMm} × ${depthMm} mm (Personalizada)`,
        widthMm,
        depthMm,
        heightMm,
      }
    );
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        data-testid="bed-size-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Tamanho da bandeja 3D: ${buildPlate.widthMm} por ${buildPlate.depthMm} por ${buildPlate.heightMm} milímetros`}
        title="Escolher tamanho da bandeja 3D"
        className="inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-lg border border-[#D5DCE6] dark:border-[#2C3649] bg-[#F7F9FC] dark:bg-[#1C2332] hover:bg-[#EDF1F7] dark:hover:bg-[#252F42] text-[#171A21] dark:text-[#E2E8F0] text-xs font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848]"
      >
        <Grid2x2 className="w-3.5 h-3.5 text-[#D93848] dark:text-[#E84C5C] shrink-0" aria-hidden="true" />
        <span className="hidden md:inline text-[#5A6375] dark:text-[#94A3B8]">Mesa</span>
        <span className="font-mono tabular-nums font-semibold">
          {buildPlate.widthMm}×{buildPlate.depthMm}
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
          aria-label="Configurar tamanho da bandeja 3D"
          data-testid="bed-size-popover"
          className="fixed inset-x-3 top-16 sm:inset-x-auto sm:top-auto sm:absolute sm:right-0 sm:mt-2 sm:w-80 rounded-xl border border-[#D5DCE6] dark:border-[#2B3548] bg-white dark:bg-[#161B26] shadow-[0_18px_44px_-12px_rgba(15,23,42,0.28)] dark:shadow-[0_20px_48px_-12px_rgba(0,0,0,0.65)] p-3.5 z-40"
        >
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#E5E9F0] dark:border-[#262E3E]">
            <div>
              <h3 className="text-xs font-bold text-[#171A21] dark:text-[#F8FAFC]">
                Tamanho da bandeja 3D
              </h3>
              <p className="text-[11px] text-[#5A6375] dark:text-[#94A3B8]">
                As peças respeitam automaticamente a área útil
              </p>
            </div>
          </div>

          {/* Printer Bed Presets */}
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            {BUILD_PLATE_PRESETS.map((preset) => {
              const isSelected =
                buildPlate.widthMm === preset.widthMm &&
                buildPlate.depthMm === preset.depthMm &&
                buildPlate.heightMm === preset.heightMm;
              const hintMatch = /\(([^)]+)\)/.exec(preset.label);
              const hint = hintMatch ? hintMatch[1] : `Z ${preset.heightMm} mm`;
              return (
                <button
                  key={preset.presetId}
                  type="button"
                  data-testid={`bed-preset-${preset.presetId}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    onChangeBuildPlate({ ...preset });
                    setOpen(false);
                  }}
                  className={`flex flex-col items-start px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[#D93848] dark:border-[#E84C5C] bg-[#FDF2F3] dark:bg-[#2B171D] text-[#171A21] dark:text-[#F8FAFC]'
                      : 'border-[#DCE2EC] dark:border-[#2A3346] bg-[#F8FAFC] dark:bg-[#111620] hover:bg-[#EFF3F8] dark:hover:bg-[#1D2535] text-[#171A21] dark:text-[#E2E8F0]'
                  }`}
                >
                  <span className="font-mono text-xs font-bold tabular-nums">
                    {preset.widthMm} × {preset.depthMm} mm
                  </span>
                  <span className="text-[10px] text-[#5A6375] dark:text-[#94A3B8] truncate w-full">
                    {hint}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom X / Y / Z inputs */}
          <div className="mt-3 pt-2.5 border-t border-[#E5E9F0] dark:border-[#262E3E]">
            <span className="text-[11px] font-semibold text-[#475569] dark:text-[#CBD5E1]">
              Medida personalizada (100–450 mm)
            </span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-[#5A6375] dark:text-[#94A3B8]">
                  X (Larg.)
                </span>
                <input
                  type="number"
                  data-testid="bed-custom-x"
                  min={MIN_BED_MM}
                  max={MAX_BED_MM}
                  value={draftX}
                  onChange={(e) => setDraftX(e.target.value)}
                  onBlur={() => commitCustomSize(draftX, draftY, draftZ)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCustomSize(draftX, draftY, draftZ);
                  }}
                  className="h-8 px-2 rounded-lg border border-[#D1D8E3] dark:border-[#323E54] bg-[#F7F9FC] dark:bg-[#0F141D] font-mono text-xs font-semibold tabular-nums text-[#171A21] dark:text-[#F1F5F9] focus:outline-none focus:border-[#D93848]"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-[#5A6375] dark:text-[#94A3B8]">
                  Y (Prof.)
                </span>
                <input
                  type="number"
                  data-testid="bed-custom-y"
                  min={MIN_BED_MM}
                  max={MAX_BED_MM}
                  value={draftY}
                  onChange={(e) => setDraftY(e.target.value)}
                  onBlur={() => commitCustomSize(draftX, draftY, draftZ)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCustomSize(draftX, draftY, draftZ);
                  }}
                  className="h-8 px-2 rounded-lg border border-[#D1D8E3] dark:border-[#323E54] bg-[#F7F9FC] dark:bg-[#0F141D] font-mono text-xs font-semibold tabular-nums text-[#171A21] dark:text-[#F1F5F9] focus:outline-none focus:border-[#D93848]"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-[#5A6375] dark:text-[#94A3B8]">
                  Z (Alt.)
                </span>
                <input
                  type="number"
                  data-testid="bed-custom-z"
                  min={MIN_BED_MM}
                  max={MAX_BED_MM}
                  value={draftZ}
                  onChange={(e) => setDraftZ(e.target.value)}
                  onBlur={() => commitCustomSize(draftX, draftY, draftZ)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCustomSize(draftX, draftY, draftZ);
                  }}
                  className="h-8 px-2 rounded-lg border border-[#D1D8E3] dark:border-[#323E54] bg-[#F7F9FC] dark:bg-[#0F141D] font-mono text-xs font-semibold tabular-nums text-[#171A21] dark:text-[#F1F5F9] focus:outline-none focus:border-[#D93848]"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
