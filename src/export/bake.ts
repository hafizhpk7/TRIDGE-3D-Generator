import {
  AnimationClip,
  Euler,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three';
import type { KeyframeTrack } from 'three';
import type { Transform } from '../viewer/ViewerEngine';
import { labelOf } from '../animate/parser';
import { Sequencer, type SeqStep } from '../animate/player';
import type { AnimTarget } from '../animate/types';

/** Name of the node that carries whole-model motion (a hop, a wobble) in an exported file. */
export const MOTION_NODE = 'TRIDGE_Motion';

export interface BakeOptions {
  fps?: number;
  /** Multiply the whole-model motion's distances by this, to turn viewer units into the exported units. */
  unitScale?: number;
  /** Viewer-unit height of the model, which whole-model motions scale with. */
  height?: number;
}

const EPS = 1e-5;

/** True when a flat array of n-vectors has any change from its first value. */
function varies(values: number[], n: number): boolean {
  for (let i = n; i < values.length; i++)
    if (Math.abs(values[i] - values[i % n]) > EPS) return true;
  return false;
}

/**
 * Play `steps` on `target` frame by frame and record every bone (and the whole-model motion) as keyframes.
 * The result is an ordinary AnimationClip that any glTF viewer can play. Returns null for an empty timeline.
 * `target` may be null, for a model with no skeleton that only has whole-model motions.
 * This leaves the target's bones wherever the last frame put them, so callers re-apply their own pose afterwards.
 */
export function bakeSteps(
  target: AnimTarget | null,
  steps: SeqStep[],
  name: string,
  opts: BakeOptions = {},
): AnimationClip | null {
  const fps = opts.fps ?? 30;
  const unit = opts.unitScale ?? 1;
  let holder: Transform | null = null;
  const seq = new Sequencer({ onHolder: (t) => (holder = t) });
  seq.setTarget(target); // a null target still plays whole-model motions
  seq.setHeight(opts.height ?? 1);
  seq.setSteps(steps);
  const total = seq.total;
  if (total <= 0) return null;

  const frames = Math.max(2, Math.ceil(total * fps) + 1);
  const times: number[] = [];
  for (let i = 0; i < frames; i++) times.push(Math.min(total, i / fps));
  if (times[times.length - 1] < total - 1e-6) times.push(total);

  const bones = target?.skeleton.bones ?? [];
  const quats = bones.map(() => [] as number[]);
  const poss = bones.map(() => [] as number[]);
  const hp: number[] = [];
  const hq: number[] = [];
  const hs: number[] = [];
  let anyHolder = false;
  const q = new Quaternion();
  const e = new Euler();

  for (const t of times) {
    seq.evaluate(t);
    bones.forEach((b, i) => {
      quats[i].push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      poss[i].push(b.position.x, b.position.y, b.position.z);
    });
    const h = holder as Transform | null;
    if (h) anyHolder = true;
    const tr = h ?? { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    hp.push(tr.position[0] * unit, tr.position[1] * unit, tr.position[2] * unit);
    e.set(tr.rotation[0], tr.rotation[1], tr.rotation[2], 'XYZ');
    q.setFromEuler(e);
    hq.push(q.x, q.y, q.z, q.w);
    hs.push(tr.scale[0], tr.scale[1], tr.scale[2]);
  }

  const tracks: KeyframeTrack[] = [];
  bones.forEach((b, i) => {
    if (varies(quats[i], 4))
      tracks.push(new QuaternionKeyframeTrack(`${b.name}.quaternion`, times, quats[i]));
    if (varies(poss[i], 3))
      tracks.push(new VectorKeyframeTrack(`${b.name}.position`, times, poss[i]));
  });
  if (anyHolder) {
    if (varies(hp, 3)) tracks.push(new VectorKeyframeTrack(`${MOTION_NODE}.position`, times, hp));
    if (varies(hq, 4))
      tracks.push(new QuaternionKeyframeTrack(`${MOTION_NODE}.quaternion`, times, hq));
    if (varies(hs, 3)) tracks.push(new VectorKeyframeTrack(`${MOTION_NODE}.scale`, times, hs));
  }
  seq.dispose();
  if (tracks.length === 0) return null;
  return new AnimationClip(name, total, tracks);
}

/**
 * The clips to put in an exported file: the whole timeline, plus each different move on its own so the receiving
 * app gets a small library to pick from.
 */
export function bakeExportClips(
  target: AnimTarget | null,
  steps: SeqStep[],
  opts: BakeOptions = {},
): AnimationClip[] {
  if (steps.length === 0) return [];
  const clips: AnimationClip[] = [];
  const used = new Set<string>();
  const unique = (base: string) => {
    let n = base;
    for (let i = 2; used.has(n); i++) n = `${base} ${i}`;
    used.add(n);
    return n;
  };
  if (steps.length > 1) {
    const all = bakeSteps(target, steps, unique('Timeline'), opts);
    if (all) clips.push(all);
  }
  const seen = new Set<string>();
  for (const s of steps) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const c = bakeSteps(target, [s], unique(capital(labelOf(s.id))), opts);
    if (c) clips.push(c);
  }
  return clips;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
