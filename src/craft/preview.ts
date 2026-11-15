import type { Bone } from 'three';
import type { CraftObjectInfo } from './builder/object';
import type { BodyType } from './spec/types';

/**
 * A small movement preview that proves the rig works: it swings bones by name, skipping any that do
 * not exist. The full animation library comes later and replaces this.
 */
export function previewMotion(bodyType: BodyType) {
  return (t: number, craft: CraftObjectInfo | null) => {
    if (!craft) return;
    const bones = new Map<string, Bone>(craft.skeleton.bones.map((b) => [b.name, b]));
    const rot = (name: string, x: number, y = 0, z = 0) => bones.get(name)?.rotation.set(x, y, z);
    const w = 5; // radians per second: a brisk walk
    const swing = (phase: number, amount: number) => Math.sin(t * w + phase) * amount;

    switch (bodyType) {
      case 'quadruped': {
        // diagonal pairs move together
        rot('leg_front_l', swing(0, 0.7));
        rot('leg_back_r', swing(0, 0.7));
        rot('leg_front_r', swing(Math.PI, 0.7));
        rot('leg_back_l', swing(Math.PI, 0.7));
        rot('spine', 0, swing(0, 0.06));
        rot('head', swing(Math.PI / 2, 0.06));
        break;
      }
      case 'biped': {
        rot('leg_l', swing(0, 0.7));
        rot('leg_r', swing(Math.PI, 0.7));
        rot('arm_l', swing(Math.PI, 0.6));
        rot('arm_r', swing(0, 0.6));
        rot('spine', 0, swing(0, 0.08));
        break;
      }
      case 'bird': {
        rot('wing_l', 0, 0, swing(0, 0.7));
        rot('wing_r', 0, 0, -swing(0, 0.7));
        rot('leg_l', swing(0, 0.5));
        rot('leg_r', swing(Math.PI, 0.5));
        rot('head', swing(Math.PI / 2, 0.1));
        break;
      }
      case 'fish':
      case 'snake':
        // a wave travelling down the chain
        for (let i = 1; i <= 8; i++) rot(`tail_${i}`, 0, swing(-i * 0.7, 0.35));
        for (let i = 1; i <= 12; i++) rot(`segment_${i}`, 0, swing(-i * 0.7, 0.3));
        rot('body', 0, swing(0, 0.1));
        rot('fin_l', 0, 0, swing(0, 0.4));
        rot('fin_r', 0, 0, -swing(0, 0.4));
        break;
      default:
        rot('root', 0, t * 1.2);
    }
  };
}
