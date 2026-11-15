import type { Frame, Vec3 } from './frame';
import type { RigBodyType } from './skeleton';

export interface BoneTurn {
  axis: Vec3;
  /** Radians. */
  angle: number;
}

const UP: Vec3 = [0, 1, 0];

/**
 * A quick pose for checking skin weights: `t` from -1 to 1 swings limbs one way or the other,
 * nods the head, and bends tails and spines. Returns only bones that exist in `names`, so partial
 * skeletons are fine.
 */
export function testPose(
  bodyType: RigBodyType,
  frame: Pick<Frame, 'front' | 'left'>,
  t: number,
  names: Iterable<string>,
): Map<string, BoneTurn> {
  const have = new Set(names);
  const out = new Map<string, BoneTurn>();
  const turn = (name: string, axis: Vec3, angle: number) => {
    if (have.has(name)) out.set(name, { axis, angle });
  };
  const side = frame.left; // swings forward and back
  const front = frame.front; // flaps up and down

  switch (bodyType) {
    case 'quadruped':
      // diagonal pairs move together
      turn('leg_front_l', side, t * 0.7);
      turn('leg_back_r', side, t * 0.7);
      turn('leg_front_r', side, -t * 0.7);
      turn('leg_back_l', side, -t * 0.7);
      turn('head', side, t * 0.3);
      turn('spine', UP, t * 0.1);
      for (let i = 1; i <= 3; i++) turn(`tail_${i}`, UP, t * 0.4);
      break;
    case 'biped':
      turn('leg_l', side, t * 0.6);
      turn('leg_r', side, -t * 0.6);
      turn('arm_l', side, -t * 0.7);
      turn('arm_r', side, t * 0.7);
      turn('head', UP, t * 0.3);
      turn('spine', UP, t * 0.12);
      break;
    case 'bird':
      turn('wing_l', front, t * 0.8);
      turn('wing_r', front, -t * 0.8);
      turn('leg_l', side, t * 0.5);
      turn('leg_r', side, -t * 0.5);
      turn('head', side, t * 0.3);
      for (let i = 1; i <= 3; i++) turn(`tail_${i}`, side, t * 0.25);
      break;
    case 'fish':
      for (let i = 1; i <= 3; i++) turn(`tail_${i}`, UP, t * 0.35 * (i % 2 ? 1 : 1.2));
      turn('fin_l', front, t * 0.6);
      turn('fin_r', front, -t * 0.6);
      turn('head', UP, -t * 0.1);
      break;
    case 'snake':
      for (let i = 1; i <= 6; i++) turn(`segment_${i}`, UP, t * 0.3 * (i % 2 ? 1 : -1));
      turn('head', UP, t * 0.2);
      break;
    case 'object':
      turn('root', UP, t * 0.6);
      break;
  }
  return out;
}
