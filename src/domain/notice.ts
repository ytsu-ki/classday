import { CHINESE } from './notice.zh-Hans';
import type { Interval } from './schedule';
import { addDays, dateOf, dayKey, toClock, toMinutes, weekdayOf, weekOf } from './time';
import type { Clock, DateKey } from './types';

/**
 * Reads a pasted notice or chat message into a one-off event: a title, a date, a start (and an end
 * or a length when given) and a place, in Chinese (notice.zh-Hans.ts) or English, e.g. "Reminder:
 * club meeting tomorrow 3pm in Room 204". Each field is taken where it appears and cut out of the
 * text; what is left, without greetings and sign-offs, becomes the title. The student checks
 * every field before anything is saved.
 */

export type NoticeDate = (
  | { offset: number }
  | { weekday: number; week: 'this' | 'next' | 'coming' }
  | { year?: number; month: number; day: number }
) & { evening?: boolean };

/** A time as written: `half` is the am/pm (or noon) the text gave, if any. */
export interface NoticeTime { hour: number; minute: number; half?: 'am' | 'pm' | 'noon' }

export interface Rule<T> { pattern: RegExp; read: (m: RegExpExecArray) => T | null }

export interface NoticeVocabulary {
  ranges: Rule<[NoticeTime, NoticeTime]>[];
  times: Rule<NoticeTime>[];
  /** Calendar dates, which win over the relative days below when a notice gives both. */
  dates: Rule<NoticeDate>[];
  /** Today, tomorrow, Wednesday, next Monday. */
  days: Rule<NoticeDate>[];
  durations: Rule<number>[];
  places: Rule<string>[];
  /** A place at the start of what is left, as in a title written right after its place. */
  placeHead: RegExp | null;
  /** "Notice:" and the like at the very start. */
  lead: RegExp;
  /** Whole clauses that are only greetings or sign-offs. */
  boilerplate: RegExp[];
  /** A greeting in front of the event, without punctuation between. */
  greeting: RegExp;
  /** Words that only join the title to what was cut out around it. */
  joiners: { start: RegExp; end: RegExp };
  /** Titles to use only when no later clause says more, such as "gather". */
  weak: RegExp | null;
}

export type NoticeField = 'date' | 'time' | 'end' | 'length' | 'place';

export interface Notice {
  title: string;
  date?: DateKey;
  start?: Clock;
  end?: Clock;
  /** A length the text gave instead of an end. */
  minutes?: number;
  location?: string;
  /** Which fields came from the text, in the order the review shows them. */
  found: NoticeField[];
}

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const MONTH_NUMBER: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const DAY_NUMBER: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_NAME = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)';
const weekday = (name: string) => DAY_NUMBER[name.toLowerCase().slice(0, 3)];
const half = (text: string | undefined): NoticeTime['half'] => (text ? (text.toLowerCase() === 'pm' ? 'pm' : 'am') : undefined);
const gi = (source: string) => new RegExp(source, 'gi');

const ENGLISH: NoticeVocabulary = {
  ranges: [
    {
      pattern: gi('(?<![\\d:])(\\d{1,2}):(\\d{2})\\s*(am|pm)?\\s*(?:-|~|to|until|till)\\s*(\\d{1,2}):(\\d{2})\\s*(am|pm)?'),
      read: m => [{ hour: Number(m[1]), minute: Number(m[2]), half: half(m[3]) }, { hour: Number(m[4]), minute: Number(m[5]), half: half(m[6]) }],
    },
    {
      pattern: gi('\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\s*(?:-|~|to|until|till)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b'),
      read: m => [{ hour: Number(m[1]), minute: Number(m[2] ?? 0), half: half(m[3]) }, { hour: Number(m[4]), minute: Number(m[5] ?? 0), half: half(m[6]) }],
    },
  ],
  times: [
    { pattern: gi('\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b'), read: m => ({ hour: Number(m[1]), minute: Number(m[2] ?? 0), half: half(m[3]) }) },
    { pattern: /(?<![\d:/])([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g, read: m => ({ hour: Number(m[1]), minute: Number(m[2]) }) },
    { pattern: /\bnoon\b/gi, read: () => ({ hour: 12, minute: 0, half: 'noon' }) },
  ],
  dates: [
    { pattern: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, read: m => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }) },
    { pattern: /(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g, read: m => ({ month: Number(m[1]), day: Number(m[2]) }) },
    { pattern: gi(`\\b(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`), read: m => ({ month: MONTH_NUMBER[m[1].toLowerCase()], day: Number(m[2]) }) },
    { pattern: gi(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})[a-z]*\\b`), read: m => ({ month: MONTH_NUMBER[m[2].toLowerCase()], day: Number(m[1]) }) },
  ],
  days: [
    { pattern: /\btoday\b/gi, read: () => ({ offset: 0 }) },
    { pattern: /\btonight\b/gi, read: () => ({ offset: 0, evening: true }) },
    { pattern: /\btomorrow night\b/gi, read: () => ({ offset: 1, evening: true }) },
    { pattern: /\b(?:tomorrow|tmr|tmrw)\b/gi, read: () => ({ offset: 1 }) },
    { pattern: gi(`\\bnext\\s+${DAY_NAME}\\b`), read: m => ({ weekday: weekday(m[1]), week: 'next' }) },
    { pattern: gi(`\\b(?:this\\s+|on\\s+)?${DAY_NAME}\\b`), read: m => ({ weekday: weekday(m[1]), week: 'coming' }) },
  ],
  durations: [
    { pattern: /\bhalf an hour\b/gi, read: () => 30 },
    { pattern: /\b(?:an|one)\s+hour\b/gi, read: () => 60 },
    { pattern: /\b(\d+)h(\d{1,2})m?\b/gi, read: m => Number(m[1]) * 60 + Number(m[2]) },
    { pattern: /\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/gi, read: m => Math.round(Number(m[1]) * 60) },
    { pattern: /\b(\d{1,3})\s*(?:minutes?|mins?)\b/gi, read: m => Number(m[1]) },
  ],
  places: [
    { pattern: /\b(?:location|venue|place|where)\s*:\s*([^\n,;]+)/gi, read: m => m[1] },
    { pattern: /\b(?:in|at)\s+((?:the\s+)?(?:room|rm\.?|lab|building|hall)\s+[A-Za-z]?\d+[\w-]*)/gi, read: m => m[1] },
    // A room on its own, as in "Friday 3pm, Room B204".
    { pattern: /\b((?:room|rm\.?)\s*#?\s*[A-Za-z]?\d+[\w-]*)/gi, read: m => m[1] },
    { pattern: /(?:^|\s)@\s*([A-Z][\w-]*(?:\s+[A-Z0-9][\w-]*)*)/g, read: m => m[1] },
    {
      pattern: /\b(?:in|at)\s+((?:the\s+)?[A-Z][\w'-]*(?:\s+(?:[A-Z0-9][\w'-]*|of|the|and)(?=\s+[A-Z0-9]|$|[\s,.;]))*)/g,
      read: m => (new RegExp(`^(?:${MONTHS}|${DAY_NAME})`, 'i').test(m[1]) ? null : m[1]),
    },
  ],
  placeHead: null,
  lead: /^\s*(?:reminder|notice|announcement|update|fyi|heads up)\s*[:-]\s*/i,
  boilerplate: [
    /^(?:hi|hello|hey|dear)\b[\w\s]{0,24}$/i,
    /^(?:please|kindly|thanks|thank you|cheers|regards|see you)\b/i,
    /^(?:everyone|all|reminder|notice|announcement)$/i,
  ],
  greeting: /^(?:hi|hello|hey|dear)\s+(?:all|everyone|everybody|team|students|class|folks)\b[\s!]*/i,
  joiners: {
    start: /^(?:(?:on|at|in|from|the|a|an|our|is|are|will be|we have|we'll have|there will be|there's|join us for)\s+)+/i,
    // A changed time: "Physics lab moved to Friday" → Physics lab.
    end: /(?:\s+(?:on|at|in|from|is|are|will be|starts|will be held|is held|held|will start|(?:(?:has|have) been |is |are |was |were |has |have )?(?:moved|changed|rescheduled|postponed|pushed back|pushed|delayed|brought forward)(?: to| until| for)?|now))+$/i,
  },
  weak: null,
};

/** Chinese first: its patterns are longer and carry morning/afternoon words English lacks. */
const VOCABULARIES = [CHINESE, ENGLISH];
const pad = (n: number) => String(n).padStart(2, '0');

/** Half-width digits and punctuation, one kind of dash, plain am/pm. */
function normalize(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/[\u2010-\u2015\u2212\u301C]/g, '-')
    .replace(/\b([ap])\.m\.?/gi, '$1m')
    .replace(/[ \t]+/g, ' ')
    // Chinese doesn't space its words, so spaces between a character and a number are only layout.
    .replace(/(?<=\p{Script=Han}) (?=[\dA-Za-z])|(?<=[\dA-Za-z]) (?=\p{Script=Han})/gu, '');
}

function resolveDate(d: NoticeDate, today: DateKey): DateKey | null {
  if ('offset' in d) return addDays(today, d.offset);
  if ('weekday' in d) {
    if (d.week === 'coming') return addDays(today, (d.weekday - weekdayOf(today) + 7) % 7);
    return addDays(weekOf(today), (d.week === 'next' ? 7 : 0) + ((d.weekday + 6) % 7));
  }
  const at = (year: number) => {
    const key = `${year}-${pad(d.month)}-${pad(d.day)}`;
    return dayKey(dateOf(key)) === key ? key : null;
  };
  if (d.year) return at(d.year);
  // A date without a year is this year's, unless that was more than a month ago.
  const year = dateOf(today).getFullYear();
  const key = at(year);
  return key && key < addDays(today, -30) ? at(year + 1) : key;
}

/** Minutes after midnight. An unmarked 1 to 6 o'clock in a notice means the afternoon. */
function minuteOf(t: NoticeTime, fallback?: NoticeTime['half']): number | null {
  let h = t.hour;
  const marked = t.half ?? fallback;
  if (marked === 'pm' && h < 12) h += 12;
  else if (marked === 'noon' && h <= 3) h += 12;
  else if (marked === 'am' && h === 12) h = 0;
  else if (!marked && h >= 1 && h <= 6) h += 12;
  return h <= 23 && t.minute <= 59 ? h * 60 + t.minute : null;
}

export function parseNotice(input: string, today: DateKey): Notice {
  let text = normalize(input).slice(0, 2000);
  for (const v of VOCABULARIES) text = text.replace(v.lead, '');
  const notice: Notice = { title: '', found: [] };

  const cut = (m: RegExpExecArray) => {
    text = `${text.slice(0, m.index)}\n${text.slice(m.index + m[0].length)}`;
  };
  // The earliest match of any rule wins; between rules at the same place, the first listed.
  const take = <T>(rules: (v: NoticeVocabulary) => Rule<T>[]): T | undefined => {
    let best: { m: RegExpExecArray; value: T } | null = null;
    for (const v of VOCABULARIES) {
      for (const rule of rules(v)) {
        for (const m of text.matchAll(rule.pattern)) {
          const value = rule.read(m as RegExpExecArray);
          if (value === null || (typeof value === 'number' && !Number.isFinite(value))) continue;
          if (!best || m.index! < best.m.index) best = { m: m as RegExpExecArray, value: value as T };
          break;
        }
      }
    }
    if (best) cut(best.m);
    return best?.value;
  };

  const date = take(v => v.dates) ?? take(v => v.days);
  if (date) {
    const day = resolveDate(date, today);
    if (day) { notice.date = day; notice.found.push('date'); }
    // Other mentions of the day, such as "Fri (Oct 16)", add nothing.
    while (take(v => v.dates) ?? take(v => v.days)) { /* cut */ }
  }
  const evening = date?.evening ? 'pm' : undefined;

  const range = take(v => v.ranges);
  const single = range ? undefined : take(v => v.times);
  const startTime = range?.[0] ?? single;
  const start = startTime ? minuteOf(startTime, evening) : null;
  if (start !== null) {
    notice.start = toClock(start);
    notice.found.push('time');
    if (range) {
      let end = minuteOf(range[1], range[1].half ?? startTime!.half ?? evening);
      if (end !== null && end <= start && end + 720 < 1440) end += 720;
      if (end !== null && end > start) { notice.end = toClock(end); notice.found.push('end'); }
    }
  }
  if (!notice.end) {
    const minutes = take(v => v.durations);
    if (minutes && minutes >= 5 && minutes <= 720) { notice.minutes = minutes; notice.found.push('length'); }
  }

  const place = take(v => v.places);
  if (place) setPlace(notice, place);

  notice.title = titleOf(text, notice).slice(0, 200);
  return notice;
}

function setPlace(notice: Notice, place: string) {
  const value = place.trim().replace(/^the\s+/i, '').slice(0, 200);
  if (!value) return;
  notice.location = value;
  notice.found.push('place');
}

/** The first clause left that says what the event is, trimmed of greetings and joining words. */
function titleOf(text: string, notice: Notice): string {
  const clauses = text.split(/\n|[,;!?()\u3001\u3002]|\.(?=\s|$)/);
  const boilerplate = (clause: string) => VOCABULARIES.some(v => v.boilerplate.some(b => b.test(clause)));
  let fallback = '';
  for (const raw of clauses) {
    let clause = clean(raw);
    if (!clause || boilerplate(raw.trim()) || boilerplate(clause) || !/\p{L}/u.test(clause)) continue;
    if (VOCABULARIES.some(v => v.weak?.test(clause))) { fallback ||= clause; continue; }
    if (!notice.location) {
      for (const v of VOCABULARIES) {
        const m = v.placeHead?.exec(clause);
        const rest = m ? clean(clause.slice(m[0].length)) : '';
        if (m && rest) { setPlace(notice, m[1]); clause = rest; break; }
      }
    }
    return clause;
  }
  return fallback;
}

function clean(raw: string): string {
  let clause = raw.trim();
  for (let previous = ''; previous !== clause;) {
    previous = clause;
    for (const v of VOCABULARIES) {
      clause = clause.replace(v.greeting, '').replace(v.joiners.start, '').replace(v.joiners.end, '').trim();
    }
    clause = clause.replace(/^[\s:\-~]+|[\s:\-~]+$/g, '');
  }
  return clause;
}

/**
 * When an event ends. The text's own end comes first, then a length it gave; with neither it lasts
 * one double period, so it lines up with the timetable: from a period's start to the end of the
 * next period, or else as long as periods 1 and 2 together (90 minutes without period times).
 */
export function eventEnd(start: number, notice: Pick<Notice, 'end' | 'minutes'>, periods: Interval[]): number {
  const cap = (m: number) => Math.min(m, 23 * 60 + 59);
  if (notice.end && toMinutes(notice.end) > start) return toMinutes(notice.end);
  if (notice.minutes) return cap(start + notice.minutes);
  const i = periods.findIndex(p => p.start === start);
  if (i >= 0 && i + 1 < periods.length) return periods[i + 1].end;
  return cap(start + (periods.length >= 2 ? periods[1].end - periods[0].start : 90));
}
