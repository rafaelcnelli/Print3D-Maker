import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { SelectionMeasureCard } from './components/SelectionMeasureCard';
import { TopBar } from './components/TopBar';
import { Viewport3D, type Viewport3DHandle } from './components/Viewport3D';
import {
  extractDimensions,
  getTemplateDimensionBounds,
  scaleDimensions,
  type DimensionAxis,
  type Dimensions3D,
} from './core/dimensionMath';
import {
  createDefaultConfig,
  TEMPLATES,
  validateProjectText,
} from './core/projectDefaults';
import { buildExportFilename } from './core/stlExporter';
import type {
  CameraPresetId,
  PrintMetrics,
  ProjectConfig,
  TemplateId,
  ThemeMode,
} from './types/project';

const THEME_STORAGE_KEY = 'molde3d-theme';

function loadInitialTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore storage access errors in restricted iframes
  }
  return 'light';
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
  const [config, setConfig] = useState<ProjectConfig>(() =>
    createDefaultConfig('heart-name')
  );
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('iso');
  const [cameraNonce, setCameraNonce] = useState(0);
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [pieceSelected, setPieceSelected] = useState(false);
  const [lockProportions, setLockProportions] = useState(true);
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

  const textValidation = useMemo(
    () => validateProjectText(config.text, 14),
    [config.text]
  );

  const isModelValid =
    config.template === 'svg-keychain' ? true : textValidation.valid;

  const displayedTextError =
    config.template === 'svg-keychain' ? null : textValidation.error;

  const dimensionBounds = useMemo(
    () => getTemplateDimensionBounds(config.template),
    [config.template]
  );

  // Keyboard shortcuts: "H" toggles Cinema/Zen Mode, "Escape" deselects piece
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, []);

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

  // Auto-dismiss export confirmation banner cleanly
  useEffect(() => {
    if (!exportNotice) return;
    const id = window.setTimeout(() => setExportNotice(null), 3600);
    return () => window.clearTimeout(id);
  }, [exportNotice]);

  const handleSelectTemplate = useCallback((template: TemplateId) => {
    setConfig((prev) => {
      const defaults = createDefaultConfig(template);
      if (template === 'svg-keychain' || prev.template === 'svg-keychain') {
        return defaults;
      }
      const prevValidation = validateProjectText(prev.text, 14);
      const isPreviousDefault = Object.values(TEMPLATES).some(
        (t) => t.defaultText.toUpperCase() === prevValidation.normalized
      );
      return {
        ...defaults,
        text:
          prevValidation.valid && !isPreviousDefault
            ? prev.text
            : defaults.text,
      };
    });
    setCameraPreset('iso');
    setCameraNonce((n) => n + 1);
  }, []);

  const handleUpdateConfig = useCallback((patch: Partial<ProjectConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleDimensionsBatchChange = useCallback((dims: Dimensions3D) => {
    setConfig((prev) => ({
      ...prev,
      widthMm: dims.widthMm,
      heightMm: dims.heightMm,
      depthMm: dims.depthMm,
    }));
  }, []);

  const handleDimensionAxisChange = useCallback(
    (axis: DimensionAxis, value: number) => {
      setConfig((prev) => {
        const bounds = getTemplateDimensionBounds(prev.template);
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
    [lockProportions]
  );

  const handleToggleLockProportions = useCallback(() => {
    setLockProportions((prev) => !prev);
  }, []);

  const handleSelectCamera = useCallback((preset: CameraPresetId) => {
    setCameraPreset(preset);
    setCameraNonce((n) => n + 1);
  }, []);

  const handleResetDefaults = useCallback(() => {
    setConfig((prev) => createDefaultConfig(prev.template));
    setCameraPreset('iso');
    setCameraNonce((n) => n + 1);
  }, []);

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
        onSelectTemplate={handleSelectTemplate}
        onToggleTheme={handleToggleTheme}
        onDownloadSTL={handleDownloadSTL}
        canExport={isModelValid}
      />

      <main className="w-full h-full pt-14">
        <Viewport3D
          ref={viewportRef}
          config={config}
          theme={theme}
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
            metrics={metrics}
            bounds={dimensionBounds}
            lockProportions={lockProportions}
            onToggleLock={handleToggleLockProportions}
            onChangeAxis={handleDimensionAxisChange}
            onClose={() => setPieceSelected(false)}
          />
        )}

        {/* Clean export confirmation banner */}
        {exportNotice && (
          <div
            role="status"
            aria-live="polite"
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
        textError={displayedTextError}
        cameraPreset={cameraPreset}
        metrics={metrics}
        collapsed={dockCollapsed}
        lockProportions={lockProportions}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
        onToggleLockProportions={handleToggleLockProportions}
        onUpdateConfig={handleUpdateConfig}
        onChangeDimensionAxis={handleDimensionAxisChange}
        onSelectCamera={handleSelectCamera}
        onResetDefaults={handleResetDefaults}
        onDownloadSTL={handleDownloadSTL}
        onDownloadOBJ={handleDownloadOBJ}
        canExport={isModelValid}
      />
    </div>
  );
}
