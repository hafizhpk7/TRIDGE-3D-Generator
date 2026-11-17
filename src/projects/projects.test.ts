import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import cat from '../craft/fixtures/cat.json';
import { validateSpec } from '../craft/spec/validate';
import { ArchiveError, packProject, unpackProject } from './archive';
import {
  duplicateProject,
  listProjects,
  loadProject,
  nearlyFull,
  removeProject,
  renameProject,
  resetDb,
  saveProject,
} from './db';
import type { Packed, Project } from './types';

const bytes = (...n: number[]): ArrayBuffer => new Uint8Array(n).buffer;
const packed = (type: string, ...n: number[]): Packed => ({ type, bytes: bytes(...n) });

function project(id: string, over: Partial<Project['meta']> = {}): Project {
  return {
    meta: {
      id,
      name: `Project ${id}`,
      createdAt: 1000,
      updatedAt: 2000,
      kind: 'model',
      bytes: 10,
      thumb: packed('image/png', 1, 2, 3),
      ...over,
    },
    data: {
      id,
      step: 'lowpoly',
      modelName: 'fox.glb',
      model: packed('model/gltf-binary', 9, 8, 7, 6),
      image: { packed: packed('image/png', 5, 5), backgroundRemoved: true },
      lowpoly: {
        settings: { targetTriangles: 600, colorMode: 'palette', paletteSize: 6, lockBorders: true },
        palette: [
          [255, 0, 0],
          [0, 255, 0],
        ],
        view: 'split',
      },
      rig: {
        bodyType: 'quadruped',
        facing: '+z',
        joints: { root: [0, 1, 0], head: [0, 2, 1] },
        mirror: true,
        rigged: true,
        variant: 'lowpoly',
      },
      anim: {
        steps: [{ id: 'walk', params: { speed: 0.6, intensity: 1 }, repeat: 2 }],
        speed: 1.5,
        loop: true,
        poses: [
          { name: 'Mid-jump', pose: { root: { position: [0, 1, 0], quaternion: [0, 0, 0, 1] } } },
        ],
      },
    },
  };
}

beforeEach(() => {
  resetDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('project storage', () => {
  it('saves a project and reads it back whole', async () => {
    await saveProject(project('a'));
    const back = await loadProject('a');
    expect(back?.meta.name).toBe('Project a');
    expect(back?.data.rig?.joints.head).toEqual([0, 2, 1]);
    expect(new Uint8Array(back!.data.model!.bytes)).toEqual(new Uint8Array([9, 8, 7, 6]));
    expect(back?.data.anim?.poses[0].name).toBe('Mid-jump');
  });

  it('lists gallery cards newest first without needing the contents', async () => {
    await saveProject(project('old', { updatedAt: 100 }));
    await saveProject(project('new', { updatedAt: 900 }));
    await saveProject(project('mid', { updatedAt: 500 }));
    expect((await listProjects()).map((m) => m.id)).toEqual(['new', 'mid', 'old']);
  });

  it('updates a project in place when it is saved again', async () => {
    await saveProject(project('a'));
    await saveProject(project('a', { name: 'Renamed by save', updatedAt: 3000 }));
    const all = await listProjects();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Renamed by save');
  });

  it('renames, ignoring blank names', async () => {
    await saveProject(project('a'));
    await renameProject('a', '  Fluffy  ');
    expect((await listProjects())[0].name).toBe('Fluffy');
    await renameProject('a', '   ');
    expect((await listProjects())[0].name).toBe('Fluffy');
  });

  it('duplicates into an independent copy', async () => {
    await saveProject(project('a'));
    const copyId = await duplicateProject('a');
    expect(copyId).toBeTruthy();
    expect(copyId).not.toBe('a');
    const copy = await loadProject(copyId!);
    expect(copy?.meta.name).toBe('Project a copy');
    expect(copy?.data.id).toBe(copyId);
    await removeProject('a');
    expect(await loadProject(copyId!)).not.toBeNull();
    expect(await loadProject('a')).toBeNull();
  });

  it('deletes both the card and the contents', async () => {
    await saveProject(project('a'));
    await removeProject('a');
    expect(await listProjects()).toEqual([]);
    expect(await loadProject('a')).toBeNull();
  });

  it('returns null for a project that does not exist', async () => {
    expect(await loadProject('nope')).toBeNull();
    expect(await duplicateProject('nope')).toBeNull();
  });
});

describe('storage warning', () => {
  it('warns when storage is nearly full', () => {
    expect(nearlyFull({ usage: 90, quota: 100 })).toBe(true);
    expect(nearlyFull({ usage: 50, quota: 100 })).toBe(false);
    expect(nearlyFull(null)).toBe(false);
  });
});

describe('.tridge files', () => {
  it('round-trips a whole project', () => {
    const original = project('a');
    const file = packProject(original);
    const back = unpackProject(file);
    expect(back.meta.id).not.toBe('a'); // imports never overwrite
    expect(back.data.id).toBe(back.meta.id);
    expect(back.meta.name).toBe('Project a');
    expect(back.meta.createdAt).toBe(1000);
    expect(back.data.step).toBe('lowpoly');
    expect(back.data.lowpoly).toEqual(original.data.lowpoly);
    expect(back.data.rig).toEqual(original.data.rig);
    expect(back.data.anim).toEqual(original.data.anim);
    expect(back.data.image?.backgroundRemoved).toBe(true);
    expect(new Uint8Array(back.data.model!.bytes)).toEqual(new Uint8Array([9, 8, 7, 6]));
    expect(new Uint8Array(back.data.image!.packed.bytes)).toEqual(new Uint8Array([5, 5]));
    expect(new Uint8Array(back.meta.thumb!.bytes)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('round-trips a Craft project through the spec checker', () => {
    const spec = validateSpec(JSON.parse(JSON.stringify(cat))).spec!;
    const p = project('c', { kind: 'craft' });
    p.data = {
      id: 'c',
      step: 'animate',
      modelName: 'cat',
      craft: { spec, detail: 4, softJoints: false },
    };
    const back = unpackProject(packProject(p));
    expect(back.meta.kind).toBe('craft');
    expect(back.data.craft?.spec.name).toBe(spec.name);
    expect(back.data.craft?.detail).toBe(4);
    expect(back.data.model).toBeUndefined();
  });

  it('stores and reads back through the database', async () => {
    const back = unpackProject(packProject(project('a')));
    await saveProject(back);
    const stored = await loadProject(back.meta.id);
    expect(stored?.data.rig?.rigged).toBe(true);
  });

  it('rejects files that are not zip files', () => {
    expect(() => unpackProject(strToU8('hello'))).toThrow(ArchiveError);
  });

  it('rejects a zip without a project description', () => {
    expect(() => unpackProject(zipSync({ 'readme.txt': strToU8('hi') }))).toThrow(/not a TRIDGE/);
  });

  it('rejects a damaged or newer description', () => {
    const zip = (json: unknown) => zipSync({ 'project.json': strToU8(JSON.stringify(json)) });
    expect(() => unpackProject(zip({ format: 'other' }))).toThrow(/damaged or from a newer/);
    expect(() => unpackProject(zip({ format: 'tridge', version: 2 }))).toThrow(ArchiveError);
    expect(() => unpackProject(zipSync({ 'project.json': strToU8('{not json') }))).toThrow(
      ArchiveError,
    );
  });

  it('rejects a project whose model file is missing', () => {
    const file = packProject(project('a'));
    // rebuild the zip without the model asset
    const json = {
      format: 'tridge',
      version: 1,
      meta: { name: 'x', createdAt: 1, updatedAt: 2, kind: 'model' },
      data: {
        step: 'input',
        modelName: 'x',
        model: { file: 'assets/model.glb', type: 'model/gltf-binary' },
      },
    };
    expect(file.byteLength).toBeGreaterThan(0);
    expect(() => unpackProject(zipSync({ 'project.json': strToU8(JSON.stringify(json)) }))).toThrow(
      /missing assets\/model.glb/,
    );
  });

  it('rejects a project with nothing to show', () => {
    const json = {
      format: 'tridge',
      version: 1,
      meta: { name: 'x', createdAt: 1, updatedAt: 2, kind: 'model' },
      data: { step: 'input', modelName: 'x' },
    };
    expect(() => unpackProject(zipSync({ 'project.json': strToU8(JSON.stringify(json)) }))).toThrow(
      /no model/,
    );
  });

  it('rejects a Craft shape that is not valid', () => {
    const json = {
      format: 'tridge',
      version: 1,
      meta: { name: 'x', createdAt: 1, updatedAt: 2, kind: 'craft' },
      data: {
        step: 'input',
        modelName: 'x',
        craft: { spec: { nonsense: true }, detail: 5, softJoints: true },
      },
    };
    expect(() => unpackProject(zipSync({ 'project.json': strToU8(JSON.stringify(json)) }))).toThrow(
      /not valid/,
    );
  });

  it('ignores unexpected files and refuses paths outside its own list', () => {
    const p = project('a');
    const good = packProject(p);
    expect(unpackProject(good).data.model).toBeDefined();
    const json = JSON.stringify({
      format: 'tridge',
      version: 1,
      meta: { name: 'x', createdAt: 1, updatedAt: 2, kind: 'model' },
      data: { step: 'input', modelName: 'x', model: { file: '../../evil.glb', type: 'a/b' } },
    });
    expect(() => unpackProject(zipSync({ 'project.json': strToU8(json) }))).toThrow(ArchiveError);
  });

  it('rejects absurd numbers inside the description', () => {
    const p = project('a');
    p.data.lowpoly!.settings.targetTriangles = 1e12;
    expect(() => unpackProject(packProject(p))).toThrow(/damaged/);
  });
});
