export interface Step {
  id: string;
  title: string;
  hint: string;
  color: 'pink' | 'orange' | 'yellow' | 'mint' | 'sky';
}

export const STEPS: Step[] = [
  { id: 'input', title: 'Input', hint: 'Add a photo or describe what you want.', color: 'pink' },
  { id: 'generate', title: 'Generate', hint: 'Make a 3D model from your input.', color: 'orange' },
  { id: 'lowpoly', title: 'Low poly', hint: 'Choose how chunky it looks.', color: 'yellow' },
  { id: 'animate', title: 'Animate', hint: 'Ask for a pose or a motion.', color: 'mint' },
  { id: 'export', title: 'Export', hint: 'Download your creation.', color: 'sky' },
];
