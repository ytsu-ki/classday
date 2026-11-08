import { addDays, dateOf, daysBetween, toClock, toMinutes } from '../domain/time';
import type { DateKey } from '../domain/types';
import { t } from '../i18n';

/** Words come from the current language; 12- or 24-hour time follows the device either way. */
export const prefers24h = (() => {
  try {
    const cycle = new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return cycle === 'h23' || cycle === 'h24';
  } catch {
    return true;
  }
})();

export function time(minutes: number): string {
  if (prefers24h) return toClock(minutes);
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  return t.format.clock12(h % 12 || 12, m ? String(m).padStart(2, '0') : '', h >= 12);
}

export const clockTime = (clock: string) => time(toMinutes(clock));

/** Time split into digits and an optional am/pm suffix, for narrow columns. */
export function timeParts(minutes: number): { digits: string; suffix: string } {
  if (prefers24h) return { digits: toClock(minutes), suffix: '' };
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  return { digits: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, suffix: h < 12 ? t.format.am : t.format.pm };
}

export function span(start: number, end: number): string {
  return t.format.span(time(start), time(end));
}

export function duration(minutes: number): string {
  const m = Math.round(minutes);
  return m < 60 ? t.format.minutes(m) : t.format.hours(Math.floor(m / 60), m % 60);
}

export const weekdayName = (day: DateKey) => t.format.weekday(dateOf(day));
export const weekdayAbbr = (day: DateKey) => t.format.weekdayShort(dateOf(day));
export const longDate = (day: DateKey) => t.format.longDate(dateOf(day));
export const shortDate = (day: DateKey) => t.format.shortDate(dateOf(day));
export const dayChip = (day: DateKey) => t.format.dayChip(dateOf(day));

/**
 * "Today", "Tomorrow", "Yesterday", or a date such as "12 Nov". Other days get their date, not
 * a weekday name: "Thu" can't tell this week's Thursday from next week's.
 */
export function relativeDay(day: DateKey, today: DateKey): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return t.format.today;
  if (diff === 1) return t.format.tomorrow;
  if (diff === -1) return t.format.yesterday;
  return shortDate(day);
}

/** relativeDay for use mid-sentence: "today", "tomorrow", "12 Nov". */
export function inlineDay(day: DateKey, today: DateKey): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return t.format.todayInline;
  if (diff === 1) return t.format.tomorrowInline;
  if (diff === -1) return t.format.yesterdayInline;
  return relativeDay(day, today);
}

/** "tomorrow at 9:00", mid-sentence. */
export const dayAtTime = (day: DateKey, minute: number, today: DateKey) => t.format.dayAtTime(inlineDay(day, today), time(minute));

function dueWhen(due: DateKey, dueTime: string | undefined, today: DateKey) {
  const day = inlineDay(due, today);
  return dueTime ? t.format.dayTime(day, clockTime(dueTime)) : day;
}

/** "due tomorrow 6 pm", "was due 23 Oct" — a phrase to place mid-sentence. */
export function dueText(due: DateKey, dueTime: string | undefined, today: DateKey): string {
  return t.format.dueText(dueWhen(due, dueTime, today), daysBetween(today, due) < 0);
}

/** "Due tomorrow 6 pm" — the same phrase as a label. */
export function dueLabel(due: DateKey, dueTime: string | undefined, today: DateKey): string {
  return t.format.dueLabel(dueWhen(due, dueTime, today), daysBetween(today, due) < 0);
}

export function weekRange(monday: DateKey): string {
  return t.format.weekRange(dateOf(monday), dateOf(addDays(monday, 6)));
}


/** Join short facts with the language's separator. */
export const joinFacts = (parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(t.format.separator);

/** Split text into plain parts and links so notes and details can show tappable URLs safely. */
export function linkParts(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  const pattern = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: match[0], href: match[0] });
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
