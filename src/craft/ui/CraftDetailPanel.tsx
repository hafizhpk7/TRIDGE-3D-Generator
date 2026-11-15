import { Chip, Panel, Slider, Toggle } from '../../design/components';
import { setPaletteColor } from '../editor/ops';
import { useCraftStore } from '../store';
import { ColorField } from './fields';
import './craft.css';

/** The Low poly step for Craft models: the slider sets the builder's detail directly, so it is exact and instant. */
export function CraftDetailPanel() {
  const spec = useCraftStore((s) => s.spec);
  const detail = useCraftStore((s) => s.detail);
  const soft = useCraftStore((s) => s.softJoints);
  const built = useCraftStore((s) => s.built);
  const building = useCraftStore((s) => s.building);
  const setDetail = useCraftStore((s) => s.setDetail);
  const setSoft = useCraftStore((s) => s.setSoftJoints);
  const edit = useCraftStore((s) => s.edit);
  if (!spec) return null;

  return (
    <Panel title="Low poly" accent="yellow" className="craft">
      <p className="muted">
        Craft models are built from shapes, so there is nothing to simplify. The slider below sets
        how smooth each shape is.
      </p>
      <Slider
        label="Detail"
        value={detail}
        min={1}
        max={10}
        step={1}
        format={(n) => (n <= 3 ? `${n} (chunky)` : n >= 8 ? `${n} (smooth)` : String(n))}
        onChange={setDetail}
      />
      <div className="craft-summary" role="status" aria-live="polite">
        {built && <Chip color="mint">{built.triangles.toLocaleString('en-US')} triangles</Chip>}
        {building && <Chip color="yellow">Building…</Chip>}
      </div>
      <Toggle label="Soft joints (hide cracks when limbs move)" checked={soft} onChange={setSoft} />

      <section aria-label="Palette">
        <h3>Palette</h3>
        <p className="muted">Changing a color changes every part that uses it.</p>
        <div className="palette">
          {Object.keys(spec.palette).map((k) => (
            <ColorField
              key={k}
              label={k}
              value={spec.palette[k]}
              onChange={(hex) => edit(setPaletteColor(spec, k, hex))}
            />
          ))}
        </div>
      </section>
    </Panel>
  );
}
