import { Bone, Group, Mesh, Scene, SkinnedMesh } from 'three';
import type { AnimationClip, Object3D } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MOTION_NODE } from './bake';

/** A copy of the model that is safe to hand to the exporter: no selection outlines, no joint markers. */
function exportCopy(root: Object3D): Object3D {
  const copy = cloneSkinned(root);
  const junk: Object3D[] = [];
  copy.traverse((o) => {
    if (o.userData.helper || o.userData.joint !== undefined) junk.push(o);
  });
  for (const o of junk) o.parent?.remove(o);
  copy.updateMatrixWorld(true);
  return copy;
}

/**
 * Pack a model and its animation clips into a binary glTF (.glb). The skeleton is included when the model has
 * one. The live model is not touched.
 */
export async function exportGlb(root: Object3D, clips: AnimationClip[] = []): Promise<ArrayBuffer> {
  const copy = exportCopy(root);
  // The skeleton's bind pose is the model's rest pose, which is what a glTF file stores.
  copy.traverse((o) => {
    if (o instanceof SkinnedMesh) o.skeleton.pose();
  });
  const scene = new Scene();
  const usesMotion = clips.some((c) => c.tracks.some((t) => t.name.startsWith(`${MOTION_NODE}.`)));
  if (usesMotion) {
    const node = new Group();
    node.name = MOTION_NODE;
    node.add(copy);
    scene.add(node);
  } else {
    scene.add(copy);
  }
  scene.updateMatrixWorld(true);

  const result = await new GLTFExporter().parseAsync(scene, {
    binary: true,
    trs: true,
    onlyVisible: true,
    animations: clips,
  });
  if (!(result instanceof ArrayBuffer))
    throw new Error('The exporter did not produce a binary file.');
  return result;
}

export interface GlbSummary {
  meshes: number;
  triangles: number;
  bones: number;
  animations: { name: string; seconds: number; tracks: number }[];
}

/** Open a .glb the way any viewer would and report what it holds. Throws when the file cannot be read. */
export async function readGlb(
  buffer: ArrayBuffer,
): Promise<{ summary: GlbSummary; scene: Group; clips: AnimationClip[] }> {
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  let meshes = 0;
  let triangles = 0;
  let bones = 0;
  gltf.scene.traverse((o) => {
    if (o instanceof Bone) bones++;
    if (o instanceof Mesh) {
      meshes++;
      const index = o.geometry.getIndex();
      triangles += Math.floor(
        (index ? index.count : o.geometry.getAttribute('position').count) / 3,
      );
    }
  });
  return {
    scene: gltf.scene,
    clips: gltf.animations,
    summary: {
      meshes,
      triangles,
      bones,
      animations: gltf.animations.map((a) => ({
        name: a.name,
        seconds: a.duration,
        tracks: a.tracks.length,
      })),
    },
  };
}
