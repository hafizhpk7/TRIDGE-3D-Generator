import { create } from 'zustand';
import type { ViewerEngine } from '../viewer/ViewerEngine';
import { MOTIONS } from '../rig/motions';
import { CLIP_LIBRARY, availableAnimations } from './library';
import { friendlyReply, labelOf, parsePrompt, resolveSteps, type ParsedStep } from './parser';
import { Sequencer, type PoseSnapshot, type SeqStep } from './player';
import type { AnimEntry, AnimId, AnimParams } from './types';

export interface SavedPose {
  id: number;
  name: string;
  pose: PoseSnapshot;
}

interface AnimState {
  steps: SeqStep[];
  playing: boolean;
  time: number;
  total: number;
  speed: number;
  loop: boolean;
  /** Describes what was understood, or why not. */
  message: string;
  /** Clickable moves offered with a message. */
  suggestions: AnimId[];
  poses: SavedPose[];
  /** What the current model can do, for chips. */
  entries: AnimEntry[];
  /** Body type of the current target, or null when there is no skeleton. */
  targetType: string | null;

  /** Understand a request and put it on the timeline. */
  submit: (text: string, mode: 'replace' | 'append') => void;
  /** Add one move by name. */
  add: (id: AnimId) => void;
  remove: (index: number) => void;
  move: (index: number, by: -1 | 1) => void;
  clear: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (t: number) => void;
  setSpeed: (v: number) => void;
  setLoop: (v: boolean) => void;
  savePose: (name: string) => void;
  applyPose: (id: number) => void;
  deletePose: (id: number) => void;
  /** Put back a saved timeline and poses. */
  load: (saved: {
    steps: SeqStep[];
    speed: number;
    loop: boolean;
    poses: { name: string; pose: PoseSnapshot }[];
  }) => void;
  /** Forget everything, for example when a different model is loaded. */
  reset: () => void;
}

let engine: ViewerEngine | null = null;
let poseId = 1;

/** The one sequencer. It acts on whatever skeleton the viewer is currently showing. */
export const sequencer = new Sequencer({
  onHolder: (t) => engine?.setHolderTransform(t),
  onTime: (time, playing) => {
    const s = useAnimStore.getState();
    // The timeline moves every frame; only tell the page about changes it can see.
    if (
      playing !== s.playing ||
      Math.abs(time - s.time) >= 0.04 ||
      time === 0 ||
      time === s.total
    ) {
      useAnimStore.setState({ time, playing });
    }
  },
});

const toSeq = (p: ParsedStep): SeqStep => ({
  id: p.id as SeqStep['id'],
  params: p.params,
  repeat: p.repeat,
});

const DEFAULT: AnimParams = { speed: 1, intensity: 1 };

export const useAnimStore = create<AnimState>((set, get) => {
  function apply(steps: SeqStep[], autoplay: boolean) {
    sequencer.setSteps(steps);
    set({ steps, total: sequencer.total });
    if (autoplay && steps.length) {
      sequencer.seek(0);
      sequencer.play();
    }
  }

  return {
    steps: [],
    playing: false,
    time: 0,
    total: 0,
    speed: 1,
    loop: false,
    message: '',
    suggestions: [],
    poses: [],
    entries: availableAnimations(null),
    targetType: null,

    submit: (text, mode) => {
      const entries = get().entries;
      const parsed = parsePrompt(text);
      if (!parsed.ok) {
        const reply = friendlyReply(parsed, entries);
        set({ message: reply.message, suggestions: reply.suggestions });
        return;
      }
      const resolved = resolveSteps(parsed.steps, entries);
      if (resolved.steps.length === 0) {
        const reply = friendlyReply(parsed, entries, resolved);
        set({ message: reply.message, suggestions: reply.suggestions });
        return;
      }
      const notes: string[] = [];
      for (const s of resolved.swapped) {
        notes.push(
          `This model can't ${labelOf(s.asked)} with bones, so it will ${labelOf(s.got)} instead.`,
        );
      }
      if (resolved.missing.length)
        notes.push(`Skipped: ${resolved.missing.map(labelOf).join(', ')}.`);
      if (parsed.ignored.length)
        notes.push(`I didn't know: ${parsed.ignored.slice(0, 3).join(', ')}.`);
      const added = resolved.steps.map(toSeq);
      apply(mode === 'replace' ? added : [...get().steps, ...added], true);
      set({ message: notes.join(' '), suggestions: [] });
    },

    add: (id) => {
      const next: SeqStep = { id: id as SeqStep['id'], params: { ...DEFAULT }, repeat: 1 };
      const wasEmpty = get().steps.length === 0;
      apply([...get().steps, next], wasEmpty || !get().playing);
      set({ message: '', suggestions: [] });
    },

    remove: (index) =>
      apply(
        get().steps.filter((_, i) => i !== index),
        false,
      ),

    move: (index, by) => {
      const steps = get().steps.slice();
      const to = index + by;
      if (to < 0 || to >= steps.length) return;
      [steps[index], steps[to]] = [steps[to], steps[index]];
      apply(steps, false);
    },

    clear: () => {
      sequencer.stop();
      apply([], false);
      set({ message: '', suggestions: [] });
    },

    play: () => sequencer.play(),
    pause: () => sequencer.pause(),
    stop: () => sequencer.stop(),
    seek: (t) => sequencer.seek(t),
    setSpeed: (speed) => {
      sequencer.speed = speed;
      set({ speed });
    },
    setLoop: (loop) => {
      sequencer.loop = loop;
      set({ loop });
    },

    savePose: (name) => {
      const pose = sequencer.snapshot();
      if (Object.keys(pose).length === 0) return;
      const id = poseId++;
      set({ poses: [...get().poses, { id, name: name.trim() || `Pose ${id}`, pose }] });
    },
    applyPose: (id) => {
      const p = get().poses.find((x) => x.id === id);
      if (p) sequencer.applyPose(p.pose);
    },
    deletePose: (id) => set({ poses: get().poses.filter((p) => p.id !== id) }),

    load: (saved) => {
      // drop any move this version has never heard of, for example from a newer project file
      const all = new Set<string>([
        ...Object.values(CLIP_LIBRARY).flatMap((o) => Object.keys(o)),
        ...MOTIONS.map((m) => m.id),
      ]);
      const steps = saved.steps.filter((s) => all.has(s.id));
      sequencer.speed = saved.speed;
      sequencer.loop = saved.loop;
      apply(steps, false);
      set({
        speed: saved.speed,
        loop: saved.loop,
        poses: saved.poses.map((p) => ({ id: poseId++, name: p.name, pose: p.pose })),
        message: '',
        suggestions: [],
      });
    },

    reset: () => {
      sequencer.stop();
      sequencer.setSteps([]);
      set({
        steps: [],
        total: 0,
        time: 0,
        playing: false,
        message: '',
        suggestions: [],
        poses: [],
      });
    },
  };
});

/**
 * Connect the sequencer to the viewer. Every frame it advances the timeline, and it follows the viewer when the
 * skeleton changes (a new rig, or an edit to a Craft model) without losing its place.
 */
export function attachAnimation(viewer: ViewerEngine): () => void {
  engine = viewer;
  let lastRoot: unknown = null;
  let lastType: string | null | undefined;
  const stop = viewer.addTicker((dt) => {
    const target = viewer.getAnimTarget();
    if ((target?.root ?? null) !== lastRoot) {
      lastRoot = target?.root ?? null;
      sequencer.setTarget(target);
      sequencer.setHeight(viewer.getModelHeight());
      useAnimStore.setState({ total: sequencer.total });
    }
    const type = target?.bodyType ?? null;
    if (type !== lastType) {
      lastType = type;
      useAnimStore.setState({ entries: availableAnimations(type), targetType: type });
    }
    sequencer.update(dt);
  });
  return () => {
    stop();
    sequencer.stop();
    engine = null;
  };
}

// Development only: lets the browser console inspect the animation state.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__tridgeAnim = useAnimStore;
}
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__tridgeSeq = sequencer;
}
