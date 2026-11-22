import { Download, Moon, Sun } from 'lucide-react';
import { TEMPLATE_ORDER, TEMPLATES } from '../core/projectDefaults';
import type { TemplateId, ThemeMode } from '../types/project';

interface TopBarProps {
  activeTemplate: TemplateId;
  theme: ThemeMode;
  onSelectTemplate: (template: TemplateId) => void;
  onToggleTheme: () => void;
  onDownloadSTL: () => void;
  canExport: boolean;
}

export function TopBar({
  activeTemplate,
  theme,
  onSelectTemplate,
  onToggleTheme,
  onDownloadSTL,
  canExport,
}: TopBarProps) {
  const isDark = theme === 'dark';

  return (
    <header className="fixed top-0 inset-x-0 z-20 h-14 bg-[#FFFFFF]/95 dark:bg-[#131720]/96 border-b border-[#DCE1EA] dark:border-[#262E3E] px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8 transition-colors">
      {/* Zone 1: Single-element display brand wordmark */}
      <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#171A21] dark:text-[#F1F5F9] whitespace-nowrap shrink-0">
        Molde3D
      </span>

      {/* Zone 2: Clean single-line project template links */}
      <nav
        aria-label="Projetos prontos"
        className="flex items-center gap-1 sm:gap-3.5 lg:gap-5 overflow-x-auto no-scrollbar min-w-0"
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

      {/* Zone 3: Theme selector + Primary action CTA */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          data-testid="theme-toggle"
          onClick={onToggleTheme}
          aria-pressed={isDark}
          aria-label={isDark ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
          title={isDark ? 'Tema claro' : 'Tema escuro'}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#D5DCE6] dark:border-[#2C3649] bg-[#F7F9FC] dark:bg-[#1C2332] hover:bg-[#EDF1F7] dark:hover:bg-[#252F42] text-[#374151] dark:text-[#E2E8F0] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848]"
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
          className="inline-flex items-center gap-2 h-9 px-3.5 sm:px-4 rounded-lg bg-[#D93848] hover:bg-[#BE2B3A] active:bg-[#A62331] disabled:bg-[#CBD2DC] dark:disabled:bg-[#2A3344] disabled:text-[#667085] dark:disabled:text-[#64748B] disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D93848]"
        >
          <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Baixar STL</span>
        </button>
      </div>
    </header>
  );
}
