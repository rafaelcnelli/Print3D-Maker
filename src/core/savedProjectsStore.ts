import type {
  BuildPlateSize,
  ImportedImagePixels,
  ProjectConfig,
} from '../types/project';
import { createDefaultConfig, TEMPLATES } from './projectDefaults';

export interface SavedProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  config: ProjectConfig;
  buildPlate: BuildPlateSize;
}

interface SerializedRasterPixels {
  width: number;
  height: number;
  rgbaBase64: string;
}

interface SerializedProjectConfig extends Omit<ProjectConfig, 'imagePixels'> {
  imagePixels?: SerializedRasterPixels | null;
}

interface SerializedSavedProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  config: SerializedProjectConfig;
  buildPlate: BuildPlateSize;
}

const DB_NAME = 'print3d-maker-db';
const DB_VERSION = 1;
const STORE_NAME = 'saved-projects';
export const SAVED_PROJECTS_LS_KEY = 'print3d-maker-saved-projects-v1';

export function uint8ToBase64(bytes: Uint8ClampedArray): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

export function base64ToUint8(base64: string): Uint8ClampedArray {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const out = new Uint8ClampedArray(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  const buf = Buffer.from(base64, 'base64');
  return new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function cloneProjectConfig(config: ProjectConfig): ProjectConfig {
  const clonedImagePixels: ImportedImagePixels | null = config.imagePixels
    ? {
        width: config.imagePixels.width,
        height: config.imagePixels.height,
        rgba: new Uint8ClampedArray(config.imagePixels.rgba),
      }
    : null;
  return {
    ...config,
    imagePixels: clonedImagePixels,
  };
}

export function serializeSavedProject(project: SavedProject): SerializedSavedProject {
  const { imagePixels, ...restConfig } = project.config;
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    buildPlate: { ...project.buildPlate },
    config: {
      ...restConfig,
      imagePixels: imagePixels
        ? {
            width: imagePixels.width,
            height: imagePixels.height,
            rgbaBase64: uint8ToBase64(imagePixels.rgba),
          }
        : null,
    },
  };
}

export function normalizeLoadedConfig(rawConfig: Partial<ProjectConfig>): ProjectConfig {
  const defaults = createDefaultConfig(rawConfig.template ?? 'heart-name');
  const merged: ProjectConfig = {
    ...defaults,
    ...rawConfig,
  };
  if (rawConfig.keyringEnabled === undefined) {
    if (merged.template === 'heart-name') {
      merged.keyringEnabled = merged.keyringArch;
    } else if (merged.template === 'keychain' || merged.template === 'svg-keychain') {
      merged.keyringEnabled = true;
    } else {
      merged.keyringEnabled = false;
    }
  }
  return merged;
}

export function deserializeSavedProject(raw: SerializedSavedProject): SavedProject {
  const { imagePixels, ...restConfig } = raw.config;
  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    buildPlate: { ...raw.buildPlate },
    config: normalizeLoadedConfig({
      ...restConfig,
      imagePixels: imagePixels
        ? {
            width: imagePixels.width,
            height: imagePixels.height,
            rgba: base64ToUint8(imagePixels.rgbaBase64),
          }
        : null,
    }),
  };
}

export function normalizeProjectName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function suggestProjectName(config: ProjectConfig): string {
  const templateLabel = TEMPLATES[config.template]?.shortLabel ?? 'Projeto';
  if (config.template === 'svg-keychain') {
    const sourceLabel =
      config.svgSourceType === 'preset'
        ? config.svgPresetId
        : config.svgFileName.replace(/\.[^.]+$/, '') || 'SVG';
    return `${templateLabel} - ${sourceLabel}`.slice(0, 48);
  }
  const cleanText = config.text.trim();
  if (cleanText.length > 0) {
    return `${templateLabel} - ${cleanText}`.slice(0, 48);
  }
  return templateLabel;
}

export function findSavedProjectByName(
  projects: SavedProject[],
  name: string
): SavedProject | undefined {
  const normalized = normalizeProjectName(name).toLocaleLowerCase('pt-BR');
  if (!normalized) return undefined;
  return projects.find(
    (p) => normalizeProjectName(p.name).toLocaleLowerCase('pt-BR') === normalized
  );
}

export function sortSavedProjects(projects: SavedProject[]): SavedProject[] {
  return [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertSavedProjectInList(
  projects: SavedProject[],
  params: {
    name: string;
    config: ProjectConfig;
    buildPlate: BuildPlateSize;
    now?: number;
    id?: string;
  }
): { list: SavedProject[]; saved: SavedProject; updatedExisting: boolean } {
  const cleanName = normalizeProjectName(params.name).slice(0, 48);
  if (!cleanName) {
    throw new Error('Nome do projeto não pode ficar vazio.');
  }
  const now = params.now ?? Date.now();
  const existing = findSavedProjectByName(projects, cleanName);

  if (existing) {
    const updated: SavedProject = {
      id: existing.id,
      name: cleanName,
      createdAt: existing.createdAt,
      updatedAt: now,
      config: cloneProjectConfig(params.config),
      buildPlate: { ...params.buildPlate },
    };
    const nextList = sortSavedProjects(
      projects.map((p) => (p.id === existing.id ? updated : p))
    );
    return { list: nextList, saved: updated, updatedExisting: true };
  }

  const generatedId =
    params.id ??
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `proj-${now}-${Math.random().toString(36).slice(2, 8)}`);

  const created: SavedProject = {
    id: generatedId,
    name: cleanName,
    createdAt: now,
    updatedAt: now,
    config: cloneProjectConfig(params.config),
    buildPlate: { ...params.buildPlate },
  };
  return {
    list: sortSavedProjects([created, ...projects]),
    saved: created,
    updatedExisting: false,
  };
}

function readLocalStorageProjects(): SavedProject[] {
  try {
    const raw = window.localStorage.getItem(SAVED_PROJECTS_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SerializedSavedProject[];
    if (!Array.isArray(parsed)) return [];
    return sortSavedProjects(parsed.map(deserializeSavedProject));
  } catch {
    return [];
  }
}

function writeLocalStorageProjects(projects: SavedProject[]): void {
  try {
    const serialized = projects.map(serializeSavedProject);
    window.localStorage.setItem(SAVED_PROJECTS_LS_KEY, JSON.stringify(serialized));
  } catch {
    // Ignore quota or restricted storage errors
  }
}

function openProjectsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open DB'));
  });
}

export async function loadAllSavedProjects(): Promise<SavedProject[]> {
  try {
    const db = await openProjectsDb();
    const records = await new Promise<SavedProject[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = ((req.result as SavedProject[] | undefined) ?? []).map((item) => ({
          ...item,
          config: normalizeLoadedConfig(item.config),
        }));
        resolve(sortSavedProjects(list));
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (records.length > 0) {
      return records;
    }
    // Check if localStorage has fallback records to surface
    return readLocalStorageProjects();
  } catch {
    return readLocalStorageProjects();
  }
}

export async function persistSavedProject(project: SavedProject): Promise<void> {
  const currentLs = readLocalStorageProjects();
  const nextLs = sortSavedProjects([
    project,
    ...currentLs.filter((item) => item.id !== project.id),
  ]);
  writeLocalStorageProjects(nextLs);

  try {
    const db = await openProjectsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        ...project,
        config: cloneProjectConfig(project.config),
        buildPlate: { ...project.buildPlate },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // localStorage fallback already written
  }
}

export async function removeSavedProject(projectId: string): Promise<void> {
  const currentLs = readLocalStorageProjects();
  writeLocalStorageProjects(currentLs.filter((item) => item.id !== projectId));

  try {
    const db = await openProjectsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // localStorage fallback already updated
  }
}
