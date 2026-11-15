import { describe, expect, it, vi } from 'vitest';
import { Quaternion } from 'three';
import { buildCraft } from '../craft/builder/build';
import { createCraftObject, type CraftObjectInfo } from '../craft/builder/object';
import { buildTemplateSpec, getTemplate } from '../craft/templates';
import { makeContext } from './library';
import {
  CROSSFADE,
  Sequencer,
  blend,
  localTime,
  planSteps,
  weightAt,
  type SeqStep,
} from './player';
import type { AnimTarget } from './types';

function catTarget(): AnimTarget {
  const spec = buildTemplateSpec(getTemplate('cat')!, {});
  const group = createCraftObject(buildCraft(spec, { detail: 4 }), spec.name);
  const info = group.userData.craft as CraftObjectInfo;
  return {
    root: group,
    skeleton: info.skeleton,
    bodyType: 'quadruped',
    frame: { front: [0, 0, 1], left: [1, 0, 0] },
    meshes: [info.mesh],
  };
}

const step = (id: SeqStep['id'], params = {}, repeat = 1): SeqStep => ({
  id,
  params: { speed: 1, intensity: 1, ...params },
  repeat,
});

describe('planning', () => {
  const target = catTarget();
  const ctx = makeContext(target);

  it('lays steps end to end, overlapping by the crossfade', () => {
    const { planned, total } = planSteps([step('walk'), step('jump')], 'quadruped', ctx);
    expect(planned[0].start).toBe(0);
    expect(planned[1].start).toBeCloseTo(planned[0].seconds - CROSSFADE);
    expect(planned[0].fadeOut).toBeCloseTo(CROSSFADE);
    expect(planned[1].fadeIn).toBeCloseTo(CROSSFADE);
    expect(total).toBeCloseTo(planned[1].start + planned[1].seconds);
  });

  it('plays a loop for about three seconds, or for the cycles or seconds asked for', () => {
    const defaults = planSteps([step('walk')], 'quadruped', ctx).planned[0];
    expect(defaults.seconds).toBeGreaterThan(2);
    expect(defaults.seconds).toBeLessThan(4.5);
    expect(defaults.seconds / defaults.cycle).toBeCloseTo(
      Math.round(defaults.seconds / defaults.cycle),
    );
    const timed = planSteps([step('walk', { duration: 6 })], 'quadruped', ctx).planned[0];
    expect(timed.seconds).toBe(6);
    const cycles = planSteps([step('wave', {}, 2)], 'biped', makeContext(target)).planned[0];
    void cycles;
    const twice = planSteps([step('walk', {}, 2)], 'quadruped', ctx).planned[0];
    expect(twice.seconds).toBeCloseTo(twice.cycle * 2);
  });

  it('plays a one-shot clip once per repeat', () => {
    const once = planSteps([step('jump')], 'quadruped', ctx).planned[0];
    const twice = planSteps([step('jump', {}, 2)], 'quadruped', ctx).planned[0];
    expect(twice.seconds).toBeCloseTo(once.seconds * 2);
    expect(once.kind).toBe('clip');
  });

  it('slower speed makes the walk longer', () => {
    const slow = planSteps([step('walk', { speed: 0.5 })], 'quadruped', ctx).planned[0].cycle;
    const normal = planSteps([step('walk')], 'quadruped', ctx).planned[0].cycle;
    expect(slow).toBeCloseTo(normal * 2);
  });

  it('treats moves a body type lacks as whole-model motions', () => {
    const p = planSteps([step('spin'), step('wave')], 'quadruped', ctx).planned;
    expect(p.map((x) => x.kind)).toEqual(['motion', 'motion']);
    const noRig = planSteps([step('bounce')], null, null).planned[0];
    expect(noRig.kind).toBe('motion');
  });

  it('keeps short steps from crossfading longer than half of them', () => {
    const { planned } = planSteps(
      [step('bounce', { duration: 0.3 }), step('spin', { duration: 0.3 })],
      null,
      null,
    );
    expect(planned[1].fadeIn).toBeLessThanOrEqual(0.15 + 1e-9);
  });

  it('is empty for no steps', () => {
    expect(planSteps([], 'quadruped', ctx)).toEqual({ planned: [], total: 0 });
  });
});

describe('blending weights', () => {
  const target = catTarget();
  const { planned } = planSteps(
    [step('walk'), step('jump'), step('sit')],
    'quadruped',
    makeContext(target),
  );

  it('weights add up to one everywhere along the timeline', () => {
    const total = planned.at(-1)!.start + planned.at(-1)!.seconds;
    for (let t = 0; t <= total; t += 0.01) {
      const sum = planned.reduce((n, p) => n + weightAt(p, t), 0);
      expect(sum, `t=${t.toFixed(2)}`).toBeGreaterThan(0.999);
      expect(sum).toBeLessThan(1.001);
    }
  });

  it('is half-and-half in the middle of a crossfade', () => {
    const t = planned[1].start + planned[1].fadeIn / 2;
    expect(weightAt(planned[0], t)).toBeCloseTo(0.5, 1);
    expect(weightAt(planned[1], t)).toBeCloseTo(0.5, 1);
  });

  it('is zero outside a step', () => {
    expect(weightAt(planned[0], -1)).toBe(0);
    expect(weightAt(planned[0], 1000)).toBe(0);
  });

  it('wraps loops and holds one-shots on their last frame', () => {
    const walk = planned[0];
    expect(localTime(walk, walk.cycle * 1.25, true)).toBeCloseTo(walk.cycle * 0.25);
    const sit = planned[2];
    expect(localTime(sit, sit.start + sit.seconds + 5, false)).toBe(sit.cycle);
    expect(localTime(sit, sit.start + sit.cycle * 0.5, false)).toBeCloseTo(sit.cycle * 0.5);
  });

  it('blends whole-model motions by weight', () => {
    const a = {
      position: [0, 1, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    };
    const half = blend([{ w: 0.5, tr: a }]);
    expect(half.position[1]).toBeCloseTo(0.5);
    expect(blend([]).position).toEqual([0, 0, 0]);
  });
});

describe('Sequencer', () => {
  const legAngle = (target: AnimTarget) => {
    const leg = target.skeleton.bones.find((b) => b.name === 'leg_front_l')!;
    return leg.quaternion.angleTo(new Quaternion());
  };

  it('moves bones while scrubbing and returns to rest on stop', () => {
    const target = catTarget();
    const seq = new Sequencer();
    seq.setTarget(target);
    seq.setSteps([step('walk')]);
    expect(seq.total).toBeGreaterThan(2);
    seq.seek(seq.planned[0].cycle * 0.25);
    expect(legAngle(target)).toBeGreaterThan(0.2);
    seq.stop();
    expect(legAngle(target)).toBeCloseTo(0, 5);
    expect(seq.time).toBe(0);
  });

  it('plays, pauses, seeks and stops at the end', () => {
    const seq = new Sequencer();
    seq.setTarget(catTarget());
    seq.setSteps([step('walk'), step('sit')]);
    seq.play();
    expect(seq.playing).toBe(true);
    seq.update(1);
    expect(seq.time).toBeCloseTo(1);
    seq.pause();
    seq.update(1);
    expect(seq.time).toBeCloseTo(1);
    seq.play();
    seq.update(seq.total + 5);
    expect(seq.playing).toBe(false);
    expect(seq.time).toBeCloseTo(seq.total);
    seq.play(); // from the end it starts over
    expect(seq.time).toBe(0);
  });

  it('follows the speed setting', () => {
    const seq = new Sequencer();
    seq.setTarget(catTarget());
    seq.setSteps([step('walk', { duration: 10 })]);
    seq.speed = 2;
    seq.play();
    seq.update(1);
    expect(seq.time).toBeCloseTo(2);
  });

  it('can loop the whole sequence', () => {
    const seq = new Sequencer();
    seq.setTarget(catTarget());
    seq.setSteps([step('walk', { duration: 2 })]);
    seq.loop = true;
    seq.play();
    seq.update(2.5);
    expect(seq.playing).toBe(true);
    expect(seq.time).toBeCloseTo(0.5);
  });

  it('walks slowly, then jumps high, smoothly blended', () => {
    const target = catTarget();
    const seq = new Sequencer();
    seq.setTarget(target);
    seq.setSteps([step('walk', { speed: 0.6 }), step('jump', { intensity: 1.5 })]);
    expect(seq.planned.map((p) => p.id)).toEqual(['walk', 'jump']);

    // walking is slower than normal and jumping goes higher than normal
    const normal = new Sequencer();
    normal.setTarget(target);
    normal.setSteps([step('walk'), step('jump')]);
    expect(seq.planned[0].cycle).toBeGreaterThan(normal.planned[0].cycle * 1.5);

    const root = target.skeleton.bones.find((b) => b.name === 'root')!;
    const peak = (s: Sequencer) => {
      let max = -Infinity;
      for (let t = 0; t <= s.total; t += 0.02) {
        s.seek(t);
        max = Math.max(max, root.position.y);
      }
      return max;
    };
    const rest = root.position.y;
    s0: {
      const high = peak(seq);
      const base = peak(normal);
      expect(high - rest).toBeGreaterThan((base - rest) * 1.3);
      break s0;
    }

    // no pops: neighboring frames never differ by much, including through the crossfade
    const legs = ['leg_front_l', 'leg_back_r', 'spine', 'head'].map((n) =>
      target.skeleton.bones.find((b) => b.name === n)!,
    );
    const previous = legs.map(() => new Quaternion());
    let worst = 0;
    for (let t = 0; t <= seq.total; t += 1 / 30) {
      seq.seek(t);
      legs.forEach((b, i) => {
        if (t > 0) worst = Math.max(worst, b.quaternion.angleTo(previous[i]));
        previous[i] = b.quaternion.clone();
      });
    }
    expect(worst).toBeLessThan(0.35);
  });

  it('plays whole-model motions through the holder callback', () => {
    const onHolder = vi.fn();
    const seq = new Sequencer({ onHolder });
    seq.setTarget(null);
    seq.setHeight(2);
    seq.setSteps([step('bounce')]);
    seq.seek(0.4);
    const last = onHolder.mock.calls.at(-1)![0];
    expect(last).not.toBeNull();
    expect(last.position[1]).toBeGreaterThanOrEqual(0);
    seq.stop();
    expect(onHolder.mock.calls.at(-1)![0]).toBeNull();
  });

  it('saves a pose and brings it back', () => {
    const target = catTarget();
    const seq = new Sequencer();
    seq.setTarget(target);
    seq.setSteps([step('walk')]);
    seq.seek(0.3);
    const pose = seq.snapshot();
    const angle = legAngle(target);
    seq.stop();
    expect(legAngle(target)).toBeCloseTo(0, 5);
    seq.applyPose(pose);
    expect(legAngle(target)).toBeCloseTo(angle, 4);
    expect(Object.keys(pose)).toContain('leg_front_l');
  });

  it('survives an empty timeline and a missing target', () => {
    const seq = new Sequencer();
    seq.setSteps([]);
    seq.play();
    expect(seq.playing).toBe(false);
    seq.seek(3);
    expect(seq.time).toBe(0);
    expect(seq.snapshot()).toEqual({});
  });
});
