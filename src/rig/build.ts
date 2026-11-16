import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import type { Frame, Vec3 } from './frame';
import { testPose } from './pose';
import type { SkinResult } from './skin';
import type { JointDef, RigBodyType } from './skeleton';

export interface RigMeshSource {
  /** Geometry baked into the root object's space (a private copy). */
  geometry: BufferGeometry;
  material: Material | Material[];
}

/** Every mesh under `root`, with its own transform baked in so all meshes share one space. */
export function collectRigMeshes(root: Object3D): RigMeshSource[] {
  root.updateWorldMatrix(true, true);
  const inverse = new Matrix4().copy(root.matrixWorld).invert();
  const out: RigMeshSource[] = [];
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    if (!o.geometry.getAttribute('position')) return;
    // Skip overlays such as selection outlines and joint markers.
    if (o.renderOrder >= 10) return;
    const geometry = o.geometry.clone();
    geometry.applyMatrix4(new Matrix4().multiplyMatrices(inverse, o.matrixWorld));
    out.push({ geometry, material: o.material });
  });
  return out;
}

/** All vertex positions of the meshes as one flat array, for analysis. */
export function mergedPositions(meshes: RigMeshSource[]): Float32Array {
  const total = meshes.reduce((n, m) => n + m.geometry.getAttribute('position').count * 3, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const m of meshes) {
    const a = m.geometry.getAttribute('position');
    for (let i = 0; i < a.count; i++) {
      out[o++] = a.getX(i);
      out[o++] = a.getY(i);
      out[o++] = a.getZ(i);
    }
  }
  return out;
}

export interface RigInfo {
  skeleton: Skeleton;
  bodyType: RigBodyType;
  frame: Frame;
  meshes: SkinnedMesh[];
}

/** Build a SkinnedMesh per source mesh, all sharing one skeleton made from the joint positions. */
export function buildRiggedObject(
  sources: RigMeshSource[],
  results: SkinResult[],
  joints: Record<string, Vec3>,
  skeleton: JointDef[],
  bodyType: RigBodyType,
  frame: Frame,
): Group {
  const group = new Group();
  group.name = 'Rigged';

  const bones = skeleton.map((j) => {
    const b = new Bone();
    b.name = j.name;
    return b;
  });
  const byName = new Map(bones.map((b) => [b.name, b]));
  skeleton.forEach((j, i) => {
    const head = joints[j.name];
    const parent = j.parent ? byName.get(j.parent) : undefined;
    if (parent && j.parent) {
      const ph = joints[j.parent];
      bones[i].position.set(head[0] - ph[0], head[1] - ph[1], head[2] - ph[2]);
      parent.add(bones[i]);
    } else {
      bones[i].position.set(...head);
      group.add(bones[i]);
    }
  });
  group.updateMatrixWorld(true);
  const skel = new Skeleton(bones);

  const meshes: SkinnedMesh[] = [];
  sources.forEach((src, i) => {
    const geometry = src.geometry;
    geometry.setAttribute('skinIndex', new BufferAttribute(results[i].skinIndices, 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(results[i].skinWeights, 4));
    geometry.computeBoundingSphere();
    // Copies of the materials, so removing the rig never disposes the original model's.
    const material = Array.isArray(src.material)
      ? src.material.map((m) => m.clone())
      : src.material.clone();
    const mesh = new SkinnedMesh(geometry, material);
    mesh.name = `Rigged ${i}`;
    mesh.frustumCulled = false;
    group.add(mesh);
    mesh.bind(skel);
    meshes.push(mesh);
  });

  const info = { skeleton: skel, bodyType, frame, meshes } satisfies RigInfo;
  // Not enumerable, so cloning or exporting the object never tries to serialize the skeleton.
  Object.defineProperty(group.userData, 'rig', {
    value: info,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return group;
}

// ---- weight preview ------------------------------------------------------------------------------

/** One distinct color per bone, spread around the color wheel. */
export function boneColor(index: number): Color {
  return new Color().setHSL((index * 0.618033988749895) % 1, 0.75, 0.55);
}

/** Show each vertex's skin weights as color, or put the real materials back. */
export function setWeightPreview(rigged: Object3D, on: boolean) {
  const info = rigged.userData.rig as RigInfo | undefined;
  if (!info) return;
  for (const mesh of info.meshes) {
    if (on) {
      if (!mesh.userData.originalMaterial) mesh.userData.originalMaterial = mesh.material;
      const idx = mesh.geometry.getAttribute('skinIndex');
      const wts = mesh.geometry.getAttribute('skinWeight');
      const colors = new Float32Array(idx.count * 3);
      for (let v = 0; v < idx.count; v++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let k = 0; k < 4; k++) {
          const w = wts.getComponent(v, k);
          if (w <= 0) continue;
          const c = boneColor(idx.getComponent(v, k));
          r += c.r * w;
          g += c.g * w;
          b += c.b * w;
        }
        colors.set([r, g, b], v * 3);
      }
      mesh.geometry.setAttribute('color', new BufferAttribute(colors, 3));
      mesh.material = new MeshBasicMaterial({ vertexColors: true });
    } else if (mesh.userData.originalMaterial) {
      (mesh.material as Material).dispose();
      mesh.material = mesh.userData.originalMaterial as Material;
      mesh.userData.originalMaterial = undefined;
      mesh.geometry.deleteAttribute('color');
    }
  }
}

// ---- posing --------------------------------------------------------------------------------------

/** Pose the skeleton for the test slider. t = 0 is the rest pose. */
export function applyTestPose(rigged: Object3D, t: number) {
  const info = rigged.userData.rig as RigInfo | undefined;
  if (!info) return;
  const bones = info.skeleton.bones;
  const turns = testPose(
    info.bodyType,
    info.frame,
    t,
    bones.map((b) => b.name),
  );
  const q = new Quaternion();
  for (const bone of bones) {
    const turn = turns.get(bone.name);
    if (turn && Math.abs(turn.angle) > 1e-6) {
      bone.quaternion.copy(q.setFromAxisAngle(new Vector3(...turn.axis).normalize(), turn.angle));
    } else {
      bone.quaternion.identity();
    }
  }
}
