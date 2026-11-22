import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import {
  ImageVectorizeModal,
  type ApprovedVectorizeResult,
  type ImageVectorizeDraft,
} from './components/ImageVectorizeModal';
import { PreloadScreen } from './components/PreloadScreen';
import { PWAInstallModal } from './components/PWAInstallModal';
import { SelectionMeasureCard } from './components/SelectionMeasureCard';
import { TopBar } from './components/TopBar';
import { Viewport3D, type Viewport3DHandle } from './components/Viewport3D';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';
import {
  applyInfillToMetrics,
  clampInfillPercent,
  clampNonNegativePrice,
  DEFAULT_COST_SETTINGS,
} from './core/costCalculator';
import {
  clampDimensionsToBounds,
  extractDimensions,
  getTemplateDimensionBounds,
  scaleDimensions,
  type DimensionAxis,
  type Dimensions3D,
} from './core/dimensionMath';
import {
  createDefaultConfig,
  DEFAULT_BUILD_PLATE,
  TEMPLATES,
  validateProjectText,
} from './core/projectDefaults';
import { buildExportFilename } from './core/stlExporter';
import type {
  BuildPlateSize,
  CameraPresetId,
  CostCalculatorSettings,
  PrintMetrics,
  ProjectConfig,
  TemplateId,
  ThemeMode,
} from './types/project';

const THEME_STORAGE_KEY = 'molde3d-theme';
const BED_STORAGE_KEY = 'molde3d-bed-size';
const COST_STORAGE_KEY = 'molde3d-cost-settings';

function loadInitialCostSettings(): CostCalculatorSettings {
  try {
    const raw = window.localStorage.getItem(COST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CostCalculatorSettings>;
      return {
        filamentPricePerKg: clampNonNegativePrice(
          Number(parsed.filamentPricePerKg),
          DEFAULT_COST_SETTINGS.filamentPricePerKg
        ),
        hourlyPrintCost: clampNonNegativePrice(
          Number(parsed.hourlyPrintCost),
          DEFAULT_COST_SETTINGS.hourlyPrintCost
        ),
        infillPercent: clampInfillPercent(Number(parsed.infillPercent)),
      };
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  return DEFAULT_COST_SETTINGS;
}

function loadInitialTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  return 'dark';
}

function loadInitialBuildPlate(): BuildPlateSize {
  try {
    const raw = window.localStorage.getItem(BED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BuildPlateSize>;
      if (
        typeof parsed.widthMm === 'number' &&
        typeof parsed.depthMm === 'number' &&
        typeof parsed.heightMm === 'number' &&
        parsed.widthMm >= 100 &&
        parsed.widthMm <= 450 &&
        parsed.depthMm >= 100 &&
        parsed.depthMm <= 450 &&
        parsed.heightMm >= 100 &&
        parsed.heightMm <= 450
      ) {
        const widthMm = Math.round(parsed.widthMm);
        const depthMm = Math.round(parsed.depthMm);
        const heightMm = Math.round(parsed.heightMm);
        return {
          presetId: parsed.presetId ?? 'custom',
          label:
            typeof parsed.label === 'string' && parsed.label.trim().length > 0
              ? parsed.label
              : `${widthMm} × ${depthMm} mm`,
          widthMm,
          depthMm,
          heightMm,
        };
      }
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  return DEFAULT_BUILD_PLATE;
}

function pixelsToDataUrl(pixels: {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}): string {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const copy = new Uint8ClampedArray(pixels.rgba);
  ctx.putImageData(new ImageData(copy, pixels.width, pixels.height), 0, 0);
  return canvas.toDataURL('image/png');
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const viewportRef = useRef<Viewport3DHandle | null>(null);
  const [buildPlate, setBuildPlate] = useState<BuildPlateSize>(loadInitialBuildPlate);
  const [config, setConfig] = useState<ProjectConfig>(() => {
    const initialBed = loadInitialBuildPlate();
    const initial = createDefaultConfig('heart-name');
    const bounds = getTemplateDimensionBounds(initial.template, initialBed);
    const clamped = clampDimensionsToBounds(extractDimensions(initial), bounds, true);
    return { ...initial, ...clamped };
  });
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('iso');
  const [cameraNonce, setCameraNonce] = useState(0);
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [pieceSelected, setPieceSelected] = useState(false);
  const [lockProportions, setLockProportions] = useState(true);
  const [vectorizeDraft, setVectorizeDraft] = useState<ImageVectorizeDraft | null>(null);
  const [showPreload, setShowPreload] = useState(true);
  const [showPWAInstallModal, setShowPWAInstallModal] = useState(false);
  const { isInstallable, isInstalled, isIOS, triggerNativeInstall } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [costSettings, setCostSettings] = useState<CostCalculatorSettings>(
    loadInitialCostSettings
  );
  const [metrics, setMetrics] = useState<PrintMetrics>({
    widthMm: 65,
    heightMm: 55,
    depthMm: 20,
    triangleCount: 0,
    volumeCm3: 0,
    filamentGrams: 11,
    estimatedMinutes: 39,
  });
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const effectiveMetrics = useMemo(
    () =>
      applyInfillToMetrics(metrics, costSettings.infillPercent, config.finish),
    [metrics, costSettings.infillPercent, config.finish]
  );

  const textValidation = useMemo(
    () => validateProjectText(config.text, 14),
    [config.text]
  );

  const isModelValid =
    config.template === 'svg-keychain' ? true : textValidation.valid;

  const displayedTextError =
    config.template === 'svg-keychain' ? null : textValidation.error;

  const dimensionBounds = useMemo(
    () =>
      getTemplateDimensionBounds(config.template, buildPlate, {
        boxLetterLayout: config.boxLetterLayout,
        svgAttachMode: config.svgAttachMode,
      }),
    [config.template, buildPlate, config.boxLetterLayout, config.svgAttachMode]
  );

  // Persist build plate size to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(BED_STORAGE_KEY, JSON.stringify(buildPlate));
    } catch {
      // Ignore storage access errors in restricted iframes
    }
  }, [buildPlate]);

  // Persist cost calculator settings to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(COST_STORAGE_KEY, JSON.stringify(costSettings));
    } catch {
      // Ignore storage access errors in restricted iframes
    }
  }, [costSettings]);

  // Keyboard shortcuts: "H" toggles Cinema/Zen Mode, "Escape" deselects piece
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (vectorizeDraft) return;
      if (e.key === 'Escape') {
        setPieceSelected(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [vectorizeDraft]);

  // Sync theme mode to <html class="dark"> and localStorage
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage access errors in restricted iframes
    }
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleOpenPWAInstall = useCallback(async () => {
    if (isInstallable) {
      const outcome = await triggerNativeInstall();
      if (outcome === 'accepted') {
        setExportNotice('Aplicativo Print3D Maker instalado com sucesso!');
        return;
      }
      if (outcome === 'dismissed') {
        return;
      }
    }
    setShowPWAInstallModal(true);
  }, [isInstallable, triggerNativeInstall]);

  // Auto-dismiss status/export confirmation banner cleanly
  useEffect(() => {
    if (!exportNotice) return;
    const id = window.setTimeout(() => setExportNotice(null), 3800);
    return () => window.clearTimeout(id);
  }, [exportNotice]);

  const handleChangeBuildPlate = useCallback((nextBed: BuildPlateSize) => {
    setBuildPlate(nextBed);
    setConfig((prev) => {
      const nextBounds = getTemplateDimensionBounds(prev.template, nextBed, {
        boxLetterLayout: prev.boxLetterLayout,
        svgAttachMode: prev.svgAttachMode,
      });
      const current = extractDimensions(prev);
      const clamped = clampDimensionsToBounds(current, nextBounds, true);
      const wasClamped =
        clamped.widthMm !== current.widthMm ||
        clamped.heightMm !== current.heightMm ||
        clamped.depthMm !== current.depthMm;
      if (wasClamped) {
        setExportNotice(
          `Peça redimensionada automaticamente para caber na mesa ${nextBed.widthMm}×${nextBed.depthMm} mm.`
        );
      }
      return wasClamped ? { ...prev, ...clamped } : prev;
    });
  }, []);

  const handleSelectTemplate = useCallback(
    (template: TemplateId) => {
      setConfig((prev) => {
        const defaults = createDefaultConfig(template);
        const bounds = getTemplateDimensionBounds(template, buildPlate, {
          boxLetterLayout: defaults.boxLetterLayout,
          svgAttachMode: defaults.svgAttachMode,
        });
        const clamped = clampDimensionsToBounds(extractDimensions(defaults), bounds, true);
        if (template === 'svg-keychain' || prev.template === 'svg-keychain') {
          return { ...defaults, ...clamped };
        }
        const prevValidation = validateProjectText(prev.text, 14);
        const isPreviousDefault = Object.values(TEMPLATES).some(
          (t) => t.defaultText.toUpperCase() === prevValidation.normalized
        );
        return {
          ...defaults,
          ...clamped,
          text:
            prevValidation.valid && !isPreviousDefault
              ? prev.text
              : defaults.text,
        };
      });
      setCameraPreset('iso');
      setCameraNonce((n) => n + 1);
    },
    [buildPlate]
  );

  const handleUpdateConfig = useCallback(
    (patch: Partial<ProjectConfig>) => {
      setConfig((prev) => {
        const merged = { ...prev, ...patch };
        if (
          patch.boxLetterLayout !== undefined ||
          patch.svgAttachMode !== undefined
        ) {
          const nextBounds = getTemplateDimensionBounds(merged.template, buildPlate, {
            boxLetterLayout: merged.boxLetterLayout,
            svgAttachMode: merged.svgAttachMode,
          });
          const clamped = clampDimensionsToBounds(
            extractDimensions(merged),
            nextBounds,
            true
          );
          return { ...merged, ...clamped };
        }
        return merged;
      });
    },
    [buildPlate]
  );

  const handleOpenVectorizeDraft = useCallback((draft: ImageVectorizeDraft) => {
    setVectorizeDraft(draft);
  }, []);

  const handleReopenVectorizeModal = useCallback(() => {
    if (!config.imagePixels) return;
    setVectorizeDraft({
      fileName: config.svgFileName || 'imagem.png',
      pixels: config.imagePixels,
      previewUrl: pixelsToDataUrl(config.imagePixels),
      initialOptions: {
        threshold: config.imageThreshold,
        invert: config.imageInvert,
        traceMode: config.imageTraceMode,
        smoothness: config.imageSmoothness,
        despeckle: config.imageDespeckle,
      },
    });
  }, [
    config.imagePixels,
    config.svgFileName,
    config.imageThreshold,
    config.imageInvert,
    config.imageTraceMode,
    config.imageSmoothness,
    config.imageDespeckle,
  ]);

  const handleApproveVectorize = useCallback((approved: ApprovedVectorizeResult) => {
    setConfig((prev) => ({
      ...prev,
      svgSourceType: 'image',
      svgFileName: approved.fileName,
      imagePixels: approved.pixels,
      imageThreshold: approved.options.threshold,
      imageInvert: approved.options.invert,
      imageTraceMode: approved.options.traceMode,
      imageSmoothness: approved.options.smoothness,
      imageDespeckle: approved.options.despeckle,
    }));
    setVectorizeDraft(null);
    setExportNotice(`Vetorização de ${approved.fileName} aprovada e aplicada ao chaveiro 3D.`);
  }, []);

  const handleDimensionsBatchChange = useCallback(
    (dims: Dimensions3D) => {
      setConfig((prev) => {
        const bounds = getTemplateDimensionBounds(prev.template, buildPlate, {
          boxLetterLayout: prev.boxLetterLayout,
          svgAttachMode: prev.svgAttachMode,
        });
        const clamped = clampDimensionsToBounds(dims, bounds, false);
        return {
          ...prev,
          widthMm: clamped.widthMm,
          heightMm: clamped.heightMm,
          depthMm: clamped.depthMm,
        };
      });
    },
    [buildPlate]
  );

  const handleDimensionAxisChange = useCallback(
    (axis: DimensionAxis, value: number) => {
      setConfig((prev) => {
        const bounds = getTemplateDimensionBounds(prev.template, buildPlate, {
          boxLetterLayout: prev.boxLetterLayout,
          svgAttachMode: prev.svgAttachMode,
        });
        const scaled = scaleDimensions(
          extractDimensions(prev),
          axis,
          value,
          lockProportions,
          bounds
        );
        return {
          ...prev,
          widthMm: scaled.widthMm,
          heightMm: scaled.heightMm,
          depthMm: scaled.depthMm,
        };
      });
    },
    [lockProportions, buildPlate]
  );

  const handleToggleLockProportions = useCallback(() => {
    setLockProportions((prev) => !prev);
  }, []);

  const handleSelectCamera = useCallback((preset: CameraPresetId) => {
    setCameraPreset(preset);
    setCameraNonce((n) => n + 1);
  }, []);

  const handleResetDefaults = useCallback(() => {
    setConfig((prev) => {
      const defaults = createDefaultConfig(prev.template);
      const bounds = getTemplateDimensionBounds(defaults.template, buildPlate, {
        boxLetterLayout: defaults.boxLetterLayout,
        svgAttachMode: defaults.svgAttachMode,
      });
      const clamped = clampDimensionsToBounds(extractDimensions(defaults), bounds, true);
      return { ...defaults, ...clamped };
    });
    setCameraPreset('iso');
    setCameraNonce((n) => n + 1);
  }, [buildPlate]);

  const exportSlugLabel = useMemo(() => {
    if (config.template === 'svg-keychain') {
      if (config.svgSourceType !== 'preset' && config.svgFileName.trim()) {
        return config.svgFileName.replace(/\.[^.]+$/, '');
      }
      return config.svgPresetId;
    }
    return textValidation.normalized;
  }, [config.template, config.svgSourceType, config.svgFileName, config.svgPresetId, textValidation.normalized]);

  const handleDownloadSTL = useCallback(() => {
    if (!isModelValid) return;
    const buffer = viewportRef.current?.exportSTL();
    if (!buffer) return;
    const filename = buildExportFilename(
      config.template,
      exportSlugLabel,
      'stl'
    );
    triggerBlobDownload(
      new Blob([buffer], { type: 'application/octet-stream' }),
      filename
    );
    setExportNotice(`Arquivo ${filename} exportado pronto para fatiamento.`);
  }, [config.template, exportSlugLabel, isModelValid]);

  const handleDownloadOBJ = useCallback(() => {
    if (!isModelValid) return;
    const objContent = viewportRef.current?.exportOBJ(
      `${config.template}_${exportSlugLabel}`
    );
    if (!objContent) return;
    const filename = buildExportFilename(
      config.template,
      exportSlugLabel,
      'obj'
    );
    triggerBlobDownload(
      new Blob([objContent], { type: 'text/plain;charset=utf-8' }),
      filename
    );
    setExportNotice(`Arquivo ${filename} exportado em milímetros.`);
  }, [config.template, exportSlugLabel, isModelValid]);

  const activeMeta = TEMPLATES[config.template];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#ECEFF3] dark:bg-[#111620] select-none transition-colors">
      <TopBar
        activeTemplate={config.template}
        theme={theme}
        buildPlate={buildPlate}
        metrics={effectiveMetrics}
        finish={config.finish}
        costSettings={costSettings}
        isPWAInstalled={isInstalled}
        onSelectTemplate={handleSelectTemplate}
        onChangeBuildPlate={handleChangeBuildPlate}
        onChangeCostSettings={setCostSettings}
        onToggleTheme={handleToggleTheme}
        onOpenPWAInstall={handleOpenPWAInstall}
        onOpenPreload={() => setShowPreload(true)}
        onDownloadSTL={handleDownloadSTL}
        canExport={isModelValid}
      />

      <main className="w-full h-full pt-14">
        <Viewport3D
          ref={viewportRef}
          config={config}
          theme={theme}
          buildPlate={buildPlate}
          cameraPreset={cameraPreset}
          cameraNonce={cameraNonce}
          isTextValid={isModelValid}
          selected={pieceSelected}
          lockProportions={lockProportions}
          onSelectChange={setPieceSelected}
          onDimensionsChange={handleDimensionsBatchChange}
          onMetricsChange={setMetrics}
        />

        {/* Subtle top-left title cue inside viewport */}
        <div className="pointer-events-none fixed top-[66px] left-4 sm:left-6 z-10 max-w-xs rounded-lg bg-[#ECEFF3]/92 dark:bg-[#161B26]/92 border border-[#D8DFE9] dark:border-[#273043] px-3 py-2 transition-colors">
          <h1 className="font-display text-sm sm:text-base font-bold text-[#171A21] dark:text-[#F1F5F9] leading-tight">
            {activeMeta.title}
          </h1>
          <p className="mt-0.5 text-xs text-[#475162] dark:text-[#94A3B8]">
            Clique na peça para ver medidas e redimensionar · Arraste para girar
          </p>
        </div>

        {/* Floating Selection Measurement & Proportional Lock Card (when piece clicked) */}
        {pieceSelected && (
          <SelectionMeasureCard
            config={config}
            metrics={effectiveMetrics}
            bounds={dimensionBounds}
            lockProportions={lockProportions}
            onToggleLock={handleToggleLockProportions}
            onChangeAxis={handleDimensionAxisChange}
            onClose={() => setPieceSelected(false)}
          />
        )}

        {/* Clean status / export confirmation banner */}
        {exportNotice && (
          <div
            role="status"
            aria-live="polite"
            data-testid="status-notice"
            className={`fixed ${
              pieceSelected ? 'bottom-44 sm:bottom-48' : 'top-[68px]'
            } right-4 sm:right-6 z-20 rounded-lg border border-[#159A6E]/30 dark:border-[#34D399]/35 bg-white dark:bg-[#142922] px-3.5 py-2 text-xs font-medium text-[#14533C] dark:text-[#A7F3D0] shadow-sm`}
          >
            {exportNotice}
          </div>
        )}
      </main>

      <ControlDock
        config={config}
        bounds={dimensionBounds}
        buildPlate={buildPlate}
        textError={displayedTextError}
        cameraPreset={cameraPreset}
        metrics={effectiveMetrics}
        collapsed={dockCollapsed}
        lockProportions={lockProportions}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
        onToggleLockProportions={handleToggleLockProportions}
        onUpdateConfig={handleUpdateConfig}
        onOpenVectorizeDraft={handleOpenVectorizeDraft}
        onReopenVectorizeModal={handleReopenVectorizeModal}
        onChangeDimensionAxis={handleDimensionAxisChange}
        onSelectCamera={handleSelectCamera}
        onResetDefaults={handleResetDefaults}
        onDownloadSTL={handleDownloadSTL}
        onDownloadOBJ={handleDownloadOBJ}
        canExport={isModelValid}
      />

      {/* Pre-Approval Raster Image Vectorization Preview Modal */}
      {vectorizeDraft && (
        <ImageVectorizeModal
          draft={vectorizeDraft}
          borderMm={config.svgBorderMm}
          primaryColor={config.primaryColor}
          accentColor={config.accentColor}
          onCancel={() => setVectorizeDraft(null)}
          onApprove={handleApproveVectorize}
        />
      )}

      {/* Pre-load Splash Screen with Logo & PWA Install CTA */}
      <PreloadScreen
        visible={showPreload}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        onInstallClick={handleOpenPWAInstall}
        onEnterStudio={() => setShowPreload(false)}
      />

      {/* PWA Installation Guide / Native Trigger Modal */}
      <PWAInstallModal
        open={showPWAInstallModal}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        isIOS={isIOS}
        onTriggerNativeInstall={triggerNativeInstall}
        onClose={() => setShowPWAInstallModal(false)}
      />

      {/* Non-intrusive offline PWA connectivity indicator */}
      {!isOnline && (
        <div
          role="status"
          data-testid="offline-indicator"
          className="fixed bottom-4 left-4 z-50 rounded-lg border border-[#F59E0B]/40 bg-[#1C1917] px-3 py-1.5 text-xs font-medium text-[#FDE68A] shadow-lg"
        >
          Modo offline — Usando estúdio 3D em cache local
        </div>
      )}
    </div>
  );
}

