import { useRef } from 'react';
import { Button, ChipButton, IconButton, Toggle, useToast } from '../../design/components';
import {
  addPrimitive,
  deletePart,
  duplicatePart,
  findPart,
  setPaletteColor,
  toggleMirror,
  unlinkMirror,
  updateBoneHead,
  updatePart,
} from '../editor/ops';
import { expandSpec } from '../builder/expand';
import { processAnswer } from '../prompts';
import { SHAPES, type Part, type ShapeName, type Vec3 } from '../spec/types';
import { useCraftStore, useCraftUi, type GizmoMode } from '../store';
import { ColorField, NumField, SelectField } from './fields';

const MODES: { id: GizmoMode; label: string; key: string }[] = [
  { id: 'translate', label: 'Move', key: 'W' },
  { id: 'rotate', label: 'Rotate', key: 'E' },
  { id: 'scale', label: 'Scale', key: 'R' },
];

/** Names and values of the editable size fields for a part. */
function sizeFields(
  part: Part,
): { label: string; value: number; set: (v: number) => Partial<Part> }[] {
  switch (part.shape) {
    case 'sphere':
      return (['x', 'y', 'z'] as const).map((a, i) => ({
        label: `Radius ${a}`,
        value: part.radii[i],
        set: (v) =>
          ({ radii: part.radii.map((r, k) => (k === i ? v : r)) as Vec3 }) as Partial<Part>,
      }));
    case 'box':
      return (['x', 'y', 'z'] as const).map((a, i) => ({
        label: `Size ${a}`,
        value: part.size[i],
        set: (v) => ({ size: part.size.map((r, k) => (k === i ? v : r)) as Vec3 }) as Partial<Part>,
      }));
    case 'cylinder':
      return [
        {
          label: 'Radius top',
          value: part.radiusTop,
          set: (v) => ({ radiusTop: v }) as Partial<Part>,
        },
        {
          label: 'Radius bottom',
          value: part.radiusBottom,
          set: (v) => ({ radiusBottom: v }) as Partial<Part>,
        },
        { label: 'Height', value: part.height, set: (v) => ({ height: v }) as Partial<Part> },
      ];
    case 'cone':
      return [
        { label: 'Radius', value: part.radius, set: (v) => ({ radius: v }) as Partial<Part> },
        { label: 'Height', value: part.height, set: (v) => ({ height: v }) as Partial<Part> },
      ];
    case 'capsule':
      return [
        { label: 'Radius', value: part.radius, set: (v) => ({ radius: v }) as Partial<Part> },
        { label: 'Length', value: part.length, set: (v) => ({ length: v }) as Partial<Part> },
      ];
    case 'torus':
      return [
        { label: 'Radius', value: part.radius, set: (v) => ({ radius: v }) as Partial<Part> },
        { label: 'Tube', value: part.tube, set: (v) => ({ tube: v }) as Partial<Part> },
      ];
    case 'tube':
      return [
        {
          label: 'Radius start',
          value: part.radiusStart,
          set: (v) => ({ radiusStart: v }) as Partial<Part>,
        },
        {
          label: 'Radius end',
          value: part.radiusEnd,
          set: (v) => ({ radiusEnd: v }) as Partial<Part>,
        },
      ];
  }
}

export function EditTab() {
  const toast = useToast();
  const spec = useCraftStore((s) => s.spec);
  const selectedId = useCraftStore((s) => s.selectedId);
  const history = useCraftStore((s) => s.history);
  const edit = useCraftStore((s) => s.edit);
  const select = useCraftStore((s) => s.select);
  const undo = useCraftStore((s) => s.undo);
  const redo = useCraftStore((s) => s.redo);
  const loadSpec = useCraftStore((s) => s.loadSpec);
  const gizmoMode = useCraftUi((s) => s.gizmoMode);
  const snap = useCraftUi((s) => s.snap);
  const setGizmoMode = useCraftUi((s) => s.setGizmoMode);
  const setSnap = useCraftUi((s) => s.setSnap);
  const importInput = useRef<HTMLInputElement>(null);

  if (!spec) return <p className="muted">Pick a template or ask Claude for a model first.</p>;

  const part = selectedId ? findPart(spec, selectedId) : undefined;
  const boneNames = expandSpec(spec).bones.map((b) => b.name);
  const paletteKeys = Object.keys(spec.palette);
  const colorOptions = [
    ...paletteKeys.map((k) => ({ value: k, label: k })),
    ...(part && !spec.palette[part.color] ? [{ value: part.color, label: part.color }] : []),
  ];

  const patch = (p: Partial<Part>) => part && edit(updatePart(spec, part.id, p));

  const downloadSpec = () => {
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'model'}.shape.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSpec = async (file: File | undefined) => {
    if (!file) return;
    const result = processAnswer(await file.text());
    if (result.ok) {
      loadSpec(result.spec, 'file', file.name, result.warnings);
      toast.show(`"${result.spec.name}" opened.`, 'success');
    } else {
      toast.show(result.errors[0] ?? 'That file could not be read.', 'error');
    }
  };

  return (
    <div className="craft-section">
      <div className="craft-row" role="toolbar" aria-label="Edit tools">
        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={history.past.length === 0}>
          ↶
        </IconButton>
        <IconButton
          label="Redo (Ctrl+Shift+Z)"
          onClick={redo}
          disabled={history.future.length === 0}
        >
          ↷
        </IconButton>
        {MODES.map((m) => (
          <ChipButton
            key={m.id}
            color="violet"
            aria-pressed={gizmoMode === m.id}
            onClick={() => setGizmoMode(m.id)}
            title={`${m.label} (${m.key})`}
          >
            {m.label}
          </ChipButton>
        ))}
      </div>
      <Toggle label="Snap (0.05 units, 15°)" checked={snap} onChange={setSnap} />
      <p className="muted">
        Click a part in the viewer, or pick it from the list. Press W, E or R to switch tools.
      </p>

      <section aria-label="Parts">
        <h3>Parts ({spec.parts.length})</h3>
        <ul className="partlist">
          {spec.parts.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`partlist__item ${p.id === selectedId ? 'partlist__item--on' : ''}`}
                aria-pressed={p.id === selectedId}
                onClick={() => select(p.id === selectedId ? null : p.id)}
              >
                <span
                  className="partlist__dot"
                  style={{
                    background:
                      spec.palette[p.color] ?? (p.color.startsWith('#') ? p.color : '#B0B0C0'),
                  }}
                />
                <span className="partlist__name">{p.id}</span>
                <span className="partlist__shape">
                  {p.shape}
                  {p.mirror ? ' ↔' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="craft-row">
          <SelectField
            label="Add a shape"
            value=""
            options={[
              { value: '', label: 'Choose…' },
              ...SHAPES.map((s) => ({ value: s, label: s })),
            ]}
            onChange={(v) => {
              if (!v) return;
              const { spec: next, newId } = addPrimitive(spec, v as ShapeName);
              edit(next);
              select(newId);
            }}
          />
        </div>
      </section>

      {part ? (
        <section aria-label={`Edit ${part.id}`} className="partedit">
          <h3>{part.id}</h3>
          <div className="craft-row">
            <Button
              variant="ghost"
              onClick={() => {
                const { spec: next, newId } = duplicatePart(spec, part.id);
                edit(next);
                select(newId);
              }}
            >
              Duplicate
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                edit(deletePart(spec, part.id));
                select(null);
              }}
              disabled={spec.parts.length <= 1}
            >
              Delete
            </Button>
            <Toggle
              label="Mirror"
              checked={Boolean(part.mirror)}
              onChange={() => edit(toggleMirror(spec, part.id))}
            />
            {part.mirror && (
              <Button variant="ghost" onClick={() => edit(unlinkMirror(spec, part.id))}>
                Unlink pair
              </Button>
            )}
          </div>
          {part.mirror && (
            <p className="muted">
              Editing this part also edits its right-hand twin. Unlink to edit them separately.
            </p>
          )}

          {part.shape !== 'tube' && (
            <>
              <fieldset>
                <legend>Position</legend>
                <div className="craft-grid3">
                  {(['x', 'y', 'z'] as const).map((a, i) => (
                    <NumField
                      key={a}
                      label={a.toUpperCase()}
                      value={part.position[i]}
                      onCommit={(v) =>
                        patch({ position: part.position.map((n, k) => (k === i ? v : n)) as Vec3 })
                      }
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Rotation (degrees)</legend>
                <div className="craft-grid3">
                  {(['x', 'y', 'z'] as const).map((a, i) => {
                    const rot = part.rotation ?? [0, 0, 0];
                    return (
                      <NumField
                        key={a}
                        label={a.toUpperCase()}
                        step={5}
                        value={rot[i]}
                        onCommit={(v) =>
                          patch({ rotation: rot.map((n, k) => (k === i ? v : n)) as Vec3 })
                        }
                      />
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}
          <fieldset>
            <legend>Size</legend>
            <div className="craft-grid3">
              {sizeFields(part).map((f) => (
                <NumField
                  key={f.label}
                  label={f.label}
                  value={f.value}
                  onCommit={(v) => patch(f.set(v))}
                />
              ))}
            </div>
          </fieldset>
          <SelectField
            label="Color"
            value={part.color}
            options={colorOptions}
            onChange={(v) => patch({ color: v })}
          />
          <SelectField
            label="Moves with bone"
            value={part.bone}
            options={boneNames.map((n) => ({ value: n, label: n }))}
            onChange={(v) => patch({ bone: v })}
          />
        </section>
      ) : (
        <p className="muted">Nothing selected.</p>
      )}

      <section aria-label="Palette">
        <h3>Palette</h3>
        <p className="muted">Changing a color changes every part that uses it.</p>
        <div className="palette">
          {paletteKeys.map((k) => (
            <ColorField
              key={k}
              label={k}
              value={spec.palette[k]}
              onChange={(hex) => edit(setPaletteColor(spec, k, hex))}
            />
          ))}
        </div>
      </section>

      <details>
        <summary>Bones</summary>
        <p className="muted">
          Move the joints. Numbers for now; draggable markers come with the rigging step.
        </p>
        {spec.bones.map((b) => (
          <fieldset key={b.name}>
            <legend>
              {b.name}
              {b.mirror ? ' ↔' : ''}
            </legend>
            <div className="craft-grid3">
              {(['x', 'y', 'z'] as const).map((a, i) => (
                <NumField
                  key={a}
                  label={a.toUpperCase()}
                  value={b.head[i]}
                  onCommit={(v) =>
                    edit(
                      updateBoneHead(spec, b.name, b.head.map((n, k) => (k === i ? v : n)) as Vec3),
                    )
                  }
                />
              ))}
            </div>
          </fieldset>
        ))}
      </details>

      <section aria-label="Shape Spec file">
        <h3>Shape Spec file</h3>
        <div className="craft-row">
          <Button variant="ghost" onClick={downloadSpec}>
            Download Shape Spec (.json)
          </Button>
          <Button variant="ghost" onClick={() => importInput.current?.click()}>
            Open a Shape Spec
          </Button>
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void importSpec(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </section>
    </div>
  );
}
