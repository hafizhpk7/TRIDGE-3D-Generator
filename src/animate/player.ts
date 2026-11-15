import {
  LinearInterpolant,
  Quaternion,
  QuaternionLinearInterpolant,
  Vector3,
  type Bone,
} from 'three';
import { MOTIONS, motionTransform, IDENTITY, type MotionId, type Transform } from '../rig/motions';
import { CLIP_LIBRARY, buildClip, clipSeconds, makeContext, type ClipCtx } from './library';
import type { AnimParams, AnimTarget, ClipId, Vec3 } from './types';

const MOTION_IDS = new Set<string>(MOTIONS.map((m) => m.id));
const isMotion = (id: string): id is MotionId => MOTION_IDS.has(id);

/** Seconds of blending between two steps. */
export const CROSSFADE = 0.25;
/** Looping animations play for about this long when no duration is given. */
const DEFAULT_PLAY_SECONDS = 3;

/** One entry in the timeline. */
export interface SeqStep {
  id: ClipId | MotionId;
  params: AnimParams;
  /** Times to play it. For loops, the number of cycles; for a jump, the number of jumps. */
  repeat?: number;
}

export interface PlannedStep extends SeqStep {
  kind: 'clip' | 'motion';
  /** When it starts on the timeline. */
  start: number;
  /** How long it plays. */
  seconds: number;
  /** Length of one cycle. */
  cycle: number;
  /** Time overlapping the previous step, spent fading in. */
  fadeIn: number;
  /** Time overlapping the next step, spent fading out. */
  fadeOut: number;
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Work out when each step starts and how long it lasts. Steps overlap by the crossfade. */
export function planSteps(
  steps: SeqStep[],
  bodyType: AnimTarget['bodyType'] | null,
  ctx: ClipCtx | null,
): { planned: PlannedStep[]; total: number } {
  const planned: PlannedStep[] = [];
  let cursor = 0;
  steps.forEach((s, i) => {
    const repeat = Math.max(1, Math.round(s.repeat ?? 1));
    const def =
      bodyType && ctx && !isMotion(s.id) ? CLIP_LIBRARY[bodyType][s.id as ClipId] : undefined;
    const kind: 'clip' | 'motion' = def ? 'clip' : 'motion';
    let cycle: number;
    let seconds: number;
    if (def && ctx && bodyType) {
      cycle = clipSeconds(bodyType, s.id as ClipId, ctx, s.params);
      if (def.loop) {
        const cycles = repeat > 1 ? repeat : Math.max(1, Math.round(DEFAULT_PLAY_SECONDS / cycle));
        seconds = s.params.duration ?? cycles * cycle;
      } else {
        seconds = cycle * repeat;
      }
    } else {
      // A whole-model motion: one "cycle" is a second at normal speed.
      cycle = 1 / Math.max(0.05, s.params.speed);
      seconds = s.params.duration ?? DEFAULT_PLAY_SECONDS * repeat;
    }
    seconds = Math.max(0.2, seconds);
    const prev = planned[i - 1];
    const fadeIn = prev ? Math.min(CROSSFADE, prev.seconds / 2, seconds / 2) : 0;
    const start = prev ? prev.start + prev.seconds - fadeIn : 0;
    if (prev) prev.fadeOut = fadeIn;
    planned.push({ ...s, repeat, kind, start, seconds, cycle, fadeIn, fadeOut: 0 });
    cursor = start + seconds;
  });
  return { planned, total: cursor };
}

/** How strongly step `p` is applied at time `t`. 0 outside the step. */
export function weightAt(p: PlannedStep, t: number): number {
  const end = p.start + p.seconds;
  if (t < p.start || t > end) return 0;
  const inW = p.fadeIn > 0 ? smooth((t - p.start) / p.fadeIn) : 1;
  const outW = p.fadeOut > 0 ? smooth((end - t) / p.fadeOut) : 1;
  return Math.min(inW, outW);
}

/** Time inside the clip for step `p` at timeline time `t`. */
export function localTime(p: PlannedStep, t: number, loops: boolean): number {
  const local = Math.max(0, t - p.start);
  if (!loops && local >= p.seconds) return p.cycle;
  const wrapped = local % p.cycle;
  // exactly at the end of a one-shot clip, stay on its last frame instead of snapping to the first
  return !loops && local > 0 && wrapped === 0 ? p.cycle : wrapped;
}

export interface BonePose {
  position: Vec3;
  quaternion: [number, number, number, number];
}
export type PoseSnapshot = Record<string, BonePose>;

export interface SequencerEvents {
  /** The whole-model motion for this frame, or null when none applies. */
  onHolder?: (t: Transform | null) => void;
  onTime?: (time: number, playing: boolean) => void;
}

/** Keyframe readers for one bone in one clip. */
interface BoneTracks {
  q?: QuaternionLinearInterpolant;
  p?: LinearInterpolant;
}

/**
 * Plays a list of steps on a skeleton: it blends overlapping steps, scrubs, loops and pauses.
 * Bone clips are read straight from their keyframes and blended here (so scrubbing is exact and held
 * poses stay put); whole-model motions drive the holder transform.
 */
export class Sequencer {
  private target: AnimTarget | null = null;
  private ctx: ClipCtx | null = null;
  private steps: SeqStep[] = [];
  /** Per planned step, the keyframe readers for each animated bone. */
  private readers = new Map<number, Map<string, BoneTracks>>();
  /** Where every bone sits at rest. */
  private rest = new Map<string, { p: Vector3; q: Quaternion }>();
  planned: PlannedStep[] = [];
  total = 0;
  time = 0;
  playing = false;
  loop = false;
  /** Multiplies how fast the timeline advances. */
  speed = 1;
  private modelHeight = 1;

  constructor(private readonly events: SequencerEvents = {}) {}

  setTarget(target: AnimTarget | null) {
    this.target = target;
    this.ctx = target ? makeContext(target) : null;
    this.modelHeight = this.ctx?.height ?? 1;
    this.rest.clear();
    if (target) {
      // pose() puts the bones into their bind pose, which is what "rest" means here.
      target.skeleton.pose();
      for (const b of target.skeleton.bones)
        this.rest.set(b.name, { p: b.position.clone(), q: b.quaternion.clone() });
    }
    this.rebuild();
  }

  setHeight(h: number) {
    this.modelHeight = h;
  }

  hasTarget() {
    return this.target !== null;
  }

  currentRoot() {
    return this.target?.root ?? null;
  }

  setSteps(steps: SeqStep[]) {
    this.steps = steps;
    this.rebuild();
  }

  private rebuild() {
    this.readers.clear();
    const { planned, total } = planSteps(this.steps, this.target?.bodyType ?? null, this.ctx);
    this.planned = planned;
    this.total = total;
    if (this.target) {
      planned.forEach((p, i) => {
        if (p.kind !== 'clip') return;
        const clip = buildClip(this.target!, p.id as ClipId, p.params, this.ctx ?? undefined);
        if (!clip) return;
        const byBone = new Map<string, BoneTracks>();
        for (const track of clip.tracks) {
          const [bone, prop] = track.name.split('.');
          const entry = byBone.get(bone) ?? {};
          if (prop === 'quaternion')
            entry.q = new QuaternionLinearInterpolant(track.times, track.values, 4);
          else if (prop === 'position')
            entry.p = new LinearInterpolant(track.times, track.values, 3);
          byBone.set(bone, entry);
        }
        this.readers.set(i, byBone);
      });
    }
    this.time = Math.min(this.time, this.total);
    this.evaluate(this.time);
  }

  /** Put the model in the pose it has at timeline time `t`. */
  evaluate(t: number) {
    this.time = t;
    const holder: { w: number; tr: Transform }[] = [];
    const clips: { w: number; time: number; tracks: Map<string, BoneTracks> }[] = [];
    this.planned.forEach((p, i) => {
      const w = weightAt(p, t);
      if (w <= 0) return;
      const tracks = this.readers.get(i);
      if (tracks) clips.push({ w, time: localTime(p, t, this.isLoop(p)), tracks });
      else if (p.kind === 'motion' && isMotion(p.id)) {
        holder.push({
          w,
          tr: motionTransform(
            p.id as MotionId,
            Math.max(0, t - p.start),
            p.params,
            this.modelHeight,
          ),
        });
      }
    });
    if (this.target) this.applyBones(clips);
    this.events.onHolder?.(holder.length ? blend(holder) : null);
    this.events.onTime?.(this.time, this.playing);
  }

  /** Blend the active clips onto the bones. Bones a clip does not animate count as resting in it. */
  private applyBones(clips: { w: number; time: number; tracks: Map<string, BoneTracks> }[]) {
    const clipWeight = clips.reduce((n, c) => n + c.w, 0);
    const restWeight = Math.max(0, 1 - clipWeight);
    const q = new Quaternion();
    const tmp = new Quaternion();
    const pos = new Vector3();
    for (const bone of this.target!.skeleton.bones) {
      const rest = this.rest.get(bone.name);
      if (!rest) continue;
      let any = false;
      for (const c of clips) if (c.tracks.has(bone.name)) any = true;
      if (!any) {
        bone.quaternion.copy(rest.q);
        bone.position.copy(rest.p);
        continue;
      }
      // weighted blend by successive slerps: add each contribution in proportion to its share so far
      let total = 0;
      pos.set(0, 0, 0);
      let first = true;
      const add = (w: number, quat: Quaternion, position: Vector3) => {
        if (w <= 0) return;
        total += w;
        if (first) {
          q.copy(quat);
          first = false;
        } else {
          q.slerp(quat, w / total);
        }
        pos.addScaledVector(position, w);
      };
      for (const c of clips) {
        const tr = c.tracks.get(bone.name);
        let quat = rest.q;
        let position = rest.p;
        if (tr?.q) {
          const v = tr.q.evaluate(c.time);
          quat = tmp.set(v[0], v[1], v[2], v[3]);
        }
        if (tr?.p) {
          const v = tr.p.evaluate(c.time);
          position = new Vector3(v[0], v[1], v[2]);
        }
        add(c.w, tr?.q ? quat.clone() : quat, position);
      }
      add(restWeight, rest.q, rest.p);
      bone.quaternion.copy(q);
      if (total > 0) bone.position.copy(pos.multiplyScalar(1 / total));
    }
  }

  private isLoop(p: PlannedStep) {
    if (!this.target) return false;
    const def = CLIP_LIBRARY[this.target.bodyType][p.id as ClipId];
    return Boolean(def?.loop);
  }

  /** Advance by real time. Call every frame. */
  update(dt: number) {
    if (!this.playing || this.total <= 0) return;
    let t = this.time + dt * this.speed;
    if (t >= this.total) {
      if (this.loop) t = t % this.total;
      else {
        this.playing = false;
        t = this.total;
      }
    }
    this.evaluate(t);
  }

  play() {
    if (this.total <= 0) return;
    if (this.time >= this.total) this.time = 0;
    this.playing = true;
    this.events.onTime?.(this.time, true);
  }

  pause() {
    this.playing = false;
    this.events.onTime?.(this.time, false);
  }

  seek(t: number) {
    this.evaluate(Math.min(this.total, Math.max(0, t)));
  }

  /** Stop and put the model back at rest. */
  stop() {
    this.playing = false;
    this.time = 0;
    this.restBones();
    this.events.onHolder?.(null);
    this.events.onTime?.(0, false);
  }

  private restBones() {
    if (!this.target) return;
    for (const b of this.target.skeleton.bones) {
      const r = this.rest.get(b.name);
      if (!r) continue;
      b.quaternion.copy(r.q);
      b.position.copy(r.p);
    }
  }

  /** The bones' current transforms, for saving a pose. */
  snapshot(): PoseSnapshot {
    const out: PoseSnapshot = {};
    if (!this.target) return out;
    for (const b of this.target.skeleton.bones) {
      out[b.name] = {
        position: [b.position.x, b.position.y, b.position.z],
        quaternion: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
      };
    }
    return out;
  }

  /** Hold the model in a saved pose. */
  applyPose(pose: PoseSnapshot) {
    if (!this.target) return;
    this.playing = false;
    this.restBones();
    const byName = new Map<string, Bone>(this.target.skeleton.bones.map((b) => [b.name, b]));
    for (const [name, p] of Object.entries(pose)) {
      const b = byName.get(name);
      if (!b) continue;
      b.position.set(...p.position);
      b.quaternion.set(...p.quaternion);
    }
    this.events.onHolder?.(null);
    this.events.onTime?.(this.time, false);
  }

  dispose() {
    this.readers.clear();
    this.target = null;
  }
}

/** Blend whole-model motions by weight. Anything not covered by the weights stays at rest. */
export function blend(items: { w: number; tr: Transform }[]): Transform {
  const out: Transform = {
    position: [...IDENTITY.position],
    rotation: [...IDENTITY.rotation],
    scale: [...IDENTITY.scale],
  };
  for (const { w, tr } of items) {
    for (let k = 0; k < 3; k++) {
      out.position[k] += (tr.position[k] - IDENTITY.position[k]) * w;
      out.rotation[k] += (tr.rotation[k] - IDENTITY.rotation[k]) * w;
      out.scale[k] += (tr.scale[k] - IDENTITY.scale[k]) * w;
    }
  }
  return out;
}
