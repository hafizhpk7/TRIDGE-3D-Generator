import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_KEY = 'tridge-theme';

export function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'system') delete root.dataset.theme;
  else root.dataset.theme = mode;
  try {
    if (mode === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* storage unavailable: the theme still applies for this session */
  }
}

export const nextTheme = (m: ThemeMode): ThemeMode =>
  m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  cycle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  mode: readStoredTheme(),
  setMode: (mode) => {
    applyTheme(mode);
    set({ mode });
  },
  cycle: () => get().setMode(nextTheme(get().mode)),
}));
