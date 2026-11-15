import type { Part, Vec3 } from '../spec/types';
import {
  COLORS,
  bone,
  cone,
  cylinder,
  capsule,
  makeSpec,
  reader,
  sphere,
  tidy,
  tube,
  type ParamDef,
  type Params,
  type Template,
} from './helpers';

/** Multiply a hex color's brightness, for pattern colors derived from the fur. */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}

type Species = 'cat' | 'dog' | 'bunny';

interface Quad {
  species: Species;
  name: string;
  head: number;
  bodyLen: number;
  legLen: number;
  round: number;
  snout: number;
  ear: string;
  earLen: number;
  earDroop: number;
  tailLen: number;
  tailCurl: number;
  fur: string;
  belly: string;
  pattern: string;
}

/** Shared generator for cat, dog and bunny. Proportions come from the parameters. */
function quadruped(q: Quad) {
  const halfLen = q.bodyLen / 2;
  const bw = 0.8 * q.round;
  const bh = 0.75 * q.round;
  const bodyY = q.legLen + bh * 0.4;
  const legX = bw * 0.55;
  const frontZ = halfLen * 0.58;
  const backZ = -halfLen * 0.56;
  const hr: Vec3 = [0.8 * q.head, 0.7 * q.head, 0.7 * q.head];
  const headY = bodyY + bh * 0.5 + hr[1] * 0.55;
  const headZ = halfLen * 0.9 + hr[2] * 0.1;
  const accent = shade(q.fur, 0.78);

  const palette = {
    fur: q.fur,
    belly: q.belly,
    accent,
    pink: COLORS.pink,
    ink: COLORS.ink,
  };

  const bones = [
    bone('root', null, [0, 0, 0]),
    bone('hips', 'root', tidy([0, bodyY, -halfLen * 0.5])),
    bone('spine', 'hips', tidy([0, bodyY, 0])),
    bone('chest', 'spine', tidy([0, bodyY, halfLen * 0.55])),
    bone('neck', 'chest', tidy([0, bodyY + bh * 0.5, halfLen * 0.85])),
    bone('head', 'neck', tidy([0, headY - hr[1] * 0.5, headZ - hr[2] * 0.2])),
    bone('leg_front_l', 'chest', tidy([legX, bodyY - 0.2, frontZ]), true),
    bone('leg_back_l', 'hips', tidy([legX, bodyY - 0.2, backZ]), true),
  ];

  const parts: Part[] = [];
  const legTop = bodyY;
  const legH = legTop - 0.05;
  const legMid = (legTop + 0.05) / 2;

  parts.push(sphere('body', tidy([0, bodyY, 0]), tidy([bw, bh, halfLen]), 'fur', 'spine'));
  parts.push(
    sphere(
      'chest',
      tidy([0, bodyY - bh * 0.1, halfLen * 0.8]),
      tidy([bw * 0.52, bh * 0.64, 0.34]),
      'belly',
      'chest',
    ),
  );

  // legs
  parts.push(
    sphere(
      'haunch_l',
      tidy([legX * 1.15, bodyY - bh * 0.3, backZ]),
      tidy([0.32 * q.round, 0.52 * q.round, 0.52]),
      'fur',
      'leg_back_l',
      { mirror: true },
    ),
    cylinder(
      'leg_front_l',
      tidy([legX, legMid, frontZ]),
      0.17,
      0.15,
      round(legH),
      'fur',
      'leg_front_l',
      { mirror: true },
    ),
    cylinder(
      'leg_back_l',
      tidy([legX, legMid, backZ]),
      0.17,
      0.15,
      round(legH),
      'fur',
      'leg_back_l',
      { mirror: true },
    ),
    sphere(
      'paw_front_l',
      tidy([legX, 0.12, frontZ + 0.06]),
      [0.2, 0.12, 0.27],
      'belly',
      'leg_front_l',
      { mirror: true },
    ),
    sphere(
      'paw_back_l',
      tidy([legX, 0.12, backZ + 0.06]),
      [0.2, 0.12, 0.27],
      'belly',
      'leg_back_l',
      { mirror: true },
    ),
  );
  if (q.pattern === 'socks') {
    parts.push(
      cylinder(
        'sock_front_l',
        tidy([legX, 0.3, frontZ]),
        0.18,
        0.17,
        0.5,
        'accent',
        'leg_front_l',
        { mirror: true },
      ),
      cylinder('sock_back_l', tidy([legX, 0.3, backZ]), 0.18, 0.17, 0.5, 'accent', 'leg_back_l', {
        mirror: true,
      }),
    );
  }

  // head and face
  parts.push(sphere('head', tidy([0, headY, headZ]), tidy(hr), 'fur', 'head'));
  const muzzleR: Vec3 = [0.27 * q.head, 0.19 * q.head, (0.2 + q.snout) * q.head];
  const muzzleY = headY - hr[1] * 0.25;
  const muzzleZ = headZ + hr[2] * 0.85;
  parts.push(
    sphere('muzzle', tidy([0, muzzleY, muzzleZ]), tidy(muzzleR), 'belly', 'head'),
    sphere(
      'nose',
      tidy([0, muzzleY + muzzleR[1] * 0.4, muzzleZ + muzzleR[2] * 0.85]),
      [0.09 * q.head, 0.06 * q.head, 0.06 * q.head],
      q.species === 'dog' ? 'ink' : 'pink',
      'head',
    ),
    sphere(
      'eye_l',
      tidy([hr[0] * 0.38, headY + hr[1] * 0.15, headZ + hr[2] * 0.85]),
      [0.1 * q.head, 0.14 * q.head, 0.07 * q.head],
      'ink',
      'head',
      { mirror: true },
    ),
  );

  // ears
  const earX = hr[0] * 0.58;
  const earBaseY = headY + hr[1] * 0.85;
  const earZ = headZ - hr[2] * 0.1;
  const H = q.head;
  switch (q.ear) {
    case 'round':
      parts.push(
        sphere('ear_l', tidy([earX, earBaseY, earZ]), [0.26 * H, 0.3 * H, 0.1 * H], 'fur', 'head', {
          mirror: true,
          rotation: [0, 0, -14],
        }),
        sphere(
          'ear_inner_l',
          tidy([earX, earBaseY, earZ + 0.06 * H]),
          [0.16 * H, 0.2 * H, 0.06 * H],
          'pink',
          'head',
          { mirror: true, rotation: [0, 0, -14] },
        ),
      );
      break;
    case 'folded':
      parts.push(
        cone(
          'ear_l',
          tidy([earX, earBaseY + 0.05 * H, earZ + 0.05 * H]),
          0.3 * H,
          0.38 * H,
          'fur',
          'head',
          { mirror: true, sides: 4, rotation: [55, 0, -25] },
        ),
        cone(
          'ear_inner_l',
          tidy([earX, earBaseY + 0.03 * H, earZ + 0.1 * H]),
          0.18 * H,
          0.26 * H,
          'pink',
          'head',
          { mirror: true, sides: 4, rotation: [55, 0, -25] },
        ),
      );
      break;
    case 'floppy':
      parts.push(
        sphere(
          'ear_l',
          tidy([hr[0] * 0.92, headY + hr[1] * 0.1, earZ]),
          [0.14 * H, 0.42 * H, 0.28 * H],
          q.pattern === 'none' ? 'fur' : 'accent',
          'head',
          { mirror: true, rotation: [0, 0, 12] },
        ),
      );
      break;
    case 'long': {
      const a = (q.earDroop * Math.PI) / 180;
      const len = q.earLen;
      const r = 0.14 * H;
      const base: Vec3 = [hr[0] * 0.4, headY + hr[1] * 0.7, earZ];
      const half = len / 2 + r * 0.5;
      const center: Vec3 = [base[0] + Math.sin(a) * half, base[1] + Math.cos(a) * half, base[2]];
      parts.push(
        capsule('ear_l', tidy(center), r, len, 'fur', 'head', {
          mirror: true,
          rotation: [0, 0, -q.earDroop],
          sides: 6,
        }),
        capsule(
          'ear_inner_l',
          tidy([center[0], center[1], center[2] + 0.05]),
          r * 0.55,
          len * 0.8,
          'pink',
          'head',
          { mirror: true, rotation: [0, 0, -q.earDroop], sides: 6 },
        ),
      );
      break;
    }
    default: // pointy and "up"
      parts.push(
        cone('ear_l', tidy([earX, earBaseY + 0.1 * H, earZ]), 0.3 * H, 0.6 * H, 'fur', 'head', {
          mirror: true,
          sides: 4,
          rotation: [0, 0, -14],
        }),
        cone(
          'ear_inner_l',
          tidy([earX, earBaseY + 0.06 * H, earZ + 0.08 * H]),
          0.18 * H,
          0.42 * H,
          'pink',
          'head',
          { mirror: true, sides: 4, rotation: [0, 0, -14] },
        ),
      );
  }

  // pattern
  if (q.pattern === 'stripes') {
    for (const [i, f] of [-0.45, 0, 0.45].entries()) {
      const z = halfLen * f;
      const y = bodyY + bh * Math.sqrt(1 - f * f) - 0.03;
      parts.push(
        sphere(
          `stripe_${i + 1}`,
          tidy([0, y, z]),
          [bw * 0.7, 0.1, 0.14],
          'accent',
          f < 0 ? 'hips' : f > 0 ? 'chest' : 'spine',
        ),
      );
    }
  } else if (q.pattern === 'spots') {
    const spots: [number, number][] = [
      [-0.4, 0.45],
      [0.1, 0.5],
      [0.5, 0.35],
    ];
    spots.forEach(([f, up], i) => {
      const z = halfLen * f;
      const inner = Math.max(0.05, 1 - up * up - f * f);
      const x = bw * Math.sqrt(inner) * 0.95;
      parts.push(
        sphere(
          `spot_${i + 1}_l`,
          tidy([x, bodyY + bh * up, z]),
          [0.1, 0.17, 0.17],
          'accent',
          f < 0 ? 'hips' : f > 0 ? 'chest' : 'spine',
          { mirror: true },
        ),
      );
    });
  }

  // tail
  if (q.species === 'bunny') {
    parts.push(
      sphere(
        'tail',
        tidy([0, bodyY + bh * 0.15, -halfLen * 0.95]),
        [0.24, 0.24, 0.24],
        'belly',
        'hips',
      ),
    );
  } else {
    const pts: Vec3[] = [[0, bodyY + bh * 0.1, -halfLen * 0.82]];
    let phi = 0.3;
    let y = pts[0][1];
    let z = pts[0][2];
    const ds = q.tailLen / 4;
    for (let i = 1; i <= 4; i++) {
      phi += (q.tailCurl * Math.PI * 0.95) / 4;
      y += Math.sin(phi) * ds;
      z -= Math.cos(phi) * ds;
      pts.push([0, y, z]);
    }
    parts.push(
      tube(
        'tail',
        pts.map((p) => tidy(p)),
        0.16,
        0.1,
        'fur',
        'hips',
        { name: 'tail', length: 4 },
      ),
    );
  }

  return makeSpec(q.name, 'quadruped', palette, bones, parts);
}

const round = (n: number) => Math.round(n * 100) / 100;

// ---- Cat -----------------------------------------------------------------------------------------

const catParams: ParamDef[] = [
  { key: 'head', label: 'Head size', type: 'range', min: 0.8, max: 1.3, step: 0.01 },
  { key: 'bodyLen', label: 'Body length', type: 'range', min: 1.8, max: 3.2, step: 0.05 },
  { key: 'legLen', label: 'Leg length', type: 'range', min: 0.6, max: 1.4, step: 0.01 },
  { key: 'tailLen', label: 'Tail length', type: 'range', min: 0.5, max: 2.4, step: 0.05 },
  { key: 'tailCurl', label: 'Tail curl', type: 'range', min: 0, max: 1, step: 0.01 },
  {
    key: 'ear',
    label: 'Ear style',
    type: 'select',
    options: [
      { value: 'pointy', label: 'Pointy' },
      { value: 'round', label: 'Round' },
      { value: 'folded', label: 'Folded' },
    ],
  },
  { key: 'fur', label: 'Fur color', type: 'color' },
  { key: 'belly', label: 'Belly color', type: 'color' },
  {
    key: 'pattern',
    label: 'Pattern',
    type: 'select',
    options: [
      { value: 'none', label: 'None' },
      { value: 'stripes', label: 'Stripes' },
      { value: 'spots', label: 'Spots' },
      { value: 'socks', label: 'Socks' },
    ],
  },
];
const catDefaults: Params = {
  head: 1,
  bodyLen: 2.5,
  legLen: 0.95,
  tailLen: 1.6,
  tailCurl: 0.35,
  ear: 'pointy',
  fur: COLORS.orange,
  belly: COLORS.cream,
  pattern: 'stripes',
};

export const catTemplate: Template = {
  id: 'cat',
  name: 'Cat',
  bodyType: 'quadruped',
  params: catParams,
  defaults: catDefaults,
  build(p) {
    const r = reader(catDefaults, p);
    return quadruped({
      species: 'cat',
      name: 'Cat',
      head: r.num('head'),
      bodyLen: r.num('bodyLen'),
      legLen: r.num('legLen'),
      round: 1,
      snout: 0,
      ear: r.str('ear'),
      earLen: 0,
      earDroop: 0,
      tailLen: r.num('tailLen'),
      tailCurl: r.num('tailCurl'),
      fur: r.str('fur'),
      belly: r.str('belly'),
      pattern: r.str('pattern'),
    });
  },
};

// ---- Dog -----------------------------------------------------------------------------------------

const dogParams: ParamDef[] = [
  { key: 'head', label: 'Head size', type: 'range', min: 0.8, max: 1.3, step: 0.01 },
  { key: 'snout', label: 'Snout length', type: 'range', min: 0.05, max: 0.55, step: 0.01 },
  {
    key: 'ear',
    label: 'Ear style',
    type: 'select',
    options: [
      { value: 'pointy', label: 'Up' },
      { value: 'floppy', label: 'Floppy' },
    ],
  },
  { key: 'legLen', label: 'Leg length', type: 'range', min: 0.7, max: 1.5, step: 0.01 },
  {
    key: 'tailStyle',
    label: 'Tail style',
    type: 'select',
    options: [
      { value: 'straight', label: 'Straight' },
      { value: 'curly', label: 'Curly' },
    ],
  },
  { key: 'fur', label: 'Fur color', type: 'color' },
  { key: 'belly', label: 'Belly color', type: 'color' },
  { key: 'accent', label: 'Patch color', type: 'color' },
];
const dogDefaults: Params = {
  head: 1,
  snout: 0.3,
  ear: 'floppy',
  legLen: 1.05,
  tailStyle: 'straight',
  fur: COLORS.brown,
  belly: COLORS.cream,
  accent: '#5E3B27',
};

export const dogTemplate: Template = {
  id: 'dog',
  name: 'Dog',
  bodyType: 'quadruped',
  params: dogParams,
  defaults: dogDefaults,
  build(p) {
    const r = reader(dogDefaults, p);
    const curly = r.str('tailStyle') === 'curly';
    const spec = quadruped({
      species: 'dog',
      name: 'Dog',
      head: r.num('head'),
      bodyLen: 2.6,
      legLen: r.num('legLen'),
      round: 0.95,
      snout: r.num('snout'),
      ear: r.str('ear'),
      earLen: 0,
      earDroop: 0,
      tailLen: curly ? 1.1 : 1.3,
      tailCurl: curly ? 0.95 : 0.1,
      fur: r.str('fur'),
      belly: r.str('belly'),
      pattern: 'none',
    });
    // dogs use a patch color for floppy ears
    spec.palette.accent = r.str('accent');
    for (const part of spec.parts)
      if (part.id.startsWith('ear_') && part.color === 'fur' && r.str('ear') === 'floppy')
        part.color = 'accent';
    return spec;
  },
};

// ---- Bunny ---------------------------------------------------------------------------------------

const bunnyParams: ParamDef[] = [
  { key: 'earLen', label: 'Ear length', type: 'range', min: 0.5, max: 1.5, step: 0.01 },
  { key: 'earDroop', label: 'Ear droop', type: 'range', min: 0, max: 75, step: 1 },
  { key: 'round', label: 'Body roundness', type: 'range', min: 0.8, max: 1.4, step: 0.01 },
  { key: 'fur', label: 'Fur color', type: 'color' },
  { key: 'belly', label: 'Belly color', type: 'color' },
];
const bunnyDefaults: Params = {
  earLen: 1,
  earDroop: 12,
  round: 1.1,
  fur: '#F2E8FF',
  belly: COLORS.white,
};

export const bunnyTemplate: Template = {
  id: 'bunny',
  name: 'Bunny',
  bodyType: 'quadruped',
  params: bunnyParams,
  defaults: bunnyDefaults,
  build(p) {
    const r = reader(bunnyDefaults, p);
    return quadruped({
      species: 'bunny',
      name: 'Bunny',
      head: 0.95,
      bodyLen: 2.1,
      legLen: 0.75,
      round: r.num('round'),
      snout: -0.05,
      ear: 'long',
      earLen: r.num('earLen'),
      earDroop: r.num('earDroop'),
      tailLen: 0,
      tailCurl: 0,
      fur: r.str('fur'),
      belly: r.str('belly'),
      pattern: 'none',
    });
  },
};
