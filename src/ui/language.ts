import type { LanguageChoice } from '../domain/types';
import { resolveLanguage, setLanguage, t, type Language } from '../i18n';
import { phoneLanguages, setNativeLanguage } from '../platform/native';

/**
 * Applies the language choice: the catalog, `lang` on <html> (for fonts and screen readers),
 * and a copy for the first paint of the next start (index.html reads it).
 */
export const LANGUAGE_HINT_KEY = 'classday.language';

let system: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
let applied = '';

export function applyLanguage(choice: LanguageChoice): Language {
  const language = resolveLanguage(choice, system);
  if (applied === `${choice}:${language}`) return language;
  applied = `${choice}:${language}`;
  setLanguage(language);
  document.documentElement.lang = t.lang;
  try {
    localStorage.setItem(LANGUAGE_HINT_KEY, language);
  } catch {
    // The first paint then uses the phone's language; the saved choice still applies right after.
  }
  return language;
}

/** Reads the phone's language list before the first paint, so System resolves correctly. */
export async function loadPhoneLanguages() {
  system = (await phoneLanguages()).system;
}

/** The language the app last showed, for screens that appear before the data has loaded. */
export function lastLanguage(): LanguageChoice {
  try {
    const hint = localStorage.getItem(LANGUAGE_HINT_KEY);
    if (hint === 'en' || hint === 'zh-Hans') return hint;
  } catch {
    // Fall back to the phone's language.
  }
  return 'system';
}

/** Maps Android's per-app language back to a choice; null for anything the app doesn't offer. */
export function choiceFromAndroid(tag: string): LanguageChoice | null {
  if (!tag) return 'system';
  const first = tag.split(',')[0].toLowerCase();
  if (first.startsWith('zh')) return 'zh-Hans';
  if (first.startsWith('en')) return 'en';
  return null;
}

/**
 * Reads the phone's languages. Returns the choice Android 13+ holds for the app when it differs
 * from the saved one (changed in Android's settings), so the caller can store it.
 */
export async function syncWithPhone(saved: LanguageChoice): Promise<{ systemChanged: boolean; fromPhone: LanguageChoice | null }> {
  const phone = await phoneLanguages();
  const systemChanged = phone.system.join() !== system.join();
  system = phone.system;
  if (phone.app === null) {
    // Older Android keeps no per-app language, so native screens are told again at every start.
    void setNativeLanguage(saved);
    return { systemChanged, fromPhone: null };
  }
  const fromPhone = choiceFromAndroid(phone.app);
  return { systemChanged, fromPhone: fromPhone && fromPhone !== saved ? fromPhone : null };
}

/** Forget what was applied, so the next call applies again (for tests). */
export function resetLanguage(languages?: readonly string[]) {
  applied = '';
  if (languages) system = languages;
}
