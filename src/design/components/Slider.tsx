import { useId } from 'react';
import type { CSSProperties, InputHTMLAttributes } from 'react';
import './Slider.css';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Format the value shown next to the label. */
  format?: (v: number) => string;
}

export function Slider({ label, value, min, max, onChange, format, step = 1, ...rest }: Props) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <div className="slider__head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format ? format(value) : value}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        {...rest}
      />
    </div>
  );
}
