import type { BuildPlateSize, ProjectConfig } from '../types/project';

export interface StudioSnapshot {
  config: ProjectConfig;
  buildPlate: BuildPlateSize;
}

export interface HistoryState {
  past: StudioSnapshot[];
  present: StudioSnapshot;
  future: StudioSnapshot[];
  lastMergeKey: string | null;
  lastCommitAt: number;
}

export interface CommitHistoryOptions {
  mergeKey?: string | null;
  timestamp?: number;
  mergeWindowMs?: number;
  maxHistory?: number;
}

export const DEFAULT_MAX_HISTORY = 60;
export const DEFAULT_MERGE_WINDOW_MS = 800;

export function areBuildPlatesEqual(a: BuildPlateSize, b: BuildPlateSize): boolean {
  if (a === b) return true;
  return (
    a.presetId === b.presetId &&
    a.label === b.label &&
    a.widthMm === b.widthMm &&
    a.depthMm === b.depthMm &&
    a.heightMm === b.heightMm
  );
}

export function areProjectConfigsEqual(a: ProjectConfig, b: ProjectConfig): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof ProjectConfig)[];
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

export function areSnapshotsEqual(a: StudioSnapshot, b: StudioSnapshot): boolean {
  if (a === b) return true;
  return (
    areProjectConfigsEqual(a.config, b.config) &&
    areBuildPlatesEqual(a.buildPlate, b.buildPlate)
  );
}

export function createHistoryState(initial: StudioSnapshot): HistoryState {
  return {
    past: [],
    present: initial,
    future: [],
    lastMergeKey: null,
    lastCommitAt: 0,
  };
}

export function inferConfigMergeKey(patch: Partial<ProjectConfig>): string | null {
  const keys = Object.keys(patch) as (keyof ProjectConfig)[];
  if (keys.length !== 1) return null;
  const onlyKey = keys[0];
  switch (onlyKey) {
    case 'text':
    case 'subtitle':
    case 'monogramInitial':
    case 'monogramNamePos':
    case 'boxLetterBorderMm':
    case 'svgBorderMm':
    case 'keyringHoleMm':
    case 'imageThreshold':
    case 'textScale':
      return `config:${onlyKey}`;
    default:
      return null;
  }
}

export function commitHistory(
  state: HistoryState,
  nextPresent: StudioSnapshot,
  options: CommitHistoryOptions = {}
): HistoryState {
  if (areSnapshotsEqual(state.present, nextPresent)) {
    return state;
  }

  const mergeKey = options.mergeKey ?? null;
  const timestamp = options.timestamp ?? Date.now();
  const mergeWindowMs = options.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS;
  const maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY;

  const canCoalesce =
    mergeKey !== null &&
    state.lastMergeKey === mergeKey &&
    timestamp - state.lastCommitAt <= mergeWindowMs &&
    state.past.length > 0;

  if (canCoalesce) {
    const previousEntry = state.past[state.past.length - 1];
    // If continuous drag/edit returned exactly to the pre-burst snapshot, pop the redundant base entry
    if (areSnapshotsEqual(previousEntry, nextPresent)) {
      return {
        past: state.past.slice(0, -1),
        present: nextPresent,
        future: [],
        lastMergeKey: null,
        lastCommitAt: 0,
      };
    }

    return {
      past: state.past,
      present: nextPresent,
      future: [],
      lastMergeKey: mergeKey,
      lastCommitAt: timestamp,
    };
  }

  const nextPast = [...state.past, state.present];
  if (nextPast.length > maxHistory) {
    nextPast.splice(0, nextPast.length - maxHistory);
  }

  return {
    past: nextPast,
    present: nextPresent,
    future: [],
    lastMergeKey: mergeKey,
    lastCommitAt: timestamp,
  };
}

export function undoHistory(state: HistoryState): HistoryState {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  const nextPast = state.past.slice(0, -1);
  const nextFuture = [state.present, ...state.future].slice(0, DEFAULT_MAX_HISTORY);

  return {
    past: nextPast,
    present: previous,
    future: nextFuture,
    lastMergeKey: null,
    lastCommitAt: 0,
  };
}

export function redoHistory(state: HistoryState): HistoryState {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  const nextFuture = state.future.slice(1);
  const nextPast = [...state.past, state.present];
  if (nextPast.length > DEFAULT_MAX_HISTORY) {
    nextPast.splice(0, nextPast.length - DEFAULT_MAX_HISTORY);
  }

  return {
    past: nextPast,
    present: next,
    future: nextFuture,
    lastMergeKey: null,
    lastCommitAt: 0,
  };
}
