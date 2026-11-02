import { CHINESE_CONNECTORS, matchChinese, peelChinese, type ChineseMatch } from './quickParse.zh-Hans';
import { addDays, dateOf, dayKey, weekdayOf } from './time';
import type { Clock, DateKey } from './types';

/**
 * Understands short trailing phrases in a to-do line, in English or Chinese, e.g.
 * "Essay draft fri 2h important", "Call home tomorrow 7pm urgent", or the same in Chinese
 * (quickParse.zh-Hans.ts). Both are read whatever the interface language is.
 * Only the end of the line is read, so titles like "Read Sun Tzu" stay intact.
 */
export type TokenKind = 'duration' | 'due' | 'time' | 'important' | 'urgent';

export interface ParsedToken { kind: TokenKind; text: string }

export interface Parsed {
  title: string;
  minutes?: number;
  due?: DateKey;
  dueTime?: Clock;
  important?: true;
  urgent?: true;
  tokens: ParsedToken[];
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const CONNECTORS = new Set(['by', 'due', 'on', 'at', 'for', 'before', 'until']);
const pad = (n: number) => String(n).padStart(2, '0');

interface Match { size: number; kind: TokenKind; apply: (p: Parsed) => void }

/** The next date falling on `weekday`, counting today. */
function nextWeekday(today: DateKey, weekday: number): DateKey {
  return addDays(today, (weekday - weekdayOf(today) + 7) % 7);
}

/** "next fri" means the Friday in the following calendar week. */
function weekdayNextWeek(today: DateKey, weekday: number): DateKey {
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  return addDays(monday, 7 + ((weekday + 6) % 7));
}

function monthDay(today: DateKey, month: number, day: number): DateKey | null {
  const year = dateOf(today).getFullYear();
  for (const y of [year, year + 1]) {
    const key = `${y}-${pad(month)}-${pad(day)}`;
    if (dayKey(dateOf(key)) !== key) return null;
    if (key >= today) return key;
  }
  return null;
}

function clockFrom(h: number, m: number, suffix?: string): Clock | null {
  if (suffix === 'pm' && h < 12) h += 12;
  if (suffix === 'am' && h === 12) h = 0;
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

function parseDuration(w: string[]): number | null {
  const one = w.join('');
  let m = /^(\d+(?:\.\d+)?)(h|hr|hrs|hour|hours)$/.exec(one);
  if (m) return Math.round(Number(m[1]) * 60);
  m = /^(\d+)(m|min|mins|minute|minutes)$/.exec(one);
  if (m) return Number(m[1]);
  m = /^(\d+)h(\d+)(m|min|mins)?$/.exec(one);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return null;
}

function fromChinese(match: ChineseMatch, today: DateKey): Match | null {
  switch (match.kind) {
    case 'duration':
      if (match.minutes < 5 || match.minutes > 1440) return null;
      return { size: 1, kind: 'duration', apply: p => { p.minutes = match.minutes; } };
    case 'time':
      return { size: 1, kind: 'time', apply: p => { p.dueTime = match.clock; } };
    case 'important':
      return { size: 1, kind: 'important', apply: p => { p.important = true; } };
    case 'urgent':
      return { size: 1, kind: 'urgent', apply: p => { p.urgent = true; } };
    case 'due': {
      const d = match.date;
      const due = 'offset' in d ? addDays(today, d.offset)
        : 'weekday' in d ? (d.nextWeek ? weekdayNextWeek(today, d.weekday) : nextWeekday(today, d.weekday))
          : monthDay(today, d.month, d.day);
      return due ? { size: 1, kind: 'due', apply: p => { p.due = due; } } : null;
    }
  }
}

function matchAt(words: string[], end: number, today: DateKey): Match | null {
  const take = (n: number) => (end - n + 1 >= 0 ? words.slice(end - n + 1, end + 1) : null);
  const chinese = matchChinese(words[end]);
  if (chinese) return fromChinese(chinese, today);
  for (const size of [4, 3, 2, 1]) {
    const w = take(size);
    if (!w) continue;
    const joined = w.join(' ');
    // Durations: "2h", "45 min", "1h30", "1.5 hours"
    if (size <= 2) {
      const minutes = parseDuration(w);
      if (minutes && minutes >= 5 && minutes <= 1440)
        return { size, kind: 'duration', apply: p => { p.minutes = minutes; } };
    }
    let m: RegExpExecArray | null;
    // Times: "5pm", "5:30 pm", "17:00", "noon"
    if (size <= 2) {
      m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(joined) ?? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(joined);
      const clock = m ? clockFrom(Number(m[1]), Number(m[2] ?? 0), m[3]) : joined === 'noon' ? '12:00' : joined === 'midnight' ? '23:59' : null;
      if (clock) return { size, kind: 'time', apply: p => { p.dueTime = clock; } };
    }
    // Dates
    let due: DateKey | null = null;
    if (size === 1) {
      if (joined === 'today' || joined === 'tonight' || joined === 'tod') due = today;
      else if (/^(tomorrow|tmr|tmrw|tomorow|tmw)$/.test(joined)) due = addDays(today, 1);
      else if (joined in WEEKDAYS) due = nextWeekday(today, WEEKDAYS[joined]);
      else if (joined === 'weekend') due = nextWeekday(today, 0);
      else if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(joined))) due = monthDay(today, Number(m[1]), Number(m[2]));
    } else if (size === 2) {
      const [a, b] = w;
      if (a === 'next' && b in WEEKDAYS) due = weekdayNextWeek(today, WEEKDAYS[b]);
      else if (a === 'this' && b in WEEKDAYS) due = nextWeekday(today, WEEKDAYS[b]);
      else if (a === 'this' && b === 'weekend') due = nextWeekday(today, 0);
      else if (a === 'next' && b === 'week') due = weekdayNextWeek(today, 0);
      else if (a in MONTHS && /^\d{1,2}(st|nd|rd|th)?$/.test(b)) due = monthDay(today, MONTHS[a], parseInt(b, 10));
      else if (b in MONTHS && /^\d{1,2}(st|nd|rd|th)?$/.test(a)) due = monthDay(today, MONTHS[b], parseInt(a, 10));
    } else if (size === 3 && w[0] === 'in') {
      const n = w[1] === 'a' || w[1] === 'one' ? 1 : /^\d{1,3}$/.test(w[1]) ? Number(w[1]) : NaN;
      if (Number.isFinite(n) && /^days?$/.test(w[2])) due = addDays(today, n);
      if (Number.isFinite(n) && /^weeks?$/.test(w[2])) due = addDays(today, n * 7);
    }
    if (due) {
      const value = due;
      return { size, kind: 'due', apply: p => { p.due = value; } };
    }
    if (size === 1 && /^(!{1,3}|important)$/.test(joined))
      return { size, kind: 'important', apply: p => { p.important = true; } };
    if (size === 1 && /^(urgent|asap)$/.test(joined))
      return { size, kind: 'urgent', apply: p => { p.urgent = true; } };
  }
  return null;
}

export function quickParse(input: string, today: DateKey, ignore: ReadonlySet<TokenKind> = new Set()): Parsed {
  // Chinese phrases are split off their words first; `glued` remembers there was no space before.
  const pieces = input.trim().split(/\s+/).filter(Boolean).flatMap(word => peelChinese(word).map((text, k) => ({ text, glued: k > 0 })));
  const raw = pieces.map(p => p.text);
  // Trailing punctuation, including the Chinese comma, full stop, semicolon and enumeration comma.
  const words = raw.map(w => w.toLowerCase().replace(/[.,;\uFF0C\u3002\uFF1B\u3001]+$/, ''));
  const kept = raw.map(() => true);
  const parsed: Parsed = { title: input.trim(), tokens: [] };
  const seen = new Set<TokenKind>();
  let i = words.length - 1;
  while (i >= 1) {
    const match = matchAt(words, i, today);
    if (!match || seen.has(match.kind) || i - match.size + 1 < 1) break;
    seen.add(match.kind);
    const end = i, from = i - match.size + 1;
    i = from - 1;
    // An ignored phrase stays in the title, but reading continues past it.
    if (ignore.has(match.kind)) continue;
    match.apply(parsed);
    parsed.tokens.push({ kind: match.kind, text: raw.slice(from, end + 1).join(' ') });
    for (let k = from; k <= end; k++) kept[k] = false;
    if (i >= 1 && (CONNECTORS.has(words[i]) || CHINESE_CONNECTORS.has(words[i]))) { kept[i] = false; i--; }
  }
  const title = pieces.reduce((text, piece, k) => (kept[k] ? `${text}${text && !piece.glued ? ' ' : ''}${piece.text}` : text), '').trim();
  if (!title) return { title: input.trim(), tokens: [] };
  parsed.title = title;
  if (parsed.dueTime && !parsed.due) parsed.due = today;
  parsed.tokens.reverse();
  return parsed;
}
