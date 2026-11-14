import { Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { extensionOf, isSupportedModel } from './helpers';

export interface LoadedModel {
  object: Object3D;
  bytes: number;
  name: string;
}

export class ModelLoadError extends Error {}

function parseGltf(buffer: ArrayBuffer): Promise<Object3D> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      buffer,
      '',
      (gltf) => resolve(gltf.scene),
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}

function parseObj(text: string): Object3D {
  const group: Group = new OBJLoader().parse(text);
  // OBJ has no materials of its own here, so give meshes a friendly default.
  const fallback = new MeshStandardMaterial({ color: '#ffd43b', roughness: 0.7 });
  group.traverse((o) => {
    if (o instanceof Mesh) o.material = fallback;
  });
  return group;
}

export async function loadModelFromBuffer(buffer: ArrayBuffer, name: string): Promise<LoadedModel> {
  const ext = extensionOf(name);
  try {
    if (ext === 'obj') {
      const object = parseObj(new TextDecoder().decode(buffer));
      return { object, bytes: buffer.byteLength, name };
    }
    const object = await parseGltf(buffer);
    return { object, bytes: buffer.byteLength, name };
  } catch {
    if (ext === 'gltf') {
      throw new ModelLoadError(
        `Could not read ${name}. A .gltf file that points to separate files can't be opened here. Try the .glb version instead.`,
      );
    }
    throw new ModelLoadError(`Could not read ${name}. Check that the file isn't damaged.`);
  }
}

export async function loadModelFromFile(file: File): Promise<LoadedModel> {
  if (!isSupportedModel(file.name)) {
    throw new ModelLoadError(`${file.name} isn't a supported file. Use .glb, .gltf or .obj.`);
  }
  return loadModelFromBuffer(await file.arrayBuffer(), file.name);
}

export async function loadModelFromUrl(url: string, name: string): Promise<LoadedModel> {
  const res = await fetch(url);
  if (!res.ok) throw new ModelLoadError(`Could not download ${name} (status ${res.status}).`);
  return loadModelFromBuffer(await res.arrayBuffer(), name);
}
