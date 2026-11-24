import { useEffect } from 'react';
import { CheckCircle2, Download, MonitorSmartphone, Share, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface PWAInstallModalProps {
  open: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onTriggerNativeInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  onClose: () => void;
}

export function PWAInstallModal({
  open,
  isInstallable,
  isInstalled,
  isIOS,
  onTriggerNativeInstall,
  onClose,
}: PWAInstallModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleInstallClick = async () => {
    const res = await onTriggerNativeInstall();
    if (res === 'accepted') {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-modal-title"
      data-testid="pwa-install-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[#D5DCE6] dark:border-[#2B3548] bg-white dark:bg-[#161B26] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.65)] p-6 text-[#171A21] dark:text-[#F1F5F9]">
        {/* Header with Logo */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <BrandLogo size={48} className="shrink-0 rounded-xl shadow-md" />
            <div>
              <h2
                id="pwa-install-modal-title"
                className="font-display text-base font-bold text-[#171A21] dark:text-[#F8FAFC]"
              >
                Instalar aplicativo Print3D Maker
              </h2>
              <p className="text-xs text-[#5A6375] dark:text-[#94A3B8]">
                Acesso rápido em tela cheia e funcionamento offline
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="pwa-install-modal-close"
            onClick={onClose}
            aria-label="Fechar janela de instalação"
            className="inline-flex items-center justify-center w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg text-[#64748B] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F8FAFC] hover:bg-[#EFF2F7] dark:hover:bg-[#232B3B] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 sm:w-4 sm:h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Direct 1-click install when browser prompt is ready */}
        {isInstalled ? (
          <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-[#159A6E]/30 bg-[#159A6E]/10 px-4 py-3 text-xs font-medium text-[#159A6E] dark:text-[#34D399]">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>O Print3D Maker já está instalado neste dispositivo.</span>
          </div>
        ) : isInstallable ? (
          <div className="mt-5">
            <button
              type="button"
              data-testid="pwa-modal-native-install-btn"
              onClick={handleInstallClick}
              className="w-full inline-flex items-center justify-center gap-2 h-12 sm:h-11 px-4 rounded-xl bg-[#D93848] hover:bg-[#BE2B3A] active:bg-[#A62331] text-white text-sm font-semibold transition-colors cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Instalar Print3D Maker agora</span>
            </button>
          </div>
        ) : null}

        {/* Platform step-by-step instructions */}
        <div className="mt-5 space-y-3 text-xs">
          {isIOS ? (
            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#262E3E] bg-[#F8FAFC] dark:bg-[#111620] p-3.5 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-[#171A21] dark:text-[#F8FAFC]">
                <Share className="w-4 h-4 text-[#D93848]" aria-hidden="true" />
                <span>Como instalar no iPhone ou iPad (Safari)</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-[#475569] dark:text-[#94A3B8]">
                <li>
                  Toque no botão <strong className="text-[#171A21] dark:text-[#E2E8F0]">Compartilhar</strong> na barra do Safari.
                </li>
                <li>
                  Role as opções e toque em{' '}
                  <strong className="text-[#171A21] dark:text-[#E2E8F0]">Adicionar à Tela de Início</strong>.
                </li>
                <li>
                  Confirme em <strong className="text-[#171A21] dark:text-[#E2E8F0]">Adicionar</strong> para criar o ícone do Print3D Maker.
                </li>
              </ol>
            </div>
          ) : (
            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#262E3E] bg-[#F8FAFC] dark:bg-[#111620] p-3.5 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-[#171A21] dark:text-[#F8FAFC]">
                <MonitorSmartphone className="w-4 h-4 text-[#D93848]" aria-hidden="true" />
                <span>Como instalar no Computador ou Android</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-[#475569] dark:text-[#94A3B8]">
                <li>
                  No Chrome ou Edge, clique no ícone{' '}
                  <strong className="text-[#171A21] dark:text-[#E2E8F0]">Instalar Print3D Maker</strong> no lado direito da barra de endereço.
                </li>
                <li>
                  No celular Android, abra o menu do navegador (⋮) e toque em{' '}
                  <strong className="text-[#171A21] dark:text-[#E2E8F0]">Instalar aplicativo</strong> ou{' '}
                  <strong className="text-[#171A21] dark:text-[#E2E8F0]">Adicionar à tela inicial</strong>.
                </li>
              </ol>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto h-11 sm:h-9 px-5 sm:px-4 rounded-xl sm:rounded-lg border border-[#D5DCE6] dark:border-[#2C3649] bg-[#F7F9FC] dark:bg-[#1C2332] hover:bg-[#EDF1F7] dark:hover:bg-[#252F42] text-sm sm:text-xs font-semibold text-[#171A21] dark:text-[#E2E8F0] transition-colors cursor-pointer"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
