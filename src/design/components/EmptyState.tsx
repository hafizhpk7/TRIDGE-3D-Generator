import type { ReactNode } from 'react';
import './EmptyState.css';

interface Props {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, children, action, icon }: Props) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon ?? (
          <svg viewBox="0 0 64 64" width="56" height="56">
            <g stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round">
              <polygon points="32,6 58,22 32,36" fill="var(--yellow)" />
              <polygon points="32,6 32,36 6,22" fill="var(--pink)" />
              <polygon points="58,22 58,44 32,58 32,36" fill="var(--sky)" />
              <polygon points="6,22 32,36 32,58 6,44" fill="var(--mint)" />
            </g>
          </svg>
        )}
      </div>
      <h3 className="empty__title">{title}</h3>
      {children && <p className="empty__body">{children}</p>}
      {action}
    </div>
  );
}
