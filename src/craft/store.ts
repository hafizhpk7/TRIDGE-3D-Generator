import { create } from 'zustand';
import { buildInWorker } from './builder/client';
import type { BuiltCraft } from './builder/build';
import {
  clone,
  emptyHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
} from './editor/ops';
import type { Params, Template } from './templates/helpers';
import { buildTemplateSpec, getTemplate } from './templates';
import type { ShapeSpec } from './spec/types';

export type CraftSource = 'template' | 'claude' | 'file' | 'edited';

export interface Version {
  label: string;
  spec: ShapeSpec;
  at: number;
}

const BUILD_DEBOUNCE_MS = 60;
const VERSION_LIMIT = 20;

interface CraftState {
  spec: ShapeSpec | null;
  source: CraftSource | null;
  templateId: string | null;
  templateParams: Params;
  /** 1 (chunky) to 10 (smooth). */
  detail: number;
  softJoints: boolean;
  /** Part id as it exists in the spec (never a generated twin). */
  selectedId: string | null;
  history: History<ShapeSpec>;
  versions: Version[];
  warnings: string[];
  built: BuiltCraft | null;
  /** Bumps whenever a different model is loaded (as opposed to an edit), so the viewer can reset its camera. */
  epoch: number;
  /** The epoch `built` belongs to. */
  builtEpoch: number;
  building: boolean;
  buildError: string;

  loadTemplate: (id: string, params?: Params) => void;
  setTemplateParams: (patch: Params) => void;
  loadSpec: (spec: ShapeSpec, source: CraftSource, label: string, warnings?: string[]) => void;
  /** Change the spec by hand. `record` false is for the middle of a drag. */
  edit: (next: ShapeSpec, opts?: { record?: boolean }) => void;
  /** Push a history entry for edits that were applied with record: false. */
  commit: (before: ShapeSpec) => void;
  undo: () => void;
  redo: () => void;
  restoreVersion: (index: number) => void;
  setDetail: (n: number) => void;
  setSoftJoints: (v: boolean) => void;
  select: (id: string | null) => void;
  clear: () => void;
}

let timer: number | undefined;
let latest = 0;

export const useCraftStore = create<CraftState>((set, get) => {
  function scheduleBuild(immediate = false) {
    window.clearTimeout(timer);
    const run = () => {
      const { spec, detail, softJoints, epoch } = get();
      if (!spec) return;
      set({ building: true });
      const { id, result } = buildInWorker(clone(spec), { detail, softJoints });
      latest = id;
      result.then(
        (built) => {
          if (id !== latest) return; // a newer build is on its way
          set({ built, builtEpoch: epoch, building: false, buildError: '' });
        },
        (e: unknown) => {
          if (id !== latest) return;
          console.warn('[craft build]', e);
          set({
            building: false,
            buildError: 'Could not build this model. Try undoing the last change.',
          });
        },
      );
    };
    if (immediate) run();
    else timer = window.setTimeout(run, BUILD_DEBOUNCE_MS);
  }

  function install(spec: ShapeSpec, source: CraftSource, label: string, warnings: string[]) {
    const s = get();
    const versions = [...s.versions, { label, spec: clone(spec), at: Date.now() }].slice(
      -VERSION_LIMIT,
    );
    set({
      spec,
      source,
      warnings,
      selectedId: null,
      history: emptyHistory(),
      versions,
      epoch: s.epoch + 1,
    });
    scheduleBuild(true);
  }

  return {
    spec: null,
    source: null,
    templateId: null,
    templateParams: {},
    detail: 5,
    softJoints: true,
    selectedId: null,
    history: emptyHistory(),
    versions: [],
    warnings: [],
    built: null,
    epoch: 0,
    builtEpoch: 0,
    building: false,
    buildError: '',

    loadTemplate: (id, params) => {
      const t: Template | undefined = getTemplate(id);
      if (!t) return;
      const merged = { ...t.defaults, ...(params ?? {}) };
      set({ templateId: id, templateParams: merged });
      install(buildTemplateSpec(t, merged), 'template', t.name, []);
    },

    setTemplateParams: (patch) => {
      const { templateId, templateParams, spec } = get();
      const t = templateId ? getTemplate(templateId) : undefined;
      if (!t || !spec) return;
      const merged = { ...templateParams, ...patch };
      // Sliders keep the same model identity: no camera reset, no history.
      set({ templateParams: merged, spec: buildTemplateSpec(t, merged), selectedId: null });
      scheduleBuild();
    },

    loadSpec: (spec, source, label, warnings = []) => {
      set({ templateId: null, templateParams: {} });
      install(spec, source, label, warnings);
    },

    edit: (next, opts = {}) => {
      const { spec, history, source } = get();
      if (!spec) return;
      const record = opts.record ?? true;
      set({
        spec: next,
        // Hand edits detach the model from the template sliders, which would overwrite them.
        templateId: null,
        source: source === 'template' ? 'edited' : source,
        ...(record ? { history: pushHistory(history, spec) } : {}),
      });
      scheduleBuild();
    },

    commit: (before) => {
      const { history } = get();
      set({ history: pushHistory(history, before) });
    },

    undo: () => {
      const { spec, history } = get();
      if (!spec) return;
      const step = undoHistory(history, spec);
      if (!step) return;
      set({ spec: step.value, history: step.history });
      scheduleBuild();
    },

    redo: () => {
      const { spec, history } = get();
      if (!spec) return;
      const step = redoHistory(history, spec);
      if (!step) return;
      set({ spec: step.value, history: step.history });
      scheduleBuild();
    },

    restoreVersion: (index) => {
      const v = get().versions[index];
      if (!v) return;
      const { spec, history } = get();
      set({
        spec: clone(v.spec),
        templateId: null,
        selectedId: null,
        history: spec ? pushHistory(history, spec) : history,
      });
      scheduleBuild();
    },

    setDetail: (detail) => {
      set({ detail: Math.min(10, Math.max(1, Math.round(detail))) });
      scheduleBuild();
    },

    setSoftJoints: (softJoints) => {
      set({ softJoints });
      scheduleBuild();
    },

    select: (selectedId) => set({ selectedId }),

    clear: () => {
      window.clearTimeout(timer);
      latest = 0;
      set({
        spec: null,
        source: null,
        templateId: null,
        templateParams: {},
        selectedId: null,
        history: emptyHistory(),
        warnings: [],
        built: null,
        building: false,
        buildError: '',
      });
    },
  };
});

export type GizmoMode = 'translate' | 'rotate' | 'scale';

interface CraftUiState {
  /** The Edit tab is open: parts can be picked and moved. */
  editMode: boolean;
  gizmoMode: GizmoMode;
  snap: boolean;
  /** The movement preview is running. */
  preview: boolean;
  setEditMode: (v: boolean) => void;
  setGizmoMode: (m: GizmoMode) => void;
  setSnap: (v: boolean) => void;
  setPreview: (v: boolean) => void;
}

/** View settings for Craft mode. These are not part of the model, so they are not undoable. */
export const useCraftUi = create<CraftUiState>((set) => ({
  editMode: false,
  gizmoMode: 'translate',
  snap: false,
  preview: false,
  setEditMode: (editMode) => set(editMode ? { editMode, preview: false } : { editMode }),
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),
  setSnap: (snap) => set({ snap }),
  setPreview: (preview) => set(preview ? { preview, editMode: false } : { preview }),
}));
