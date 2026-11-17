import { describe, expect, it } from 'vitest';
import { buildCraft } from '../craft/builder/build';
import { createCraftObject, type CraftObjectInfo } from '../craft/builder/object';
import { TEMPLATES, buildTemplateSpec } from '../craft/templates';
import { availableAnimations } from '../animate/library';
import type { SeqStep } from '../animate/player';
import type { AnimTarget } from '../animate/types';
import { bakeExportClips } from './bake';
import { exportGlb, readGlb } from './glb';
import { unpackProject, packProject } from '../projects/archive';
import { validateSpec } from '../craft/spec/validate';
import type { Project } from '../projects/types';

/**
 * The whole path a person takes, without the browser: pick a template, build it, play every move it can do,
 * export it, and open the file again. If any link breaks, one of these fails and names the template.
 */
describe.each(TEMPLATES.map((t) => [t.id, t] as const))(
  'template %s: build, animate, export',
  (_id, template) => {
    const spec = buildTemplateSpec(template, {});
    const built = buildCraft(spec, { detail: 3 });
    const object = createCraftObject(built, spec.name, spec.bodyType);
    const info = object.userData.craft as CraftObjectInfo;
    const target: AnimTarget = {
      root: object,
      skeleton: info.skeleton,
      bodyType: info.bodyType!,
      frame: { front: [0, 0, 1], left: [1, 0, 0] },
      meshes: [info.mesh],
    };
    const moves = availableAnimations(spec.bodyType ?? null);
    const steps: SeqStep[] = moves.map((m) => ({
      id: m.id,
      params: { speed: 1, intensity: 1 },
      repeat: 1,
    }));

    it('has a body and moves to play', () => {
      expect(built.triangles).toBeGreaterThan(50);
      expect(steps.length).toBeGreaterThan(0);
    });

    it('bakes every move into a clip with real keyframes', () => {
      const clips = bakeExportClips(target, steps, { height: 2.4 });
      // the whole timeline plus one per move (a car has no bones, so its moves are whole-model motions)
      expect(clips).toHaveLength(steps.length + 1);
      for (const clip of clips) {
        expect(clip.duration).toBeGreaterThan(0.2);
        expect(clip.tracks.length).toBeGreaterThan(0);
        for (const track of clip.tracks) expect(track.values.every(Number.isFinite)).toBe(true);
      }
    });

    it('exports a GLB that the Khronos validator accepts and that reads back whole', async () => {
      const clips = bakeExportClips(target, steps, { height: 2.4 });
      const glb = await exportGlb(object, clips);
      const validator = await import('gltf-validator');
      const report = await validator.validateBytes(new Uint8Array(glb));
      expect(report.issues.numErrors).toBe(0);
      expect(report.info.animationCount).toBe(clips.length);
      const { summary } = await readGlb(glb);
      expect(summary.bones).toBe(info.skeleton.bones.length);
      expect(summary.triangles).toBe(built.triangles);
    });

    it('survives being saved as a .tridge project and opened again', () => {
      const project: Project = {
        meta: { id: 'x', name: spec.name, createdAt: 1, updatedAt: 2, kind: 'craft', bytes: 1 },
        data: {
          id: 'x',
          step: 'export',
          modelName: spec.name,
          craft: { spec, detail: 3, softJoints: true },
          anim: { steps, speed: 1, loop: false, poses: [] },
        },
      };
      const back = unpackProject(packProject(project));
      expect(validateSpec(back.data.craft?.spec).spec?.name).toBe(spec.name);
      expect(back.data.anim?.steps.map((s) => s.id)).toEqual(steps.map((s) => s.id));
    });
  },
  60_000,
);
