import { useEffect, useMemo, useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import {
  computeAutoThreshold,
  shapesToSvgPreview,
  vectorizeImagePixels,
} from '../core/contourTracer';
import type { ImageTraceMode } from '../types/project';

export interface ImageVectorizeDraft {
  fileName: string;
  pixels: {
    width: number;
    height: number;
    rgba: Uint8ClampedArray;
  };
  previewUrl: string;
  initialOptions: {
    threshold: number;
    invert: boolean;
    traceMode: ImageTraceMode;
    smoothness: number;
    despeckle: number;
  };
}

export interface ApprovedVectorizeResult {
  fileName: string;
  pixels: {
    width: number;
    height: number;
    rgba: Uint8ClampedArray;
  };
  options: {
    threshold: number;
    invert: boolean;
    traceMode: ImageTraceMode;
    smoothness: number;
    despeckle: number;
  };
}

interface ImageVectorizeModalProps {
  draft: ImageVectorizeDraft;
  borderMm: number;
  primaryColor: string;
  accentColor: string;
  onCancel: () => void;
  onApprove: (result: ApprovedVectorizeResult) => void;
}

const SMOOTHNESS_LABELS = ['Nítido', 'Leve', 'Suave', 'Extra'];
const DESPECKLE_LABELS = ['Desligado', 'Leve', 'Médio', 'Forte', 'Máximo'];

export function ImageVectorizeModal({
  draft,
  borderMm,
  primaryColor,
  accentColor,
  onCancel,
  onApprove,
}: ImageVectorizeModalProps) {
  const [traceMode, setTraceMode] = useState<ImageTraceMode>(
    draft.initialOptions.traceMode
  );
  const [threshold, setThreshold] = useState<number>(draft.initialOptions.threshold);
  const [invert, setInvert] = useState<boolean>(draft.initialOptions.invert);
  const [smoothness, setSmoothness] = useState<number>(draft.initialOptions.smoothness);
  const [despeckle, setDespeckle] = useState<number>(draft.initialOptions.despeckle);
  const [showBorderPreview, setShowBorderPreview] = useState<boolean>(true);

  // Close cleanly on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const vectorResult = useMemo(() => {
    return vectorizeImagePixels(
      draft.pixels.rgba,
      draft.pixels.width,
      draft.pixels.height,
      58,
      58,
      {
        threshold,
        invert,
        traceMode,
        smoothness,
        despeckle,
      }
    );
  }, [draft.pixels, threshold, invert, traceMode, smoothness, despeckle]);

  const svgPreview = useMemo(() => {
    return shapesToSvgPreview(
      vectorResult.shapes,
      vectorResult.width,
      vectorResult.height,
      showBorderPreview ? Math.min(borderMm, 5.5) : 0
    );
  }, [vectorResult, showBorderPreview, borderMm]);

  const handleAutoThreshold = () => {
    const auto = computeAutoThreshold(
      draft.pixels.rgba,
      draft.pixels.width,
      draft.pixels.height,
      traceMode
    );
    setThreshold(auto.threshold);
  };

  const handleModeChange = (nextMode: ImageTraceMode) => {
    setTraceMode(nextMode);
    const auto = computeAutoThreshold(
      draft.pixels.rgba,
      draft.pixels.width,
      draft.pixels.height,
      nextMode
    );
    setThreshold(auto.threshold);
  };

  const hasValidShapes = vectorResult.shapeCount > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0F17]/72 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vectorize-modal-title"
      data-testid="vectorize-preview-modal"
    >
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-[#D5DCE6] dark:border-[#2B3548] bg-white dark:bg-[#151B26] shadow-[0_24px_64px_-16px_rgba(15,23,42,0.45)] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#E5E9F0] dark:border-[#262E3E] flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2
              id="vectorize-modal-title"
              className="font-display text-base sm:text-lg font-bold text-[#171A21] dark:text-[#F8FAFC] truncate"
            >
              Pré-visualização da vetorização
            </h2>
            <p className="text-xs text-[#5A6375] dark:text-[#94A3B8] truncate">
              {draft.fileName} · {draft.pixels.width} × {draft.pixels.height} px · Ajuste os contornos antes de gerar o chaveiro 3D
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fechar pré-visualização"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#5A6375] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F8FAFC] hover:bg-[#EFF2F7] dark:hover:bg-[#222B3B] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Side-by-side Preview & Controls */}
        <div className="p-4 sm:p-5 overflow-y-auto flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Original Raster Image */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#374151] dark:text-[#CBD5E1]">
                  Imagem original
                </span>
                <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8]">
                  {draft.pixels.width}×{draft.pixels.height} px
                </span>
              </div>
              <div
                className="relative h-56 sm:h-64 rounded-xl border border-[#DCE2EC] dark:border-[#2B3548] flex items-center justify-center p-4 overflow-hidden"
                style={{
                  backgroundImage:
                    'repeating-conic-gradient(rgba(148,163,184,0.18) 0% 25%, transparent 0% 50%)',
                  backgroundSize: '16px 16px',
                }}
              >
                <img
                  src={draft.previewUrl}
                  alt="Imagem importada original"
                  className="max-w-full max-h-full object-contain rounded"
                />
              </div>
            </div>

            {/* Live Vectorized SVG Output */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#374151] dark:text-[#CBD5E1]">
                  Vetor 3D gerado (prévia real)
                </span>
                <span
                  data-testid="vectorize-stats"
                  className="text-[11px] font-mono tabular-nums text-[#475569] dark:text-[#94A3B8]"
                >
                  {vectorResult.shapeCount} forma(s) · {vectorResult.holeCount} furo(s)
                </span>
              </div>
              <div className="relative h-56 sm:h-64 rounded-xl border border-[#DCE2EC] dark:border-[#2B3548] bg-[#F5F7FA] dark:bg-[#0E131C] flex items-center justify-center p-4 overflow-hidden">
                {hasValidShapes ? (
                  <svg
                    data-testid="vectorize-svg-preview"
                    viewBox={svgPreview.viewBox}
                    className="w-full h-full max-w-full max-h-full"
                    aria-label="Prévia do contorno vetorizado"
                  >
                    {showBorderPreview && svgPreview.borderPathData && (
                      <path
                        d={svgPreview.borderPathData}
                        fill={
                          accentColor.toLowerCase() === '#ffffff' ||
                          accentColor.toLowerCase() === '#f8fafc' ||
                          accentColor.toLowerCase() === '#f4efe6'
                            ? '#CBD5E1'
                            : accentColor
                        }
                        fillOpacity={0.42}
                        stroke="#64748B"
                        strokeOpacity={0.85}
                        strokeWidth={0.55}
                        strokeDasharray="1.6 1.0"
                        strokeLinejoin="round"
                      />
                    )}
                    <path
                      d={svgPreview.pathData}
                      fill={primaryColor}
                      fillRule="evenodd"
                      stroke="#0F172A"
                      strokeOpacity={0.35}
                      strokeWidth={0.3}
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <div className="max-w-xs text-center px-3">
                    <p className="text-xs font-semibold text-[#B91C1C] dark:text-[#F87171]">
                      Nenhuma forma detectada com estes parâmetros
                    </p>
                    <p className="mt-1 text-[11px] text-[#5A6375] dark:text-[#94A3B8]">
                      Ajuste o contraste, clique em Auto ou marque Inverter para destacar o desenho.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Vectorization Quality Controls */}
          <div className="rounded-xl border border-[#E5E9F0] dark:border-[#262E3E] bg-[#FAFBFD] dark:bg-[#111620] p-3.5 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Trace Mode */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-[#475569] dark:text-[#CBD5E1]">
                Detecção ({vectorResult.detectedMode === 'alpha' ? 'Alpha' : 'Luminosidade'})
              </span>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#EFF2F7] dark:bg-[#0B0F17]">
                {(
                  [
                    { id: 'auto', label: 'Auto' },
                    { id: 'luminance', label: 'Luz' },
                    { id: 'alpha', label: 'Alpha' },
                  ] as { id: ImageTraceMode; label: string }[]
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    data-testid={`trace-mode-${m.id}`}
                    onClick={() => handleModeChange(m.id)}
                    aria-pressed={traceMode === m.id}
                    className={`flex-1 h-7 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      traceMode === m.id
                        ? 'bg-white dark:bg-[#232B3B] text-[#171A21] dark:text-[#F8FAFC] shadow-xs'
                        : 'text-[#525C6E] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F1F5F9]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Threshold + Auto Otsu */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <label
                  htmlFor="modal-threshold"
                  className="font-semibold text-[#475569] dark:text-[#CBD5E1]"
                >
                  Limiar / Contraste
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono tabular-nums font-semibold text-[#171A21] dark:text-[#F1F5F9]">
                    {threshold}
                  </span>
                  <button
                    type="button"
                    data-testid="vectorize-auto-btn"
                    onClick={handleAutoThreshold}
                    className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-[#EFF2F7] dark:bg-[#222B3B] hover:bg-[#E2E8F0] dark:hover:bg-[#2D384D] text-[10px] font-semibold text-[#334155] dark:text-[#E2E8F0] transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-2.5 h-2.5" aria-hidden="true" />
                    Auto
                  </button>
                </div>
              </div>
              <input
                id="modal-threshold"
                type="range"
                min={15}
                max={240}
                step={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="studio-slider w-full mt-1"
              />
            </div>

            {/* Curve Smoothness */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <label
                  htmlFor="modal-smoothness"
                  className="font-semibold text-[#475569] dark:text-[#CBD5E1]"
                >
                  Suavização
                </label>
                <span className="font-mono font-semibold text-[#171A21] dark:text-[#F1F5F9]">
                  {SMOOTHNESS_LABELS[smoothness] ?? 'Suave'}
                </span>
              </div>
              <input
                id="modal-smoothness"
                type="range"
                min={0}
                max={3}
                step={1}
                value={smoothness}
                onChange={(e) => setSmoothness(Number(e.target.value))}
                className="studio-slider w-full mt-1"
              />
            </div>

            {/* Despeckle / Noise Removal */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <label
                  htmlFor="modal-despeckle"
                  className="font-semibold text-[#475569] dark:text-[#CBD5E1]"
                >
                  Limpeza de ruído
                </label>
                <span className="font-mono font-semibold text-[#171A21] dark:text-[#F1F5F9]">
                  {DESPECKLE_LABELS[despeckle] ?? 'Leve'}
                </span>
              </div>
              <input
                id="modal-despeckle"
                type="range"
                min={0}
                max={4}
                step={1}
                value={despeckle}
                onChange={(e) => setDespeckle(Number(e.target.value))}
                className="studio-slider w-full mt-1"
              />
            </div>
          </div>

          {/* Quick Checkboxes */}
          <div className="flex flex-wrap items-center gap-5 px-1">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#2A313D] dark:text-[#CBD5E1] cursor-pointer">
              <input
                type="checkbox"
                data-testid="vectorize-invert-toggle"
                checked={invert}
                onChange={(e) => setInvert(e.target.checked)}
                className="w-4 h-4 accent-[#D93848] rounded cursor-pointer"
              />
              <span>Inverter cores (fundo escuro / desenho claro)</span>
            </label>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#2A313D] dark:text-[#CBD5E1] cursor-pointer">
              <input
                type="checkbox"
                checked={showBorderPreview}
                onChange={(e) => setShowBorderPreview(e.target.checked)}
                className="w-4 h-4 accent-[#D93848] rounded cursor-pointer"
              />
              <span>Mostrar contorno da base do chaveiro ({borderMm.toFixed(1)} mm)</span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-[#E5E9F0] dark:border-[#262E3E] bg-[#FAFBFD] dark:bg-[#111620] flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="cancel-vectorize-btn"
            onClick={onCancel}
            className="h-9 px-4 rounded-lg border border-[#CBD2DC] dark:border-[#323E54] bg-white dark:bg-[#1C2332] hover:bg-[#F3F5F9] dark:hover:bg-[#252F42] text-[#374151] dark:text-[#E2E8F0] text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="approve-vectorize-btn"
            disabled={!hasValidShapes}
            onClick={() =>
              onApprove({
                fileName: draft.fileName,
                pixels: draft.pixels,
                options: {
                  threshold,
                  invert,
                  traceMode,
                  smoothness,
                  despeckle,
                },
              })
            }
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#D93848] hover:bg-[#BE2B3A] active:bg-[#A62331] disabled:bg-[#CBD2DC] dark:disabled:bg-[#2A3344] disabled:text-[#667085] dark:disabled:text-[#64748B] disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
          >
            <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Aprovar e gerar chaveiro 3D</span>
          </button>
        </div>
      </div>
    </div>
  );
}
