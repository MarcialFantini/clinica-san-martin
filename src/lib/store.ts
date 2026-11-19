// Single source of truth for the app. Every view reads from here and re-renders on change.
// Persisted in localStorage, except in showcase mode, which always starts clean and never saves.
import { createInitialState, STATE_VERSION } from '../data/seed';
import type { AppState, SimEvent } from './types';

const KEY = 'csm-recepta-state';
const SAVE_DELAY = 1200;

type Listener = (state: AppState) => void;
type EventListener = (event: SimEvent) => void;

let state: AppState | null = null;
let persist = true;
let saveTimer: number | undefined;
let notifyQueued = false;
const listeners = new Set<Listener>();
const eventListeners = new Set<EventListener>();

function isValid(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<AppState>;
  return v.version === STATE_VERSION && Array.isArray(v.patients) && Array.isArray(v.flows) && typeof v.clock === 'number';
}

function load(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function save(): void {
  if (!persist || !state) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the demo keeps working in memory.
  }
}

export interface StoreOptions {
  showcase: boolean;
  reducedMotion: boolean;
}

export function initStore(opts: StoreOptions): AppState {
  if (state) return state;
  persist = !opts.showcase;
  state = (persist ? load() : null) ?? createInitialState();
  if (opts.showcase) state.sim = { paused: false, speed: 10 };
  else if (opts.reducedMotion) state.sim.paused = true;
  if (persist) {
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
    });
  }
  return state;
}

export function getState(): AppState {
  if (!state) throw new Error('Store not initialised');
  return state;
}

export const isPersistent = (): boolean => persist;

function queueNotify(): void {
  if (notifyQueued) return;
  notifyQueued = true;
  requestAnimationFrame(() => {
    notifyQueued = false;
    if (!state) return;
    for (const fn of listeners) fn(state);
  });
}

function queueSave(): void {
  if (!persist) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, SAVE_DELAY);
}

/** Applies a change, then notifies views (once per frame) and schedules a save. */
export function mutate(fn: (s: AppState) => void | SimEvent[], extra: SimEvent[] = []): void {
  const s = getState();
  const events = fn(s) ?? [];
  for (const e of [...events, ...extra]) emit(e);
  queueNotify();
  queueSave();
}

export function emit(event: SimEvent): void {
  for (const fn of eventListeners) fn(event);
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onEvent(fn: EventListener): () => void {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}

export function resetDemo(): void {
  const fresh = createInitialState();
  if (state) fresh.sim = { ...state.sim, paused: false };
  state = fresh;
  save();
  emit({ type: 'reset' });
  queueNotify();
}
