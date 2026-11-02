import { problemOf, type Problem } from '../domain/problems';
import type { LanguageChoice } from '../domain/types';
import { en, type Messages } from './en';
import { zhHans, zhHansName } from './zh-Hans';

/**
 * The interface language. `t` is a live binding: code reads `t.section.key` while rendering,
 * and the app re-renders everything after setLanguage().
 */
export type Language = 'en' | 'zh-Hans';
export type { Messages };

export let t: Messages = en;
export let language: Language = 'en';

/** Each language's own name, so anyone can find their way back to it. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', 'zh-Hans': zhHansName };

export function setLanguage(next: Language) {
  language = next;
  t = next === 'zh-Hans' ? zhHans : en;
}

/** System picks the first English or Chinese language in the phone's list; anything else is English. */
export function resolveLanguage(choice: LanguageChoice, preferred: readonly string[]): Language {
  if (choice !== 'system') return choice;
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    if (lower === 'zh' || lower.startsWith('zh-') || lower.startsWith('zh_')) return 'zh-Hans';
    if (lower === 'en' || lower.startsWith('en-') || lower.startsWith('en_')) return 'en';
  }
  return 'en';
}

export function problemText(problem: Problem): string {
  return (t.problems[problem.code] as (p: Problem) => string)(problem);
}

/** The words for an error that carries a Problem, or the fallback for anything unexpected. */
export function errorText(error: unknown, fallback: string): string {
  const problem = problemOf(error);
  return problem ? problemText(problem) : fallback;
}
