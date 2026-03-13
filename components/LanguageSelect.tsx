import {
  OUTPUT_LANGUAGE_GROUPS,
  OUTPUT_LANGUAGE_OPTIONS,
  type OutputLanguageCode,
} from '@/lib/output-language';
import { useUiText } from '@/lib/ui-text';

interface Props {
  value: OutputLanguageCode;
  disabled?: boolean;
  onChange: (value: OutputLanguageCode) => void;
}

export function LanguageSelect({ value, disabled = false, onChange }: Props) {
  const ui = useUiText();

  return (
    <label className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-base px-2.5 py-1.5 text-[11px] text-text-secondary shadow-sm">
      <span className="shrink-0 whitespace-nowrap font-semibold text-text-muted">{ui.t('language')}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as OutputLanguageCode)}
        className="w-full bg-transparent text-[11px] font-medium text-text-primary outline-none disabled:opacity-60"
      >
        {OUTPUT_LANGUAGE_GROUPS.map((group) => {
          const options = OUTPUT_LANGUAGE_OPTIONS.filter((option) => option.group === group);
          return (
            <optgroup key={group} label={ui.groupLabel(group)}>
              {options.map((option) => (
                <option key={option.code} value={option.code}>
                  {ui.languageLabel(option)}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}
