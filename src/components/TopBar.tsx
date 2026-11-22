import { useEffect, useState } from 'react';
import {
  Check,
  Download,
  Menu,
  MonitorSmartphone,
  Moon,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { TEMPLATE_ORDER, TEMPLATES } from '../core/projectDefaults';
import type {
  BuildPlateSize,
  CostCalculatorSettings,
  FilamentFinishId,
  PrintMetrics,
  TemplateId,
  ThemeMode,
} from '../types/project';
import { BrandLogo } from './BrandLogo';
import { BuildPlateSelector } from './BuildPlateSelector';
import { CostCalculator } from './CostCalculator';

interface TopBarProps {
  activeTemplate: TemplateId;
  theme: ThemeMode;
  buildPlate: BuildPlateSize;
  metrics: PrintMetrics;
  finish: FilamentFinishId;
  costSettings: CostCalculatorSettings;
  isPWAInstalled: boolean;
  onSelectTemplate: (template: TemplateId) => void;
  onChangeBuildPlate: (next: BuildPlateSize) => void;
  onChangeCostSettings: (next: CostCalculatorSettings) => void;
  onToggleTheme: () => void;
  onOpenPWAInstall: () => void;
  onOpenPreload: () => void;
  onDownloadSTL: () => void;
  canExport: boolean;
}

export function TopBar({
  activeTemplate,
  theme,
  buildPlate,
  metrics,
  finish,
  costSettings,
  isPWAInstalled,
  onSelectTemplate,
  onChangeBuildPlate,
  onChangeCostSettings,
  onToggleTheme,
  onOpenPWAInstall,
  onOpenPreload,
  onDownloadSTL,
  canExport,
}: TopBarProps) {
  const isDark = theme === 'dark';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile sidebar drawer on Escape or when resizing to desktop (lg >= 1024px)
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-20 h-14 bg-[#FFFFFF]/95 dark:bg-[#131720]/96 border-b border-[#DCE1EA] dark:border-[#262E3E] px-3 sm:px-5 flex items-center justify-between gap-2 sm:gap-4 transition-colors">
        {/* Zone 1: Mobile Hamburger Button (< lg) + Brand logo + display wordmark */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <button
            type="button"
            data-testid="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-sidebar-drawer"
            aria-label={
              mobileMenuOpen ? 'Fechar menu lateral' : 'Abrir menu lateral'
            }
            title="Menu de projetos e ferramentas"
            className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#D5DCE6] dark:border-[#2C3649] bg-[#F7F9FC] dark:bg-[#1C2332] hover:bg-[#EDF1F7] dark:hover:bg-[#252F42] text-[#171A21] dark:text-[#E2E8F0] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848]"
          >
            {mobileMenuOpen ? (
              <X className="w-4 h-4 text-[#D93848]" aria-hidden="true" />
            ) : (
              <Menu className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            data-testid="brand-preload-btn"
            onClick={onOpenPreload}
            title="Ver tela inicial do Print3D Maker"
            className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848] rounded-lg"
          >
            <BrandLogo size={30} className="shrink-0 rounded-lg" />
            <span className="font-display text-sm sm:text-lg font-bold tracking-tight text-[#171A21] dark:text-[#F1F5F9]">
              Print3D Maker
            </span>
          </button>
        </div>

        {/* Zone 2: Desktop single-line project template links (lg+) */}
        <nav
          aria-label="Projetos prontos"
          className="hidden lg:flex items-center gap-1 sm:gap-2 xl:gap-2.5 overflow-x-auto no-scrollbar min-w-0"
        >
          {TEMPLATE_ORDER.map((id) => {
            const meta = TEMPLATES[id];
            const isActive = activeTemplate === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectTemplate(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative h-14 px-2 sm:px-1 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848] focus-visible:ring-inset ${
                  isActive
                    ? 'text-[#171A21] dark:text-[#F8FAFC]'
                    : 'text-[#5A6375] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F1F5F9]'
                }`}
              >
                {meta.shortLabel}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 inset-x-1 sm:inset-x-0 h-[2px] bg-[#D93848] dark:bg-[#E84C5C]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Cost calculator + Build plate selector + PWA Install + Theme selector + Primary action CTA */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <CostCalculator
            metrics={metrics}
            finish={finish}
            settings={costSettings}
            onChangeSettings={onChangeCostSettings}
          />

          <div className="hidden sm:block">
            <BuildPlateSelector
              buildPlate={buildPlate}
              onChangeBuildPlate={onChangeBuildPlate}
            />
          </div>

          {!isPWAInstalled && (
            <button
              type="button"
              data-testid="navbar-pwa-install-btn"
              onClick={onOpenPWAInstall}
              aria-label="Instalar aplicativo Print3D Maker"
              title="Instalar aplicativo (PWA)"
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-lg border border-[#D5DCE6] dark:border-[#2C3649] bg-[#F7F9FC] dark:bg-[#1C2332] hover:bg-[#EDF1F7] dark:hover:bg-[#252F42] text-[#171A21] dark:text-[#E2E8F0] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848]"
            >
              <MonitorSmartphone
                className="w-3.5 h-3.5 text-[#D93848] dark:text-[#E84C5C] shrink-0"
                aria-hidden="true"
              />
              <span className="hidden 2xl:inline">Instalar App</span>
            </button>
          )}

          <button
            type="button"
            data-testid="theme-toggle"
            onClick={onToggleTheme}
            aria-pressed={isDark}
            aria-label={
              isDark ? 'Alternar para tema claro' : 'Alternar para tema escuro'
            }
            title={isDark ? 'Tema claro' : 'Tema escuro'}
            className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#D5DCE6] dark:border-[#2C3649] bg-[#F7F9FC] dark:bg-[#1C2332] hover:bg-[#EDF1F7] dark:hover:bg-[#252F42] text-[#374151] dark:text-[#E2E8F0] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848]"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-[#FBBF24]" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-[#374151]" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onDownloadSTL}
            disabled={!canExport}
            className="inline-flex items-center gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-4 rounded-lg bg-[#D93848] hover:bg-[#BE2B3A] active:bg-[#A62331] disabled:bg-[#CBD2DC] dark:disabled:bg-[#2A3344] disabled:text-[#667085] dark:disabled:text-[#64748B] disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D93848]"
          >
            <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="sm:hidden">STL</span>
            <span className="hidden sm:inline">Baixar STL</span>
          </button>
        </div>
      </header>

      {/* Mobile & Tablet Left Sidebar Drawer (accessible via Hamburger button) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menu lateral do Print3D Maker"
        >
          {/* Backdrop */}
          <div
            data-testid="mobile-sidebar-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-[1px] transition-opacity"
          />

          {/* Slide-over Sidebar Panel */}
          <aside
            id="mobile-sidebar-drawer"
            data-testid="mobile-sidebar-drawer"
            className="relative z-10 w-[290px] max-w-[85vw] h-full bg-[#FFFFFF] dark:bg-[#131720] border-r border-[#DCE1EA] dark:border-[#262E3E] shadow-2xl flex flex-col justify-between overflow-y-auto"
          >
            <div>
              {/* Drawer Header */}
              <div className="h-14 px-4 flex items-center justify-between border-b border-[#E5E9F0] dark:border-[#262E3E]">
                <div className="flex items-center gap-2.5">
                  <BrandLogo size={28} className="shrink-0 rounded-lg" />
                  <span className="font-display text-base font-bold tracking-tight text-[#171A21] dark:text-[#F8FAFC]">
                    Print3D Maker
                  </span>
                </div>

                <button
                  type="button"
                  data-testid="mobile-sidebar-close"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Fechar menu lateral"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#5A6375] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F8FAFC] hover:bg-[#EFF2F7] dark:hover:bg-[#1F2737] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Project Templates List */}
              <div className="p-3">
                <div className="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                  Projetos 3D
                </div>

                <nav
                  aria-label="Menu lateral de projetos 3D"
                  className="flex flex-col gap-1"
                >
                  {TEMPLATE_ORDER.map((id) => {
                    const meta = TEMPLATES[id];
                    const isActive = activeTemplate === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        data-testid={`mobile-nav-${id}`}
                        onClick={() => {
                          onSelectTemplate(id);
                          setMobileMenuOpen(false);
                        }}
                        aria-current={isActive ? 'page' : undefined}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#FDF2F3] dark:bg-[#2B171D] text-[#D93848] dark:text-[#F87171] border border-[#D93848]/30 dark:border-[#E84C5C]/40'
                            : 'text-[#171A21] dark:text-[#E2E8F0] hover:bg-[#F3F6FA] dark:hover:bg-[#1C2332] border border-transparent'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">
                            {meta.shortLabel}
                          </div>
                          <div className="text-[11px] text-[#5A6375] dark:text-[#94A3B8] truncate">
                            {meta.title}
                          </div>
                        </div>
                        {isActive && (
                          <Check
                            className="w-4 h-4 text-[#D93848] dark:text-[#F87171] shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>

            {/* Bottom Tools & Preferences inside Mobile Sidebar */}
            <div className="p-3.5 border-t border-[#E5E9F0] dark:border-[#262E3E] bg-[#F8FAFC] dark:bg-[#0F131C] space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] px-1">
                Configurações e App
              </div>

              {/* Build Plate Size Selector row for mobile */}
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border border-[#DCE2EC] dark:border-[#262E3E] bg-white dark:bg-[#161B26]">
                <span className="text-xs font-medium text-[#374151] dark:text-[#CBD5E1]">
                  Bandeja 3D
                </span>
                <BuildPlateSelector
                  buildPlate={buildPlate}
                  onChangeBuildPlate={onChangeBuildPlate}
                />
              </div>

              {/* Theme Toggle row */}
              <button
                type="button"
                data-testid="mobile-theme-toggle"
                onClick={onToggleTheme}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-[#DCE2EC] dark:border-[#262E3E] bg-white dark:bg-[#161B26] hover:bg-[#F1F5F9] dark:hover:bg-[#1E2636] text-xs font-semibold text-[#171A21] dark:text-[#E2E8F0] transition-colors cursor-pointer"
              >
                <span>Tema da interface</span>
                <span className="inline-flex items-center gap-1.5 text-[#5A6375] dark:text-[#94A3B8]">
                  {isDark ? (
                    <>
                      <Sun
                        className="w-3.5 h-3.5 text-[#FBBF24]"
                        aria-hidden="true"
                      />
                      <span>Escuro</span>
                    </>
                  ) : (
                    <>
                      <Moon
                        className="w-3.5 h-3.5 text-[#374151]"
                        aria-hidden="true"
                      />
                      <span>Claro</span>
                    </>
                  )}
                </span>
              </button>

              {/* PWA Install CTA */}
              {!isPWAInstalled && (
                <button
                  type="button"
                  data-testid="mobile-pwa-install-btn"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenPWAInstall();
                  }}
                  className="w-full flex items-center justify-center gap-2 h-9 px-3 rounded-xl border border-[#D93848]/35 bg-[#FDF2F3] dark:bg-[#2B171D] text-[#D93848] dark:text-[#F87171] text-xs font-semibold transition-colors cursor-pointer"
                >
                  <MonitorSmartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Instalar aplicativo (PWA)</span>
                </button>
              )}

              {/* Reopen Welcome / Preload Screen */}
              <button
                type="button"
                data-testid="mobile-open-preload-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenPreload();
                }}
                className="w-full flex items-center justify-center gap-2 h-9 px-3 rounded-xl border border-[#DCE2EC] dark:border-[#262E3E] bg-white dark:bg-[#161B26] hover:bg-[#F1F5F9] dark:hover:bg-[#1E2636] text-xs font-medium text-[#475569] dark:text-[#94A3B8] transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#D93848]" aria-hidden="true" />
                <span>Tela inicial do app</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
