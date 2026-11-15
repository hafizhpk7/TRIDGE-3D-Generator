import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { Button, Chip, IconButton, useToast } from '../design/components';
import { ViewerEngine } from './ViewerEngine';
import { formatBytes, formatCount, isSupportedModel, type ModelStats } from './helpers';
import {
  loadModelFromBuffer,
  loadModelFromFile,
  loadModelFromUrl,
  type LoadedModel,
} from './loadModel';
import { useModelStore } from '../store/modelStore';
import { useLowPolyStore } from '../store/lowPolyStore';
import { applyPalette, buildProcessed } from '../pipeline/lowpoly/build';
import { extractSource } from '../pipeline/lowpoly/source';
import { Confetti } from './Confetti';
import { useCraftStore, useCraftUi } from '../craft/store';
import { useCraftViewer } from '../craft/useCraftViewer';
import './ViewerPanel.css';

const SAMPLE_URL = './models/sample.glb';
const SAMPLE_NAME = 'sample.glb';

const BACKGROUNDS = [
  { id: 'default', label: 'Default', css: null },
  { id: 'yellow', label: 'Yellow', css: 'var(--yellow)' },
  { id: 'mint', label: 'Mint', css: 'var(--mint)' },
  { id: 'sky', label: 'Sky', css: 'var(--sky)' },
  { id: 'pink', label: 'Pink', css: 'var(--pink)' },
  { id: 'violet', label: 'Violet', css: 'var(--violet)' },
] as const;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function ViewerPanel() {
  const toast = useToast();
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ViewerEngine | null>(null);
  const loadToken = useRef(0);
  const dragDepth = useRef(0);
  const dividerDrag = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [reducedMotion] = useState(prefersReducedMotion);
  const [autoRotate, setAutoRotate] = useState(!reducedMotion);
  const [wireframe, setWireframe] = useState(false);
  const [flat, setFlat] = useState(false);
  const [bg, setBg] = useState<(typeof BACKGROUNDS)[number]['id']>('default');
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [modelName, setModelName] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [burst, setBurst] = useState(0);
  const [badge, setBadge] = useState('');
  const pending = useModelStore((s) => s.pending);
  const [split, setSplit] = useState(0.5);
  const result = useLowPolyStore((s) => s.result);
  const resultMode = useLowPolyStore((s) => s.resultMode);
  const palette = useLowPolyStore((s) => s.palette);
  const paletteVersion = useLowPolyStore((s) => s.paletteVersion);
  const view = useLowPolyStore((s) => s.view);
  // Flat-shaded meshes are not indexed, so every triangle has its own three vertices.
  const processedStats = result
    ? { triangles: result.triangles, vertices: result.triangles * 3 }
    : null;

  const show = useCallback((loaded: LoadedModel) => {
    const engine = engineRef.current;
    if (!engine) return;
    // A regular model replaces any Craft model.
    useCraftStore.getState().clear();
    useCraftUi.getState().setPreview(false);
    engine.setHighlight(null);
    engine.setGizmo(null);
    engine.setModel(loaded.object, loaded.bytes);
    setStats(engine.getStats());
    setModelName(loaded.name);
    setBadge(loaded.badge ?? '');
    // Hand the new model to the low-poly pipeline (it only starts working once that step is open).
    useLowPolyStore.getState().setSource(extractSource(loaded.object));
  }, []);

  // Craft models are built by their own store and shown here.
  const craft = useCraftViewer(engineRef, {
    onShown: ({ stats: craftStats, name }) => {
      setStats(craftStats);
      setModelName(name);
      setBadge('Craft');
    },
  });

  const invalidateLoads = useCallback(() => {
    loadToken.current++;
  }, []);

  /** Run a load; if a newer load starts meanwhile, drop this result and free it. */
  const runLoad = useCallback(
    async (task: () => Promise<LoadedModel>) => {
      const token = ++loadToken.current;
      setLoading(true);
      try {
        const loaded = await task();
        if (token !== loadToken.current || !engineRef.current) return;
        show(loaded);
      } catch (e) {
        if (token === loadToken.current) {
          toast.show(e instanceof Error ? e.message : 'Could not open that file.', 'error');
        }
      } finally {
        if (token === loadToken.current) setLoading(false);
      }
    },
    [show, toast],
  );

  const loadSample = useCallback(
    () => runLoad(() => loadModelFromUrl(SAMPLE_URL, SAMPLE_NAME)),
    [runLoad],
  );

  const openFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!isSupportedModel(file.name)) {
        toast.show(`${file.name} isn't a supported file. Use .glb, .gltf or .obj.`, 'error');
        return;
      }
      void runLoad(() => loadModelFromFile(file));
    },
    [runLoad, toast],
  );

  // Create the engine once, load the sample, tear everything down on unmount.
  useEffect(() => {
    const container = stageRef.current;
    if (!container) return;
    let engine: ViewerEngine;
    try {
      engine = new ViewerEngine(container);
    } catch {
      toast.show(
        'Your browser could not start 3D graphics. Try turning on hardware acceleration.',
        'error',
      );
      return;
    }
    engineRef.current = engine;
    engine.setAutoRotate(!reducedMotion);
    engine.start();
    // Deferred so React finishes mounting first (and StrictMode's first pass is cancelled).
    const startTimer = window.setTimeout(() => void loadSample(), 0);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__tridgeViewer = { engine, loadSample, show };
    }

    return () => {
      window.clearTimeout(startTimer);
      invalidateLoads();
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause rendering while the tab is hidden.
  useEffect(() => {
    const onVis = () => {
      const engine = engineRef.current;
      if (!engine) return;
      if (document.hidden) engine.stop();
      else engine.start();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Show the low-poly result next to the original.
  useEffect(() => {
    const engine = engineRef.current;
    const source = useLowPolyStore.getState().source;
    if (!engine) return;
    if (!result || !source) {
      engine.setProcessed(null);
      return;
    }
    engine.setProcessed(buildProcessed(source, result, resultMode));
  }, [result, resultMode]);

  // Palette swatch edits recolor the existing mesh without another worker run.
  useEffect(() => {
    const engine = engineRef.current;
    const group = engine?.getProcessedObject();
    if (!group || !result || !palette || resultMode !== 'palette') return;
    applyPalette(group, result, palette);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteVersion]);

  useEffect(() => {
    engineRef.current?.setViewMode(result ? view : 'original');
  }, [view, result]);

  useEffect(() => {
    engineRef.current?.setSplitRatio(split);
  }, [split]);

  // Show models handed over by other parts of the app (for example a finished generation).
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      void runLoad(async () => {
        const loaded: LoadedModel = pending.object
          ? { object: pending.object, bytes: 0, name: pending.name, badge: pending.badge }
          : await loadModelFromBuffer(await pending.blob!.arrayBuffer(), pending.name);
        if (pending.celebrate) setBurst((n) => n + 1);
        return loaded;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pending, runLoad]);

  const toggleAutoRotate = () => {
    const next = !autoRotate;
    setAutoRotate(next);
    engineRef.current?.setAutoRotate(next);
  };
  const toggleWireframe = () => {
    const next = !wireframe;
    setWireframe(next);
    engineRef.current?.setWireframe(next);
  };
  const toggleFlat = () => {
    const next = !flat;
    setFlat(next);
    engineRef.current?.setFlatShading(next);
  };

  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    openFile(e.dataTransfer.files[0]);
  };

  const bgCss = BACKGROUNDS.find((b) => b.id === bg)?.css ?? null;

  return (
    <section className="viewer" aria-label="3D viewer">
      <div
        className={`viewer__stage ${dragging ? 'viewer__stage--drag' : ''}`}
        style={bgCss ? { background: bgCss } : undefined}
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onPointerDown={craft.onPointerDown}
        onPointerUp={craft.onPointerUp}
      >
        <div ref={stageRef} className="viewer__canvas" />
        <Confetti burst={burst} />
        {result && view === 'split' && (
          <>
            <span className="viewer__tag viewer__tag--left">Original</span>
            <span className="viewer__tag viewer__tag--right">Low poly</span>
            <div
              className="divider"
              style={{ left: `${split * 100}%` }}
              role="slider"
              tabIndex={0}
              aria-label="Before and after divider"
              aria-orientation="horizontal"
              aria-valuemin={5}
              aria-valuemax={95}
              aria-valuenow={Math.round(split * 100)}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                dividerDrag.current = true;
              }}
              onPointerMove={(e) => {
                if (!dividerDrag.current) return;
                const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                setSplit(Math.min(0.95, Math.max(0.05, (e.clientX - rect.left) / rect.width)));
              }}
              onPointerUp={() => {
                dividerDrag.current = false;
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') setSplit((v) => Math.max(0.05, v - 0.05));
                if (e.key === 'ArrowRight') setSplit((v) => Math.min(0.95, v + 0.05));
              }}
            >
              <span className="divider__grip" aria-hidden="true">
                ⇆
              </span>
            </div>
          </>
        )}
        {loading && <div className="viewer__loading">Loading model…</div>}
        {dragging && <div className="viewer__drop">Drop a .glb, .gltf or .obj file</div>}
      </div>

      <div className="viewer__controls">
        <div className="viewer__group" role="group" aria-label="View">
          <IconButton
            label={reducedMotion ? 'Auto-rotate is off (reduced motion)' : 'Auto-rotate'}
            aria-pressed={autoRotate}
            disabled={reducedMotion}
            onClick={toggleAutoRotate}
          >
            ⟳
          </IconButton>
          <IconButton label="Reset view" onClick={() => engineRef.current?.resetView()}>
            ⌖
          </IconButton>
          <IconButton label="Wireframe" aria-pressed={wireframe} onClick={toggleWireframe}>
            ▦
          </IconButton>
          <IconButton
            label={flat ? 'Flat shading (click for smooth)' : 'Smooth shading (click for flat)'}
            aria-pressed={flat}
            onClick={toggleFlat}
          >
            ◆
          </IconButton>
        </div>

        <div className="viewer__group" role="group" aria-label="Background color">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              type="button"
              className="swatch"
              aria-label={`${b.label} background`}
              aria-pressed={bg === b.id}
              style={{ '--swatch': b.css ?? 'var(--surface)' } as CSSProperties}
              onClick={() => setBg(b.id)}
            />
          ))}
        </div>

        <div className="viewer__group">
          <Button variant="ghost" onClick={() => fileInput.current?.click()}>
            Open file
          </Button>
          <Button variant="ghost" onClick={() => void loadSample()}>
            Load sample
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".glb,.gltf,.obj"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              openFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="viewer__stats" role="status" aria-live="polite">
        {stats ? (
          <>
            <Chip color="violet">{modelName}</Chip>
            {badge && <Chip color="orange">{badge}</Chip>}
            <Chip color="mint">
              {formatCount(stats.triangles)} triangles
              {processedStats && ` → ${formatCount(processedStats.triangles)} low poly`}
            </Chip>
            <Chip color="sky">
              {formatCount(stats.vertices)} vertices
              {processedStats && ` → ${formatCount(processedStats.vertices)}`}
            </Chip>
            {stats.bytes > 0 && <Chip color="yellow">{formatBytes(stats.bytes)}</Chip>}
          </>
        ) : (
          <Chip color="violet">{loading ? 'Loading…' : 'No model yet'}</Chip>
        )}
      </div>
    </section>
  );
}
