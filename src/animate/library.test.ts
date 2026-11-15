import { describe, expect, it } from 'vitest';
import { AnimationMixer, Quaternion, type Skeleton } from 'three';
import { buildCraft } from '../craft/builder/build';
import { createCraftObject, type CraftObjectInfo } from '../craft/builder/object';
import { TEMPLATES, buildTemplateSpec, getTemplate } from '../craft/templates';
import { CLIP_LIBRARY, availableAnimations, buildClip, clipSeconds, makeContext } from './library';
import type { AnimTarget, ClipId } from './types';

function craftTarget(
  templateId: string,
  params = {},
): AnimTarget & { group: ReturnType<typeof createCraftObject> } {
  const t = getTemplate(templateId)!;
  const spec = buildTemplateSpec(t, params);
  const group = createCraftObject(buildCraft(spec, { detail: 4 }), spec.name);
  const info = group.userData.craft as CraftObjectInfo;
  return {
    group,
    root: group,
    skeleton: info.skeleton,
    bodyType: spec.bodyType,
    frame: { front: [0, 0, 1], left: [1, 0, 0] },
    meshes: [info.mesh],
  };
}

const params = { speed: 1, intensity: 1 };

describe.each(TEMPLATES.map((t) => [t.id] as const))('animations for the %s template', (id) => {
  const target = craftTarget(id);
  const defs = CLIP_LIBRARY[target.bodyType];
  const names = new Set(target.skeleton.bones.map((b) => b.name));

  it('has clips for its body type (objects use whole-model motions only)', () => {
    if (target.bodyType === 'object') expect(Object.keys(defs)).toHaveLength(0);
    else expect(Object.keys(defs).length).toBeGreaterThanOrEqual(2);
  });

  it.each(Object.keys(defs))('%s builds at least one track on real bones', (clipId) => {
    const clip = buildClip(target, clipId as ClipId, params)!;
    expect(clip).not.toBeNull();
    expect(clip.duration).toBeGreaterThan(0.3);
    expect(clip.tracks.length).toBeGreaterThan(0);
    for (const track of clip.tracks) {
      const bone = track.name.split('.')[0];
      expect(names.has(bone), `${clipId} animates unknown bone ${bone}`).toBe(true);
      for (const v of track.values) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('clip behavior', () => {
  const cat = craftTarget('cat');
  const ctx = makeContext(cat);

  it('loops end exactly where they start', () => {
    for (const [clipId, def] of Object.entries(CLIP_LIBRARY.quadruped)) {
      if (!def!.loop) continue;
      const clip = buildClip(cat, clipId as ClipId, params)!;
      for (const track of clip.tracks) {
        const n = track.getValueSize();
        const first = Array.from(track.values.slice(0, n));
        const last = Array.from(track.values.slice(track.values.length - n));
        first.forEach((v, i) => expect(last[i], `${clipId} ${track.name}`).toBeCloseTo(v, 5));
      }
    }
  });

  it('walks with diagonal legs together', () => {
    const pose = CLIP_LIBRARY.quadruped.walk!.sample(0.25, ctx, 1);
    const swing = (n: string) => pose.rot[n][0];
    expect(Math.sign(swing('leg_front_l'))).toBe(Math.sign(swing('leg_back_r')));
    expect(Math.sign(swing('leg_front_r'))).toBe(Math.sign(swing('leg_back_l')));
    expect(Math.sign(swing('leg_front_l'))).toBe(-Math.sign(swing('leg_front_r')));
    expect(Math.abs(swing('leg_front_l'))).toBeGreaterThan(0.3);
  });

  it('gallops with the front pair and back pair each moving together', () => {
    const pose = CLIP_LIBRARY.quadruped.run!.sample(0.1, ctx, 1);
    expect(pose.rot.leg_front_l[0]).toBeCloseTo(pose.rot.leg_front_r[0], 0);
    expect(pose.rot.leg_back_l[0]).toBeCloseTo(pose.rot.leg_back_r[0], 0);
  });

  it('jumps up from the ground, never below it, and lands back at rest', () => {
    const clip = buildClip(cat, 'jump', params)!;
    const root = clip.tracks.find((t) => t.name === 'root.position')!;
    const base = cat.skeleton.bones.find((b) => b.name === 'root')!.position.y;
    const ys = Array.from({ length: root.times.length }, (_, i) => root.values[i * 3 + 1] - base);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...ys)).toBeGreaterThan(0.2 * ctx.height);
    expect(ys[0]).toBeCloseTo(0);
    expect(ys.at(-1)).toBeCloseTo(0, 1);
  });

  it('a bigger intensity jumps higher', () => {
    const peak = (intensity: number) => {
      const clip = buildClip(cat, 'jump', { speed: 1, intensity })!;
      const root = clip.tracks.find((t) => t.name === 'root.position')!;
      const base = cat.skeleton.bones.find((b) => b.name === 'root')!.position.y;
      return Math.max(
        ...Array.from({ length: root.times.length }, (_, i) => root.values[i * 3 + 1] - base),
      );
    };
    expect(peak(1.5)).toBeGreaterThan(peak(1) * 1.3);
    expect(peak(0.5)).toBeLessThan(peak(1) * 0.7);
  });

  it('speed changes the length of a clip', () => {
    const slow = buildClip(cat, 'walk', { speed: 0.5, intensity: 1 })!.duration;
    const fast = buildClip(cat, 'walk', { speed: 2, intensity: 1 })!.duration;
    expect(slow).toBeCloseTo(fast * 4, 1);
  });

  it('longer legs take slower steps', () => {
    const short = craftTarget('cat', { legLen: 0.6 });
    const long = craftTarget('cat', { legLen: 1.4 });
    const a = clipSeconds('quadruped', 'walk', makeContext(short), params);
    const b = clipSeconds('quadruped', 'walk', makeContext(long), params);
    expect(b).toBeGreaterThan(a);
  });

  it('skips bones that do not exist, so partial skeletons still animate', () => {
    const partial = { ...cat } as unknown as AnimTarget;
    const keep = new Set(['root', 'hips', 'spine', 'head']);
    const bones = cat.skeleton.bones.filter((b) => keep.has(b.name));
    const idx = cat.skeleton.bones.map((b, i) => (keep.has(b.name) ? i : -1)).filter((i) => i >= 0);
    partial.skeleton = {
      bones,
      boneInverses: idx.map((i) => cat.skeleton.boneInverses[i]),
    } as unknown as Skeleton;
    const clip = buildClip(partial, 'walk', params)!;
    expect(clip.tracks.length).toBeGreaterThan(0);
    for (const t of clip.tracks) expect(keep.has(t.name.split('.')[0])).toBe(true);
  });

  it('playing a clip actually moves the bones', () => {
    const mixer = new AnimationMixer(cat.group);
    mixer.clipAction(buildClip(cat, 'walk', params)!).play();
    mixer.update(0.2);
    const leg = cat.skeleton.bones.find((b) => b.name === 'leg_front_l')!;
    expect(leg.quaternion.angleTo(new Quaternion())).toBeGreaterThan(0.05);
  });
});

describe('rest-pose adaptation', () => {
  it('finds hanging arms on a Craft person and raises them above the head for a wave', () => {
    const human = craftTarget('human');
    const ctx = makeContext(human);
    expect(ctx.hangsDown('arm_l')).toBe(true);
    // from hanging (-90 degrees) to 100 degrees above horizontal is nearly 3.3 radians of turn
    expect(ctx.raise('arm_l', 1.75)).toBeGreaterThan(2.5);
    expect(ctx.raise('arm_r', 1.75)).toBeLessThan(-2.5);
  });

  it('knows a bone chain and the hip height', () => {
    const cat = makeContext(craftTarget('cat'));
    expect(cat.chain('tail')).toEqual(['tail_1', 'tail_2', 'tail_3', 'tail_4']);
    expect(cat.legLen).toBeGreaterThan(0.5);
    expect(cat.height).toBeGreaterThan(cat.legLen);
  });
});

describe('availableAnimations', () => {
  const ids = (t: Parameters<typeof availableAnimations>[0]) =>
    availableAnimations(t).map((a) => a.id);

  it('offers bone clips by body type plus whole-model motions', () => {
    expect(ids('quadruped')).toEqual(
      expect.arrayContaining([
        'idle',
        'walk',
        'trot',
        'run',
        'jump',
        'sit',
        'lie_down',
        'stretch',
        'tail_wag',
        'look_around',
        'bounce',
        'spin',
      ]),
    );
    expect(ids('quadruped')).not.toContain('wave');
    expect(ids('biped')).toEqual(
      expect.arrayContaining(['idle', 'walk', 'run', 'jump', 'wave', 'dance', 'sit', 'clap']),
    );
    expect(ids('bird')).toEqual(expect.arrayContaining(['idle', 'hop', 'flap', 'fly']));
    expect(ids('fish')).toContain('swim');
    expect(ids('snake')).toContain('slither');
  });

  it('lets a bird hop with its bones instead of the whole-model hop', () => {
    const hop = availableAnimations('bird').filter((a) => a.id === 'hop');
    expect(hop).toHaveLength(1);
    expect(hop[0].kind).toBe('clip');
    expect(availableAnimations('quadruped').find((a) => a.id === 'hop')?.kind).toBe('motion');
  });

  it('gives an unrigged model the six whole-model motions', () => {
    expect(ids(null)).toEqual(
      expect.arrayContaining(['bounce', 'hop', 'spin', 'wobble', 'squash', 'float']),
    );
    expect(availableAnimations(null).every((a) => a.kind === 'motion')).toBe(true);
    expect(ids('object')).toEqual(ids(null).length ? expect.arrayContaining(['bounce']) : []);
  });
});
