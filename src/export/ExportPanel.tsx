import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Panel, ProgressBar, Slider, Toggle } from '../design/components';
import '../craft/ui/craft.css';
import { useAnimStore } from '../animate/store';
import { useCraftStore } from '../craft/store';
import { getEngine } from '../rig/bridge';
import { formatBytes } from './download';
import {
  GIF_SIZES,
  IMAGE_SIZES,
  VIDEO_SIZES,
  captureDims,
  gifEstimate,
  pngEstimate,
  webmEstimate,
  type GifSize,
  type ImageSize,
  type VideoSize,
} from './estimates';
import { exportGlb } from './glb';
import { MAX_GIF_FRAMES, canRecordVideo, clipLength, pickWebmType } from './media';
import { fitToBed, stlSize, toObj } from './meshFormats';
import { clipsForExport, useExportStore, type ExportKind } from './store';
import { collectTriangles } from './triangles';
import './ExportPanel.css';

interface Info {
  /** "low-poly version", "rigged model" and so on. */
  what: string;
  triangles: number;
  hasSkeleton: boolean;
  clips: number;
  glb: number | null;
  stl: number;
  obj: number;
  view: { w: number; h: number };
}

const WHAT = {
  rigged: 'rigged model',
  lowpoly: 'low-poly version',
  original: 'model',
} as const;

/** Look at what would be exported and measure it. Re-measures when the model or timeline changes. */
function useExportInfo(glbAnimations: boolean): Info | null {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    let alive = true;
    let last = '';
    const tick = async () => {
      await Promise.resolve();
      const engine = getEngine();
      const src = engine?.getExportSource() ?? null;
      const steps = useAnimStore.getState().steps;
      const sig = src
        ? `${src.kind}|${src.root.uuid}|${JSON.stringify(steps)}|${glbAnimations}`
        : '';
      if (engine && alive) {
        // the viewer can be resized without the model changing, so keep the picture sizes current
        const view = engine.getViewSize();
        setInfo((p) => (p && (p.view.w !== view.w || p.view.h !== view.h) ? { ...p, view } : p));
      }
      if (sig === last) return;
      last = sig;
      if (!engine || !src) {
        if (alive) setInfo(null);
        return;
      }
      try {
        const soup = collectTriangles(src.root);
        const fitted = fitToBed(soup, { heightMm: 80, zUp: true });
        const obj = toObj(fitted, soup.colors).length;
        const clips = glbAnimations ? clipsForExport(engine, 1 / src.scale) : [];
        const glb = await exportGlb(src.root, clips).then((b) => b.byteLength);
        let skinned = false;
        src.root.traverse((o) => {
          if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned = true;
        });
        if (alive)
          setInfo({
            what: WHAT[src.kind],
            triangles: soup.count,
            hasSkeleton: skinned,
            clips: clips.length,
            glb,
            stl: stlSize(soup.count),
            obj,
            view: engine.getViewSize(),
          });
      } catch {
        // an estimate failing must never break the panel
        if (alive) setInfo(null);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [glbAnimations]);
  return info;
}

function Card(props: {
  title: string;
  contains: string;
  size?: string;
  children?: ReactNode;
  kind: ExportKind;
  button: string;
  disabled?: boolean;
  note?: string;
  extra?: ReactNode;
}) {
  const busy = useExportStore((s) => s.busy);
  const progress = useExportStore((s) => s.progress);
  const result = useExportStore((s) => s.results[props.kind]);
  const run = useExportStore((s) => s.run);
  const cancel = useExportStore((s) => s.cancel);
  const working = busy === props.kind;
  return (
    <section className="export-card" aria-label={props.title}>
      <div className="export-card__head">
        <h3>{props.title}</h3>
        {props.size && <span className="export-card__size">{props.size}</span>}
      </div>
      <p className="muted">{props.contains}</p>
      {props.children}
      <div className="craft-row">
        <Button disabled={Boolean(busy) || props.disabled} onClick={() => void run(props.kind)}>
          {working ? 'Working…' : props.button}
        </Button>
        {props.extra}
        {working && (props.kind === 'webm' || props.kind === 'gif') && (
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
      {working && (props.kind === 'webm' || props.kind === 'gif') && (
        <ProgressBar label={`Making the ${props.kind}`} value={progress * 100} />
      )}
      {props.note && <p className="muted">{props.note}</p>}
      <div role="status" aria-live="polite">
        {result && <p className={result.ok ? 'export-ok' : 'export-bad'}>{result.text}</p>}
      </div>
    </section>
  );
}

function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="selectfield">
      <label htmlFor={id}>{props.label}</label>
      <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ExportPanel() {
  const s = useExportStore();
  const info = useExportInfo(s.glbAnimations);
  const steps = useAnimStore((a) => a.steps);
  const total = useAnimStore((a) => a.total);
  const speed = useAnimStore((a) => a.speed);
  const isCraft = useCraftStore((c) => c.spec !== null);
  const hasSteps = steps.length > 0;
  const seconds = clipLength(total, speed, hasSteps);

  const png = captureDims(
    info?.view ?? { w: 800, h: 600 },
    IMAGE_SIZES.find((x) => x.id === s.pngSize)?.maxSide,
    Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio),
  );
  const vid = captureDims(
    info?.view ?? { w: 800, h: 600 },
    VIDEO_SIZES.find((x) => x.id === s.videoSize)?.maxSide,
  );
  const gif = captureDims(
    info?.view ?? { w: 800, h: 600 },
    GIF_SIZES.find((x) => x.id === s.gifSize)?.maxSide,
  );
  const gifFrames = Math.max(2, Math.min(MAX_GIF_FRAMES, Math.round(seconds * 15)));
  const videoOk = canRecordVideo() && pickWebmType() !== null;

  if (!info) {
    return (
      <Panel title="Export" accent="sky" className="craft export">
        <p>There is nothing to export yet. Make or load a model, then come back here.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Export" accent="sky" className="craft export">
      <p>
        Exporting the <strong>{info.what}</strong> you see now ({info.triangles.toLocaleString()}{' '}
        triangles
        {info.hasSkeleton ? ', with a skeleton' : ''}).
        {hasSteps
          ? ` Your timeline has ${steps.length} ${steps.length === 1 ? 'move' : 'moves'}.`
          : ''}
      </p>

      <Card
        kind="glb"
        title="3D model (.glb)"
        size={info.glb === null ? 'working it out…' : formatBytes(info.glb)}
        contains={`Mesh and colours${info.hasSkeleton ? ', the skeleton' : ''}${
          s.glbAnimations && info.clips > 0
            ? `, and ${info.clips} animation ${info.clips === 1 ? 'clip' : 'clips'} (your timeline, plus each move on its own)`
            : ''
        }. Opens in Blender, Unity, Godot, three.js and every glTF viewer.`}
        button="Download GLB"
        note={
          hasSteps && !info.hasSkeleton
            ? 'This model has no skeleton, so whole-model motions are saved as movement of the model itself.'
            : undefined
        }
      >
        <Toggle
          label="Include animations"
          checked={s.glbAnimations && hasSteps}
          disabled={!hasSteps}
          onChange={(v) => s.set({ glbAnimations: v })}
        />
        {!hasSteps && <p className="muted">Add moves in the Animate step to include them.</p>}
      </Card>

      <Card
        kind="stl"
        title="3D printing (.stl and .obj)"
        size={`${formatBytes(info.stl)} / ${formatBytes(info.obj)}`}
        contains="The surface only, frozen in its current pose, set on the print bed at the size you choose. The OBJ also carries vertex colours. Neither holds a skeleton or animation."
        button="Download STL"
        extra={
          <Button variant="secondary" disabled={Boolean(s.busy)} onClick={() => void s.run('obj')}>
            Download OBJ
          </Button>
        }
      >
        <Slider
          label="Height"
          value={s.heightMm}
          min={10}
          max={300}
          step={5}
          format={(v) => `${v} mm`}
          onChange={(v) => s.set({ heightMm: v })}
        />
        <Toggle
          label="Z is up (what slicers expect)"
          checked={s.zUp}
          onChange={(v) => s.set({ zUp: v })}
        />
        {s.results.obj && (
          <p className={s.results.obj.ok ? 'export-ok' : 'export-bad'}>{s.results.obj.text}</p>
        )}
      </Card>

      <Card
        kind="png"
        title="Picture (.png)"
        size={`about ${formatBytes(pngEstimate(png.w, png.h))}`}
        contains={`A still of the view as it is now, ${png.w} × ${png.h} pixels.`}
        button="Download PNG"
      >
        <SelectField<ImageSize>
          label="Size"
          value={s.pngSize}
          options={IMAGE_SIZES}
          onChange={(v) => s.set({ pngSize: v })}
        />
        <Toggle
          label="Transparent background"
          checked={s.pngTransparent}
          onChange={(v) => s.set({ pngTransparent: v })}
        />
      </Card>

      <Card
        kind="webm"
        title="Video (.webm)"
        size={videoOk ? `up to ${formatBytes(webmEstimate(vid.w, vid.h, seconds))}` : undefined}
        contains={`${seconds.toFixed(1)} seconds, ${vid.w} × ${vid.h}. ${
          hasSteps
            ? 'Plays your timeline once.'
            : 'The model turns around once, since there is no animation.'
        }`}
        button="Record video"
        disabled={!videoOk}
        note={
          videoOk
            ? 'Recording runs in real time, so keep this tab open and in front. Transparent video works in Chrome and Edge; other browsers may give a solid background.'
            : 'This browser cannot record video. Try Chrome, Edge or Firefox.'
        }
      >
        <SelectField<VideoSize>
          label="Size"
          value={s.videoSize}
          options={VIDEO_SIZES}
          onChange={(v) => s.set({ videoSize: v })}
        />
        <Toggle
          label="Transparent background"
          checked={s.videoTransparent}
          onChange={(v) => s.set({ videoTransparent: v })}
        />
        <Toggle
          label="Turn the model around while it plays"
          checked={s.turntable || !hasSteps}
          disabled={!hasSteps}
          onChange={(v) => s.set({ turntable: v })}
        />
      </Card>

      <Card
        kind="gif"
        title="Animated GIF (.gif)"
        size={`about ${formatBytes(gifEstimate(gif.w, gif.h, gifFrames))}`}
        contains={`${gifFrames} frames, ${gif.w} × ${gif.h}. Works everywhere, but colours are limited to 256 and edges cannot be soft.`}
        button="Make GIF"
      >
        <SelectField<GifSize>
          label="Size"
          value={s.gifSize}
          options={GIF_SIZES}
          onChange={(v) => s.set({ gifSize: v })}
        />
        <Toggle
          label="Transparent background"
          checked={s.gifTransparent}
          onChange={(v) => s.set({ gifTransparent: v })}
        />
      </Card>

      {isCraft && (
        <Card
          kind="spec"
          title="Shape Spec (.json)"
          contains="The recipe for this Craft model. Load it again in Craft to keep editing, or share it. It holds shapes and colours only, never your keys."
          button="Download Shape Spec"
        />
      )}
    </Panel>
  );
}
