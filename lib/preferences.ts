import {
  DEFAULT_OUTPUT_LANGUAGE,
  isOutputLanguageCode,
  type OutputLanguageCode,
} from './output-language';

const OUTPUT_LANGUAGE_KEY = 'preferred_output_language';

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
