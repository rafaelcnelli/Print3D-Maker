import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileCode2,
  ImageUp,
  Layers,
  Lock,
  LockOpen,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react';
import {
  computeAutoThreshold,
  KEYCHAIN_SVG_PRESETS,
} from '../core/contourTracer';
import type { DimensionAxis, DimensionBounds } from '../core/dimensionMath';
import {
  FILAMENT_COLORS,
  FILAMENT_FINISHES,
  FONT_STYLES,
  getKeychainArchMaxDiameterMm,
  HEART_KEYRING_HOLE_RANGE,
  KEYCHAIN_KEYRING_HOLE_RANGE,
  KEYRING_DIRECTIONS,
  TEMPLATES,
} from '../core/projectDefaults';
import { formatPrintDuration } from '../core/stlExporter';
import type {
  BoxLetterLayout,
  BuildPlateSize,
  CameraPresetId,
  HeartStructureMode,
  KeychainShape,
  KeyringDirection,
  PrintMetrics,
  ProjectConfig,
  SignBaseStyle,
  SvgAttachMode,
} from '../types/project';
import type { ImageVectorizeDraft } from './ImageVectorizeModal';

type DockTab = 'shape' | 'dimensions' | 'filament';

const CARDINAL_GRID_CELLS: (KeyringDirection | null)[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  null,
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

function HoleDiameterControl({
  sliderId,
  inputId,
  sliderTestId,
  inputTestId,
  valueTestId,
  valueMm,
  minMm,
  maxMm,
  step = 0.1,
  hint,
  onChange,
}: {
  sliderId: string;
  inputId: string;
  sliderTestId: string;
  inputTestId: string;
  valueTestId: string;
  valueMm: number;
  minMm: number;
  maxMm: number;
  step?: number;
  hint?: string;
  onChange: (nextMm: number) => void;
}) {
  const clampedMm = Number(
    Math.min(maxMm, Math.max(minMm, valueMm)).toFixed(1)
  );
  const [draft, setDraft] = useState(clampedMm.toFixed(1));

  useEffect(() => {
    setDraft(clampedMm.toFixed(1));
  }, [clampedMm]);

  const commitDraft = () => {
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      const next = Number(
        Math.min(maxMm, Math.max(minMm, parsed)).toFixed(1)
      );
      onChange(next);
      setDraft(next.toFixed(1));
    } else {
      setDraft(clampedMm.toFixed(1));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <label
          htmlFor={inputId}
          className="font-medium text-[#5A6375] dark:text-[#94A3B8] truncate"
        >
          Diâmetro do furo (Ø)
          {hint && (
            <span className="ml-1 text-[10px] font-normal text-[#8A94A6] dark:text-[#64748B]">
              ({hint})
            </span>
          )}
        </label>

        <div className="flex items-center gap-1 shrink-0">
          <input
            id={inputId}
            data-testid={inputTestId}
            type="number"
            inputMode="decimal"
            min={minMm}
            max={maxMm}
            step={step}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const parsed = Number(e.target.value.replace(',', '.'));
              if (
                Number.isFinite(parsed) &&
                parsed >= minMm &&
                parsed <= maxMm
              ) {
                onChange(Number(parsed.toFixed(1)));
              }
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitDraft();
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="Diâmetro do furo em milímetros"
            className="w-16 h-8 sm:h-7 px-1.5 rounded-md border border-[#CBD5E1] dark:border-[#323E54] bg-white dark:bg-[#0F141D] text-right font-mono text-xs font-semibold tabular-nums text-[#171A21] dark:text-[#F1F5F9] focus:outline-none focus:border-[#D93848]"
          />
          <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8]">
            mm
          </span>
          <span data-testid={valueTestId} className="sr-only">
            {clampedMm.toFixed(1)} mm
          </span>
        </div>
      </div>

      <input
        id={sliderId}
        data-testid={sliderTestId}
        type="range"
        min={minMm}
        max={maxMm}
        step={step}
        value={clampedMm}
        onChange={(e) => onChange(Number(Number(e.target.value).toFixed(1)))}
        aria-label="Controle deslizante de diâmetro do furo em milímetros"
        className="studio-slider w-full"
      />
    </div>
  );
}

function KeyringAttachmentAndCardinalControl({
  enabled,
  attachMode,
  direction,
  holeMm,
  minHoleMm,
  maxHoleMm,
  holeHint,
  onToggleEnabled,
  onSelectMode,
  onSelectDirection,
  onChangeHoleMm,
}: {
  enabled: boolean;
  attachMode: SvgAttachMode;
  direction: KeyringDirection;
  holeMm: number;
  minHoleMm: number;
  maxHoleMm: number;
  holeHint?: string;
  onToggleEnabled: (enabled: boolean) => void;
  onSelectMode: (mode: SvgAttachMode) => void;
  onSelectDirection: (dir: KeyringDirection) => void;
  onChangeHoleMm: (holeMm: number) => void;
}) {
  const activeDirMeta =
    KEYRING_DIRECTIONS.find((d) => d.id === direction) ?? KEYRING_DIRECTIONS[1];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs font-medium text-[#2A313D] dark:text-[#CBD5E1] cursor-pointer">
          <input
            type="checkbox"
            data-testid="toggle-keyring-enabled"
            checked={enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            className="w-4 h-4 accent-[#D93848] rounded cursor-pointer"
          />
          <span>Furo para argola</span>
        </label>
        {enabled ? (
          <span
            data-testid="active-keyring-direction-label"
            className="text-[11px] font-semibold text-[#D93848] dark:text-[#F46472] truncate"
          >
            {activeDirMeta.label}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-[#8A94A6] dark:text-[#64748B]">
            Sem furo
          </span>
        )}
      </div>

      {enabled && (
        <>
          <div className="flex items-center gap-2.5">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-[11px] font-medium text-[#5A6375] dark:text-[#94A3B8]">
                Tipo de encaixe
              </span>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#EFF2F7] dark:bg-[#0E121A]">
                {(
                  [
                    { id: 'arch', label: 'Arco neg.' },
                    { id: 'hole', label: 'Furo red.' },
                    { id: 'loop', label: 'Argola' },
                  ] as { id: SvgAttachMode; label: string }[]
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    data-testid={`svg-attach-${mode.id}`}
                    onClick={() => onSelectMode(mode.id)}
                    aria-pressed={attachMode === mode.id}
                    className={`flex-1 h-9 sm:h-7 px-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      attachMode === mode.id
                        ? 'bg-white dark:bg-[#232B3B] text-[#171A21] dark:text-[#F8FAFC] shadow-xs'
                        : 'text-[#525C6E] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F1F5F9]'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3x3 Square with the 8 Cardinal Directions */}
            <div
              data-testid="keyring-cardinal-pad"
              role="group"
              aria-label="Escolher direção do encaixe da argola (8 cardeais)"
              className="grid grid-cols-3 gap-1 sm:gap-0.5 p-1.5 sm:p-1 rounded-xl bg-[#EFF2F7] dark:bg-[#0E121A] border border-[#D1D8E3]/80 dark:border-[#252F42] shrink-0"
            >
              {CARDINAL_GRID_CELLS.map((cellDir, idx) => {
                if (!cellDir) {
                  return (
                    <div
                      key={`center-${idx}`}
                      className="w-8 h-8 sm:w-5 sm:h-5 flex items-center justify-center"
                      aria-hidden="true"
                    >
                      <span className="w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full bg-[#8A94A6]/60 dark:bg-[#64748B]/70 ring-2 ring-[#D93848]/25" />
                    </div>
                  );
                }
                const meta = KEYRING_DIRECTIONS.find((d) => d.id === cellDir)!;
                const active = direction === cellDir;
                return (
                  <button
                    key={cellDir}
                    type="button"
                    data-testid={`keyring-dir-${cellDir}`}
                    title={`Posição: ${meta.label}`}
                    aria-label={`Posição ${meta.label}`}
                    aria-pressed={active}
                    onClick={() => onSelectDirection(cellDir)}
                    className={`w-8 h-8 sm:w-5 sm:h-5 rounded-lg sm:rounded-md flex items-center justify-center text-sm sm:text-[11px] font-bold leading-none transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848] ${
                      active
                        ? 'bg-[#D93848] text-white shadow-xs scale-105'
                        : 'bg-white/80 dark:bg-[#192130] text-[#4E5869] dark:text-[#94A3B8] hover:bg-white dark:hover:bg-[#253046] hover:text-[#171A21] dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    {meta.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <HoleDiameterControl
            sliderId="slider-keychain-hole-size"
            inputId="input-keychain-hole-diameter"
            sliderTestId="keychain-hole-size-slider"
            inputTestId="keychain-hole-diameter-input"
            valueTestId="keychain-hole-size-value"
            valueMm={holeMm}
            minMm={minHoleMm}
            maxMm={maxHoleMm}
            step={0.1}
            hint={holeHint}
            onChange={onChangeHoleMm}
          />
        </>
      )}
    </div>
  );
}

interface ControlDockProps {
  config: ProjectConfig;
  bounds: DimensionBounds;
  buildPlate: BuildPlateSize;
  textError: string | null;
  cameraPreset: CameraPresetId;
  metrics: PrintMetrics;
  collapsed: boolean;
  lockProportions: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleCollapse: () => void;
  onToggleLockProportions: () => void;
  onUpdateConfig: (patch: Partial<ProjectConfig>) => void;
  onOpenVectorizeDraft: (draft: ImageVectorizeDraft) => void;
  onReopenVectorizeModal: () => void;
  onChangeDimensionAxis: (axis: DimensionAxis, value: number) => void;
  onSelectCamera: (preset: CameraPresetId) => void;
  onResetDefaults: () => void;
  onDownload3MF: () => void;
  onDownloadSTL: () => void;
  onDownloadOBJ: () => void;
  canExport: boolean;
}

export function ControlDock({
  config,
  bounds,
  buildPlate,
  textError,
  cameraPreset,
  metrics,
  collapsed,
  lockProportions,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onToggleCollapse,
  onToggleLockProportions,
  onUpdateConfig,
  onOpenVectorizeDraft,
  onReopenVectorizeModal,
  onChangeDimensionAxis,
  onSelectCamera,
  onResetDefaults,
  onDownload3MF,
  onDownloadSTL,
  onDownloadOBJ,
  canExport,
}: ControlDockProps) {
  const [activeTab, setActiveTab] = useState<DockTab>('shape');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const meta = TEMPLATES[config.template];

  const isFlatTemplate =
    config.template === 'keychain' ||
    config.template === 'plaque' ||
    config.template === 'svg-keychain' ||
    (config.template === 'box-letter' && config.boxLetterLayout === 'separated');

  const handleSvgOrImageFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);

    const isSvg =
      file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');

    if (isSvg) {
      try {
        const text = await file.text();
        if (!text.includes('<svg')) {
          setUploadError('Arquivo SVG inválido. Escolha um vetor SVG com formas.');
          return;
        }
        onUpdateConfig({
          svgSourceType: 'svg',
          svgRawContent: text,
          svgFileName: file.name,
        });
      } catch {
        setUploadError('Não foi possível ler o arquivo SVG.');
      }
      return;
    }

    // Raster image (PNG/JPG/WebP) -> high-res 384px capture + open pre-approval vectorization modal
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Falha ao carregar imagem'));
        image.src = objectUrl;
      });
      const maxDim = 384;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
      const w = Math.max(16, Math.round(img.width * scale));
      const h = Math.max(16, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setUploadError('Não foi possível processar a imagem neste navegador.');
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const rgba = new Uint8ClampedArray(imgData.data);
      const auto = computeAutoThreshold(rgba, w, h, 'auto');
      const previewUrl = canvas.toDataURL('image/png');

      onOpenVectorizeDraft({
        fileName: file.name,
        pixels: {
          width: w,
          height: h,
          rgba,
        },
        previewUrl,
        initialOptions: {
          threshold: auto.threshold,
          invert: false,
          traceMode: 'auto',
          smoothness: 2,
          despeckle: 1,
        },
      });
    } catch {
      setUploadError('Formato de imagem não suportado. Use SVG, PNG ou JPG.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const cameraButtons: { id: CameraPresetId; label: string }[] = [
    { id: 'iso', label: '3D' },
    { id: 'front', label: meta.frontHint },
    { id: 'top', label: meta.topHint },
    { id: 'side', label: 'Lateral' },
  ];

  const activePresetLabel =
    KEYCHAIN_SVG_PRESETS.find((p) => p.id === config.svgPresetId)?.label ?? 'Patinha';

  return (
    <section
      aria-label="Controles de personalização do projeto 3D"
      className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(960px,95vw)] pointer-events-none flex flex-col items-center"
    >
      {/* Attached Undo / Collapse / Redo Handle Bar */}
      <div className="pointer-events-auto inline-flex items-stretch rounded-t-xl sm:rounded-t-lg border border-b-0 border-[#D5DCE6] dark:border-[#273043] bg-[#FFFFFF]/96 dark:bg-[#161B26]/96 shadow-[0_-4px_14px_rgba(15,23,42,0.05)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.35)] overflow-hidden transition-colors">
        <button
          type="button"
          data-testid="undo-btn"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Desfazer última ação (Ctrl+Z)"
          title="Desfazer (Ctrl+Z)"
          className="inline-flex items-center justify-center w-11 h-10 sm:w-8 sm:h-8 border-r border-[#E2E8F0] dark:border-[#273043] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#1F2738] hover:text-[#171A21] dark:hover:text-[#F8FAFC] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D93848]"
        >
          <Undo2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-controls="studio-dock-panel"
          className="inline-flex items-center gap-1.5 h-10 sm:h-8 px-4 sm:px-3.5 text-sm sm:text-xs font-semibold sm:font-medium text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#1F2738] hover:text-[#171A21] dark:hover:text-[#F8FAFC] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D93848]"
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
              <span>Personalizar projeto</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
              <span>Ocultar controles</span>
            </>
          )}
        </button>

        <button
          type="button"
          data-testid="redo-btn"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Refazer ação (Ctrl+Y)"
          title="Refazer (Ctrl+Y)"
          className="inline-flex items-center justify-center w-11 h-10 sm:w-8 sm:h-8 border-l border-[#E2E8F0] dark:border-[#273043] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#1F2738] hover:text-[#171A21] dark:hover:text-[#F8FAFC] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D93848]"
        >
          <Redo2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Main Dock Panel (solid rgba surface, NO backdrop-filter over WebGL) */}
      {!collapsed && (
        <div
          id="studio-dock-panel"
          className="pointer-events-auto w-full rounded-xl border border-[#D5DCE6] dark:border-[#273043] bg-[#FFFFFF]/96 dark:bg-[#161B26]/96 shadow-[0_14px_38px_-12px_rgba(15,23,42,0.18)] dark:shadow-[0_18px_42px_-12px_rgba(0,0,0,0.6)] overflow-hidden transition-colors"
        >
          {/* Row 1: Primary Name Input (or SVG/Image Import) + Quick Camera Angles + Print Specs */}
          <div className="px-4 py-3 border-b border-[#E5E9F0] dark:border-[#262E3E] flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-5">
            {config.template === 'svg-keychain' ? (
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  data-testid="upload-svg-image-input"
                  accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp"
                  onChange={handleSvgOrImageFileChange}
                  className="sr-only"
                />
                <button
                  type="button"
                  data-testid="upload-svg-image-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 h-10 sm:h-9 px-3.5 rounded-lg bg-[#171A21] hover:bg-[#2B303C] dark:bg-[#263042] dark:hover:bg-[#334155] text-white text-xs sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848]"
                >
                  <ImageUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Importar SVG / Imagem</span>
                </button>
                <span className="text-xs font-medium text-[#475162] dark:text-[#94A3B8] truncate">
                  {config.svgSourceType === 'preset'
                    ? `Modelo: ${activePresetLabel}`
                    : `Arquivo: ${config.svgFileName || 'Personalizado'}`}
                </span>
                {config.svgSourceType === 'image' && config.imagePixels && (
                  <button
                    type="button"
                    data-testid="edit-vectorize-btn"
                    onClick={onReopenVectorizeModal}
                    className="inline-flex items-center gap-1.5 h-9 sm:h-8 px-3 sm:px-2.5 rounded-lg border border-[#D1D8E3] dark:border-[#323E54] bg-[#F7F9FC] dark:bg-[#1E2534] hover:bg-[#EDF1F7] dark:hover:bg-[#273145] text-[#171A21] dark:text-[#E2E8F0] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Editar vetor</span>
                  </button>
                )}
                {uploadError && (
                  <p role="alert" className="text-xs font-medium text-[#B91C1C] dark:text-[#F87171] truncate">
                    {uploadError}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <label
                  htmlFor="project-name-input"
                  className="text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] whitespace-nowrap shrink-0"
                >
                  Nome
                </label>
                <div className="relative flex-1 min-w-0 max-w-xs">
                  <input
                    id="project-name-input"
                    type="text"
                    value={config.text}
                    onChange={(e) => onUpdateConfig({ text: e.target.value })}
                    maxLength={18}
                    placeholder={config.template === 'monogram' ? 'Ex: Gabriel' : 'Ex: MARIA'}
                    aria-invalid={Boolean(textError)}
                    aria-describedby={textError ? 'project-name-error' : undefined}
                    className={`w-full h-9 px-3 rounded-lg border text-sm font-semibold tracking-wide bg-[#F7F9FC] dark:bg-[#0F141D] text-[#171A21] dark:text-[#F1F5F9] placeholder:text-[#8A94A6] dark:placeholder:text-[#64748B] placeholder:normal-case focus:outline-none focus:bg-white dark:focus:bg-[#161D2A] transition-colors ${
                      config.template === 'monogram' ? '' : 'uppercase'
                    } ${
                      textError
                        ? 'border-[#DC2626] dark:border-[#EF4444] focus:ring-2 focus:ring-[#DC2626]/25'
                        : 'border-[#D1D8E3] dark:border-[#323E54] focus:border-[#171A21] dark:focus:border-[#64748B] focus:ring-2 focus:ring-[#171A21]/10 dark:focus:ring-[#94A3B8]/20'
                    }`}
                  />
                </div>
                {textError && (
                  <p
                    id="project-name-error"
                    role="alert"
                    className="text-xs font-medium text-[#B91C1C] dark:text-[#F87171] truncate"
                  >
                    {textError}
                  </p>
                )}
              </div>
            )}

            {/* Camera Angle Presets (instant front/top verification for Heart+Name!) */}
            <div
              role="group"
              aria-label="Ângulos de visualização"
              className="flex items-center gap-1 p-1 rounded-lg bg-[#EFF2F7] dark:bg-[#0E121A] overflow-x-auto no-scrollbar shrink-0"
            >
              {cameraButtons.map((btn) => {
                const active = cameraPreset === btn.id;
                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => onSelectCamera(btn.id)}
                    aria-pressed={active}
                    className={`flex-1 sm:flex-none h-9 sm:h-7 px-2 sm:px-2.5 rounded-md text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848] ${
                      active
                        ? 'bg-white dark:bg-[#232B3B] text-[#171A21] dark:text-[#F8FAFC] shadow-xs'
                        : 'text-[#525C6E] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F1F5F9]'
                    }`}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>

            {/* Clean unboxed tabular print specs */}
            <div
              aria-label="Medidas estimadas da peça"
              className="hidden xl:flex items-center gap-2 text-xs font-mono tabular-nums text-[#4D5666] dark:text-[#94A3B8] whitespace-nowrap shrink-0"
            >
              <span>
                {metrics.widthMm} × {metrics.heightMm} × {metrics.depthMm} mm
              </span>
              <span aria-hidden="true">·</span>
              <span>~{metrics.filamentGrams} g</span>
              <span aria-hidden="true">·</span>
              <span>{formatPrintDuration(metrics.estimatedMinutes)}</span>
            </div>
          </div>

          {/* Row 2: Tab Strip + Active Parameter Controls */}
          <div className="px-4 py-2.5 bg-[#FAFBFD] dark:bg-[#111620] flex flex-col gap-3 transition-colors">
            <div className="flex items-center justify-between gap-4 border-b border-[#E7EBF2] dark:border-[#262E3E] pb-2">
              <div role="tablist" aria-label="Categorias de ajustes" className="flex items-center gap-3 sm:gap-4 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'shape', label: 'Texto e forma' },
                    { id: 'dimensions', label: 'Dimensões' },
                    { id: 'filament', label: 'Filamento e exportação' },
                  ] as { id: DockTab; label: string }[]
                ).map((tab) => {
                  const selected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveTab(tab.id)}
                      className={`text-xs sm:text-xs font-semibold py-2 sm:py-0 sm:pb-1 -mb-[9px] border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848] ${
                        selected
                          ? 'text-[#171A21] dark:text-[#F8FAFC] border-[#D93848] dark:border-[#E84C5C]'
                          : 'text-[#616B7D] dark:text-[#94A3B8] border-transparent hover:text-[#171A21] dark:hover:text-[#F1F5F9]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="hidden sm:flex items-center gap-3 text-xs text-[#5A6375] dark:text-[#94A3B8] min-w-0">
                <span className="hidden md:inline truncate">{meta.summary}</span>
                <span className="xl:hidden font-mono tabular-nums whitespace-nowrap">
                  {metrics.widthMm}×{metrics.heightMm}×{metrics.depthMm} mm · ~{metrics.filamentGrams} g
                </span>
              </div>
            </div>

            {/* Tab 1: Text & Shape */}
            {activeTab === 'shape' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-center">
                {/* Font Style (all text templates except svg-keychain) */}
                {config.template !== 'svg-keychain' && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[#5A6375] dark:text-[#94A3B8]">Tipografia 3D</span>
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#EFF2F7] dark:bg-[#0E121A]">
                      {FONT_STYLES.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => onUpdateConfig({ fontStyle: f.id })}
                          aria-pressed={config.fontStyle === f.id}
                          className={`flex-1 h-9 sm:h-7 px-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            config.fontStyle === f.id
                              ? 'bg-white dark:bg-[#232B3B] text-[#171A21] dark:text-[#F8FAFC] shadow-xs'
                              : 'text-[#525C6E] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F1F5F9]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Monogram (Inicial + Nome cursivo) Controls */}
                {config.template === 'monogram' && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1 w-20 shrink-0">
                        <label
                          htmlFor="monogram-initial-input"
                          className="text-[11px] font-medium text-[#5A6375] dark:text-[#94A3B8]"
                        >
                          Inicial
                        </label>
                        <input
                          id="monogram-initial-input"
                          type="text"
                          maxLength={1}
                          value={config.monogramInitial}
                          onChange={(e) =>
                            onUpdateConfig({ monogramInitial: e.target.value.slice(0, 1) })
                          }
                          placeholder={(config.text.trim()[0] || 'G').toUpperCase()}
                          className="h-8 px-2.5 rounded-lg border border-[#D1D8E3] dark:border-[#323E54] bg-white dark:bg-[#0F141D] text-center text-sm font-bold uppercase text-[#171A21] dark:text-[#F1F5F9] placeholder:text-[#8A94A6] dark:placeholder:text-[#64748B] focus:outline-none focus:border-[#171A21] dark:focus:border-[#64748B]"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between text-[11px]">
                          <label htmlFor="slider-monogram-pos" className="font-medium text-[#5A6375] dark:text-[#94A3B8]">
                            Altura do nome
                          </label>
                          <span className="font-mono tabular-nums font-semibold text-[#171A21] dark:text-[#F1F5F9]">
                            {config.monogramNamePos}%
                          </span>
                        </div>
                        <input
                          id="slider-monogram-pos"
                          type="range"
                          min={20}
                          max={62}
                          step={1}
                          value={config.monogramNamePos}
                          onChange={(e) =>
                            onUpdateConfig({ monogramNamePos: Number(e.target.value) })
                          }
                          className="studio-slider w-full"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-3 sm:pt-4">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-[#2A313D] dark:text-[#CBD5E1] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.useDualColor}
                          onChange={(e) =>
                            onUpdateConfig({ useDualColor: e.target.checked })
                          }
                          className="w-4 h-4 accent-[#D93848] rounded cursor-pointer"
                        />
                        <span>Duas cores</span>
                      </label>
                    </div>
                  </>
                )}

                {/* Box Letter (Letra Caixa 2 peças) Controls */}
                {config.template === 'box-letter' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-[#5A6375] dark:text-[#94A3B8]">
                        Disposição das peças
                      </span>
                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#EFF2F7] dark:bg-[#0E121A]">
                        {(
                          [
                            { id: 'assembled', label: 'Montado (Em pé)' },
                            { id: 'separated', label: 'Separado (Impressão)' },
                          ] as { id: BoxLetterLayout; label: string }[]
                        ).map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            data-testid={`box-layout-${mode.id}`}
                            onClick={() => onUpdateConfig({ boxLetterLayout: mode.id })}
                            aria-pressed={config.boxLetterLayout === mode.id}
                            className={`flex-1 h-9 sm:h-7 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                              config.boxLetterLayout === mode.id
                                ? 'bg-white dark:bg-[#232B3B] text-[#171A21] dark:text-[#F8FAFC] shadow-xs'
                                : 'text-[#525C6E] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F1F5F9]'
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between text-[11px]">
                          <label htmlFor="slider-box-border" className="font-medium text-[#5A6375] dark:text-[#94A3B8]">
                            Borda
                          </label>
                          <span className="font-mono tabular-nums font-semibold text-[#171A21] dark:text-[#F1F5F9]">
                            {config.boxLetterBorderMm.toFixed(1)} mm
                          </span>
                        </div>
                        <input
                          id="slider-box-border"
                          type="range"
                          min={2.0}
                          max={6.0}
                          step={0.2}
                          value={config.boxLetterBorderMm}
                          onChange={(e) =>
                            onUpdateConfig({ boxLetterBorderMm: Number(e.target.value) })
                          }
                          className="studio-slider w-full"
                        />
                      </div>

                      <div className="flex flex-col gap-1 shrink-0">
                        <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#2A313D] dark:text-[#CBD5E1] cursor-pointer whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={config.boxLetterJoined}
                            onChange={(e) =>
                              onUpdateConfig({ boxLetterJoined: e.target.checked })
                            }
                            className="w-3.5 h-3.5 accent-[#D93848] rounded cursor-pointer"
                          />
                          <span>Letras unidas</span>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {/* SVG / Image Keychain Controls */}
                {config.template === 'svg-keychain' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-[#5A6375] dark:text-[#94A3B8]">
                        Modelos rápidos (ou importe SVG/PNG)
                      </span>
                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#EFF2F7] dark:bg-[#0E121A]">
                        {KEYCHAIN_SVG_PRESETS.map((preset) => {
                          const active =
                            config.svgSourceType === 'preset' &&
                            config.svgPresetId === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() =>
                                onUpdateConfig({
                                  svgSourceType: 'preset',
                                  svgPresetId: preset.id,
                                })
                              }
                              aria-pressed={active}
                              className={`flex-1 h-9 sm:h-7 px-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                active
                                  ? 'bg-white dark:bg-[#232B3B] text-[#171A21] dark:text-[#F8FAFC] shadow-xs'
                                  : 'text-[#525C6E] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F1F5F9]'
                              }`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {(() => {
                      const isArch = config.svgAttachMode === 'arch';
                      const maxArchMm = getKeychainArchMaxDiameterMm(
                        config.depthMm,
                        config.bevelMm,
                        true
                      );
                      const minMm = isArch ? 1.2 : KEYCHAIN_KEYRING_HOLE_RANGE.min;
                      const maxMm = isArch
                        ? maxArchMm
                        : KEYCHAIN_KEYRING_HOLE_RANGE.max;
                      const currentMm =
                        config.keyringHoleMm ?? (isArch ? 2.2 : 5.0);
                      return (
                        <KeyringAttachmentAndCardinalControl
                          enabled={config.keyringEnabled !== false}
                          attachMode={config.svgAttachMode}
                          direction={config.keyringDirection ?? 'top'}
                          holeMm={Math.min(maxMm, Math.max(minMm, currentMm))}
                          minHoleMm={minMm}
                          maxHoleMm={maxMm}
                          holeHint={
                            isArch ? `máx. ${maxArchMm.toFixed(1)} mm` : undefined
                          }
                          onToggleEnabled={(enabled) =>
                            onUpdateConfig({ keyringEnabled: enabled })
                          }
                          onSelectMode={(mode) => {
                            let nextHoleMm = currentMm;
                            if (mode === 'arch') {
                              nextHoleMm = Math.min(currentMm, maxArchMm);
                            } else if (
                              config.svgAttachMode === 'arch' &&
                              currentMm <= 2.4
                            ) {
                              nextHoleMm = KEYCHAIN_KEYRING_HOLE_RANGE.defaultMm;
                            }
                            onUpdateConfig({
                              svgAttachMode: mode,
                              keyringArch: mode === 'arch',
                              keyringHoleMm: Number(nextHoleMm.toFixed(1)),
                            });
                          }}
                          onSelectDirection={(dir) =>
                            onUpdateConfig({ keyringDirection: dir })
                          }
                          onChangeHoleMm={(holeMm) =>
                            onUpdateConfig({ keyringHoleMm: holeMm })
                          }
                        />
                      );
                    })()}

                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between text-[11px]">
                          <label htmlFor="slider-svg-border" className="font-medium text-[#5A6375] dark:text-[#94A3B8]">
                            Borda
                          </label>
                          <span className="font-mono tabular-nums font-semibold text-[#171A21] dark:text-[#F1F5F9]">
                            {config.svgBorderMm.toFixed(1)} mm
                          </span>
                        </div>
                        <input
                          id="slider-svg-border"
                          type="range"
                          min={1.5}
                          max={6.0}
                          step={0.2}
                          value={config.svgBorderMm}
                          onChange={(e) =>
                            onUpdateConfig({ svgBorderMm: Number(e.target.value) })
                          }
                          className="studio-slider w-full"
                        />
                      </div>

                      {config.svgSourceType === 'image' && (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                            <div className="flex items-center justify-between text-[11px]">
                              <label htmlFor="slider-img-thresh" className="font-medium text-[#5A6375] dark:text-[#94A3B8]">
                                Contraste
                              </label>
                              <span className="font-mono tabular-nums font-semibold text-[#171A21] dark:text-[#F1F5F9]">
                                {config.imageThreshold}
                              </span>
                            </div>
                            <input
                              id="slider-img-thresh"
                              type="range"
                              min={25}
                              max={230}
                              step={5}
                              value={config.imageThreshold}
                              onChange={(e) =>
                                onUpdateConfig({ imageThreshold: Number(e.target.value) })
                              }
                              className="studio-slider w-full"
                            />
                          </div>

                          <label className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2A313D] dark:text-[#CBD5E1] cursor-pointer whitespace-nowrap pt-3">
                            <input
                              type="checkbox"
                              checked={config.imageInvert}
                              onChange={(e) =>
                                onUpdateConfig({ imageInvert: e.target.checked })
                              }
                              className="w-3.5 h-3.5 accent-[#D93848] rounded cursor-pointer"
                            />
                            <span>Inverter</span>
                          </label>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Template-specific Structure Options */}
                {config.template === 'heart-name' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-[#5A6375] dark:text-[#94A3B8]">
                        Estrutura do coração
                      </span>
                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#EFF2F7] dark:bg-[#0E121A]">
                        {(
                          [
                            { id: 'pure', label: 'Puro (Ilusão)' },
                            { id: 'desk-stand', label: 'Com base' },
                            { id: 'solid-front', label: 'Frente sólida' },
                          ] as { id: HeartStructureMode; label: string }[]
                        ).map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => onUpdateConfig({ heartMode: mode.id })}
                            aria-pressed={config.heartMode === mode.id}
                            className={`flex-1 h-9 sm:h-7 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                              config.heartMode === mode.id
                                ? 'bg-white dark:bg-[#232B3B] text-[#171A21] dark:text-[#F8FAFC] shadow-xs'
                                : 'text-[#525C6E] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F1F5F9]'
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5 pt-2 sm:pt-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-2 text-xs font-medium text-[#2A313D] dark:text-[#CBD5E1] cursor-pointer">
                          <input
                            type="checkbox"
                            data-testid="toggle-keyring-arch"
                            checked={config.keyringArch && config.keyringEnabled !== false}
                            onChange={(e) =>
                              onUpdateConfig({
                                keyringArch: e.target.checked,
                                keyringEnabled: e.target.checked,
                              })
                            }
                            className="w-4 h-4 accent-[#D93848] rounded cursor-pointer"
                          />
                          <span>Furo para argola (arco)</span>
                        </label>

                        <label className="inline-flex items-center gap-2 text-xs font-medium text-[#2A313D] dark:text-[#CBD5E1] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.useDualColor}
                            onChange={(e) =>
                              onUpdateConfig({ useDualColor: e.target.checked })
                            }
                            className="w-4 h-4 accent-[#D93848] rounded cursor-pointer"
                          />
                          <span>Duas cores</span>
                        </label>
                      </div>

                      {config.keyringArch && config.keyringEnabled !== false && (
                        <HoleDiameterControl
                          sliderId="slider-heart-hole-size"
                          inputId="input-heart-hole-diameter"
                          sliderTestId="heart-hole-size-slider"
                          inputTestId="heart-hole-diameter-input"
                          valueTestId="heart-hole-size-value"
                          valueMm={
                            config.keyringHoleMm ??
                            HEART_KEYRING_HOLE_RANGE.defaultMm
                          }
                          minMm={HEART_KEYRING_HOLE_RANGE.min}
                          maxMm={HEART_KEYRING_HOLE_RANGE.max}
                          step={HEART_KEYRING_HOLE_RANGE.step}
                          onChange={(nextMm) =>
                            onUpdateConfig({ keyringHoleMm: nextMm })
                          }
                        />
                      )}
                    </div>
                  </>
                )}

                {config.template === 'name-sign' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-[#5A6375] dark:text-[#94A3B8]">Estilo da base</span>
                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#EFF2F7] dark:bg-[#0E121A]">
                        {(
                          [
                            { id: 'beveled', label: 'Chanfrada' },
                            { id: 'stepped', label: 'Degrau' },
                            { id: 'minimal', label: 'Fina' },
                          ] as { id: SignBaseStyle; label: string }[]
                        ).map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => onUpdateConfig({ signBaseStyle: st.id })}
                            aria-pressed={config.signBaseStyle === st.id}
                            className={`flex-1 h-9 sm:h-7 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                              config.signBaseStyle === st.id
                                ? 'bg-white dark:bg-[#232B3B] text-[#171A21] dark:text-[#F8FAFC] shadow-xs'
                                : 'text-[#525C6E] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F1F5F9]'
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="sign-subtitle-input"
                        className="text-[11px] font-medium text-[#5A6375] dark:text-[#94A3B8]"
                      >
                        Subtítulo na base
                      </label>
                      <input
                        id="sign-subtitle-input"
                        type="text"
                        value={config.subtitle}
                        onChange={(e) => onUpdateConfig({ subtitle: e.target.value })}
                        maxLength={18}
                        placeholder="Ex: ESTÚDIO 3D"
                        className="h-8 px-2.5 rounded-lg border border-[#D1D8E3] dark:border-[#323E54] bg-white dark:bg-[#0F141D] text-xs font-medium uppercase text-[#171A21] dark:text-[#F1F5F9] placeholder:text-[#8A94A6] dark:placeholder:text-[#64748B] focus:outline-none focus:border-[#171A21] dark:focus:border-[#64748B]"
                      />
                    </div>
                  </>
                )}

                {config.template === 'keychain' && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <span className="text-[11px] font-medium text-[#5A6375] dark:text-[#94A3B8]">Formato da base</span>
                        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#EFF2F7] dark:bg-[#0E121A]">
                          {(
                            [
                              { id: 'capsule', label: 'Cápsula' },
                              { id: 'heart', label: 'Coração' },
                              { id: 'rectangle', label: 'Retângulo' },
                            ] as { id: KeychainShape; label: string }[]
                          ).map((sh) => (
                            <button
                              key={sh.id}
                              type="button"
                              onClick={() => onUpdateConfig({ keychainShape: sh.id })}
                              aria-pressed={config.keychainShape === sh.id}
                              className={`flex-1 h-9 sm:h-7 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                                config.keychainShape === sh.id
                                  ? 'bg-white dark:bg-[#232B3B] text-[#171A21] dark:text-[#F8FAFC] shadow-xs'
                                  : 'text-[#525C6E] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F1F5F9]'
                              }`}
                            >
                              {sh.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2A313D] dark:text-[#CBD5E1] cursor-pointer whitespace-nowrap pt-4 shrink-0">
                        <input
                          type="checkbox"
                          checked={config.keychainRaisedBorder}
                          onChange={(e) =>
                            onUpdateConfig({ keychainRaisedBorder: e.target.checked })
                          }
                          className="w-4 h-4 accent-[#D93848] rounded cursor-pointer"
                        />
                        <span>Borda</span>
                      </label>
                    </div>

                    {(() => {
                      const effectiveMode: SvgAttachMode =
                        !config.keyringArch && config.svgAttachMode === 'arch'
                          ? 'hole'
                          : config.svgAttachMode;
                      const isArch = effectiveMode === 'arch';
                      const maxArchMm = getKeychainArchMaxDiameterMm(
                        config.depthMm,
                        config.bevelMm,
                        false
                      );
                      const minMm = isArch ? 1.2 : KEYCHAIN_KEYRING_HOLE_RANGE.min;
                      const maxMm = isArch
                        ? maxArchMm
                        : KEYCHAIN_KEYRING_HOLE_RANGE.max;
                      const currentMm =
                        config.keyringHoleMm ?? (isArch ? 2.2 : 5.0);
                      return (
                        <KeyringAttachmentAndCardinalControl
                          enabled={config.keyringEnabled !== false}
                          attachMode={effectiveMode}
                          direction={config.keyringDirection ?? 'top'}
                          holeMm={Math.min(maxMm, Math.max(minMm, currentMm))}
                          minHoleMm={minMm}
                          maxHoleMm={maxMm}
                          holeHint={
                            isArch ? `máx. ${maxArchMm.toFixed(1)} mm` : undefined
                          }
                          onToggleEnabled={(enabled) =>
                            onUpdateConfig({ keyringEnabled: enabled })
                          }
                          onSelectMode={(mode) => {
                            let nextHoleMm = currentMm;
                            if (mode === 'arch') {
                              nextHoleMm = Math.min(currentMm, maxArchMm);
                            } else if (isArch && currentMm <= 2.4) {
                              nextHoleMm = KEYCHAIN_KEYRING_HOLE_RANGE.defaultMm;
                            }
                            onUpdateConfig({
                              svgAttachMode: mode,
                              keyringArch: mode === 'arch',
                              keyringHoleMm: Number(nextHoleMm.toFixed(1)),
                            });
                          }}
                          onSelectDirection={(dir) =>
                            onUpdateConfig({ keyringDirection: dir })
                          }
                          onChangeHoleMm={(holeMm) =>
                            onUpdateConfig({ keyringHoleMm: holeMm })
                          }
                        />
                      );
                    })()}
                  </>
                )}

                {config.template === 'plaque' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="plaque-subtitle-input"
                        className="text-[11px] font-medium text-[#5A6375] dark:text-[#94A3B8]"
                      >
                        Segunda linha (opcional)
                      </label>
                      <input
                        id="plaque-subtitle-input"
                        type="text"
                        value={config.subtitle}
                        onChange={(e) => onUpdateConfig({ subtitle: e.target.value })}
                        maxLength={20}
                        placeholder="Ex: IMPRESSÃO 3D"
                        className="h-8 px-2.5 rounded-lg border border-[#D1D8E3] dark:border-[#323E54] bg-white dark:bg-[#0F141D] text-xs font-medium uppercase text-[#171A21] dark:text-[#F1F5F9] placeholder:text-[#8A94A6] dark:placeholder:text-[#64748B] focus:outline-none focus:border-[#171A21] dark:focus:border-[#64748B]"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-3 sm:pt-4">

                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2A313D] dark:text-[#CBD5E1] cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={config.plaqueMountHoles}
                          onChange={(e) =>
                            onUpdateConfig({ plaqueMountHoles: e.target.checked })
                          }
                          className="w-4 h-4 accent-[#D93848] rounded cursor-pointer"
                        />
                        <span>Furos</span>
                      </label>

                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2A313D] dark:text-[#CBD5E1] cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={config.plaqueRounded}
                          onChange={(e) =>
                            onUpdateConfig({ plaqueRounded: e.target.checked })
                          }
                          className="w-4 h-4 accent-[#D93848] rounded cursor-pointer"
                        />
                        <span>Cantos suaves</span>
                      </label>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Tab 2: Dimensions */}
            {activeTab === 'dimensions' && (
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    data-testid="dock-toggle-lock-proportions"
                    onClick={onToggleLockProportions}
                    aria-pressed={lockProportions}
                    className={`inline-flex items-center gap-1.5 h-9 sm:h-7 px-3 sm:px-2.5 rounded-lg sm:rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                      lockProportions
                        ? 'border-[#0284C7]/40 dark:border-[#38BDF8]/40 bg-[#F0F9FF] dark:bg-[#0C2D48]/65 text-[#0369A1] dark:text-[#7DD3FC]'
                        : 'border-[#CBD5E1] dark:border-[#323E54] bg-white dark:bg-[#1E2534] text-[#475569] dark:text-[#CBD5E1] hover:text-[#171A21] dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    {lockProportions ? (
                      <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <LockOpen className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {lockProportions ? 'Proporção trancada' : 'Proporção livre'}
                    </span>
                  </button>

                  <span
                    data-testid="dock-bed-limit-hint"
                    className="text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]"
                  >
                    Mesa {buildPlate.widthMm}×{buildPlate.depthMm}×{buildPlate.heightMm} mm · Máx: {bounds.maxWidthMm}×{bounds.maxHeightMm}×{bounds.maxDepthMm} mm
                  </span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 items-center">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-width" className="font-medium text-[#374151] dark:text-[#CBD5E1]">
                        Largura
                      </label>
                      <span className="font-mono tabular-nums text-[#171A21] dark:text-[#F1F5F9] font-semibold">
                        {config.widthMm} mm
                      </span>
                    </div>
                    <input
                      id="slider-width"
                      type="range"
                      min={bounds.minWidthMm}
                      max={bounds.maxWidthMm}
                      step={1}
                      value={config.widthMm}
                      onChange={(e) =>
                        onChangeDimensionAxis('widthMm', Number(e.target.value))
                      }
                      className="studio-slider w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-height" className="font-medium text-[#374151] dark:text-[#CBD5E1]">
                        {isFlatTemplate ? 'Comprimento' : 'Altura'}
                      </label>
                      <span className="font-mono tabular-nums text-[#171A21] dark:text-[#F1F5F9] font-semibold">
                        {config.heightMm} mm
                      </span>
                    </div>
                    <input
                      id="slider-height"
                      type="range"
                      min={bounds.minHeightMm}
                      max={bounds.maxHeightMm}
                      step={1}
                      value={config.heightMm}
                      onChange={(e) =>
                        onChangeDimensionAxis('heightMm', Number(e.target.value))
                      }
                      className="studio-slider w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-depth" className="font-medium text-[#374151] dark:text-[#CBD5E1]">
                        {isFlatTemplate ? 'Espessura' : 'Profundidade'}
                      </label>
                      <span className="font-mono tabular-nums text-[#171A21] dark:text-[#F1F5F9] font-semibold">
                        {config.depthMm} mm
                      </span>
                    </div>
                    <input
                      id="slider-depth"
                      type="range"
                      min={bounds.minDepthMm}
                      max={bounds.maxDepthMm}
                      step={0.5}
                      value={config.depthMm}
                      onChange={(e) =>
                        onChangeDimensionAxis('depthMm', Number(e.target.value))
                      }
                      className="studio-slider w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-text-scale" className="font-medium text-[#374151] dark:text-[#CBD5E1]">
                        {config.template === 'svg-keychain'
                          ? 'Escala do desenho'
                          : 'Escala do texto'}
                      </label>
                      <span className="font-mono tabular-nums text-[#171A21] dark:text-[#F1F5F9] font-semibold">
                        {config.textScale}%
                      </span>
                    </div>
                    <input
                      id="slider-text-scale"
                      type="range"
                      min={72}
                      max={102}
                      step={2}
                      value={config.textScale}
                      onChange={(e) => onUpdateConfig({ textScale: Number(e.target.value) })}
                      className="studio-slider w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Filament & Export */}
            {activeTab === 'filament' && (
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Filament colors */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-[#5A6375] dark:text-[#94A3B8] whitespace-nowrap">
                      Cor letras
                    </span>
                    <div className="flex items-center gap-1.5">
                      {FILAMENT_COLORS.map((c) => {
                        const selected = config.primaryColor === c.hex;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => onUpdateConfig({ primaryColor: c.hex })}
                            aria-label={`Cor principal ${c.name}`}
                            aria-pressed={selected}
                            title={c.name}
                            className={`w-7 h-7 sm:w-6 sm:h-6 rounded-full border cursor-pointer transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848] ${
                              selected
                                ? 'ring-2 ring-offset-2 ring-[#171A21] border-[#171A21] dark:ring-offset-[#111620] dark:ring-[#F1F5F9] dark:border-[#F1F5F9]'
                                : 'border-[#CBD2DC] dark:border-[#3B475C]'
                            }`}
                            style={{ backgroundColor: c.hex }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-[#5A6375] dark:text-[#94A3B8] whitespace-nowrap">
                      Base / frente
                    </span>
                    <div className="flex items-center gap-1.5">
                      {FILAMENT_COLORS.slice(0, 8).map((c) => {
                        const selected = config.accentColor === c.hex && config.useDualColor;
                        return (
                          <button
                            key={`acc-${c.id}`}
                            type="button"
                            onClick={() =>
                              onUpdateConfig({ accentColor: c.hex, useDualColor: true })
                            }
                            aria-label={`Cor secundária ${c.name}`}
                            aria-pressed={selected}
                            title={c.name}
                            className={`w-6 h-6 sm:w-5 sm:h-5 rounded-full border cursor-pointer transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848] ${
                              selected
                                ? 'ring-2 ring-offset-1 ring-[#171A21] border-[#171A21] dark:ring-offset-[#111620] dark:ring-[#F1F5F9] dark:border-[#F1F5F9]'
                                : 'border-[#CBD2DC] dark:border-[#3B475C]'
                            }`}
                            style={{ backgroundColor: c.hex }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Finish & Secondary Export Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Acabamento do filamento"
                    value={config.finish}
                    onChange={(e) =>
                      onUpdateConfig({ finish: e.target.value as ProjectConfig['finish'] })
                    }
                    className="h-10 sm:h-8 px-3 sm:px-2.5 rounded-lg border border-[#D1D8E3] dark:border-[#323E54] bg-white dark:bg-[#1E2534] text-sm sm:text-xs font-medium text-[#171A21] dark:text-[#E2E8F0] cursor-pointer focus:outline-none focus:border-[#171A21] dark:focus:border-[#64748B]"
                  >
                    {FILAMENT_FINISHES.map((fin) => (
                      <option key={fin.id} value={fin.id}>
                        {fin.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    data-testid="dock-download-3mf"
                    onClick={onDownload3MF}
                    disabled={!canExport}
                    title="Exportar 3MF (preserva cores, peças e propriedades)"
                    className="inline-flex items-center gap-1.5 h-10 sm:h-8 px-3.5 sm:px-3 rounded-lg bg-[#D93848] hover:bg-[#BE2B3A] disabled:bg-[#CBD2DC] dark:disabled:bg-[#334155] text-white text-sm sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Layers className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                    <span>3MF</span>
                  </button>

                  <button
                    type="button"
                    data-testid="dock-download-stl"
                    onClick={onDownloadSTL}
                    disabled={!canExport}
                    className="inline-flex items-center gap-1.5 h-10 sm:h-8 px-3.5 sm:px-3 rounded-lg bg-[#171A21] hover:bg-[#2B303C] dark:bg-[#F1F5F9] dark:hover:bg-white disabled:bg-[#CBD2DC] dark:disabled:bg-[#334155] text-white dark:text-[#0F172A] text-sm sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                    <span>STL</span>
                  </button>

                  <button
                    type="button"
                    onClick={onDownloadOBJ}
                    disabled={!canExport}
                    className="inline-flex items-center gap-1.5 h-10 sm:h-8 px-3.5 sm:px-3 rounded-lg border border-[#CBD2DC] dark:border-[#323E54] bg-white dark:bg-[#1E2534] hover:bg-[#F3F5F9] dark:hover:bg-[#273044] disabled:opacity-50 text-[#171A21] dark:text-[#E2E8F0] text-sm sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <FileCode2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                    <span>OBJ</span>
                  </button>

                  <button
                    type="button"
                    onClick={onResetDefaults}
                    aria-label="Restaurar padrões do projeto"
                    title="Restaurar padrões"
                    className="inline-flex items-center gap-1.5 h-10 sm:h-8 px-3 sm:px-2.5 rounded-lg border border-[#CBD2DC] dark:border-[#323E54] bg-white dark:bg-[#1E2534] hover:bg-[#F3F5F9] dark:hover:bg-[#273044] text-[#4D5666] dark:text-[#CBD5E1] hover:text-[#171A21] dark:hover:text-[#F8FAFC] text-sm sm:text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                    <span>Resetar</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
