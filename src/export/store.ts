import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { sequencer, useAnimStore } from '../animate/store';
import { useCraftStore } from '../craft/store';
import { getEngine } from '../rig/bridge';
import type { ViewerEngine } from '../viewer/ViewerEngine';
import { bakeExportClips } from './bake';
import { downloadBlob, formatBytes, slug } from './download';
import {
  GIF_SIZES,
  IMAGE_SIZES,
  VIDEO_SIZES,
  type GifSize,
  type ImageSize,
  type VideoSize,
} from './estimates';
import { exportGlb, readGlb, type GlbSummary } from './glb';
import { CancelledError, recordWebm, renderGif } from './media';
import { DEFAULT_PRINT, fitToBed, toObj, toStl } from './meshFormats';
import { collectTriangles } from './triangles';

export type ExportKind = 'glb' | 'obj' | 'stl' | 'png' | 'webm' | 'gif' | 'spec';

export interface ExportSettings {
  glbAnimations: boolean;
  heightMm: number;
  zUp: boolean;
  pngSize: ImageSize;
  pngTransparent: boolean;
  videoSize: VideoSize;
  videoTransparent: boolean;
  gifSize: GifSize;
  gifTransparent: boolean;
  fps: number;
  turntable: boolean;
}

interface ExportState extends ExportSettings {
  /** Used in file names. */
  name: string;
  busy: ExportKind | null;
  progress: number;
  /** What happened with each format the last time, shown under its button. */
  results: Partial<Record<ExportKind, { ok: boolean; text: string }>>;
  /** What the last GLB turned out to contain when it was opened again. */
  glbCheck: GlbSummary | null;

  set: (patch: Partial<ExportSettings>) => void;
  setName: (name: string) => void;
  run: (kind: ExportKind) => Promise<void>;
  cancel: () => void;
}

let abort: AbortController | null = null;

const currentName = (): string => slug(useExportStore.getState().name);

/** What the viewer is showing, or a reason there is nothing to export. */
function source(engine: ViewerEngine | null) {
  const src = engine?.getExportSource() ?? null;
  if (!engine || !src)
    throw new Error('There is nothing to export yet. Make or load a model first.');
  return { engine, src };
}

/** Bake the timeline into clips, and put the bones back as they were. */
export function clipsForExport(engine: ViewerEngine, unitScale: number) {
  const steps = useAnimStore.getState().steps;
  const target = engine.getAnimTarget();
  if (!steps.length) return [];
  const saved = target ? sequencer.snapshot() : null;
  try {
    return bakeExportClips(target, steps, { height: engine.getModelHeight(), unitScale });
  } finally {
    if (target && saved) {
      for (const b of target.skeleton.bones) {
        const p = saved[b.name];
        if (!p) continue;
        b.position.set(...p.position);
        b.quaternion.set(...p.quaternion);
      }
    }
  }
}

export const useExportStore: UseBoundStore<StoreApi<ExportState>> = create<ExportState>(
  (set, get) => ({
    glbAnimations: true,
    heightMm: DEFAULT_PRINT.heightMm,
    zUp: DEFAULT_PRINT.zUp,
    pngSize: 'hd',
    pngTransparent: false,
    videoSize: '720',
    videoTransparent: false,
    gifSize: '480',
    gifTransparent: false,
    fps: 30,
    turntable: false,
    name: 'model',
    busy: null,
    progress: 0,
    results: {},
    glbCheck: null,

    set: (patch) => set(patch),
    setName: (name) => set({ name }),
    cancel: () => abort?.abort(),

    run: async (kind): Promise<void> => {
      if (get().busy) return;
      const finish = (text: string, ok = true) =>
        set({ busy: null, progress: 0, results: { ...get().results, [kind]: { ok, text } } });
      set({ busy: kind, progress: 0 });
      abort = new AbortController();
      const s = get();
      const base: string = currentName();
      try {
        if (kind === 'spec') {
          const spec = useCraftStore.getState().spec;
          if (!spec) throw new Error('Only Craft models have a Shape Spec.');
          const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
          downloadBlob(blob, `${base}.shape.json`);
          return finish(`Saved ${base}.shape.json (${formatBytes(blob.size)}).`);
        }

        const { engine, src } = source(getEngine());

        if (kind === 'glb') {
          const clips = s.glbAnimations ? clipsForExport(engine, 1 / src.scale) : [];
          const bytes = await exportGlb(src.root, clips);
          // Open it again the way any viewer would, to be sure the file is sound.
          const { summary } = await readGlb(bytes);
          downloadBlob(new Blob([bytes], { type: 'model/gltf-binary' }), `${base}.glb`);
          set({ glbCheck: summary });
          const anim = summary.animations.length;
          return finish(
            `Saved ${base}.glb (${formatBytes(bytes.byteLength)}). Checked by opening it again: ${summary.bones} bones, ${anim} ${anim === 1 ? 'animation' : 'animations'}.`,
          );
        }

        if (kind === 'obj' || kind === 'stl') {
          const soup = collectTriangles(src.root);
          if (soup.count === 0) throw new Error('The model has no surface to export.');
          const fitted = fitToBed(soup, { heightMm: s.heightMm, zUp: s.zUp });
          if (kind === 'stl') {
            const bytes = toStl(fitted, `TRIDGE ${base}`);
            downloadBlob(new Blob([bytes as BlobPart], { type: 'model/stl' }), `${base}.stl`);
            return finish(`Saved ${base}.stl (${formatBytes(bytes.byteLength)}).`);
          }
          const text = toObj(fitted, soup.colors, base);
          const blob = new Blob([text], { type: 'model/obj' });
          downloadBlob(blob, `${base}.obj`);
          return finish(`Saved ${base}.obj (${formatBytes(blob.size)}).`);
        }

        if (kind === 'png') {
          const maxSide = IMAGE_SIZES.find((x) => x.id === s.pngSize)?.maxSide;
          const blob = await engine.snapshotPng({ maxSide, transparent: s.pngTransparent });
          downloadBlob(blob, `${base}.png`);
          return finish(`Saved ${base}.png (${formatBytes(blob.size)}).`);
        }

        const maxSide =
          kind === 'webm'
            ? (VIDEO_SIZES.find((x) => x.id === s.videoSize)?.maxSide ?? 1280)
            : (GIF_SIZES.find((x) => x.id === s.gifSize)?.maxSide ?? 480);
        const opts = {
          maxSide,
          transparent: kind === 'webm' ? s.videoTransparent : s.gifTransparent,
          fps: kind === 'webm' ? s.fps : 15,
          turntable: s.turntable,
          onProgress: (progress: number) => set({ progress }),
          signal: abort.signal,
        };
        const blob =
          kind === 'webm'
            ? await recordWebm(engine, sequencer, opts)
            : await renderGif(engine, sequencer, opts);
        downloadBlob(blob, `${base}.${kind}`);
        return finish(`Saved ${base}.${kind} (${formatBytes(blob.size)}).`);
      } catch (err) {
        if (err instanceof CancelledError) return finish('Cancelled.', false);
        finish(err instanceof Error ? err.message : 'The export failed.', false);
      } finally {
        abort = null;
      }
    },
  }),
);

// Development only: lets the browser console drive exports.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__tridgeExport = useExportStore;
}
