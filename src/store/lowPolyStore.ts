import { create } from 'zustand';
import type { ExtractedSource } from '../pipeline/lowpoly/source';
import type {
  ColorMode,
  LowPolyResult,
  LowPolySettings,
  Rgb,
  WorkerRequest,
  WorkerResponse,
} from '../pipeline/lowpoly/types';

export type ViewMode = 'original' | 'lowpoly' | 'split';

const DEBOUNCE_MS = 250;
export const DEFAULT_SETTINGS: LowPolySettings = {
  targetTriangles: 800,
  colorMode: 'palette',
  paletteSize: 8,
  lockBorders: false,
};

interface LowPolyState {
  source: ExtractedSource | null;
  settings: LowPolySettings;
  /** Processing only starts once the Low poly step has been opened. */
  enabled: boolean;
  busy: boolean;
  stage: string;
  error: string;
  result: LowPolyResult | null;
  /** Mode the current result was made with (settings may have moved on). */
  resultMode: ColorMode;
  /** Editable copy of the palette. */
  palette: Rgb[] | null;
  paletteVersion: number;
  view: ViewMode;

  enable: () => void;
  setSource: (source: ExtractedSource | null) => void;
  update: (patch: Partial<LowPolySettings>) => void;
  setPaletteColor: (index: number, color: Rgb) => void;
  setView: (view: ViewMode) => void;
}

// ---- job runner: debounced, and cancelled by restarting the worker ------------

let worker: Worker | null = null;
let timer: number | undefined;
let jobId = 0;

function killWorker() {
  worker?.terminate();
  worker = null;
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/lowpoly.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return worker;
}

export const useLowPolyStore = create<LowPolyState>((set, get) => {
  function run() {
    const { source, settings, enabled } = get();
    if (!source || !enabled) return;
    // A newer request replaces whatever is running: stop it by restarting the worker.
    if (get().busy) killWorker();
    const id = ++jobId;
    set({ busy: true, stage: 'Starting', error: '' });
    const w = getWorker();
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') {
        set({ stage: msg.stage });
        return;
      }
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (msg.type === 'done') {
        set({
          busy: false,
          result: msg.result,
          resultMode: settings.colorMode,
          palette: msg.result.palette ? msg.result.palette.map((c) => [...c] as Rgb) : null,
          paletteVersion: get().paletteVersion + 1,
        });
      } else {
        console.warn('[low poly]', msg.message);
        set({
          busy: false,
          error:
            'Could not make this model low poly. Try a different detail level or another model.',
        });
      }
    };
    const onError = (e: ErrorEvent) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      console.warn('[low poly]', e.message);
      killWorker();
      set({ busy: false, error: 'The low-poly worker stopped unexpectedly. Try again.' });
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    // The source stays in the store, so send a copy and keep the original arrays.
    w.postMessage({ type: 'run', id, source: source.data, settings } satisfies WorkerRequest);
  }

  function schedule(immediate = false) {
    window.clearTimeout(timer);
    if (immediate) run();
    else timer = window.setTimeout(run, DEBOUNCE_MS);
  }

  return {
    source: null,
    settings: DEFAULT_SETTINGS,
    enabled: false,
    busy: false,
    stage: '',
    error: '',
    result: null,
    resultMode: DEFAULT_SETTINGS.colorMode,
    palette: null,
    paletteVersion: 0,
    view: 'split',

    enable: () => {
      if (get().enabled) return;
      set({ enabled: true });
      schedule(true);
    },

    setSource: (source) => {
      window.clearTimeout(timer);
      killWorker();
      jobId++;
      set({ source, result: null, palette: null, busy: false, error: '', stage: '' });
      if (source) schedule(true);
    },

    update: (patch) => {
      set({ settings: { ...get().settings, ...patch } });
      schedule();
    },

    setPaletteColor: (index, color) => {
      const palette = get().palette;
      if (!palette) return;
      const next = palette.slice();
      next[index] = color;
      set({ palette: next, paletteVersion: get().paletteVersion + 1 });
    },

    setView: (view) => set({ view }),
  };
});
