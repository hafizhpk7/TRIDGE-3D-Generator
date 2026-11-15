import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject, PointerEvent } from 'react';
import type { GizmoListener, ViewerEngine } from '../viewer/ViewerEngine';
import { computeStats, type ModelStats } from '../viewer/helpers';
import { useLowPolyStore } from '../store/lowPolyStore';
import { partAtFace } from './builder/build';
import { createCraftObject } from './builder/object';
import { clone, findPart, rotatePart, scalePart, sourceIdFor, translatePart } from './editor/ops';
import { previewMotion } from './preview';
import { mirrorId } from './spec/mirror';
import type { Part, ShapeSpec, Vec3 } from './spec/types';
import { useCraftStore, useCraftUi } from './store';

interface Callbacks {
  onShown: (info: { stats: ModelStats | null; name: string }) => void;
}

/** Where the gizmo sits for a part. Tubes have no position of their own, so use the middle of their points. */
export function gizmoOrigin(part: Part): Vec3 {
  if (part.shape !== 'tube') return part.position;
  const n = part.points.length;
  const sum = part.points.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

/**
 * Connects the Craft store to the 3D viewer: builds the rigged model, shows selection outlines and
 * gizmo handles, picks parts by clicking, and runs the movement preview.
 */
export function useCraftViewer(
  engineRef: MutableRefObject<ViewerEngine | null>,
  { onShown }: Callbacks,
) {
  const built = useCraftStore((s) => s.built);
  const builtEpoch = useCraftStore((s) => s.builtEpoch);
  const spec = useCraftStore((s) => s.spec);
  const selectedId = useCraftStore((s) => s.selectedId);
  const editMode = useCraftUi((s) => s.editMode);
  const gizmoMode = useCraftUi((s) => s.gizmoMode);
  const snap = useCraftUi((s) => s.snap);
  const preview = useCraftUi((s) => s.preview);

  const lastEpoch = useRef(-1);
  const onShownRef = useRef(onShown);
  useEffect(() => {
    onShownRef.current = onShown;
  });

  const gizmoHandlerRef = useRef<GizmoListener>(() => undefined);

  // ---- show the built model
  useEffect(() => {
    const engine = engineRef.current;
    const currentSpec = useCraftStore.getState().spec;
    if (!engine || !built || !currentSpec) return;
    const group = createCraftObject(built, currentSpec.name);
    // Same model, edited: keep the camera and placement.
    engine.setModel(group, 0, { keepView: lastEpoch.current === builtEpoch });
    lastEpoch.current = builtEpoch;
    engine.onGizmo(gizmoHandlerRef.current);
    useLowPolyStore.getState().setSource(null);
    onShownRef.current({ stats: computeStats(group, 0), name: currentSpec.name });
  }, [built, builtEpoch, engineRef]);

  // ---- selection outline + gizmo
  const syncSelection = useCallback(() => {
    const engine = engineRef.current;
    const { built: b, spec: s, selectedId: sel } = useCraftStore.getState();
    const ui = useCraftUi.getState();
    if (!engine) return;
    const part = s && sel ? findPart(s, sel) : undefined;
    if (!b || !s || !part || !ui.editMode) {
      engine.setHighlight(null);
      engine.setGizmo(null);
      return;
    }
    const ids = new Set([part.id, ...(part.mirror ? [mirrorId(part.id)] : [])]);
    const chunks = b.ranges
      .filter((r) => ids.has(r.id))
      .map((r) => b.positions.subarray(r.start * 3, (r.start + r.count) * 3));
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let o = 0;
    for (const c of chunks) {
      merged.set(c, o);
      o += c.length;
    }
    engine.setHighlight(total ? merged : null);
    const mode = part.shape === 'tube' && ui.gizmoMode !== 'translate' ? 'translate' : ui.gizmoMode;
    engine.setGizmo({
      position: gizmoOrigin(part),
      rotation: part.rotation ?? [0, 0, 0],
      mode,
      snap: ui.snap,
    });
  }, [engineRef]);

  useEffect(() => {
    syncSelection();
  }, [built, spec, selectedId, editMode, gizmoMode, snap, syncSelection]);

  // ---- gizmo drags edit the spec. The drag state lives in a ref so a rebuild mid-drag cannot lose it.
  const drag = useRef<{ before: ShapeSpec | null; start: Part | null; origin: Vec3 }>({
    before: null,
    start: null,
    origin: [0, 0, 0],
  });
  const handleGizmo = useCallback<GizmoListener>(
    (t, phase) => {
      const store = useCraftStore.getState();
      const sel = store.selectedId;
      const current = store.spec;
      const d = drag.current;
      if (!current || !sel) return;
      if (phase === 'start') {
        const part = findPart(current, sel);
        if (!part) return;
        d.before = clone(current);
        d.start = clone(part);
        d.origin = gizmoOrigin(part);
        return;
      }
      if (phase === 'end') {
        if (d.before) store.commit(d.before);
        d.before = null;
        d.start = null;
        syncSelection();
        return;
      }
      const start = d.start;
      if (!start) return;
      const mode = useCraftUi.getState().gizmoMode;
      let next: Part;
      if (mode === 'rotate') next = rotatePart(start, t.rotation);
      else if (mode === 'scale') next = scalePart(start, t.scale);
      else {
        const delta: Vec3 = [
          t.position[0] - d.origin[0],
          t.position[1] - d.origin[1],
          t.position[2] - d.origin[2],
        ];
        next = translatePart(start, [
          start.position[0] + delta[0],
          start.position[1] + delta[1],
          start.position[2] + delta[2],
        ]);
      }
      store.edit(
        { ...current, parts: current.parts.map((p) => (p.id === sel ? next : p)) },
        { record: false },
      );
    },
    [syncSelection],
  );

  useEffect(() => {
    gizmoHandlerRef.current = handleGizmo;
    engineRef.current?.onGizmo(handleGizmo);
  }, [handleGizmo, engineRef]);

  useEffect(() => {
    const engine = engineRef.current;
    return () => engine?.onGizmo(null);
  }, [engineRef]);

  // ---- movement preview
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setUpdater(preview && spec ? previewMotion(spec.bodyType) : null);
    return () => engine.setUpdater(null);
  }, [preview, spec?.bodyType, built, engineRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- click to pick a part
  const down = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = useCallback((e: PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const engine = engineRef.current;
      const start = down.current;
      down.current = null;
      const { built: b, spec: s } = useCraftStore.getState();
      if (!engine || !start || !b || !s || !useCraftUi.getState().editMode) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return; // a drag, not a click
      if (engine.isGizmoBusy()) return;
      const face = engine.pickFace(e.clientX, e.clientY);
      const id = face === null ? null : partAtFace(b.ranges, face);
      useCraftStore.getState().select(id ? sourceIdFor(s, id) : null);
    },
    [engineRef],
  );

  return { onPointerDown, onPointerUp };
}
