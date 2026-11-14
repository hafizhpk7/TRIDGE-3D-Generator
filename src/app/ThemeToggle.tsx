import { IconButton } from '../design/components';
import { useTheme } from './theme';
import type { ThemeMode } from './theme';

const ICON: Record<ThemeMode, string> = { system: '🖥️', light: '☀️', dark: '🌙' };
const NAME: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function ThemeToggle() {
  const mode = useTheme((s) => s.mode);
  const cycle = useTheme((s) => s.cycle);
  return (
    <IconButton label={`Theme: ${NAME[mode]}. Click to change`} onClick={cycle}>
      <span aria-hidden="true">{ICON[mode]}</span>
    </IconButton>
  );
}
