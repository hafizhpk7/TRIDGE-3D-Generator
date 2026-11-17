import { useAnimStore } from '../animate/store';
import { useCraftStore } from '../craft/store';
import { exportGlb } from '../export/glb';
import { useLowPolyStore } from '../store/lowPolyStore';
import { useInputStore } from '../store/inputStore';
import { useRigStore } from '../rig/store';
import { getEngine } from '../rig/bridge';
import type { Packed, Project, ProjectData } from './types';

// The original model only changes when a new one is loaded, so its saved copy is reused between saves.
let modelCache: { uuid: string; packed: Packed } | null = null;

async function packBlob(blob: Blob, fallbackType: string): Promise<Packed> {
  return { type: blob.type || fallbackType, bytes: await blob.arrayBuffer() };
}

export interface CaptureInput {
  id: string;
  name: string;
  createdAt: number;
  step: string;
  /** Whether the picture in the input step is where this model came from. */
  hasImage: boolean;
}

/** Gather everything that makes up the current work into one project record. */
export async function captureProject(input: CaptureInput): Promise<Project> {
  const engine = getEngine();
  const original = engine?.getOriginalObject();
  if (!engine || !original) throw new Error('There is nothing to save yet.');

  const craft = useCraftStore.getState();
  const data: ProjectData = { id: input.id, step: input.step, modelName: input.name };

  if (craft.spec) {
    data.craft = {
      spec: JSON.parse(JSON.stringify(craft.spec)),
      detail: craft.detail,
      softJoints: craft.softJoints,
    };
  } else {
    if (modelCache?.uuid !== original.uuid) {
      const bytes = await exportGlb(original, [], { keepPlacement: false });
      modelCache = { uuid: original.uuid, packed: { type: 'model/gltf-binary', bytes } };
    }
    data.model = modelCache.packed;

    const lp = useLowPolyStore.getState();
    if (lp.enabled && lp.source) {
      data.lowpoly = {
        settings: { ...lp.settings },
        palette: lp.palette ? lp.palette.map((c) => [...c] as [number, number, number]) : null,
        view: lp.view,
      };
    }
    const rig = useRigStore.getState();
    if (rig.status !== 'idle' && Object.keys(rig.joints).length > 0) {
      data.rig = {
        bodyType: rig.bodyType,
        facing: rig.facing,
        joints: JSON.parse(JSON.stringify(rig.joints)),
        mirror: rig.mirror,
        rigged: rig.status === 'rigged',
        variant: rig.variant,
      };
    }
  }

  const prepared = useInputStore.getState().prepared;
  if (input.hasImage && prepared) {
    data.image = {
      packed: await packBlob(prepared.blob, 'image/png'),
      backgroundRemoved: prepared.backgroundRemoved,
    };
  }

  const anim = useAnimStore.getState();
  if (anim.steps.length || anim.poses.length) {
    data.anim = {
      steps: JSON.parse(JSON.stringify(anim.steps)),
      speed: anim.speed,
      loop: anim.loop,
      poses: anim.poses.map((p) => ({ name: p.name, pose: p.pose })),
    };
  }

  let thumb: Packed | undefined;
  try {
    thumb = await packBlob(
      await engine.snapshotPng({ maxSide: 320, transparent: true }),
      'image/png',
    );
  } catch {
    // a missing picture should never stop work from being saved
  }

  let bytes = JSON.stringify({ ...data, model: undefined, image: undefined }).length;
  bytes += data.model?.bytes.byteLength ?? 0;
  bytes += data.image?.packed.bytes.byteLength ?? 0;
  bytes += thumb?.bytes.byteLength ?? 0;

  const now = Date.now();
  return {
    meta: {
      id: input.id,
      name: input.name,
      createdAt: input.createdAt,
      updatedAt: now,
      kind: data.craft ? 'craft' : 'model',
      bytes,
      thumb,
    },
    data,
  };
}

/** Forget the cached model copy, for tests. */
export function resetCaptureCache() {
  modelCache = null;
}
