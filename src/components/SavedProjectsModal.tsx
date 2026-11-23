import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Save, Search, Trash2, X } from 'lucide-react';
import { TEMPLATES } from '../core/projectDefaults';
import type { SavedProject } from '../core/savedProjectsStore';

interface SavedProjectsModalProps {
  open: boolean;
  projects: SavedProject[];
  activeSavedProjectId: string | null;
  onLoadProject: (project: SavedProject) => void;
  onDeleteProject: (projectId: string) => void;
  onOpenSaveCurrent: () => void;
  onClose: () => void;
}

function formatSavedDate(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

export function SavedProjectsModal({
  open,
  projects,
  activeSavedProjectId,
  onLoadProject,
  onDeleteProject,
  onOpenSaveCurrent,
  onClose,
}: SavedProjectsModalProps) {
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setConfirmDeleteId(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    if (!q) return projects;
    return projects.filter((p) => {
      const tpl = TEMPLATES[p.config.template]?.shortLabel ?? '';
      return (
        p.name.toLocaleLowerCase('pt-BR').includes(q) ||
        tpl.toLocaleLowerCase('pt-BR').includes(q) ||
        p.config.text.toLocaleLowerCase('pt-BR').includes(q)
      );
    });
  }, [projects, query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-projects-title"
      data-testid="saved-projects-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-[#DCE1EA] dark:border-[#273043] bg-white dark:bg-[#131823] text-[#171A21] dark:text-[#F1F5F9] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#E5E9F0] dark:border-[#232B3B] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#EFF2F7] dark:bg-[#1F2738] text-[#D93848] dark:text-[#F87171] shrink-0">
              <FolderOpen className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2
                  id="saved-projects-title"
                  className="font-display text-base font-bold truncate"
                >
                  Projetos salvos
                </h2>
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-[#EFF2F7] dark:bg-[#1E2636] text-[#475569] dark:text-[#CBD5E1]">
                  {projects.length}
                </span>
              </div>
              <p className="text-xs text-[#5A6375] dark:text-[#94A3B8]">
                Abra um projeto salvo para continuar editando no estúdio 3D.
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-saved-projects-modal"
            onClick={onClose}
            aria-label="Fechar projetos salvos"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#5A6375] dark:text-[#94A3B8] hover:text-[#171A21] dark:hover:text-[#F8FAFC] hover:bg-[#EFF2F7] dark:hover:bg-[#1F2738] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Search & Save Action Strip */}
        <div className="px-5 py-3 border-b border-[#E5E9F0] dark:border-[#232B3B] bg-[#FAFBFD] dark:bg-[#0F141E] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="relative flex-1 min-w-[180px]">
            <Search
              className="w-3.5 h-3.5 text-[#8A94A6] dark:text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              data-testid="saved-projects-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-[#D1D8E3] dark:border-[#2C3649] bg-white dark:bg-[#131823] text-xs text-[#171A21] dark:text-[#F1F5F9] placeholder:text-[#8A94A6] dark:placeholder:text-[#64748B] focus:outline-none focus:border-[#D93848]"
            />
          </div>

          <button
            type="button"
            data-testid="saved-modal-save-current-btn"
            onClick={() => {
              onClose();
              onOpenSaveCurrent();
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#D93848] hover:bg-[#BE2B3A] text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Salvar projeto atual</span>
          </button>
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto p-5">
          {projects.length === 0 ? (
            <div
              data-testid="saved-projects-empty"
              className="py-10 px-4 text-center flex flex-col items-center gap-2.5"
            >
              <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#F1F5F9] dark:bg-[#1C2332] text-[#64748B] dark:text-[#94A3B8]">
                <FolderOpen className="w-6 h-6" aria-hidden="true" />
              </span>
              <h3 className="text-sm font-bold">Nenhum projeto salvo ainda</h3>
              <p className="text-xs text-[#5A6375] dark:text-[#94A3B8] max-w-xs leading-relaxed">
                Alterações não são salvas automaticamente. Clique no ícone de salvar quando quiser guardar um projeto com seu nome.
              </p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#5A6375] dark:text-[#94A3B8]">
              Nenhum projeto encontrado para &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <ul className="space-y-2.5" aria-label="Lista de projetos salvos">
              {filteredProjects.map((project) => {
                const tpl = TEMPLATES[project.config.template];
                const isActive = project.id === activeSavedProjectId;
                const isConfirmingDelete = confirmDeleteId === project.id;

                return (
                  <li
                    key={project.id}
                    data-testid={`saved-project-item-${project.id}`}
                    data-project-name={project.name}
                    className={`rounded-xl border p-3.5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isActive
                        ? 'border-[#D93848]/45 bg-[#FDF2F3]/60 dark:bg-[#2B171D]/45'
                        : 'border-[#E2E8F0] dark:border-[#242D3F] bg-[#FAFBFD] dark:bg-[#0F141E]'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex items-center -space-x-1.5 pt-0.5 shrink-0">
                        <span
                          className="w-4 h-4 rounded-full border border-black/20 dark:border-white/25"
                          style={{ backgroundColor: project.config.primaryColor }}
                          title="Cor principal"
                        />
                        {project.config.useDualColor && (
                          <span
                            className="w-4 h-4 rounded-full border border-black/20 dark:border-white/25"
                            style={{ backgroundColor: project.config.accentColor }}
                            title="Cor secundária"
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold truncate">
                            {project.name}
                          </span>
                          {isActive && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#D93848]/15 text-[#D93848] dark:text-[#F87171]">
                              Aberto
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap text-[11px] text-[#5A6375] dark:text-[#94A3B8]">
                          <span className="font-medium text-[#374151] dark:text-[#CBD5E1]">
                            {tpl?.shortLabel ?? project.config.template}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {project.config.widthMm}×{project.config.heightMm}×{project.config.depthMm} mm
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatSavedDate(project.updatedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 shrink-0">
                      {isConfirmingDelete ? (
                        <>
                          <button
                            type="button"
                            data-testid="confirm-delete-saved-project-btn"
                            onClick={() => {
                              onDeleteProject(project.id);
                              setConfirmDeleteId(null);
                            }}
                            className="h-8 px-2.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="h-8 px-2 rounded-lg border border-[#D1D8E3] dark:border-[#2C3649] text-xs font-medium text-[#5A6375] dark:text-[#94A3B8] hover:bg-[#EFF2F7] dark:hover:bg-[#1F2738] transition-colors cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            data-testid="load-saved-project-btn"
                            onClick={() => onLoadProject(project)}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#171A21] hover:bg-[#2B303C] dark:bg-[#263042] dark:hover:bg-[#334155] text-white text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Abrir</span>
                          </button>
                          <button
                            type="button"
                            data-testid="delete-saved-project-btn"
                            onClick={() => setConfirmDeleteId(project.id)}
                            aria-label={`Excluir projeto ${project.name}`}
                            title="Excluir projeto"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[#D1D8E3] dark:border-[#2C3649] bg-white dark:bg-[#1A2130] hover:bg-[#FEE2E2] dark:hover:bg-[#3B181E] hover:border-[#FCA5A5] dark:hover:border-[#EF4444]/45 text-[#64748B] dark:text-[#94A3B8] hover:text-[#DC2626] dark:hover:text-[#F87171] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
