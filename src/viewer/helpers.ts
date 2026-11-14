import type { BufferGeometry, Material, Object3D, Texture } from 'three';
import { Mesh } from 'three';

export interface ModelStats {
  triangles: number;
  vertices: number;
  bytes: number;
}

/** Distance at which a bounding sphere of `radius` fits the view, for either axis. */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = 1.25): number {
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const limiting = Math.min(vFov, hFov);
  return (radius * margin) / Math.sin(limiting / 2);
}

/** Uniform scale that makes the longest side equal `target`. Returns 1 for degenerate sizes. */
export function normalizeScale(maxDimension: number, target: number): number {
  return maxDimension > 1e-9 ? target / maxDimension : 1;
}

export function geometryCounts(geometry: BufferGeometry): { triangles: number; vertices: number } {
  const position = geometry.getAttribute('position');
  const vertices = position ? position.count : 0;
  const indexCount = geometry.index ? geometry.index.count : vertices;
  return { triangles: Math.floor(indexCount / 3), vertices };
}

export function computeStats(root: Object3D, bytes: number): ModelStats {
  let triangles = 0;
  let vertices = 0;
  root.traverse((o) => {
    if (o instanceof Mesh) {
      const c = geometryCounts(o.geometry);
      triangles += c.triangles;
      vertices += c.vertices;
    }
  });
  return { triangles, vertices, bytes };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

export const SUPPORTED_EXTENSIONS = ['glb', 'gltf', 'obj'] as const;
export type ModelExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export function isSupportedModel(name: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

const TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'envMap',
  'specularMap',
];

function disposeMaterial(material: Material, textures: boolean) {
  const record = material as unknown as Record<string, unknown>;
  for (const key of textures ? TEXTURE_KEYS : []) {
    const tex = record[key] as Texture | null | undefined;
    if (tex && typeof tex.dispose === 'function') {
      // Release the decoded bitmap held by glTF textures, not just the GPU copy.
      const image = tex.image as { close?: () => void } | undefined;
      tex.dispose();
      image?.close?.();
    }
  }
  material.dispose();
}

/**
 * Free every GPU and bitmap resource under `root`.
 * Pass `textures: false` when the textures are shared with another object that is still in use.
 */
export function disposeObject(root: Object3D, { textures = true } = {}) {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = mesh.material as Material | Material[] | undefined;
    if (Array.isArray(mats)) mats.forEach((m) => disposeMaterial(m, textures));
    else if (mats) disposeMaterial(mats, textures);
  });
}
