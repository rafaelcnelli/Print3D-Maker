import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Download } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface PreloadScreenProps {
  visible: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  onInstallClick: () => void;
  onEnterStudio: () => void;
}

const LOADING_STEPS = [
  'Carregando motor 3D e geometria booleana CSG...',
  'Preparando fontes vetoriais e perfis de filamento...',
  'Configurando bandeja PEI 3D e calculadora de custos...',
  'Estúdio Print3D Maker pronto para criação',
];

export function PreloadScreen({
  visible,
  isInstallable,
  isInstalled,
  onInstallClick,
  onEnterStudio,
}: PreloadScreenProps) {
  const [progress, setProgress] = useState(20);

  useEffect(() => {
    if (!visible) return;
    setProgress(20);

    const interval = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          window.clearInterval(interval);
          return 100;
        }
        const step = prev < 65 ? 20 : prev < 90 ? 15 : 10;
        return Math.min(100, prev + step);
      });
    }, 110);

    return () => window.clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  const stepIndex =
    progress < 35
      ? 0
      : progress < 68
      ? 1
      : progress < 100
      ? 2
      : 3;

  const handleInstallAction = () => {
    onInstallClick();
  };

  return (
    <div
      role="region"
      aria-label="Tela de abertura do Print3D Maker"
      data-testid="preload-screen"
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#ECEFF3] dark:bg-[#111620] px-6 text-[#171A21] dark:text-[#F1F5F9] transition-opacity duration-200"
    >
      <div className="w-full max-w-md flex flex-col items-center text-center">
        {/* Brand Logo Emblem */}
        <div className="relative p-3 rounded-3xl bg-white dark:bg-[#161B26] border border-[#D8DFE9] dark:border-[#262E3E] shadow-[0_22px_50px_-12px_rgba(217,56,72,0.28)]">
          <BrandLogo size={88} className="rounded-2xl" />
        </div>

        {/* Title & Subtitle */}
        <h1 className="mt-5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#171A21] dark:text-[#F8FAFC]">
          Print3D Maker
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-[#5A6375] dark:text-[#94A3B8] max-w-sm">
          Criador de projetos personalizados para impressão 3D com exportação direta em 3MF, STL e OBJ
        </p>

        {/* Progress Bar & Status Step */}
        <div className="mt-7 w-full">
          <div className="flex items-center justify-between text-xs mb-2">
            <span
              data-testid="preload-status-text"
              className="font-medium text-[#475569] dark:text-[#94A3B8] truncate"
            >
              {LOADING_STEPS[stepIndex]}
            </span>
            <span
              data-testid="preload-progress-pct"
              className="font-mono tabular-nums font-semibold text-[#171A21] dark:text-[#F1F5F9] shrink-0 ml-2"
            >
              {progress}%
            </span>
          </div>

          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="w-full h-2 rounded-full bg-[#DCE2EC] dark:bg-[#1E2636] overflow-hidden"
          >
            <div
              className="h-full rounded-full bg-[#D93848] transition-all duration-150 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Primary Entry & PWA Install Actions */}
        <div className="mt-7 w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <button
            type="button"
            data-testid="preload-enter-btn"
            onClick={onEnterStudio}
            className="w-full sm:w-auto sm:flex-1 shrink-0 inline-flex items-center justify-center gap-2.5 h-12 sm:h-11 px-5 rounded-xl bg-[#D93848] hover:bg-[#BE2B3A] active:bg-[#A62331] text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848]"
          >
            <span>Entrar no Estúdio 3D</span>
            <ArrowRight className="w-5 h-5 sm:w-4 sm:h-4 shrink-0" aria-hidden="true" />
          </button>

          {!isInstalled ? (
            <button
              type="button"
              data-testid="preload-pwa-install-btn"
              onClick={handleInstallAction}
              className="w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-2.5 h-12 sm:h-11 px-5 rounded-xl border border-[#D5DCE6] dark:border-[#2C3649] bg-white dark:bg-[#1A2130] hover:bg-[#F1F5F9] dark:hover:bg-[#242E42] text-[#171A21] dark:text-[#E2E8F0] text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93848]"
            >
              <Download
                className="w-5 h-5 sm:w-4 sm:h-4 text-[#D93848] dark:text-[#E84C5C] shrink-0"
                aria-hidden="true"
              />
              <span>{isInstallable ? 'Instalar App' : 'Instalar PWA'}</span>
            </button>
          ) : (
            <div className="inline-flex items-center justify-center gap-1.5 h-12 sm:h-11 px-4 text-sm sm:text-xs font-medium text-[#159A6E] dark:text-[#34D399]">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>App instalado</span>
            </div>
          )}
        </div>

        {/* Unboxed capabilities summary */}
        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-[#64748B] dark:text-[#64748B] flex-wrap">
          <span>Coração Dupla Vista</span>
          <span aria-hidden="true">·</span>
          <span>Chaveiros SVG & PNG</span>
          <span aria-hidden="true">·</span>
          <span>Calculadora de Custos</span>
          <span aria-hidden="true">·</span>
          <span>Funciona Offline (PWA)</span>
        </div>
      </div>
    </div>
  );
}
