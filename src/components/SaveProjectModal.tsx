import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import { TEMPLATES } from '../core/projectDefaults';
import {
  findSavedProjectByName,
  normalizeProjectName,
  suggestProjectName,
  type SavedProject,
} from '../core/savedProjectsStore';
import type { BuildPlateSize, PrintMetrics, ProjectConfig } from '../types/project';

interface SaveProjectModalProps {
  open: boolean;
  config: ProjectConfig;
  buildPlate: BuildPlateSize;
  metrics: PrintMetrics;
  savedProjects: SavedProject[];
  activeProjectName?: string | null;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export function SaveProjectModal({
  open,
  config,
  buildPlate,
  metrics,
  savedProjects,
  activeProjectName,
  onSave,
  onCancel,
}: SaveProjectModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const suggested = activeProjectName?.trim() || suggestProjectName(config);
    setName(suggested);
    setError(null);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(id);
  }, [open, activeProjectName, config]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  const matchingExisting = useMemo(
    () => findSavedProjectByName(savedProjects, name),
    [savedProjects, name]
  );

  if (!open) return null;

  const templateMeta = TEMPLATES[config.template];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeProjectName(name);
    if (!cleaned) {
      setError('Digite um nome para salvar o projeto.');
      inputRef.current?.focus();
      return;
    }
    onSave(cleaned);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-project-title"
      data-testid="save-project-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[#DCE1EA] dark:border-[#273043] bg-white dark:bg-[#131823] text-[#171A21] dark:text-[#F1F5F9] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#E5E9F0] dark:border-[#232B3B]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#FDF2F3] dark:bg-[#2B171D] text-[#D93848] dark:text-[#F87171] shrink-0">
              <Save className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="save-project-title"
                className="font-display text-base font-bold truncate"
              >
                Salvar projeto
              </h2>
              <p className="text-xs text-[#5A6375] dark:text-[#94A3B8]">
                O projeto só é salvo quando você confirma aqui.
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-save-project-modal"
            onClick={onCancel}
            aria-label="Fechar janela de salvar"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#5A6375] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F8FAFC] hover:bg-[#EFF2F7] dark:hover:bg-[#1F2738] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Summary badge of current piece */}
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-[#E5E9F0] dark:border-[#242D3F] bg-[#F7F9FC] dark:bg-[#0E131D]">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-4 h-4 rounded-full border border-black/15 dark:border-white/20 shrink-0"
                style={{ backgroundColor: config.primaryColor }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">
                  {templateMeta.title}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-[#5A6375] dark:text-[#94A3B8]">
                  {metrics.widthMm} × {metrics.heightMm} × {metrics.depthMm} mm · Mesa{' '}
                  {buildPlate.widthMm}×{buildPlate.depthMm}
                </div>
              </div>
            </div>
          </div>

          {/* Name Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="save-project-name-input"
              className="block text-xs font-semibold text-[#374151] dark:text-[#CBD5E1]"
            >
              Nome do projeto
            </label>
            <input
              ref={inputRef}
              id="save-project-name-input"
              data-testid="save-project-name-input"
              type="text"
              maxLength={48}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Ex: Chaveiro da Maria"
              className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] dark:border-[#323E54] bg-white dark:bg-[#0D111A] text-sm font-medium text-[#171A21] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#D93848] focus:ring-2 focus:ring-[#D93848]/20"
            />
            {error && (
              <p
                role="alert"
                className="text-xs font-medium text-[#DC2626] dark:text-[#F87171]"
              >
                {error}
              </p>
            )}
            {!error && matchingExisting && (
              <p className="text-[11px] font-medium text-[#B45309] dark:text-[#FBBF24]">
                Já existe um projeto chamado &ldquo;{matchingExisting.name}&rdquo;. Ao salvar, ele será atualizado.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="h-9 px-3.5 rounded-lg border border-[#D1D8E3] dark:border-[#2C3649] bg-[#F7F9FC] dark:bg-[#1A2130] hover:bg-[#EDF1F7] dark:hover:bg-[#232C3F] text-xs font-semibold text-[#374151] dark:text-[#CBD5E1] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              data-testid="confirm-save-project-btn"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#D93848] hover:bg-[#BE2B3A] active:bg-[#A62331] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{matchingExisting ? 'Atualizar projeto' : 'Salvar projeto'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
