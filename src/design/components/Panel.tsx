import type { HTMLAttributes, ReactNode } from 'react';
import './Panel.css';

interface Props extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  accent?: 'pink' | 'orange' | 'yellow' | 'mint' | 'sky' | 'violet';
  children: ReactNode;
}

export function Panel({ title, accent, children, className = '', ...rest }: Props) {
  return (
    <section className={`panel ${className}`} {...rest}>
      {title && (
        <h2 className="panel__title">
          {accent && (
            <span
              className="panel__dot"
              aria-hidden="true"
              style={{ background: `var(--${accent})` }}
            />
          )}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
