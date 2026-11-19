const KEY = 'tridge.tour';

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === 'done';
  } catch {
    return true; // when storage is blocked, never nag
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(KEY, 'done');
  } catch {
    // nothing to do: the tour just shows again next time
  }
}

export interface TourStep {
  /** Matches a data-tour attribute in the page. */
  target: string;
  title: string;
  body: string;
}

export const TOUR: TourStep[] = [
  {
    target: 'steps',
    title: 'Step by step',
    body: 'Start with a photo, a few words, or a Craft shape. Then work down the list: make it low poly, rig it, animate it and export it.',
  },
  {
    target: 'viewer',
    title: 'Your model lives here',
    body: 'Drag to turn it around, scroll or pinch to zoom. Everything you do shows up here straight away.',
  },
  {
    target: 'tools',
    title: 'Tools and saving',
    body: 'Rig, animate and export from here. Your work saves itself in this browser, and the Projects button brings it back any time.',
  },
];

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Where to put the explanation card: beside the highlighted area when it fits, otherwise in the middle. */
export function placeCard(
  target: Box | null,
  card: { width: number; height: number },
  view: { width: number; height: number },
  gap = 14,
): { top: number; left: number } {
  const clampX = (x: number) => Math.max(12, Math.min(view.width - card.width - 12, x));
  const clampY = (y: number) => Math.max(12, Math.min(view.height - card.height - 12, y));
  if (!target)
    return {
      top: clampY((view.height - card.height) / 2),
      left: clampX((view.width - card.width) / 2),
    };
  const centerX = target.left + target.width / 2 - card.width / 2;
  const below = target.top + target.height + gap;
  if (below + card.height + 12 <= view.height) return { top: below, left: clampX(centerX) };
  const above = target.top - gap - card.height;
  if (above >= 12) return { top: above, left: clampX(centerX) };
  const right = target.left + target.width + gap;
  if (right + card.width + 12 <= view.width) return { top: clampY(target.top), left: right };
  const left = target.left - gap - card.width;
  if (left >= 12) return { top: clampY(target.top), left };
  // the highlighted area fills the screen: sit over its lower part
  return { top: clampY(view.height - card.height - 24), left: clampX(centerX) };
}
