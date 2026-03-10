export type OutputLanguageCode =
  | 'auto'
  | 'en'
  | 'ko'
  | 'ja'
  | 'zh-Hans'
  | 'zh-Hant'
  | 'hi'
  | 'bn'
  | 'ta'
  | 'te'
  | 'mr'
  | 'gu'
  | 'kn'
  | 'ml'
  | 'pa'
  | 'ur'
  | 'es'
  | 'fr'
  | 'de'
  | 'it'
  | 'pt'
  | 'nl'
  | 'pl'
  | 'sv'
  | 'da'
  | 'no'
  | 'fi'
  | 'cs'
  | 'ro'
  | 'hu'
  | 'el'
  | 'uk'
  | 'tr';

export interface OutputLanguageOption {
  code: OutputLanguageCode;
  label: string;
  group: string;
  geminiName: string;
}

export const DEFAULT_OUTPUT_LANGUAGE: OutputLanguageCode = 'auto';

export const OUTPUT_LANGUAGE_OPTIONS: OutputLanguageOption[] = [
  { code: 'auto', label: 'Original subtitles', group: 'Default', geminiName: 'the same language as the transcript' },
  { code: 'en', label: 'English', group: 'Global', geminiName: 'English' },
  { code: 'ko', label: '한국어 · Korean', group: 'East Asia', geminiName: 'Korean' },
  { code: 'ja', label: '日本語 · Japanese', group: 'East Asia', geminiName: 'Japanese' },
  { code: 'zh-Hans', label: '中文(简体) · Simplified Chinese', group: 'East Asia', geminiName: 'Simplified Chinese' },
  { code: 'zh-Hant', label: '中文(繁體) · Traditional Chinese', group: 'East Asia', geminiName: 'Traditional Chinese' },
  { code: 'hi', label: 'हिन्दी · Hindi', group: 'Indian languages', geminiName: 'Hindi' },
  { code: 'bn', label: 'বাংলা · Bengali', group: 'Indian languages', geminiName: 'Bengali' },
  { code: 'ta', label: 'தமிழ் · Tamil', group: 'Indian languages', geminiName: 'Tamil' },
  { code: 'te', label: 'తెలుగు · Telugu', group: 'Indian languages', geminiName: 'Telugu' },
  { code: 'mr', label: 'मराठी · Marathi', group: 'Indian languages', geminiName: 'Marathi' },
  { code: 'gu', label: 'ગુજરાતી · Gujarati', group: 'Indian languages', geminiName: 'Gujarati' },
  { code: 'kn', label: 'ಕನ್ನಡ · Kannada', group: 'Indian languages', geminiName: 'Kannada' },
  { code: 'ml', label: 'മലയാളം · Malayalam', group: 'Indian languages', geminiName: 'Malayalam' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ · Punjabi', group: 'Indian languages', geminiName: 'Punjabi' },
  { code: 'ur', label: 'اردو · Urdu', group: 'Indian languages', geminiName: 'Urdu' },
  { code: 'es', label: 'Español · Spanish', group: 'European languages', geminiName: 'Spanish' },
  { code: 'fr', label: 'Français · French', group: 'European languages', geminiName: 'French' },
  { code: 'de', label: 'Deutsch · German', group: 'European languages', geminiName: 'German' },
  { code: 'it', label: 'Italiano · Italian', group: 'European languages', geminiName: 'Italian' },
  { code: 'pt', label: 'Português · Portuguese', group: 'European languages', geminiName: 'Portuguese' },
  { code: 'nl', label: 'Nederlands · Dutch', group: 'European languages', geminiName: 'Dutch' },
  { code: 'pl', label: 'Polski · Polish', group: 'European languages', geminiName: 'Polish' },
  { code: 'sv', label: 'Svenska · Swedish', group: 'European languages', geminiName: 'Swedish' },
  { code: 'da', label: 'Dansk · Danish', group: 'European languages', geminiName: 'Danish' },
  { code: 'no', label: 'Norsk · Norwegian', group: 'European languages', geminiName: 'Norwegian' },
  { code: 'fi', label: 'Suomi · Finnish', group: 'European languages', geminiName: 'Finnish' },
  { code: 'cs', label: 'Čeština · Czech', group: 'European languages', geminiName: 'Czech' },
  { code: 'ro', label: 'Română · Romanian', group: 'European languages', geminiName: 'Romanian' },
  { code: 'hu', label: 'Magyar · Hungarian', group: 'European languages', geminiName: 'Hungarian' },
  { code: 'el', label: 'Ελληνικά · Greek', group: 'European languages', geminiName: 'Greek' },
  { code: 'uk', label: 'Українська · Ukrainian', group: 'European languages', geminiName: 'Ukrainian' },
  { code: 'tr', label: 'Türkçe · Turkish', group: 'European languages', geminiName: 'Turkish' },
];

export const OUTPUT_LANGUAGE_GROUPS = ['Default', 'Global', 'East Asia', 'Indian languages', 'European languages'] as const;

export function isOutputLanguageCode(value: string): value is OutputLanguageCode {
  return OUTPUT_LANGUAGE_OPTIONS.some((option) => option.code === value);
}

export function getOutputLanguageOption(code: OutputLanguageCode): OutputLanguageOption {
  return OUTPUT_LANGUAGE_OPTIONS.find((option) => option.code === code) ?? OUTPUT_LANGUAGE_OPTIONS[0];
}

export function getOutputLanguageInstruction(targetLanguage: OutputLanguageCode, fallbackLang?: string): string {
  if (targetLanguage === 'auto') {
    const inferred = inferLanguageOption(fallbackLang);
    if (inferred) {
      return `Write the entire response in ${inferred.geminiName}.`;
    }
    return 'Write the entire response in the same language as the transcript.';
  }

  return `Write the entire response in ${getOutputLanguageOption(targetLanguage).geminiName}.`;
}

export function isSameLanguageSelection(sourceLang: string | undefined, targetLanguage: OutputLanguageCode): boolean {
  if (targetLanguage === 'auto') {
    return true;
  }

  const normalizedSource = normalizeLanguageTag(sourceLang);
  const normalizedTarget = normalizeLanguageTag(targetLanguage);
  return normalizedSource !== null && normalizedSource === normalizedTarget;
}

function inferLanguageOption(sourceLang?: string): OutputLanguageOption | null {
  const normalizedSource = normalizeLanguageTag(sourceLang);
  if (!normalizedSource) {
    return null;
  }

  return OUTPUT_LANGUAGE_OPTIONS.find((option) => normalizeLanguageTag(option.code) === normalizedSource) ?? null;
}

function normalizeLanguageTag(value?: string): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/_/g, '-').toLowerCase();
  if (normalized === 'auto') {
    return 'auto';
  }

  if (normalized.startsWith('zh-hant') || normalized.endsWith('-tw') || normalized.endsWith('-hk') || normalized.endsWith('-mo')) {
    return 'zh-hant';
  }

  if (normalized.startsWith('zh-hans') || normalized.endsWith('-cn') || normalized.endsWith('-sg')) {
    return 'zh-hans';
  }

  return normalized.split('-')[0] ?? null;
}
