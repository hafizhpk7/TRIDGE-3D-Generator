import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './IconButton.css';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`icon-btn ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
