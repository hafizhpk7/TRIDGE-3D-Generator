import { useId, useState } from 'react';
import { Slider, Toggle } from '../../design/components';
import type { ParamDef, Params } from '../templates/helpers';

/** Number input that applies its value when you leave it or press Enter, so one edit is one undo step. */
export function NumField({
  label,
  value,
  onCommit,
  step = 0.05,
  min,
  max,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const id = useId();
  const shown = String(Math.round(value * 1000) / 1000);
  // null means "show the model's value"; text only exists while you are typing.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = Number.parseFloat(draft ?? shown);
    setDraft(null);
    if (Number.isFinite(n) && n !== value) onCommit(n);
  };
  return (
    <div className="numfield">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={draft ?? shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </div>
  );
}

/** A native color input styled as a swatch. `value` is a hex string. */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const id = useId();
  return (
    <div className="colorfield">
      <input
        id={id}
        type="color"
        value={value.toLowerCase()}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

/** Controls generated from a template's parameter list. */
export function ParamControls({
  defs,
  values,
  onChange,
}: {
  defs: ParamDef[];
  values: Params;
  onChange: (patch: Params) => void;
}) {
  return (
    <div className="params">
      {defs.map((d) => {
        const v = values[d.key];
        switch (d.type) {
          case 'range':
            return (
              <Slider
                key={d.key}
                label={d.label}
                value={Number(v)}
                min={d.min}
                max={d.max}
                step={d.step}
                format={(n) => n.toFixed(d.step < 0.1 ? 2 : 1)}
                onChange={(n) => onChange({ [d.key]: n })}
              />
            );
          case 'color':
            return (
              <ColorField
                key={d.key}
                label={d.label}
                value={String(v)}
                onChange={(hex) => onChange({ [d.key]: hex })}
              />
            );
          case 'select':
            return (
              <SelectField
                key={d.key}
                label={d.label}
                value={String(v)}
                options={d.options}
                onChange={(val) => onChange({ [d.key]: val })}
              />
            );
          case 'toggle':
            return (
              <Toggle
                key={d.key}
                label={d.label}
                checked={Boolean(v)}
                onChange={(c) => onChange({ [d.key]: c })}
              />
            );
        }
      })}
    </div>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="selectfield">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
