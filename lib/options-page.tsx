import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageSelect } from '@/components/LanguageSelect';
import {
  DEFAULT_OUTPUT_LANGUAGE,
  getOutputLanguageOption,
  type OutputLanguageCode,
} from '@/lib/output-language';
import {
  getPreferredOutputLanguage,
  setPreferredOutputLanguage,
  getPreferredTheme,
  setPreferredTheme,
  type ThemeMode,
} from '@/lib/preferences';
import { useTheme } from '@/lib/use-theme';
import { UiTextProvider, createUiText } from '@/lib/ui-text';
import './options-page.css';

function OptionsApp() {
  const [language, setLanguage] = useState<OutputLanguageCode>(DEFAULT_OUTPUT_LANGUAGE);
  const [isLoaded, setIsLoaded] = useState(false);
  const { mode, setTheme } = useTheme();
  const ui = createUiText(language);

  useEffect(() => {
    void getPreferredOutputLanguage().then((value) => {
      setLanguage(value);
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    document.title = ui.t('options.title');
  }, [ui]);

  const handleChange = (value: OutputLanguageCode) => {
    setLanguage(value);
    void setPreferredOutputLanguage(value);
  };

  const selected = getOutputLanguageOption(language);

  return (
    <UiTextProvider language={language}>
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-2xl rounded-3xl border border-border-subtle bg-bg-base p-8 shadow-sm">
        <p className="text-sm font-semibold text-accent-brand">{ui.t('options.title')}</p>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary">{ui.t('options.language')}</h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          {ui.t('options.description')}
        </p>

        <div className="mt-8 rounded-2xl border border-border-default bg-bg-subtle p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="shrink-0">
              <p className="text-sm font-medium text-text-primary">{ui.t('options.outputLanguage')}</p>
              <p className="mt-1 text-xs text-text-muted">{ui.t('options.currentSelection', { label: selected.label })}</p>
            </div>
            <LanguageSelect value={language} disabled={!isLoaded} onChange={handleChange} />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border-default bg-bg-subtle p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="shrink-0">
              <p className="text-sm font-medium text-text-primary">{ui.t('options.theme')}</p>
              <p className="mt-1 text-xs text-text-muted">{ui.t('options.themeDescription')}</p>
            </div>
            <select
              value={mode}
              onChange={(e) => setTheme(e.target.value as ThemeMode)}
              className="rounded-lg border border-border-default bg-bg-base px-3 py-2 text-sm font-medium text-text-primary outline-none"
            >
              <option value="system">{ui.t('options.theme.system')}</option>
              <option value="light">{ui.t('options.theme.light')}</option>
              <option value="dark">{ui.t('options.theme.dark')}</option>
            </select>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border-subtle p-5">
          <p className="text-sm font-medium text-text-primary">{ui.t('options.howItWorks')}</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
            <li>{ui.t('options.rule1')}</li>
            <li>{ui.t('options.rule2')}</li>
            <li>{ui.t('options.rule3')}</li>
          </ul>
        </div>

        <div className="mt-6 rounded-2xl border border-border-default bg-bg-subtle p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">{ui.t('options.manageMemos')}</p>
              <p className="mt-1 text-xs text-text-muted">{ui.t('memos.description')}</p>
            </div>
            <button
              onClick={() => {
                const url = chrome.runtime.getURL('memos.html');
                window.open(url, '_blank');
              }}
              className="shrink-0 rounded-xl bg-accent-brand px-4 py-2 text-xs font-medium text-white hover:bg-accent-brand/90 transition-colors"
            >
              {ui.t('options.manageMemos')}
            </button>
          </div>
        </div>
      </div>
    </main>
    </UiTextProvider>
  );
}

const container = document.getElementById('root');

if (container) {
  createRoot(container).render(<OptionsApp />);
}
