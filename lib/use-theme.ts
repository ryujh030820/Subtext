import { useEffect, useState, useCallback } from 'react';
import {
  getPreferredTheme,
  setPreferredTheme,
  onPreferredThemeChange,
  type ThemeMode,
} from './preferences';

type ResolvedTheme = 'light' | 'dark';

function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  return mode;
}

/**
 * Theme hook. Manages dark class on root element.
 * @param root — the element to toggle `.dark` on (defaults to document.documentElement)
 */
export function useTheme(root?: HTMLElement | null) {
  const [mode, setMode] = useState<ThemeMode>('system');
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  const resolved = resolveTheme(mode, systemDark);

  // Load stored preference
  useEffect(() => {
    void getPreferredTheme().then(setMode);
    return onPreferredThemeChange(setMode);
  }, []);

  // Listen for system color scheme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Apply dark class
  useEffect(() => {
    const el = root ?? document.documentElement;
    if (!el) return;
    if (resolved === 'dark') {
      el.classList.add('dark');
    } else {
      el.classList.remove('dark');
    }
  }, [resolved, root]);

  const cycleTheme = useCallback(() => {
    const next: ThemeMode = resolved === 'light' ? 'dark' : 'light';
    setMode(next);
    void setPreferredTheme(next);
  }, [resolved]);

  const setTheme = useCallback((t: ThemeMode) => {
    setMode(t);
    void setPreferredTheme(t);
  }, []);

  return { mode, resolved, cycleTheme, setTheme };
}
