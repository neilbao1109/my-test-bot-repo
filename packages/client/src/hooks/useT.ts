import { useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { locales } from '../locales';
import type { LocaleKeys } from '../locales';

export function useT() {
  const language = useAppStore((s) => s.language);

  const t = useCallback(
    (key: LocaleKeys, params?: Record<string, string | number>): string => {
      const locale = locales[language] || locales.zh;
      let text = locale[key] || locales.zh[key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return text;
    },
    [language],
  );

  return t;
}
