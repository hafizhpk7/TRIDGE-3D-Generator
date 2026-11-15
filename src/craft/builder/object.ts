import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
} from 'three';
import type { BuiltCraft, PartRange } from './build';

export interface CraftObjectInfo {
  ranges: PartRange[];
  mesh: SkinnedMesh;
  skeleton: Skeleton;
}

/** Turn built arrays into a rigged SkinnedMesh with one flat-shaded, vertex-colored material. */
export function createCraftObject(built: BuiltCraft, name: string): Group {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(built.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(built.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(built.colors, 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(built.skinIndices, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(built.skinWeights, 4));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.85,
    metalness: 0,
  });
  const mesh = new SkinnedMesh(geometry, material);
  mesh.name = `${name} mesh`;
  // Bones move the vertices after the bounding sphere was measured.
  mesh.frustumCulled = false;

  // Bones keep positions relative to their parent; the spec gives joint positions in model space.
  const bones = built.bones.map((b) => {
    const bone = new Bone();
    bone.name = b.name;
    return bone;
  });
  const byName = new Map(bones.map((b) => [b.name, b]));
  built.bones.forEach((b, i) => {
    const bone = bones[i];
    const parentDef = b.parent ? built.bones.find((p) => p.name === b.parent) : undefined;
    const parent = b.parent ? byName.get(b.parent) : undefined;
    if (parent && parentDef) {
      bone.position.set(
        b.head[0] - parentDef.head[0],
        b.head[1] - parentDef.head[1],
        b.head[2] - parentDef.head[2],
      );
      parent.add(bone);
    } else {
      bone.position.set(...b.head);
    }
  });

  const roots = bones.filter((b) => !b.parent || !(b.parent instanceof Bone));
  for (const r of roots) mesh.add(r);
  const group = new Group();
  group.name = name;
  group.add(mesh);
  group.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  mesh.bind(skeleton);

  group.userData.craft = { ranges: built.ranges, mesh, skeleton } satisfies CraftObjectInfo;
  return group;
}
