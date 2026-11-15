import type { Part, Vec3 } from '../spec/types';
import {
  COLORS,
  bone,
  box,
  capsule,
  cone,
  cylinder,
  makeSpec,
  reader,
  sphere,
  tidy,
  tube,
  type ParamDef,
  type Params,
  type Template,
} from './helpers';
import { shade } from './quadruped';

const round = (n: number) => Math.round(n * 100) / 100;

// ================================================================================================
// Bird
// ================================================================================================

const birdParams: ParamDef[] = [
  { key: 'beak', label: 'Beak size', type: 'range', min: 0.5, max: 1.8, step: 0.01 },
  { key: 'round', label: 'Body roundness', type: 'range', min: 0.8, max: 1.35, step: 0.01 },
  { key: 'wing', label: 'Wing length', type: 'range', min: 0.6, max: 1.7, step: 0.01 },
  { key: 'crest', label: 'Crest', type: 'toggle' },
  { key: 'body', label: 'Body color', type: 'color' },
  { key: 'belly', label: 'Belly color', type: 'color' },
  { key: 'beakColor', label: 'Beak color', type: 'color' },
];
const birdDefaults: Params = {
  beak: 1,
  round: 1,
  wing: 1,
  crest: true,
  body: COLORS.sky,
  belly: COLORS.cream,
  beakColor: COLORS.orange,
};

export const birdTemplate: Template = {
  id: 'bird',
  name: 'Bird',
  bodyType: 'bird',
  params: birdParams,
  defaults: birdDefaults,
  build(p) {
    const r = reader(birdDefaults, p);
    const rd = r.num('round');
    const beak = r.num('beak');
    const wing = r.num('wing');
    const bodyR: Vec3 = [0.9 * rd, 0.85 * rd, 1.0];
    const bodyY = 0.55 + bodyR[1] * 0.8;
    const headR = 0.55;
    const headY = bodyY + bodyR[1] * 0.75 + 0.25;
    const headZ = 0.45;
    const legX = 0.35;

    const bones = [
      bone('root', null, [0, 0, 0]),
      bone('body', 'root', tidy([0, bodyY, 0])),
      bone('head', 'body', tidy([0, headY - 0.3, 0.3])),
      bone('wing_l', 'body', tidy([bodyR[0], bodyY + 0.3, 0]), true),
      bone('leg_l', 'body', tidy([legX, 0.7, 0.1]), true),
    ];
    const legH = bodyY - 0.35;
    const parts: Part[] = [
      sphere('body', tidy([0, bodyY, 0]), tidy(bodyR), 'body', 'body'),
      sphere(
        'belly',
        tidy([0, bodyY - 0.12, 0.38]),
        tidy([bodyR[0] * 0.78, bodyR[1] * 0.8, 0.7]),
        'belly',
        'body',
      ),
      sphere('head', tidy([0, headY, headZ]), [headR, headR, headR], 'body', 'head'),
      cone(
        'beak',
        tidy([0, headY - 0.05, headZ + headR * 0.75 + 0.2 * beak]),
        0.2 * beak,
        0.5 * beak,
        'beakColor',
        'head',
        { sides: 4, rotation: [90, 0, 0] },
      ),
      sphere('eye_l', tidy([0.25, headY + 0.1, headZ + 0.43]), [0.09, 0.11, 0.07], 'ink', 'head', {
        mirror: true,
      }),
      sphere(
        'wing_l',
        tidy([bodyR[0] + 0.05, bodyY, -0.05]),
        tidy([0.15, 0.55 * wing, 0.7]),
        'body',
        'wing_l',
        { mirror: true, rotation: [0, 0, -10] },
      ),
      cylinder(
        'leg_l',
        tidy([legX, (legH + 0.05) / 2, 0.1]),
        0.07,
        0.06,
        round(legH - 0.05),
        'beakColor',
        'leg_l',
        { mirror: true },
      ),
      sphere('foot_l', tidy([legX, 0.06, 0.28]), [0.2, 0.06, 0.3], 'beakColor', 'leg_l', {
        mirror: true,
      }),
      tube(
        'tail',
        [
          [0, bodyY, -0.8],
          [0, bodyY + 0.2, -1.3],
          [0, bodyY + 0.4, -1.8],
        ].map((q) => tidy(q as Vec3)),
        0.28,
        0.12,
        'body',
        'body',
        { name: 'tail', length: 3 },
      ),
    ];
    if (r.bool('crest')) {
      for (const [i, dx] of [-0.14, 0, 0.14].entries()) {
        parts.push(
          cone(
            `crest_${i + 1}`,
            tidy([dx, headY + headR * 0.95, headZ - 0.1]),
            0.1,
            0.36,
            'beakColor',
            'head',
            { sides: 4 },
          ),
        );
      }
    }
    return makeSpec(
      'Bird',
      'bird',
      {
        body: r.str('body'),
        belly: r.str('belly'),
        beakColor: r.str('beakColor'),
        ink: COLORS.ink,
      },
      bones,
      parts,
    );
  },
};

// ================================================================================================
// Fish
// ================================================================================================

const fishParams: ParamDef[] = [
  { key: 'length', label: 'Body length', type: 'range', min: 1.6, max: 3.4, step: 0.05 },
  { key: 'fin', label: 'Fin size', type: 'range', min: 0.6, max: 1.7, step: 0.01 },
  {
    key: 'tailShape',
    label: 'Tail shape',
    type: 'select',
    options: [
      { value: 'fork', label: 'Fork' },
      { value: 'round', label: 'Round' },
    ],
  },
  { key: 'body', label: 'Body color', type: 'color' },
  { key: 'belly', label: 'Belly color', type: 'color' },
  { key: 'finColor', label: 'Fin color', type: 'color' },
];
const fishDefaults: Params = {
  length: 2.4,
  fin: 1,
  tailShape: 'fork',
  body: COLORS.orange,
  belly: COLORS.cream,
  finColor: COLORS.pink,
};

export const fishTemplate: Template = {
  id: 'fish',
  name: 'Fish',
  bodyType: 'fish',
  params: fishParams,
  defaults: fishDefaults,
  build(p) {
    const r = reader(fishDefaults, p);
    const len = r.num('length');
    const fin = r.num('fin');
    const y = 0.75;
    const half = len / 2;
    const headZ = half * 0.8;
    const tailEnd = -half - 0.9;
    const bones = [
      bone('root', null, [0, 0, 0]),
      bone('body', 'root', tidy([0, y, 0])),
      bone('head', 'body', tidy([0, y, len * 0.35])),
      bone('fin_l', 'body', tidy([0.7, 0.6, 0.2]), true),
      bone('fin_top', 'body', tidy([0, 1.4, -0.1])),
    ];
    const parts: Part[] = [
      sphere('body', [0, y, 0], [0.7, 0.75, half], 'body', 'body'),
      sphere('belly', tidy([0, y - 0.25, 0.1]), tidy([0.55, 0.5, half * 0.8]), 'belly', 'body'),
      sphere('head', tidy([0, y, headZ]), [0.6, 0.62, 0.55], 'body', 'head'),
      sphere('eye_l', tidy([0.35, y + 0.2, headZ + 0.35]), [0.12, 0.12, 0.1], 'ink', 'head', {
        mirror: true,
      }),
      sphere(
        'fin_l',
        tidy([0.74, 0.6, 0.2]),
        tidy([0.06, 0.14 * fin, 0.34 * fin]),
        'finColor',
        'fin_l',
        { mirror: true, rotation: [0, 0, -25] },
      ),
      cone(
        'fin_top',
        tidy([0, 1.5 + 0.25 * fin - 0.1, -0.1]),
        0.3 * fin,
        0.5 * fin,
        'finColor',
        'fin_top',
        { sides: 3, rotation: [-15, 0, 0] },
      ),
      tube(
        'tail',
        [
          [0, y, -half * 0.8],
          [0, y + 0.02, -half - 0.3],
          [0, y + 0.03, -half - 0.8],
        ].map((q) => tidy(q as Vec3)),
        0.4,
        0.15,
        'body',
        'body',
        { name: 'tail', length: 3 },
      ),
    ];
    const tz = tailEnd + 0.45;
    // Big fins would dip below the ground, so the tail fin stops growing past this size.
    const tf = Math.min(fin, 1.2);
    if (r.str('tailShape') === 'fork') {
      parts.push(
        cone(
          'tail_fin_top',
          tidy([0, y + 0.2 + 0.2 * tf, tz]),
          0.3 * tf,
          0.9 * tf,
          'finColor',
          'tail_3',
          {
            sides: 4,
            rotation: [-55, 0, 0],
          },
        ),
        cone(
          'tail_fin_bottom',
          tidy([0, y - 0.05 - 0.05 * tf, tz]),
          0.3 * tf,
          0.9 * tf,
          'finColor',
          'tail_3',
          {
            sides: 4,
            rotation: [-125, 0, 0],
          },
        ),
      );
    } else {
      parts.push(
        sphere(
          'tail_fin',
          tidy([0, y + 0.03, tz + 0.1]),
          tidy([0.08, Math.min(0.55 * fin, 0.7), 0.55 * fin]),
          'finColor',
          'tail_3',
        ),
      );
    }
    return makeSpec(
      'Fish',
      'fish',
      {
        body: r.str('body'),
        belly: r.str('belly'),
        finColor: r.str('finColor'),
        ink: COLORS.ink,
      },
      bones,
      parts,
    );
  },
};

// ================================================================================================
// Chibi human
// ================================================================================================

const humanParams: ParamDef[] = [
  { key: 'head', label: 'Head size', type: 'range', min: 0.9, max: 1.5, step: 0.01 },
  { key: 'height', label: 'Body height', type: 'range', min: 0.7, max: 1.4, step: 0.01 },
  {
    key: 'hair',
    label: 'Hair style',
    type: 'select',
    options: [
      { value: 'short', label: 'Short' },
      { value: 'long', label: 'Long' },
      { value: 'bun', label: 'Bun' },
      { value: 'spiky', label: 'Spiky' },
    ],
  },
  { key: 'hairColor', label: 'Hair color', type: 'color' },
  { key: 'shirt', label: 'Shirt color', type: 'color' },
  { key: 'pants', label: 'Pants color', type: 'color' },
  { key: 'skin', label: 'Skin color', type: 'color' },
];
const humanDefaults: Params = {
  head: 1.15,
  height: 1,
  hair: 'short',
  hairColor: COLORS.brown,
  shirt: COLORS.mint,
  pants: COLORS.violet,
  skin: COLORS.skin,
};

export const humanTemplate: Template = {
  id: 'human',
  name: 'Chibi human',
  bodyType: 'biped',
  params: humanParams,
  defaults: humanDefaults,
  build(p) {
    const r = reader(humanDefaults, p);
    const H = r.num('head');
    const bh = r.num('height');
    const legH = 0.9 * bh;
    const torsoH = 0.9 * bh;
    const torsoTop = legH + torsoH - 0.05;
    const headY = torsoTop + 0.72 * H * 0.85;
    const armL = 0.55 * bh;
    const shoulderY = torsoTop - 0.1;

    const bones = [
      bone('root', null, [0, 0, 0]),
      bone('hips', 'root', tidy([0, legH, 0])),
      bone('spine', 'hips', tidy([0, legH + 0.2 * bh, 0])),
      bone('chest', 'spine', tidy([0, legH + torsoH * 0.6, 0])),
      bone('neck', 'chest', tidy([0, torsoTop, 0])),
      bone('head', 'neck', tidy([0, torsoTop + 0.1, 0])),
      bone('arm_l', 'chest', tidy([0.45, shoulderY, 0]), true),
      bone('leg_l', 'hips', tidy([0.22, legH, 0]), true),
    ];
    const hr: Vec3 = [0.75 * H, 0.72 * H, 0.7 * H];
    const parts: Part[] = [
      cylinder('leg_l', tidy([0.22, legH / 2, 0]), 0.17, 0.16, round(legH), 'pants', 'leg_l', {
        mirror: true,
      }),
      sphere('shoe_l', tidy([0.22, 0.12, 0.08]), [0.2, 0.12, 0.3], 'ink', 'leg_l', {
        mirror: true,
      }),
      cylinder(
        'torso',
        tidy([0, legH + torsoH / 2 - 0.05, 0]),
        0.42,
        0.46,
        round(torsoH),
        'shirt',
        'spine',
      ),
      capsule('arm_l', tidy([0.5, shoulderY - armL / 2, 0]), 0.13, round(armL), 'shirt', 'arm_l', {
        mirror: true,
        rotation: [0, 0, -8],
        sides: 6,
      }),
      sphere(
        'hand_l',
        tidy([0.55, shoulderY - armL - 0.1, 0]),
        [0.13, 0.13, 0.13],
        'skin',
        'arm_l',
        { mirror: true },
      ),
      sphere('head', tidy([0, headY, 0]), tidy(hr), 'skin', 'head'),
      sphere(
        'eye_l',
        tidy([0.26 * H, headY + 0.02 * H, 0.62 * H]),
        [0.09 * H, 0.12 * H, 0.06 * H],
        'ink',
        'head',
        { mirror: true },
      ),
      sphere(
        'cheek_l',
        tidy([0.42 * H, headY - 0.16 * H, 0.55 * H]),
        [0.12 * H, 0.07 * H, 0.05 * H],
        'blush',
        'head',
        { mirror: true },
      ),
      // hair cap, shared by every style
      sphere(
        'hair',
        tidy([0, headY + 0.3 * H, -0.08 * H]),
        tidy([0.8 * H, 0.55 * H, 0.78 * H]),
        'hairColor',
        'head',
      ),
    ];
    switch (r.str('hair')) {
      case 'long':
        parts.push(
          sphere(
            'hair_back',
            tidy([0, headY - 0.1 * H, -0.45 * H]),
            tidy([0.75 * H, 0.9 * H, 0.35 * H]),
            'hairColor',
            'head',
          ),
        );
        break;
      case 'bun':
        parts.push(
          sphere(
            'hair_bun',
            tidy([0, headY + 0.85 * H, -0.15 * H]),
            [0.28 * H, 0.28 * H, 0.28 * H],
            'hairColor',
            'head',
          ),
        );
        break;
      case 'spiky':
        for (const [i, [x, z, tilt]] of (
          [
            [0, 0.1, 0],
            [0.4, 0, -25],
            [-0.4, 0, 25],
            [0, -0.35, 0],
          ] as [number, number, number][]
        ).entries()) {
          parts.push(
            cone(
              `hair_spike_${i + 1}`,
              tidy([x * H, headY + 0.78 * H, z * H]),
              0.2 * H,
              0.5 * H,
              'hairColor',
              'head',
              { sides: 4, rotation: [z < -0.2 ? -20 : 0, 0, tilt] },
            ),
          );
        }
        break;
      default:
        break;
    }
    return makeSpec(
      'Chibi human',
      'biped',
      {
        skin: r.str('skin'),
        hairColor: r.str('hairColor'),
        shirt: r.str('shirt'),
        pants: r.str('pants'),
        ink: COLORS.ink,
        blush: COLORS.pink,
      },
      bones,
      parts,
    );
  },
};

// ================================================================================================
// Robot
// ================================================================================================

const robotParams: ParamDef[] = [
  {
    key: 'headShape',
    label: 'Head shape',
    type: 'select',
    options: [
      { value: 'box', label: 'Box' },
      { value: 'round', label: 'Round' },
    ],
  },
  { key: 'antenna', label: 'Antenna', type: 'toggle' },
  { key: 'arm', label: 'Arm length', type: 'range', min: 0.6, max: 1.5, step: 0.01 },
  { key: 'body', label: 'Body color', type: 'color' },
  { key: 'accent', label: 'Accent color', type: 'color' },
  { key: 'glow', label: 'Eye color', type: 'color' },
];
const robotDefaults: Params = {
  headShape: 'box',
  antenna: true,
  arm: 1,
  body: COLORS.sky,
  accent: COLORS.yellow,
  glow: COLORS.mint,
};

export const robotTemplate: Template = {
  id: 'robot',
  name: 'Robot',
  bodyType: 'biped',
  params: robotParams,
  defaults: robotDefaults,
  build(p) {
    const r = reader(robotDefaults, p);
    const armL = 0.7 * r.num('arm');
    const round_ = r.str('headShape') === 'round';
    const headCenterY = round_ ? 2.06 : 1.975;
    const headFront = round_ ? 0.46 : 0.375;
    const bones = [
      bone('root', null, [0, 0, 0]),
      bone('hips', 'root', [0, 0.7, 0]),
      bone('spine', 'hips', [0, 1.0, 0]),
      bone('chest', 'spine', [0, 1.4, 0]),
      bone('neck', 'chest', [0, 1.65, 0]),
      bone('head', 'neck', [0, 1.7, 0]),
      bone('arm_l', 'chest', [0.62, 1.55, 0], true),
      bone('leg_l', 'hips', [0.25, 0.7, 0], true),
    ];
    const parts: Part[] = [
      box('leg_l', [0.25, 0.35, 0], [0.3, 0.7, 0.3], 'accent', 'leg_l', {
        mirror: true,
        bevel: 0.15,
      }),
      box('foot_l', [0.25, 0.075, 0.08], [0.4, 0.15, 0.55], 'body', 'leg_l', {
        mirror: true,
        bevel: 0.2,
      }),
      box('torso', [0, 1.15, 0], [1.1, 1.0, 0.7], 'body', 'spine', { bevel: 0.12 }),
      box('panel', [0, 1.2, 0.36], [0.6, 0.4, 0.06], 'accent', 'chest'),
      box(
        'arm_l',
        tidy([0.62, 1.55 - armL / 2 + 0.1, 0]),
        tidy([0.22, armL, 0.22]),
        'accent',
        'arm_l',
        { mirror: true, bevel: 0.2 },
      ),
      sphere('hand_l', tidy([0.62, 1.55 - armL + 0.02, 0]), [0.15, 0.15, 0.15], 'body', 'arm_l', {
        mirror: true,
      }),
      round_
        ? sphere('head', [0, headCenterY, 0], [0.5, 0.46, 0.46], 'body', 'head')
        : box('head', [0, headCenterY, 0], [0.9, 0.75, 0.75], 'body', 'head', { bevel: 0.15 }),
      box(
        'eye_l',
        tidy([0.22, headCenterY + 0.05, headFront - 0.01]),
        [0.2, 0.14, 0.06],
        'glow',
        'head',
        { mirror: true },
      ),
    ];
    if (r.bool('antenna')) {
      const topY = round_ ? headCenterY + 0.46 : headCenterY + 0.375;
      parts.push(
        cylinder('antenna', tidy([0, topY + 0.15, 0]), 0.04, 0.04, 0.4, 'accent', 'head'),
        sphere('antenna_tip', tidy([0, topY + 0.38, 0]), [0.09, 0.09, 0.09], 'glow', 'head'),
      );
    }
    return makeSpec(
      'Robot',
      'biped',
      {
        body: r.str('body'),
        accent: r.str('accent'),
        glow: r.str('glow'),
      },
      bones,
      parts,
    );
  },
};

// ================================================================================================
// Car
// ================================================================================================

const carParams: ParamDef[] = [
  { key: 'length', label: 'Body length', type: 'range', min: 2.6, max: 4.4, step: 0.05 },
  { key: 'wheel', label: 'Wheel size', type: 'range', min: 0.3, max: 0.65, step: 0.01 },
  { key: 'roof', label: 'Roof height', type: 'range', min: 0.4, max: 1.0, step: 0.01 },
  { key: 'body', label: 'Body color', type: 'color' },
  { key: 'glass', label: 'Window color', type: 'color' },
  { key: 'tire', label: 'Wheel color', type: 'color' },
];
const carDefaults: Params = {
  length: 3.4,
  wheel: 0.45,
  roof: 0.65,
  body: COLORS.pink,
  glass: COLORS.sky,
  tire: COLORS.ink,
};

export const carTemplate: Template = {
  id: 'car',
  name: 'Car',
  bodyType: 'object',
  params: carParams,
  defaults: carDefaults,
  build(p) {
    const r = reader(carDefaults, p);
    const L = r.num('length');
    const wr = r.num('wheel');
    const roof = r.num('roof');
    const bodyY = wr + 0.25;
    const bodyTop = bodyY + 0.35;
    const wheelZ = L / 2 - 0.75;
    const parts: Part[] = [
      box('body', tidy([0, bodyY, 0]), tidy([1.7, 0.7, L]), 'body', 'root', { bevel: 0.2 }),
      box(
        'cabin',
        tidy([0, bodyTop + roof / 2 - 0.06, -0.15]),
        tidy([1.45, roof, L * 0.5]),
        'glass',
        'root',
        { bevel: 0.2 },
      ),
      box(
        'roof',
        tidy([0, bodyTop + roof - 0.06 + 0.04, -0.15]),
        tidy([1.55, 0.1, L * 0.5 + 0.1]),
        'body',
        'root',
        { bevel: 0.3 },
      ),
      cylinder('wheel_fl', tidy([0.9, wr, wheelZ]), wr, wr, 0.3, 'tire', 'root', {
        mirror: true,
        rotation: [0, 0, 90],
        sides: 12,
      }),
      cylinder('wheel_bl', tidy([0.9, wr, -wheelZ]), wr, wr, 0.3, 'tire', 'root', {
        mirror: true,
        rotation: [0, 0, 90],
        sides: 12,
      }),
      sphere(
        'headlight_l',
        tidy([0.5, bodyY + 0.08, L / 2 - 0.02]),
        [0.18, 0.14, 0.1],
        'light',
        'root',
        { mirror: true },
      ),
      sphere(
        'taillight_l',
        tidy([0.5, bodyY + 0.08, -L / 2 + 0.02]),
        [0.18, 0.12, 0.08],
        'tail',
        'root',
        { mirror: true },
      ),
    ];
    return makeSpec(
      'Car',
      'object',
      {
        body: r.str('body'),
        glass: r.str('glass'),
        tire: r.str('tire'),
        light: COLORS.yellow,
        tail: shade(COLORS.pink, 0.8),
      },
      [{ name: 'root', parent: null, head: [0, 0, 0] }],
      parts,
    );
  },
};
