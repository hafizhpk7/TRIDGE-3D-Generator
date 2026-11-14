/** RGB triple, each 0..1, in sRGB. */
export type Rgb = [number, number, number];

export type ColorMode = 'texture' | 'faces' | 'palette';

export interface LowPolySettings {
  targetTriangles: number;
  colorMode: ColorMode;
  /** Number of palette colors (4..16) when colorMode is "palette". */
  paletteSize: number;
  /** Try not to move the open edges of the mesh. */
  lockBorders: boolean;
}

export interface SourceTexture {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  /** three.js flips textures by default; glTF textures are not flipped. */
  flipY: boolean;
}

/** A mesh in plain arrays, safe to send to a worker. */
export interface SourceMesh {
  positions: Float32Array;
  indices: Uint32Array;
  uvs: Float32Array | null;
  /** Per-vertex RGB (sRGB 0..1), or null. */
  vertexColors: Float32Array | null;
  /** Material color (sRGB 0..1). */
  baseColor: Rgb;
  /** Index into SourceData.textures, or -1. */
  textureId: number;
}

export interface SourceData {
  meshes: SourceMesh[];
  textures: SourceTexture[];
}

/** Worker output for one mesh. Always flat-shaded (not indexed). */
export interface ResultMesh {
  /** 9 numbers per triangle. */
  positions: Float32Array;
  /** 9 numbers per triangle: the face normal repeated for each corner. */
  normals: Float32Array;
  /** 6 numbers per triangle, or null when the source had no UVs. */
  uvs: Float32Array | null;
  /** 3 numbers per triangle (sRGB 0..1). */
  faceColors: Float32Array;
  /** Palette slot per triangle in palette mode, otherwise null. */
  paletteIndex: Uint8Array | null;
}

export interface LowPolyResult {
  meshes: ResultMesh[];
  palette: Rgb[] | null;
  sourceTriangles: number;
  triangles: number;
  /** Which simplifier did the work. */
  engine: 'meshoptimizer' | 'three' | 'clustering';
}

export type WorkerRequest = {
  type: 'run';
  id: number;
  source: SourceData;
  settings: LowPolySettings;
};
export type WorkerResponse =
  | { type: 'progress'; id: number; stage: string }
  | { type: 'done'; id: number; result: LowPolyResult }
  | { type: 'error'; id: number; message: string };
