import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import './Tabs.css';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface Props {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}

export function Tabs({ tabs, value, onChange, ariaLabel }: Props) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const targets: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const next = targets[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  const active = tabs.find((t) => t.id === value) ?? tabs[0];

  return (
    <div className="tabs">
      <div role="tablist" aria-label={ariaLabel} className="tabs__list">
        {tabs.map((t, i) => {
          const selected = t.id === active.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              className="tabs__tab"
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel-${active.id}`}
        aria-labelledby={`${base}-tab-${active.id}`}
        className="tabs__panel"
        tabIndex={0}
      >
        {active.content}
      </div>
    </div>
  );
}
