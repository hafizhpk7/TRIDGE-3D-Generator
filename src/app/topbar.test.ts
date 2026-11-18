import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const css = read('src/app/Workspace.css');
const modalCss = read('src/projects/ProjectsModal.css');

/** Every rule that sits inside a small-screen media query (560px or 520px). */
function smallScreenRules(source: string): string {
  return (source.match(/@media \(max-width: 5\d0px\) \{[\s\S]*?\n\}/g) ?? []).join('\n');
}

describe('top bar on small screens', () => {
  it('never hides the Projects button (it is the only way to reopen work on a phone)', () => {
    const rules = smallScreenRules(css);
    // hiding every .btn would take Projects away with it
    expect(rules).not.toMatch(/\.topbar__actions\s+\.btn\s*\{[^}]*display:\s*none/);
  });

  it('keeps the save status visible on small screens', () => {
    const rules = smallScreenRules(modalCss);
    expect(rules).not.toMatch(/\.save-status\s*\{[^}]*display:\s*none/);
  });

  it('still hides the Playground link, which is for developers', () => {
    expect(smallScreenRules(css)).toMatch(/\.topbar__link/);
  });
});
