import { useAnimStore } from '../animate/store';
import { useCraftStore, useCraftUi } from '../craft/store';
import { validateSpec } from '../craft/spec/validate';
import { getEngine } from '../rig/bridge';
import { useRigStore } from '../rig/store';
import { SKELETONS, type RigBodyType } from '../rig/skeleton';
import type { Facing } from '../rig/frame';
import { useInputStore } from '../store/inputStore';
import { useLowPolyStore } from '../store/lowPolyStore';
import { useModelStore } from '../store/modelStore';
import type { ColorMode } from '../pipeline/lowpoly/types';
import type { ProjectData } from './types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Poll until `ready` returns something truthy. Gives up with a plain message after `ms`. */
export async function waitFor<T>(
  ready: () => T | null | undefined | false,
  ms = 60_000,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = ready();
    if (v) return v;
    if (Date.now() > end) throw new Error('Opening the project took too long. Please try again.');
    await sleep(40);
  }
}

/**
 * Put the app back into the state a project was saved in: model, low-poly settings, rig and animation.
 * Steps that need processing (low poly, rigging) are redone from the saved settings.
 */
export async function restoreProject(data: ProjectData): Promise<void> {
  const engine = getEngine();
  if (!engine) throw new Error('The viewer is not ready yet.');

  // start from a clean slate
  useCraftStore.getState().clear();
  useCraftUi.getState().setPreview(false);
  useRigStore.getState().reset();
  useAnimStore.getState().reset();
  engine.setHighlight(null);
  engine.setGizmo(null);

  const before = engine.getOriginalObject()?.uuid;

  // ---- picture
  if (data.image) {
    useInputStore.getState().setPrepared({
      blob: new Blob([data.image.packed.bytes], { type: data.image.packed.type }),
      size: data.image.packed.bytes.byteLength,
      backgroundRemoved: data.image.backgroundRemoved,
    });
  } else {
    useInputStore.getState().clear();
  }

  // ---- model
  if (data.craft) {
    const checked = validateSpec(data.craft.spec);
    if (!checked.spec) throw new Error('The Craft shape in this project is not valid.');
    const craft = useCraftStore.getState();
    craft.loadSpec(checked.spec, 'file', checked.spec.name);
    craft.setDetail(data.craft.detail);
    craft.setSoftJoints(data.craft.softJoints);
    await sleep(250); // let the last queued rebuild start
    await waitFor(() => {
      const c = useCraftStore.getState();
      const o = engine.getOriginalObject();
      return c.built && !c.building && o && o.uuid !== before && engine.getAnimTarget();
    });
  } else if (data.model) {
    useModelStore
      .getState()
      .show(new Blob([data.model.bytes], { type: data.model.type }), data.modelName);
    await waitFor(() => {
      const o = engine.getOriginalObject();
      return o && o.uuid !== before;
    });
  } else {
    throw new Error('This project has no model in it.');
  }

  // ---- low poly
  const lp = data.lowpoly;
  if (lp && !data.craft) {
    const store = useLowPolyStore.getState();
    store.update({ ...lp.settings, colorMode: lp.settings.colorMode as ColorMode });
    store.enable();
    await sleep(400); // the settings change is debounced
    await waitFor(() => {
      const s = useLowPolyStore.getState();
      return !s.busy && s.result && engine.getProcessedStats();
    });
    if (lp.palette && useLowPolyStore.getState().resultMode === 'palette') {
      lp.palette.forEach((c, i) => {
        const cur = useLowPolyStore.getState().palette?.[i];
        if (cur && (cur[0] !== c[0] || cur[1] !== c[1] || cur[2] !== c[2]))
          useLowPolyStore.getState().setPaletteColor(i, c);
      });
    }
    useLowPolyStore.getState().setView(lp.view);
  }

  // ---- rig
  const rig = data.rig;
  if (rig && !data.craft && rig.bodyType in SKELETONS) {
    const wantView = useLowPolyStore.getState().view;
    // a rig built on the low-poly look needs that look to be showing while it is made
    if (rig.variant === 'lowpoly' && wantView === 'original')
      useLowPolyStore.getState().setView('lowpoly');
    await sleep(80);
    await useRigStore.getState().restore({
      bodyType: rig.bodyType as RigBodyType,
      facing: rig.facing as Facing,
      joints: rig.joints,
      mirror: rig.mirror,
      rigged: rig.rigged,
    });
    useLowPolyStore.getState().setView(wantView);
  }

  // ---- animation
  if (data.anim) {
    await waitFor(() => engine.getAnimTarget() || !rig, 5_000).catch(() => undefined);
    useAnimStore.getState().load(data.anim);
  }
}
