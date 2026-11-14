import { Panel } from '../design/components';
import { STEPS } from './steps';

interface Props {
  current: string;
  onSelect: (id: string) => void;
}

export function StepTracker({ current, onSelect }: Props) {
  return (
    <Panel title="Steps" className="steps">
      <ol className="steps__list">
        {STEPS.map((s, i) => {
          const active = s.id === current;
          return (
            <li key={s.id}>
              <button
                type="button"
                className="step"
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect(s.id)}
              >
                <span className="step__num" style={{ background: `var(--${s.color})` }}>
                  {i + 1}
                </span>
                <span className="step__text">
                  <span className="step__title">{s.title}</span>
                  <span className="step__hint">{s.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
