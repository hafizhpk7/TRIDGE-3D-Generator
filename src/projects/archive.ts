import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';
import { validateSpec } from '../craft/spec/validate';
import { newId } from './db';
import type { Packed, Project, ProjectData } from './types';

/** A problem with a .tridge file, worded for the person who picked it. */
export class ArchiveError extends Error {}

export const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;
const MAX_ENTRY_BYTES = 200 * 1024 * 1024;

const ASSETS = ['assets/image', 'assets/model.glb', 'assets/thumb.png'] as const;
const assetName = z.enum(ASSETS);
const finite = z.number().refine(Number.isFinite);
const vec3 = z.tuple([finite, finite, finite]);
const asset = z.object({ file: assetName, type: z.string().max(100) });

const manifest = z.object({
  format: z.literal('tridge'),
  version: z.literal(1),
  meta: z.object({
    name: z.string().min(1).max(200),
    createdAt: finite,
    updatedAt: finite,
    kind: z.enum(['model', 'craft']),
    thumb: asset.optional(),
  }),
  data: z.object({
    step: z.string().max(40),
    modelName: z.string().max(300),
    model: asset.optional(),
    image: asset.extend({ backgroundRemoved: z.boolean() }).optional(),
    craft: z
      .object({
        spec: z.unknown(),
        detail: finite.pipe(z.number().min(1).max(10)),
        softJoints: z.boolean(),
      })
      .optional(),
    lowpoly: z
      .object({
        settings: z.object({
          targetTriangles: finite.pipe(z.number().min(4).max(2_000_000)),
          colorMode: z.string().max(20),
          paletteSize: finite.pipe(z.number().min(1).max(64)),
          lockBorders: z.boolean(),
        }),
        palette: z.array(vec3).max(64).nullable(),
        view: z.enum(['original', 'lowpoly', 'split']),
      })
      .optional(),
    rig: z
      .object({
        bodyType: z.string().max(30),
        facing: z.string().max(4),
        joints: z.record(z.string().max(60), vec3),
        mirror: z.boolean(),
        rigged: z.boolean(),
        variant: z.enum(['original', 'lowpoly']).nullable(),
      })
      .optional(),
    anim: z
      .object({
        steps: z
          .array(
            z.object({
              id: z.string().max(40),
              params: z.object({
                speed: finite,
                intensity: finite,
                duration: finite.optional(),
              }),
              repeat: finite.optional(),
            }),
          )
          .max(200),
        speed: finite,
        loop: z.boolean(),
        poses: z
          .array(
            z.object({
              name: z.string().max(100),
              pose: z.record(
                z.string().max(60),
                z.object({ position: vec3, quaternion: z.tuple([finite, finite, finite, finite]) }),
              ),
            }),
          )
          .max(100),
      })
      .optional(),
  }),
});

type Manifest = z.infer<typeof manifest>;

/** Pack a project into one .tridge file (a zip holding a JSON description and the pictures and model). */
export function packProject(p: Project): Uint8Array {
  const files: Zippable = {};
  const add = (name: (typeof ASSETS)[number], packed: Packed | undefined) => {
    if (!packed) return undefined;
    files[name] = [new Uint8Array(packed.bytes), { level: name === 'assets/model.glb' ? 6 : 0 }];
    return { file: name, type: packed.type };
  };
  const d = p.data;
  const json: Manifest = {
    format: 'tridge',
    version: 1,
    meta: {
      name: p.meta.name,
      createdAt: p.meta.createdAt,
      updatedAt: p.meta.updatedAt,
      kind: p.meta.kind,
      thumb: add('assets/thumb.png', p.meta.thumb),
    },
    data: {
      step: d.step,
      modelName: d.modelName,
      model: add('assets/model.glb', d.model),
      image: d.image
        ? { ...add('assets/image', d.image.packed)!, backgroundRemoved: d.image.backgroundRemoved }
        : undefined,
      craft: d.craft,
      lowpoly: d.lowpoly,
      rig: d.rig,
      anim: d.anim,
    },
  };
  files['project.json'] = [strToU8(JSON.stringify(json)), { level: 6 }];
  return zipSync(files);
}

function bytesOf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

/**
 * Read a .tridge file into a new project (with a fresh id, so importing never overwrites anything).
 * Throws ArchiveError with a plain message when the file is not usable.
 */
export function unpackProject(bytes: Uint8Array): Project {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new ArchiveError('That file is too big to open.');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      // never inflate anything we do not know, or anything absurdly large
      filter: (f) =>
        (f.name === 'project.json' || (ASSETS as readonly string[]).includes(f.name)) &&
        f.originalSize <= MAX_ENTRY_BYTES,
    });
  } catch {
    throw new ArchiveError('That is not a TRIDGE project file.');
  }
  const raw = files['project.json'];
  if (!raw) throw new ArchiveError('That is not a TRIDGE project file.');
  let parsed: Manifest;
  try {
    const res = manifest.safeParse(JSON.parse(strFromU8(raw)));
    if (!res.success) throw new Error('shape');
    parsed = res.data;
  } catch {
    throw new ArchiveError('This project file is damaged or from a newer version of TRIDGE.');
  }

  const pack = (
    a: { file: (typeof ASSETS)[number]; type: string } | undefined,
  ): Packed | undefined => {
    if (!a) return undefined;
    const f = files[a.file];
    if (!f) throw new ArchiveError(`The project file is missing ${a.file}.`);
    return { type: a.type, bytes: bytesOf(f) };
  };

  const id = newId();
  const d = parsed.data;
  const data: ProjectData = { id, step: d.step, modelName: d.modelName };
  const model = pack(d.model);
  if (model) data.model = model;
  if (d.image)
    data.image = { packed: pack(d.image)!, backgroundRemoved: d.image.backgroundRemoved };
  if (d.craft) {
    const v = validateSpec(d.craft.spec);
    if (!v.spec) throw new ArchiveError('The Craft shape inside this project is not valid.');
    data.craft = { spec: v.spec, detail: d.craft.detail, softJoints: d.craft.softJoints };
  }
  if (!data.model && !data.craft) throw new ArchiveError('This project has no model in it.');
  if (d.lowpoly) data.lowpoly = d.lowpoly as ProjectData['lowpoly'];
  if (d.rig) data.rig = d.rig as ProjectData['rig'];
  if (d.anim) data.anim = d.anim as ProjectData['anim'];

  const thumb = pack(parsed.meta.thumb);
  const now = Date.now();
  let size = 0;
  for (const f of Object.values(files)) size += f.byteLength;
  return {
    meta: {
      id,
      name: parsed.meta.name,
      createdAt: parsed.meta.createdAt,
      updatedAt: now,
      kind: parsed.meta.kind,
      bytes: size,
      ...(thumb ? { thumb } : {}),
    },
    data,
  };
}
