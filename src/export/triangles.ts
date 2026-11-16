import { Color, Mesh, SkinnedMesh, Vector3 } from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';

/** Every triangle of a model in its current pose, in world space. Vertices are not shared between triangles. */
export interface TriangleSoup {
  /** 9 numbers per triangle. */
  positions: Float32Array;
  /** 9 numbers per triangle (sRGB 0..1), or null when the model has no color information. */
  colors: Float32Array | null;
  count: number;
}

function materialOf(mesh: Mesh): Material | null {
  const m = mesh.material;
  return Array.isArray(m) ? (m[0] ?? null) : (m ?? null);
}

/** Things the viewer adds that are not part of the model: selection outlines, joint markers. */
function isHelper(o: Object3D): boolean {
  return Boolean(o.userData.helper) || o.userData.joint !== undefined;
}

function triangleIndices(geometry: BufferGeometry): (i: number) => [number, number, number] {
  const index = geometry.getIndex();
  if (index) return (i) => [index.getX(i * 3), index.getX(i * 3 + 1), index.getX(i * 3 + 2)];
  return (i) => [i * 3, i * 3 + 1, i * 3 + 2];
}

function triangleTotal(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  const n = index ? index.count : (geometry.getAttribute('position')?.count ?? 0);
  return Math.floor(n / 3);
}

/**
 * Collect the visible triangles of `root` as they look right now: skinned meshes follow their bones.
 * Colors come from vertex colors multiplied by the material color.
 */
export function collectTriangles(root: Object3D): TriangleSoup {
  root.updateWorldMatrix(true, true);
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh && !isHelper(o) && o.visible && o.geometry.getAttribute('position'))
      meshes.push(o);
  });

  let total = 0;
  for (const m of meshes) total += triangleTotal(m.geometry);

  const positions = new Float32Array(total * 9);
  const colors = new Float32Array(total * 9);
  let anyColor = false;
  let t = 0;
  const v = new Vector3();
  const c = new Color();
  const base = new Color();

  for (const mesh of meshes) {
    if (mesh instanceof SkinnedMesh) mesh.skeleton.update();
    const geometry = mesh.geometry;
    const pos = geometry.getAttribute('position');
    const col = geometry.getAttribute('color');
    const material = materialOf(mesh);
    const hasMaterialColor = material && 'color' in material;
    const useVertexColors =
      Boolean(col) && Boolean((material as { vertexColors?: boolean })?.vertexColors);
    if (hasMaterialColor) base.copy((material as unknown as { color: Color }).color);
    else base.set(1, 1, 1);
    if (useVertexColors || hasMaterialColor) anyColor = true;

    const tri = triangleIndices(geometry);
    const n = triangleTotal(geometry);
    for (let i = 0; i < n; i++) {
      const [a, b, d] = tri(i);
      [a, b, d].forEach((vi, k) => {
        v.fromBufferAttribute(pos, vi);
        if (mesh instanceof SkinnedMesh) mesh.applyBoneTransform(vi, v);
        v.applyMatrix4(mesh.matrixWorld);
        const o = t * 9 + k * 3;
        positions[o] = v.x;
        positions[o + 1] = v.y;
        positions[o + 2] = v.z;
        c.copy(base);
        if (useVertexColors) c.multiply(new Color(col.getX(vi), col.getY(vi), col.getZ(vi)));
        c.convertLinearToSRGB();
        colors[o] = c.r;
        colors[o + 1] = c.g;
        colors[o + 2] = c.b;
      });
      t++;
    }
  }
  return { positions, colors: anyColor ? colors : null, count: total };
}

/** Smallest box around the triangles. */
export function boundsOf(positions: Float32Array): { min: Vector3; max: Vector3 } {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < positions.length; i += 3) {
    min.x = Math.min(min.x, positions[i]);
    min.y = Math.min(min.y, positions[i + 1]);
    min.z = Math.min(min.z, positions[i + 2]);
    max.x = Math.max(max.x, positions[i]);
    max.y = Math.max(max.y, positions[i + 1]);
    max.z = Math.max(max.z, positions[i + 2]);
  }
  return { min, max };
}
