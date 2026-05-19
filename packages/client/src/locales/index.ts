import zh from './zh';
import en from './en';
import type { LocaleKeys } from './zh';

export type { LocaleKeys };
export type SupportedLocale = 'zh' | 'en';

export const locales: Record<SupportedLocale, Record<LocaleKeys, string>> = {
  zh,
  en,
};
