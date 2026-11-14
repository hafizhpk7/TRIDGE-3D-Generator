import { useEffect } from 'react';
import { ChipButton, Panel, ProgressBar, Slider, Toggle } from '../../design/components';
import { useLowPolyStore, type ViewMode } from '../../store/lowPolyStore';
import { hexToRgb, rgbToHex } from './colors';
import {
  PRESETS,
  MAX_TRIANGLES,
  MIN_TRIANGLES,
  sliderToTriangles,
  trianglesToSlider,
} from './slider';
import type { ColorMode } from './types';
import './LowPolyPanel.css';

const COLOR_MODES: { id: ColorMode; label: string; hint: string }[] = [
  { id: 'palette', label: 'Palette', hint: 'A few flat colors for a clean toy look.' },
  { id: 'faces', label: 'Face colors', hint: 'One color per facet, sampled from the picture.' },
  { id: 'texture', label: 'Original texture', hint: 'Keeps the painted surface of the model.' },
];

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'split', label: 'Split' },
  { id: 'original', label: 'Original' },
  { id: 'lowpoly', label: 'Low poly' },
];

const fmt = (n: number) => n.toLocaleString('en-US');

export function LowPolyPanel() {
  const source = useLowPolyStore((s) => s.source);
  const settings = useLowPolyStore((s) => s.settings);
  const busy = useLowPolyStore((s) => s.busy);
  const stage = useLowPolyStore((s) => s.stage);
  const error = useLowPolyStore((s) => s.error);
  const result = useLowPolyStore((s) => s.result);
  const palette = useLowPolyStore((s) => s.palette);
  const view = useLowPolyStore((s) => s.view);
  const enable = useLowPolyStore((s) => s.enable);
  const update = useLowPolyStore((s) => s.update);
  const setPaletteColor = useLowPolyStore((s) => s.setPaletteColor);
  const setView = useLowPolyStore((s) => s.setView);

  useEffect(() => {
    enable();
  }, [enable]);

  if (!source) {
    return (
      <Panel title="Low poly" accent="yellow">
        <p>Make or open a 3D model first, then come back to make it chunky.</p>
      </Panel>
    );
  }

  const sourceTriangles =
    result?.sourceTriangles ?? source.data.meshes.reduce((n, m) => n + m.indices.length / 3, 0);
  const tooSmall = sourceTriangles <= settings.targetTriangles;

  return (
    <Panel title="Low poly" accent="yellow" className="lowpoly">
      <section aria-label="Detail">
        <h3>How chunky?</h3>
        <div className="lowpoly__presets" role="group" aria-label="Presets">
          {PRESETS.map((p) => (
            <ChipButton
              key={p.id}
              color="yellow"
              aria-pressed={settings.targetTriangles === p.triangles}
              onClick={() => update({ targetTriangles: p.triangles })}
            >
              {p.label}
            </ChipButton>
          ))}
        </div>
        <Slider
          label="Detail"
          value={trianglesToSlider(settings.targetTriangles)}
          min={0}
          max={100}
          step={0.5}
          format={() => `${fmt(settings.targetTriangles)} triangles`}
          onChange={(v) => update({ targetTriangles: sliderToTriangles(v) })}
        />
        <div className="lowpoly__ends" aria-hidden="true">
          <span>Chunky ({fmt(MIN_TRIANGLES)})</span>
          <span>Detailed ({fmt(MAX_TRIANGLES)})</span>
        </div>
        <div className="lowpoly__count" role="status" aria-live="polite">
          {busy ? (
            <>
              <p>{stage || 'Working'}…</p>
              <ProgressBar label="Making it low poly" />
            </>
          ) : result ? (
            <p>
              <strong>{fmt(result.triangles)}</strong> triangles now, from{' '}
              {fmt(result.sourceTriangles)}.
              {tooSmall && ' This model is already smaller than your target.'}
            </p>
          ) : null}
        </div>
      </section>

      <section aria-label="Color">
        <h3>Color</h3>
        <div className="radios" role="radiogroup" aria-label="Color style">
          {COLOR_MODES.map((m) => (
            <label key={m.id} className={`radio ${settings.colorMode === m.id ? 'radio--on' : ''}`}>
              <input
                type="radio"
                name="color-mode"
                checked={settings.colorMode === m.id}
                onChange={() => update({ colorMode: m.id })}
              />
              <span className="radio__text">
                <span className="radio__label">{m.label}</span>
                <span className="radio__hint">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {settings.colorMode === 'palette' && (
          <>
            <Slider
              label="Number of colors"
              value={settings.paletteSize}
              min={4}
              max={16}
              onChange={(v) => update({ paletteSize: v })}
            />
            {palette && (
              <ul className="swatches" aria-label="Palette colors. Click one to change it.">
                {palette.map((c, i) => (
                  <li key={i}>
                    <input
                      type="color"
                      className="swatch-input"
                      aria-label={`Palette color ${i + 1}`}
                      value={rgbToHex(c)}
                      onChange={(e) => setPaletteColor(i, hexToRgb(e.target.value))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section aria-label="Edges">
        <Toggle
          label="Keep open edges in place"
          checked={settings.lockBorders}
          onChange={(v) => update({ lockBorders: v })}
        />
      </section>

      <section aria-label="Compare">
        <h3>Compare</h3>
        <div className="lowpoly__views" role="radiogroup" aria-label="What to show">
          {VIEWS.map((v) => (
            <ChipButton
              key={v.id}
              color="violet"
              role="radio"
              aria-checked={view === v.id}
              aria-pressed={undefined}
              className={view === v.id ? 'chip--on' : ''}
              disabled={!result}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </ChipButton>
          ))}
        </div>
      </section>

      {result && result.engine !== 'meshoptimizer' && (
        <p className="lowpoly__note">
          {result.engine === 'three'
            ? 'Used the backup simplifier. Vertex colors may be lost.'
            : 'Used the basic simplifier because WebAssembly is not available. Results are rougher.'}
        </p>
      )}
      {error && (
        <p className="lowpoly__error" role="alert">
          {error}
        </p>
      )}
    </Panel>
  );
}
