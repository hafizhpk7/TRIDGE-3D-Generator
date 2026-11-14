import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';
import './Chip.css';

type Color = 'pink' | 'orange' | 'yellow' | 'mint' | 'sky' | 'violet';

interface BaseProps {
  color?: Color;
}

/** Static label chip. */
export function Chip({
  color = 'sky',
  className = '',
  ...rest
}: BaseProps & HTMLAttributes<HTMLSpanElement>) {
  return <span className={`chip chip--${color} ${className}`} {...rest} />;
}

/** Clickable chip, e.g. for animation suggestions. */
export function ChipButton({
  color = 'sky',
  className = '',
  type = 'button',
  ...rest
}: BaseProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`chip chip--btn chip--${color} ${className}`} {...rest} />;
}
