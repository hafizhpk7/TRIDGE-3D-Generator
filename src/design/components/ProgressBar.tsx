import './ProgressBar.css';

interface Props {
  label: string;
  /** 0 to 100. Omit for the indeterminate "queue" state. */
  value?: number;
}

export function ProgressBar({ label, value }: Props) {
  const indeterminate = value === undefined;
  return (
    <div
      className={`progress ${indeterminate ? 'progress--queue' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
    >
      <div className="progress__fill" style={indeterminate ? undefined : { width: `${value}%` }} />
    </div>
  );
}
