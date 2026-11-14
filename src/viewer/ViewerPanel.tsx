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
import { Confetti } from './Confetti';
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
  const pending = useModelStore((s) => s.pending);

  const show = useCallback((loaded: LoadedModel) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setModel(loaded.object, loaded.bytes);
    setStats(engine.getStats());
    setModelName(loaded.name);
  }, []);

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
      (window as unknown as Record<string, unknown>).__tridgeViewer = { engine, loadSample };
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

  // Show models handed over by other parts of the app (for example a finished generation).
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      void runLoad(async () => {
        const loaded = await loadModelFromBuffer(await pending.blob.arrayBuffer(), pending.name);
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
      >
        <div ref={stageRef} className="viewer__canvas" />
        <Confetti burst={burst} />
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
            <Chip color="mint">{formatCount(stats.triangles)} triangles</Chip>
            <Chip color="sky">{formatCount(stats.vertices)} vertices</Chip>
            <Chip color="yellow">{formatBytes(stats.bytes)}</Chip>
          </>
        ) : (
          <Chip color="violet">{loading ? 'Loading…' : 'No model yet'}</Chip>
        )}
      </div>
    </section>
  );
}
