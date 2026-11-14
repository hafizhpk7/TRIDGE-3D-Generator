import { sampleTexture } from './colors';
import type { SimplifiedMesh } from './simplify';
import type { ResultMesh, Rgb, SourceTexture } from './types';

export interface FaceMeta {
  baseColor: Rgb;
  texture: SourceTexture | null;
}

/** If a triangle's corners are further apart than this in UV space, it probably crosses a seam. */
const SEAM_UV_DISTANCE = 0.3;

/**
 * Turn an indexed mesh into flat-shaded (non-indexed) arrays with one color per face.
 * Texture colors are sampled at the face centroid, as specified, unless the face straddles a seam.
 */
export function buildFlatMesh(
  mesh: SimplifiedMesh,
  meta: FaceMeta,
): { mesh: ResultMesh; areas: Float32Array } {
  const { positions, indices, uvs, vertexColors } = mesh;
  const faces = indices.length / 3;
  const outPos = new Float32Array(faces * 9);
  const outNormal = new Float32Array(faces * 9);
  const outUv = uvs ? new Float32Array(faces * 6) : null;
  const faceColors = new Float32Array(faces * 3);
  const areas = new Float32Array(faces);
  const [br, bg, bb] = meta.baseColor;

  for (let f = 0; f < faces; f++) {
    const ia = indices[f * 3];
    const ib = indices[f * 3 + 1];
    const ic = indices[f * 3 + 2];
    const corners = [ia, ib, ic];

    for (let c = 0; c < 3; c++) {
      outPos.set(positions.subarray(corners[c] * 3, corners[c] * 3 + 3), f * 9 + c * 3);
      if (outUv && uvs) outUv.set(uvs.subarray(corners[c] * 2, corners[c] * 2 + 2), f * 6 + c * 2);
    }

    // face normal and area
    const ax = outPos[f * 9];
    const ay = outPos[f * 9 + 1];
    const az = outPos[f * 9 + 2];
    const e1x = outPos[f * 9 + 3] - ax;
    const e1y = outPos[f * 9 + 4] - ay;
    const e1z = outPos[f * 9 + 5] - az;
    const e2x = outPos[f * 9 + 6] - ax;
    const e2y = outPos[f * 9 + 7] - ay;
    const e2z = outPos[f * 9 + 8] - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    areas[f] = len / 2;
    if (len > 1e-20) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = 0;
      ny = 1;
      nz = 0;
    }
    for (let c = 0; c < 3; c++) outNormal.set([nx, ny, nz], f * 9 + c * 3);

    // face color
    let r = 1;
    let g = 1;
    let b = 1;
    if (meta.texture && uvs) {
      const u0 = uvs[ia * 2];
      const v0 = uvs[ia * 2 + 1];
      const u1 = uvs[ib * 2];
      const v1 = uvs[ib * 2 + 1];
      const u2 = uvs[ic * 2];
      const v2 = uvs[ic * 2 + 1];
      const spread = Math.max(
        Math.hypot(u0 - u1, v0 - v1),
        Math.hypot(u1 - u2, v1 - v2),
        Math.hypot(u0 - u2, v0 - v2),
      );
      if (spread <= SEAM_UV_DISTANCE) {
        [r, g, b] = sampleTexture(meta.texture, (u0 + u1 + u2) / 3, (v0 + v1 + v2) / 3);
      } else {
        const s0 = sampleTexture(meta.texture, u0, v0);
        const s1 = sampleTexture(meta.texture, u1, v1);
        const s2 = sampleTexture(meta.texture, u2, v2);
        r = (s0[0] + s1[0] + s2[0]) / 3;
        g = (s0[1] + s1[1] + s2[1]) / 3;
        b = (s0[2] + s1[2] + s2[2]) / 3;
      }
    }
    if (vertexColors) {
      r *= (vertexColors[ia * 3] + vertexColors[ib * 3] + vertexColors[ic * 3]) / 3;
      g *= (vertexColors[ia * 3 + 1] + vertexColors[ib * 3 + 1] + vertexColors[ic * 3 + 1]) / 3;
      b *= (vertexColors[ia * 3 + 2] + vertexColors[ib * 3 + 2] + vertexColors[ic * 3 + 2]) / 3;
    }
    faceColors[f * 3] = r * br;
    faceColors[f * 3 + 1] = g * bg;
    faceColors[f * 3 + 2] = b * bb;
  }

  return {
    mesh: { positions: outPos, normals: outNormal, uvs: outUv, faceColors, paletteIndex: null },
    areas,
  };
}
