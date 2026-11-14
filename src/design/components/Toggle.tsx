import type { ButtonHTMLAttributes } from 'react';
import './Toggle.css';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, checked, onChange, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle ${className}`}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
      <span className="toggle__label">{label}</span>
    </button>
  );
}
