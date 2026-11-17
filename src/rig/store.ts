import { create } from 'zustand';
import {
  applyTestPose,
  buildRiggedObject,
  collectRigMeshes,
  mergedPositions,
  setWeightPreview,
} from './build';
import { getEngine } from './bridge';
import { mirrorPoint, twinName, type Facing, type Frame, type Vec3 } from './frame';
import { MOTIONS, motionTransform, type MotionId } from './motions';
import { buildSkinBones } from './skin';
import { skinInWorker } from './skinClient';
import { SKELETONS, type RigBodyType } from './skeleton';
import { autoFacing, suggestJoints } from './suggest';

export type RigStatus = 'idle' | 'placing' | 'skinning' | 'rigged';

interface RigState {
  bodyType: RigBodyType;
  facing: Facing;
  joints: Record<string, Vec3>;
  frame: Frame | null;
  notes: string[];
  /** Moving a left joint also moves its right twin, and the other way round. */
  mirror: boolean;
  status: RigStatus;
  /** True when joints moved after the last time the model was rigged. */
  dirty: boolean;
  error: string;
  weights: boolean;
  pose: number;
  /** Bumps when the markers need to be rebuilt (not when one is dragged). */
  markerEpoch: number;
  /** Which version of the model the rig was made from. */
  variant: 'original' | 'lowpoly' | null;

  motion: MotionId | null;
  motionSpeed: number;
  motionIntensity: number;

  /** Look at the current model and place a skeleton on it. */
  begin: (bodyType?: RigBodyType) => void;
  setBodyType: (t: RigBodyType) => void;
  setFacing: (f: Facing) => void;
  setMirror: (v: boolean) => void;
  moveJoint: (name: string, position: Vec3) => void;
  rig: () => Promise<void>;
  removeRig: () => void;
  setWeights: (v: boolean) => void;
  setPose: (v: number) => void;
  setMotion: (m: MotionId | null) => void;
  setMotionParams: (p: { speed?: number; intensity?: number }) => void;
  /** Put back a saved rig: place the joints where they were, and build the skeleton if it had been built. */
  restore: (saved: {
    bodyType: RigBodyType;
    facing: Facing;
    joints: Record<string, Vec3>;
    mirror: boolean;
    rigged: boolean;
  }) => Promise<void>;
  /** Forget everything, for example when a different model is loaded. */
  reset: () => void;
}

const INITIAL = {
  joints: {} as Record<string, Vec3>,
  frame: null as Frame | null,
  notes: [] as string[],
  status: 'idle' as RigStatus,
  dirty: false,
  error: '',
  weights: false,
  pose: 0,
  variant: null as 'original' | 'lowpoly' | null,
};

export const useRigStore = create<RigState>((set, get) => {
  /** Positions of the model's current look, in the space the joints use. */
  function currentPositions(): { positions: Float32Array; variant: 'original' | 'lowpoly' } | null {
    const engine = getEngine();
    const src = engine?.getRigSource();
    if (!src) return null;
    const meshes = collectRigMeshes(src.root);
    const positions = mergedPositions(meshes);
    meshes.forEach((m) => m.geometry.dispose());
    return positions.length ? { positions, variant: src.variant } : null;
  }

  function place(bodyType: RigBodyType, facing: Facing | null) {
    const cur = currentPositions();
    if (!cur) {
      set({ error: 'Load a model first, then come back to rig it.', status: 'idle' });
      return;
    }
    const f = facing ?? autoFacing(bodyType, cur.positions);
    const s = suggestJoints(bodyType, cur.positions, f);
    // Rebuilding the joints replaces any rig that was made from the old ones.
    getEngine()?.setRigged(null);
    set({
      bodyType,
      facing: f,
      joints: s.joints,
      frame: s.frame,
      notes: s.notes,
      status: 'placing',
      dirty: false,
      error: '',
      weights: false,
      pose: 0,
      variant: cur.variant,
      markerEpoch: get().markerEpoch + 1,
    });
  }

  return {
    bodyType: 'quadruped',
    facing: '+z',
    mirror: true,
    markerEpoch: 0,
    motion: null,
    motionSpeed: 1,
    motionIntensity: 1,
    ...INITIAL,

    begin: (bodyType) => place(bodyType ?? get().bodyType, null),
    setBodyType: (t) => place(t, null),
    setFacing: (f) => place(get().bodyType, f),
    setMirror: (mirror) => set({ mirror }),

    moveJoint: (name, position) => {
      const { joints, frame, mirror, status } = get();
      if (!frame || !joints[name]) return;
      const next = { ...joints, [name]: position };
      const engine = getEngine();
      engine?.updateMarker(name, position);
      const twin = twinName(name);
      if (mirror && twin && next[twin]) {
        const m = mirrorPoint(frame, position);
        next[twin] = m;
        engine?.updateMarker(twin, m);
      }
      set({ joints: next, dirty: status === 'rigged' ? true : get().dirty });
    },

    rig: async () => {
      const { joints, frame, bodyType } = get();
      const engine = getEngine();
      const src = engine?.getRigSource();
      if (!engine || !src || !frame) return;
      set({ status: 'skinning', error: '' });
      const sources = collectRigMeshes(src.root);
      try {
        const skeleton = SKELETONS[bodyType];
        const bones = buildSkinBones(joints, skeleton, frame, bodyType);
        const results = await skinInWorker(
          sources.map((m) => {
            const index = m.geometry.getIndex();
            return {
              positions: new Float32Array(m.geometry.getAttribute('position').array),
              indices: index ? new Uint32Array(index.array) : null,
            };
          }),
          bones,
          frame,
        );
        const group = buildRiggedObject(sources, results, joints, skeleton, bodyType, frame);
        engine.setRigged(group);
        applyTestPose(group, get().pose);
        if (get().weights) setWeightPreview(group, true);
        set({ status: 'rigged', dirty: false, variant: src.variant });
      } catch (e) {
        console.warn('[rig]', e);
        sources.forEach((m) => m.geometry.dispose());
        set({
          status: 'placing',
          error: 'Could not rig this model. Try moving the joints or picking another body type.',
        });
      }
    },

    removeRig: () => {
      getEngine()?.setRigged(null);
      set({ status: 'placing', weights: false, pose: 0, dirty: false });
    },

    setWeights: (weights) => {
      set({ weights });
      const rigged = getEngine()?.getRiggedObject();
      if (rigged) setWeightPreview(rigged, weights);
    },

    setPose: (pose) => {
      set({ pose });
      const rigged = getEngine()?.getRiggedObject();
      if (rigged) applyTestPose(rigged, pose);
    },

    setMotion: (motion) => {
      set({ motion });
      syncMotion();
    },

    setMotionParams: (p) => {
      set({
        ...(p.speed !== undefined ? { motionSpeed: p.speed } : {}),
        ...(p.intensity !== undefined ? { motionIntensity: p.intensity } : {}),
      });
      // The running motion reads these on every frame, so nothing else to do.
    },

    restore: async (saved) => {
      place(saved.bodyType, saved.facing);
      if (get().status !== 'placing') return;
      set({ joints: saved.joints, mirror: saved.mirror, markerEpoch: get().markerEpoch + 1 });
      if (saved.rigged) await get().rig();
    },

    reset: () => {
      const engine = getEngine();
      engine?.setMarkers(null);
      engine?.setMotion(null);
      set({ ...INITIAL, motion: null, markerEpoch: get().markerEpoch + 1 });
    },
  };

  function syncMotion() {
    const engine = getEngine();
    if (!engine) return;
    const { motion } = get();
    if (!motion) {
      engine.setMotion(null);
      return;
    }
    const height = engine.getModelHeight();
    engine.setMotion((t) => {
      const s = useRigStore.getState();
      return motionTransform(
        motion,
        t,
        { speed: s.motionSpeed, intensity: s.motionIntensity },
        height,
      );
    });
  }
});

export { MOTIONS };

// Development only: lets the browser console inspect the rig state.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__tridgeRig = useRigStore;
}
