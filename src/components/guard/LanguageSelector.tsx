import { LANGUAGE_PREFERENCE, type LanguagePreference } from "../../../lib/constants";
import { Button } from "@/components/ui/button";

type LanguageSelectorProps = {
  currentLocale: string;
  onSelect: (locale: string) => void;
  disabled?: boolean;
};

const LANGUAGE_OPTIONS = [
  {
    value: LANGUAGE_PREFERENCE.en,
    label: "English",
  },
  {
    value: LANGUAGE_PREFERENCE.hi,
    label: "हिन्दी",
  },
  {
    value: LANGUAGE_PREFERENCE.hinglish,
    label: "Hinglish",
  },
] as const;

function isLanguagePreference(value: string): value is LanguagePreference {
  return Object.values(LANGUAGE_PREFERENCE).includes(value as LanguagePreference);
}

export function LanguageSelector({
  currentLocale,
  onSelect,
  disabled = false,
}: LanguageSelectorProps) {
  const activeLocale = isLanguagePreference(currentLocale) ? currentLocale : LANGUAGE_PREFERENCE.en;

  return (
    <div className="grid grid-cols-3 gap-2">
      {LANGUAGE_OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={activeLocale === option.value ? "default" : "outline"}
          className="h-10 rounded-lg px-2 text-sm"
          disabled={disabled}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
