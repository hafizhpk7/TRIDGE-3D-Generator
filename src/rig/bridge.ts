import type { ViewerEngine } from '../viewer/ViewerEngine';

/**
 * The viewer engine lives inside a React component, but the rig tools (which sit in a different
 * part of the page) need to reach it. The viewer registers itself here.
 */
let current: ViewerEngine | null = null;

export function registerEngine(engine: ViewerEngine | null) {
  current = engine;
}

export function getEngine(): ViewerEngine | null {
  return current;
}
