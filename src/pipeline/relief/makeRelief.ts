import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';
import { removeBackground, type BgProgress } from '../input/bgRemoval';
import { cutoutLooksWrong, decodeImage } from '../input/imageOps';
import { RELIEF_DEPTH, RELIEF_GRID } from './config';
import { estimateDepth, type DepthProgress } from './depth';
import { buildReliefMesh } from './mesh';

export type ReliefStage =
  | { step: 'cutout'; progress: BgProgress | null }
  | { step: 'depth'; progress: DepthProgress | null }
  | { step: 'mesh' };

/** True when the picture already has a meaningful transparent area. */
export function hasTransparency(rgba: Uint8ClampedArray, fraction = 0.02): boolean {
  let clear = 0;
  const total = rgba.length / 4;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 200) clear++;
  return clear / total > fraction;
}

async function imageDataOf(blob: Blob): Promise<ImageData> {
  const img = await decodeImage(blob);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img.bitmap, 0, 0);
  img.bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * The no-server fallback. Works entirely in the browser:
 * cut-out (if needed) -> depth estimate -> displaced grid mesh with the background cut away.
 * The result goes through the normal low-poly step to simplify and flat-shade it.
 */
export async function makeRelief(
  picture: Blob,
  onStage: (s: ReliefStage) => void,
  signal: AbortSignal,
): Promise<Group> {
  let cutout = await imageDataOf(picture);

  if (!hasTransparency(cutout.data)) {
    onStage({ step: 'cutout', progress: null });
    const result = await removeBackground(
      picture,
      (p) => onStage({ step: 'cutout', progress: p }),
      signal,
    );
    if (cutoutLooksWrong(result)) {
      throw new Error(
        'Almost nothing was left after removing the background. Try a clearer picture.',
      );
    }
    cutout = result;
  }

  onStage({ step: 'depth', progress: null });
  const depth = await estimateDepth(
    picture,
    (p) => onStage({ step: 'depth', progress: p }),
    signal,
  );

  onStage({ step: 'mesh' });
  const mesh = buildReliefMesh({
    depth: depth.data,
    depthWidth: depth.width,
    depthHeight: depth.height,
    rgba: cutout.data,
    width: cutout.width,
    height: cutout.height,
    grid: RELIEF_GRID,
    reliefDepth: RELIEF_DEPTH,
  });
  if (mesh.indices.length === 0) throw new Error('No object was found in the picture.');

  // Vertex colors are stored in sRGB; three.js wants linear values.
  const linear = new Float32Array(mesh.colors.length);
  const c = new Color();
  for (let i = 0; i < mesh.colors.length; i += 3) {
    c.setRGB(mesh.colors[i], mesh.colors[i + 1], mesh.colors[i + 2], SRGBColorSpace);
    linear.set([c.r, c.g, c.b], i);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('color', new BufferAttribute(linear, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeVertexNormals();

  const group = new Group();
  group.name = 'Relief';
  group.add(
    new Mesh(
      geometry,
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }),
    ),
  );
  return group;
}
