import {
  DEFAULT_OUTPUT_LANGUAGE,
  isOutputLanguageCode,
  type OutputLanguageCode,
} from './output-language';

const OUTPUT_LANGUAGE_KEY = 'preferred_output_language';

// Theme preferences
export type ThemeMode = 'light' | 'dark' | 'system';
const THEME_KEY = 'preferred_theme';
const VALID_THEMES: ThemeMode[] = ['light', 'dark', 'system'];

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && VALID_THEMES.includes(value as ThemeMode);
}

export async function getPreferredTheme(): Promise<ThemeMode> {
  const stored = await chrome.storage.local.get(THEME_KEY);
  const value = stored[THEME_KEY];
  return isThemeMode(value) ? value : 'system';
}

export async function setPreferredTheme(theme: ThemeMode): Promise<void> {
  await chrome.storage.local.set({ [THEME_KEY]: theme });
}

export function onPreferredThemeChange(
  callback: (theme: ThemeMode) => void,
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !changes[THEME_KEY]) return;
    const nextValue = changes[THEME_KEY].newValue;
    if (isThemeMode(nextValue)) {
      callback(nextValue);
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function getPreferredOutputLanguage(): Promise<OutputLanguageCode> {
  const stored = await chrome.storage.local.get(OUTPUT_LANGUAGE_KEY);
  const value = stored[OUTPUT_LANGUAGE_KEY];
  return typeof value === 'string' && isOutputLanguageCode(value)
    ? value
    : DEFAULT_OUTPUT_LANGUAGE;
}

export async function setPreferredOutputLanguage(language: OutputLanguageCode): Promise<void> {
  await chrome.storage.local.set({ [OUTPUT_LANGUAGE_KEY]: language });
}

export function onPreferredOutputLanguageChange(
  callback: (language: OutputLanguageCode) => void,
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !changes[OUTPUT_LANGUAGE_KEY]) {
      return;
    }

    const nextValue = changes[OUTPUT_LANGUAGE_KEY].newValue;
    if (typeof nextValue === 'string' && isOutputLanguageCode(nextValue)) {
      callback(nextValue);
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
