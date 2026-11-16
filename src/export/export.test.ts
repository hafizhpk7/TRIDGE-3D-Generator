import { describe, expect, it } from 'vitest';
import { AnimationMixer, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import cat from '../craft/fixtures/cat.json';
import { buildCraft } from '../craft/builder/build';
import { createCraftObject } from '../craft/builder/object';
import { validateSpec } from '../craft/spec/validate';
import type { AnimTarget } from '../animate/types';
import type { CraftObjectInfo } from '../craft/builder/object';
import { bakeExportClips, bakeSteps, MOTION_NODE } from './bake';
import { exportGlb, readGlb } from './glb';
import { fitToBed, stlSize, toObj, toStl } from './meshFormats';
import { boundsOf, collectTriangles } from './triangles';
import { formatBytes, slug } from './download';

function craftCat() {
  const r = validateSpec(JSON.parse(JSON.stringify(cat)));
  if (!r.spec) throw new Error('bad fixture');
  const built = buildCraft(r.spec, { detail: 3 });
  const obj = createCraftObject(built, 'cat', r.spec.bodyType);
  const info = obj.userData.craft as CraftObjectInfo;
  const target: AnimTarget = {
    root: obj,
    skeleton: info.skeleton,
    bodyType: info.bodyType!,
    frame: { front: [0, 0, 1], left: [1, 0, 0] },
    meshes: [info.mesh],
  };
  return { obj, target, built };
}

const walkJump = [
  { id: 'walk' as const, params: { speed: 1, intensity: 1 }, repeat: 1 },
  { id: 'jump' as const, params: { speed: 1, intensity: 1 }, repeat: 1 },
];

describe('file names and sizes', () => {
  it('makes safe names', () => {
    expect(slug('Fluffy Cat!.glb')).toBe('fluffy-cat');
    expect(slug('???')).toBe('model');
  });
  it('formats byte counts', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('collectTriangles', () => {
  it('reads a plain mesh in world space with its color', () => {
    const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshStandardMaterial({ color: '#ff0000' }));
    const g = new Group();
    g.add(mesh);
    g.position.set(5, 0, 0);
    const soup = collectTriangles(g);
    expect(soup.count).toBe(12);
    const { min, max } = boundsOf(soup.positions);
    expect(min.x).toBeCloseTo(4);
    expect(max.x).toBeCloseTo(6);
    // pure red stays red after the color-space conversion
    expect(soup.colors![0]).toBeCloseTo(1);
    expect(soup.colors![1]).toBeCloseTo(0);
  });

  it('follows the bones of a skinned model', () => {
    const { obj, target } = craftCat();
    const before = boundsOf(collectTriangles(obj).positions);
    const jump = bakeSteps(target, [walkJump[1]], 'jump', { height: 2.4 })!;
    expect(jump).not.toBeNull();
    // bend the first bone with tracks to the middle of the clip
    const mixer = new AnimationMixer(obj);
    mixer.clipAction(jump).play();
    mixer.setTime(jump.duration * 0.4);
    const during = boundsOf(collectTriangles(obj).positions);
    const moved =
      Math.abs(during.max.y - before.max.y) + Math.abs(during.min.y - before.min.y) > 0.001 ||
      Math.abs(during.max.z - before.max.z) > 0.001;
    expect(moved).toBe(true);
  });

  it('skips helper meshes', () => {
    const g = new Group();
    g.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
    const helper = new Mesh(new BoxGeometry(9, 9, 9), new MeshStandardMaterial());
    helper.userData.helper = true;
    g.add(helper);
    expect(collectTriangles(g).count).toBe(12);
  });
});

describe('STL and OBJ', () => {
  const box = () => {
    const g = new Group();
    g.add(new Mesh(new BoxGeometry(2, 4, 2), new MeshStandardMaterial({ color: '#3366ff' })));
    g.position.set(7, 3, -2);
    return collectTriangles(g);
  };

  it('fits the model onto the bed at the requested height', () => {
    const fitted = fitToBed(box(), { heightMm: 50, zUp: false });
    const { min, max } = boundsOf(fitted);
    expect(min.y).toBeCloseTo(0);
    expect(max.y).toBeCloseTo(50);
    expect((min.x + max.x) / 2).toBeCloseTo(0);
    expect((min.z + max.z) / 2).toBeCloseTo(0);
  });

  it('puts +Z up when asked', () => {
    const fitted = fitToBed(box(), { heightMm: 50, zUp: true });
    const { min, max } = boundsOf(fitted);
    expect(min.z).toBeCloseTo(0);
    expect(max.z).toBeCloseTo(50);
  });

  it('writes a binary STL of the exact expected size', () => {
    const fitted = fitToBed(box(), { heightMm: 50, zUp: true });
    const stl = toStl(fitted);
    expect(stl.byteLength).toBe(stlSize(12));
    expect(new DataView(stl.buffer).getUint32(80, true)).toBe(12);
  });

  it('writes outward-facing normals', () => {
    const fitted = fitToBed(box(), { heightMm: 50, zUp: true });
    const stl = toStl(fitted);
    const view = new DataView(stl.buffer);
    const center = new Vector3(0, 0, 25);
    for (let t = 0; t < 12; t++) {
      const at = 84 + t * 50;
      const n = new Vector3(
        view.getFloat32(at, true),
        view.getFloat32(at + 4, true),
        view.getFloat32(at + 8, true),
      );
      const p = new Vector3(
        view.getFloat32(at + 12, true),
        view.getFloat32(at + 16, true),
        view.getFloat32(at + 20, true),
      );
      expect(n.dot(p.sub(center))).toBeGreaterThan(0);
    }
  });

  it('skips triangles that have no area', () => {
    const flat = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(new DataView(toStl(flat).buffer).getUint32(80, true)).toBe(1);
  });

  it('writes OBJ with shared vertices, faces and colors', () => {
    const soup = box();
    const obj = toObj(soup.positions, soup.colors, 'My Box');
    const vs = obj.split('\n').filter((l) => l.startsWith('v '));
    const fs = obj.split('\n').filter((l) => l.startsWith('f '));
    expect(fs).toHaveLength(12);
    expect(vs).toHaveLength(8);
    expect(vs[0].split(' ')).toHaveLength(7); // v x y z r g b
    expect(obj).toContain('o My_Box');
    // every face points at a vertex that exists
    for (const f of fs)
      for (const i of f.slice(2).split(' ')) expect(Number(i)).toBeLessThanOrEqual(vs.length);
  });
});

describe('baking animation', () => {
  it('records bones for a walk and jump timeline', () => {
    const { target } = craftCat();
    const clips = bakeExportClips(target, walkJump, { height: 2.4 });
    // timeline plus each move on its own
    expect(clips.map((c) => c.name)).toEqual(['Timeline', 'Walk', 'Jump']);
    const timeline = clips[0];
    expect(timeline.duration).toBeGreaterThan(clips[1].duration);
    expect(timeline.tracks.length).toBeGreaterThan(4);
    for (const t of timeline.tracks) {
      expect(t.times.length).toBeGreaterThan(2);
      expect(t.values.every(Number.isFinite)).toBe(true);
    }
  });

  it('gives a single move one clip and nothing for an empty timeline', () => {
    const { target } = craftCat();
    expect(bakeExportClips(target, [walkJump[0]]).map((c) => c.name)).toEqual(['Walk']);
    expect(bakeExportClips(target, [])).toEqual([]);
  });

  it('records whole-model motion on its own node for a model with no skeleton', () => {
    const clip = bakeSteps(
      null,
      [{ id: 'hop', params: { speed: 1, intensity: 1 }, repeat: 1 }],
      'Hop',
      {
        height: 2.4,
        unitScale: 2,
      },
    );
    expect(clip).not.toBeNull();
    expect(clip!.tracks.every((t) => t.name.startsWith(`${MOTION_NODE}.`))).toBe(true);
    const pos = clip!.tracks.find((t) => t.name === `${MOTION_NODE}.position`)!;
    const ys = pos.values.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(0.05);
  });
});

describe('GLB export', () => {
  it('exports a skinned model with animations that read back and play', async () => {
    const { obj, target } = craftCat();
    const clips = bakeExportClips(target, walkJump, { height: 2.4 });
    const glb = await exportGlb(obj, clips);
    expect(new DataView(glb).getUint32(0, true)).toBe(0x46546c67); // "glTF"

    const { summary, scene, clips: loaded } = await readGlb(glb);
    expect(summary.meshes).toBe(1);
    expect(summary.bones).toBe(target.skeleton.bones.length);
    expect(summary.animations.map((a) => a.name)).toEqual(['Timeline', 'Walk', 'Jump']);
    expect(summary.triangles).toBeGreaterThan(100);

    // the file really plays: some bone turns when the walk clip runs
    const names = target.skeleton.bones.map((x) => x.name);
    const before = names.map((n) => scene.getObjectByName(n)!.quaternion.clone());
    const mixer = new AnimationMixer(scene);
    const walk = loaded.find((c) => c.name === 'Walk')!;
    mixer.clipAction(walk).play();
    mixer.setTime(walk.duration * 0.25);
    const moved = names.some(
      (n, i) => scene.getObjectByName(n)!.quaternion.angleTo(before[i]) > 1e-3,
    );
    expect(moved).toBe(true);
  });

  it('passes the official Khronos validator', async () => {
    const { obj, target } = craftCat();
    const glb = await exportGlb(obj, bakeExportClips(target, walkJump, { height: 2.4 }));
    const validator = await import('gltf-validator');
    const report = await validator.validateBytes(new Uint8Array(glb));
    expect(report.issues.numErrors).toBe(0);
    expect(report.info.animationCount).toBe(3);
  });

  it('exports a static model with no animations', async () => {
    const g = new Group();
    g.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#ffcc00' })));
    const { summary } = await readGlb(await exportGlb(g));
    expect(summary.animations).toEqual([]);
    expect(summary.triangles).toBe(12);
  });

  it('carries whole-model motion on a named node', async () => {
    const g = new Group();
    g.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
    const clip = bakeSteps(
      null,
      [{ id: 'hop', params: { speed: 1, intensity: 1 }, repeat: 1 }],
      'Hop',
      {
        height: 1,
      },
    )!;
    const { scene, summary } = await readGlb(await exportGlb(g, [clip]));
    expect(summary.animations[0].name).toBe('Hop');
    expect(scene.getObjectByName(MOTION_NODE)).toBeDefined();
  });

  it('leaves the live model untouched', async () => {
    const { obj, target } = craftCat();
    const bone = target.skeleton.bones[2];
    bone.rotation.set(0.5, 0, 0);
    const before = bone.quaternion.clone();
    await exportGlb(obj, []);
    expect(bone.quaternion.equals(before)).toBe(true);
  });
});
