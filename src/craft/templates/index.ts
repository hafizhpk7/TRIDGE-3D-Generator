import type { ShapeSpec } from '../spec/types';
import { validateSpec } from '../spec/validate';
import type { Params, Template } from './helpers';
import { birdTemplate, carTemplate, fishTemplate, humanTemplate, robotTemplate } from './others';
import { bunnyTemplate, catTemplate, dogTemplate } from './quadruped';

export const TEMPLATES: Template[] = [
  catTemplate,
  dogTemplate,
  bunnyTemplate,
  birdTemplate,
  fishTemplate,
  humanTemplate,
  robotTemplate,
  carTemplate,
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Build a template and run it through the same validation as pasted specs. */
export function buildTemplateSpec(template: Template, params: Params): ShapeSpec {
  const result = validateSpec(template.build({ ...template.defaults, ...params }));
  if (!result.spec)
    throw new Error(
      `Template "${template.id}" produced an invalid spec: ${result.errors.join('; ')}`,
    );
  return result.spec;
}

/** Random parameter values within each control's range, for tests. */
export function randomParams(template: Template, rand: () => number): Params {
  const out: Params = {};
  for (const def of template.params) {
    switch (def.type) {
      case 'range': {
        const steps = Math.round((def.max - def.min) / def.step);
        out[def.key] =
          Math.round((def.min + Math.floor(rand() * (steps + 1)) * def.step) * 1000) / 1000;
        break;
      }
      case 'color': {
        const c = Math.floor(rand() * 0xffffff);
        out[def.key] = `#${c.toString(16).padStart(6, '0').toUpperCase()}`;
        break;
      }
      case 'select':
        out[def.key] = def.options[Math.floor(rand() * def.options.length)].value;
        break;
      case 'toggle':
        out[def.key] = rand() > 0.5;
        break;
    }
  }
  return out;
}
