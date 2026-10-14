import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import de from './locales/de.json';

export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type AppLocale = typeof SUPPORTED_LOCALES[number];

const STORAGE_KEY = 'locale';

function isSupported(l: unknown): l is AppLocale {
  return typeof l === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(l);
}

// An explicit choice from the sidebar switch wins; otherwise follow the
// browser's language, falling back to English for anything but German.
function detectLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isSupported(stored)) return stored;
  } catch {
    // localStorage can throw in sandboxed iframes - just fall through.
  }
  return navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

const initialLocale = detectLocale();
document.documentElement.lang = initialLocale;

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: { en, de }
});

export function getLocale(): AppLocale {
  return i18n.global.locale.value as AppLocale;
}

export function setLocale(locale: AppLocale) {
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not persisted in sandboxed iframes - the switch still works for this visit.
  }
}

// Number/date formatting for the active locale - use these instead of a
// hardcoded 'en-US' so German gets "1.234" and "61 %".
export function formatNumber(n: number, options?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(getLocale(), options);
}

export function formatPercent(ratio: number, maxFractionDigits = 0): string {
  return ratio.toLocaleString(getLocale(), {
    style: 'percent',
    minimumFractionDigits: maxFractionDigits,
    maximumFractionDigits: maxFractionDigits
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(getLocale(), { month: 'long', day: 'numeric', year: 'numeric' });
}
