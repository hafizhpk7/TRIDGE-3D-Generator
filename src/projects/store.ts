import { create } from 'zustand';
import { useAnimStore } from '../animate/store';
import { useShell } from '../app/shellStore';
import { useCraftStore } from '../craft/store';
import { downloadBlob, slug } from '../export/download';
import { DEFAULT_SETTINGS, useLowPolyStore } from '../store/lowPolyStore';
import { useRigStore } from '../rig/store';
import { packProject, unpackProject } from './archive';
import { captureProject } from './capture';
import {
  duplicateProject,
  listProjects,
  loadProject,
  newId,
  removeProject,
  renameProject,
  saveProject,
  storageUsage,
} from './db';
import { restoreProject } from './restore';
import type { ProjectMeta } from './types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_DELAY_MS = 1500;
const SAMPLE_NAME = 'sample.glb';

interface ProjectState {
  currentId: string | null;
  name: string;
  createdAt: number | null;
  /** Nothing is saved until the person has actually done something with the model. */
  touched: boolean;
  /** True while a saved project is being put back, so that does not count as a change. */
  restoring: boolean;
  /** The picture in the input step is where the current model came from. */
  hasImage: boolean;
  /** Set just before a freshly generated model is handed to the viewer. */
  nextWithImage: boolean;
  status: SaveStatus;
  savedAt: number | null;
  error: string;

  projects: ProjectMeta[];
  usage: { usage: number; quota: number } | null;
  persisted: boolean | null;
  loading: boolean;
  message: string;

  /** A different model just appeared: start a new, unsaved project for it. */
  modelLoaded: (name: string) => void;
  /** Something changed that deserves saving. */
  touch: () => void;
  saveNow: () => Promise<void>;
  refresh: () => Promise<void>;
  open: (id: string) => Promise<boolean>;
  rename: (id: string, name: string) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  exportFile: (id: string) => Promise<void>;
  importFile: (file: File) => Promise<void>;
}

let timer: number | undefined;
let saving = false;
let saveAgain = false;

const stripExt = (n: string) => n.replace(/\.[a-z0-9]{2,5}$/i, '') || 'Untitled';

function friendly(err: unknown): string {
  if (err instanceof DOMException && err.name === 'QuotaExceededError')
    return 'Your browser storage is full. Delete some projects to make room.';
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const scheduleSave = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void get().saveNow(), SAVE_DELAY_MS);
  };

  return {
    currentId: null,
    name: 'Untitled',
    createdAt: null,
    touched: false,
    restoring: false,
    hasImage: false,
    nextWithImage: false,
    status: 'idle',
    savedAt: null,
    error: '',

    projects: [],
    usage: null,
    persisted: null,
    loading: false,
    message: '',

    modelLoaded: (name) => {
      if (get().restoring) return;
      window.clearTimeout(timer);
      const withImage = get().nextWithImage;
      set({
        currentId: null,
        createdAt: null,
        name: stripExt(name),
        touched: name !== SAMPLE_NAME,
        hasImage: withImage,
        nextWithImage: false,
        status: 'idle',
        error: '',
      });
      if (get().touched) scheduleSave();
    },

    touch: () => {
      if (get().restoring) return;
      // a model that was never touched (the starter sample) is not worth a gallery entry
      if (!get().touched && !workWasDone()) return;
      set({ touched: true });
      scheduleSave();
    },

    saveNow: async () => {
      const s = get();
      if (!s.touched || s.restoring) return;
      if (saving) {
        saveAgain = true;
        return;
      }
      saving = true;
      set({ status: 'saving', error: '' });
      try {
        const id = s.currentId ?? newId();
        const createdAt = s.createdAt ?? Date.now();
        const project = await captureProject({
          id,
          name: get().name,
          createdAt,
          step: useShell.getState().step,
          hasImage: get().hasImage,
        });
        await saveProject(project);
        set({
          currentId: id,
          createdAt,
          status: 'saved',
          savedAt: project.meta.updatedAt,
        });
        if (get().persisted === null) {
          void navigator.storage?.persist?.().then(
            (p) => set({ persisted: p }),
            () => set({ persisted: false }),
          );
        }
        if (useShell.getState().galleryOpen) void get().refresh();
      } catch (err) {
        set({ status: 'error', error: friendly(err) });
      } finally {
        saving = false;
        if (saveAgain) {
          saveAgain = false;
          scheduleSave();
        }
      }
    },

    refresh: async () => {
      try {
        const [projects, usage] = await Promise.all([listProjects(), storageUsage()]);
        set({ projects, usage });
      } catch (err) {
        set({ message: friendly(err) });
      }
    },

    open: async (id) => {
      set({ loading: true, message: '' });
      window.clearTimeout(timer);
      try {
        const p = await loadProject(id);
        if (!p) throw new Error('That project could not be found.');
        set({
          restoring: true,
          currentId: p.meta.id,
          createdAt: p.meta.createdAt,
          name: p.meta.name,
          hasImage: Boolean(p.data.image),
        });
        await restoreProject(p.data);
        useShell.getState().setStep(p.data.step);
        set({ touched: true, status: 'saved', savedAt: p.meta.updatedAt });
        return true;
      } catch (err) {
        set({ message: friendly(err) });
        return false;
      } finally {
        set({ restoring: false, loading: false });
      }
    },

    rename: async (id, name) => {
      const clean = name.trim();
      if (!clean) return;
      await renameProject(id, clean);
      if (get().currentId === id) set({ name: clean });
      await get().refresh();
    },

    duplicate: async (id) => {
      try {
        await duplicateProject(id);
      } catch (err) {
        set({ message: friendly(err) });
      }
      await get().refresh();
    },

    remove: async (id) => {
      await removeProject(id);
      // deleting the project that is open leaves its work on screen as a new, unsaved one
      if (get().currentId === id) {
        window.clearTimeout(timer);
        set({ currentId: null, createdAt: null, touched: false, status: 'idle' });
      }
      await get().refresh();
    },

    exportFile: async (id) => {
      try {
        const p = await loadProject(id);
        if (!p) throw new Error('That project could not be found.');
        const bytes = packProject(p);
        downloadBlob(
          new Blob([bytes as BlobPart], { type: 'application/zip' }),
          `${slug(p.meta.name)}.tridge`,
        );
        set({ message: `Saved ${slug(p.meta.name)}.tridge.` });
      } catch (err) {
        set({ message: friendly(err) });
      }
    },

    importFile: async (file) => {
      try {
        const project = unpackProject(new Uint8Array(await file.arrayBuffer()));
        await saveProject(project);
        set({ message: `Added "${project.meta.name}" to your projects.` });
      } catch (err) {
        set({ message: friendly(err) });
      }
      await get().refresh();
    },
  };
});

/** Anything about the current model that proves the person worked on it. */
function workWasDone(): boolean {
  const lp = useLowPolyStore.getState();
  const rig = useRigStore.getState();
  const anim = useAnimStore.getState();
  return (
    lp.settings !== DEFAULT_SETTINGS ||
    rig.status !== 'idle' ||
    anim.steps.length > 0 ||
    anim.poses.length > 0
  );
}

/**
 * Save automatically a moment after anything changes: low-poly settings, the rig, the animation timeline,
 * the Craft shape, the open step. Returns a function that stops it.
 */
export function startAutosave(): () => void {
  const touch = () => useProjectStore.getState().touch();
  const stops = [
    useShell.subscribe((s, p) => {
      if (s.step !== p.step) touch();
    }),
    useLowPolyStore.subscribe((s, p) => {
      if (s.settings !== p.settings || s.paletteVersion !== p.paletteVersion || s.view !== p.view)
        touch();
    }),
    useRigStore.subscribe((s, p) => {
      if (s.status !== p.status || s.joints !== p.joints || s.mirror !== p.mirror) touch();
    }),
    useAnimStore.subscribe((s, p) => {
      if (s.steps !== p.steps || s.poses !== p.poses || s.speed !== p.speed || s.loop !== p.loop)
        touch();
    }),
    useCraftStore.subscribe((s, p) => {
      const ps = useProjectStore.getState();
      if (ps.restoring || !s.spec) return;
      if (s.epoch !== p.epoch) {
        // a different Craft model: its own project
        ps.modelLoaded(s.spec.name);
      } else if (s.spec !== p.spec || s.detail !== p.detail || s.softJoints !== p.softJoints) {
        touch();
      }
    }),
  ];
  return () => stops.forEach((s) => s());
}

// Development only: lets the browser console drive projects.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__tridgeProjects = useProjectStore;
}
