import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, nextTheme, readStoredTheme, THEME_KEY } from './theme';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('cycles system, light, dark, system', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });

  it('persists explicit modes and sets data-theme', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(readStoredTheme()).toBe('dark');
  });

  it('clears storage and attribute for system', () => {
    applyTheme('light');
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(readStoredTheme()).toBe('system');
  });
});
