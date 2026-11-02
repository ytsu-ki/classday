import type { Clock } from '../domain/types';
import type { ClassEntry } from './classes';
import { ZH } from './vocabulary.zh-Hans';
import { parseRanges } from './weeks';

/**
 * Reads classes from plain text: one class per line, in English or Chinese, fields in any order.
 *   Calculus, Mon 08:00-09:40, weeks 1-16, Room A101, Dr. Wang
 *   (the same line in Chinese: title, weekday, periods with the period marker, weeks with the
 *   week marker, room, teacher)
 * A line holding only a weekday starts a section for the lines below it. Academic-system
 * records, a title followed by "(1-2<period>)<weeks>/<campus>/<room>/<teacher>/…", are read
 * too, several per line; they are also what the PDF reader finds in each timetable cell.
 */

export interface TextResult { entries: ClassEntry[]; skipped: number }

const FULL_WIDTH = new RegExp(`[${Object.keys(ZH.fullWidth).join('')}]`, 'g');
export const normalizeText = (text: string) => text.replace(FULL_WIDTH, c => ZH.fullWidth[c]).replace(/\r/g, '');

const ENGLISH_DAYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_ZH = new RegExp(`${ZH.weekdayPrefix}([${Object.keys(ZH.weekdayDigits).join('')}])`);
const DAY_EN = /\b(mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b\.?/i;

/** A record's periods: "(1-2<period>)". */
const RECORD = new RegExp(`\\((\\d{1,2})(?:\\s*-\\s*(\\d{1,2}))?${ZH.period}\\)`, 'g');
/** The hours and credits ending a record, e.g. "/4/64/4.0"; the next title starts after them. */
const RECORD_END = /\/\d+(?:\.\d+)?\/\d+(?:\.\d+)?\/\d+(?:\.\d+)?/g;

const CLOCKS = new RegExp(`(\\d{1,2}):(\\d{2})\\s*(?:-|~|to|${ZH.to})\\s*(\\d{1,2}):(\\d{2})`, 'i');
const PERIODS_ZH = new RegExp(`(?:${ZH.ordinal})?(\\d{1,2})(?:\\s*-\\s*(\\d{1,2}))?\\s*${ZH.period}`);
const PERIODS_EN = /\b(?:periods?|p)\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?\b/i;
const WEEK_ITEM = `(?:${ZH.ordinal})?\\d{1,2}(?:\\s*-\\s*\\d{1,2})?\\s*(?:${ZH.week})?(?:\\s*\\([^)]{1,3}\\))?`;
const WEEKS_ZH = new RegExp(`${WEEK_ITEM}(?:\\s*,\\s*${WEEK_ITEM})*`, 'g');
const WEEKS_EN = /\bweeks?\s*:?\s*(\d{1,2}(?:\s*[-,]\s*\d{1,2})*(?:\s*\((?:odd|even)\))?)/i;
const LOCATION_LABEL = new RegExp(`(?:${ZH.locationLabel}|\\b(?:room|location|loc|venue))\\s*:?\\s*([^,;/|\\t]+)`, 'i');
const TEACHER_LABEL = new RegExp(`(?:${ZH.teacherLabel}|\\b(?:teacher|instructor|lecturer|tutor))\\s*:\\s*([^,;/|\\t]+)`, 'i');
const ROOMISH = new RegExp(`^(?:[\\p{L}]{0,6}\\s?[A-Z]?\\d{2,4}[A-Za-z]?|.*${ZH.roomHint}.*|(?:room|rm\\.?)\\s*\\S+)$`, 'iu');
const TEACHERISH = new RegExp(`^(?:\\S{1,8}${ZH.teacherSuffix}|(?:dr|prof|mr|ms|mrs)\\.?\\s+\\S.*)$`, 'i');

export function weekdayIn(text: string): number | undefined {
  const zh = DAY_ZH.exec(text);
  if (zh) return ZH.weekdayDigits[zh[1]];
  const en = DAY_EN.exec(text);
  return en ? ENGLISH_DAYS[en[1].slice(0, 3).toLowerCase()] : undefined;
}

function weeksFrom(text: string): number[] | undefined {
  try {
    return parseRanges(text);
  } catch {
    return undefined;
  }
}

const clock = (h: string, m: string): Clock | null => (Number(h) < 24 && Number(m) < 60 ? `${h.padStart(2, '0')}:${m}` : null);
const tidy = (text: string) => text.replace(/\s+/g, ' ').replace(/^[\s,;:/|.\-]+|[\s,;:/|\-]+$/g, '').trim();
/** Line breaks inside Chinese text are not spaces: join characters that the PDF split apart. */
const joinCjk = (text: string) => text.replace(/(\p{Script=Han})\s+(?=\p{Script=Han})/gu, '$1');
/**
 * A record's lines were broken only to fit the cell, so a break next to Chinese, a digit or
 * punctuation joins without a space; between two words it stays a space.
 */
const JOINED_BREAK = /(?<=[\p{Script=Han}\d/:(),;.\-])[ \t]*\n[ \t]*|[ \t]*\n[ \t]*(?=[\p{Script=Han}\d/:(),;.\-])/gu;
const joinLines = (text: string) => text.replace(JOINED_BREAK, '').replace(/\s*\n\s*/g, ' ');
const isPlaceholder = (text: string) => ZH.noLocation.includes(text);

/** Weeks, room and teacher from a record's details: "1-4<w>,7-16<w>/<campus>/<room>/<teacher>/…". */
function recordDetails(details: string): Pick<ClassEntry, 'weeks' | 'location' | 'teacher'> {
  const fields = details.split('/').map(f => tidy(f));
  const out: Pick<ClassEntry, 'weeks' | 'location' | 'teacher'> = {};
  const weeks = weeksFrom(fields[0] ?? '');
  if (weeks) out.weeks = weeks;
  let room = -1;
  for (let i = 1; i < Math.min(fields.length, 5); i++) {
    const f = fields[i];
    if (isPlaceholder(f) || /\d/.test(f) || new RegExp(ZH.roomHint).test(f)) { room = i; break; }
  }
  if (room > 0) {
    if (!isPlaceholder(fields[room])) out.location = fields[room].slice(0, 200);
    const teacher = fields[room + 1];
    if (teacher && !/\d/.test(teacher) && teacher.length <= 40 && !isPlaceholder(teacher)) out.teacher = teacher;
  }
  return out;
}

/** Classes in academic-system records, without their weekday (the caller knows it). */
export function recordsIn(text: string): Omit<ClassEntry, 'weekday'>[] {
  const source = joinLines(normalizeText(text));
  const matches = [...source.matchAll(RECORD)];
  const out: Omit<ClassEntry, 'weekday'>[] = [];
  let titleFrom = 0;
  matches.forEach((m, k) => {
    // The title is what follows the previous record's last field.
    let before = source.slice(titleFrom, m.index);
    const ends = [...before.matchAll(RECORD_END)];
    if (ends.length) before = before.slice(ends[ends.length - 1].index! + ends[ends.length - 1][0].length);
    const title = tidy(joinCjk(before)).slice(0, 120);
    const next = matches[k + 1];
    const rest = source.slice(m.index! + m[0].length, next ? next.index : undefined);
    const end = [...rest.matchAll(RECORD_END)][0];
    const details = end ? rest.slice(0, end.index) : rest;
    titleFrom = m.index! + m[0].length + (end ? end.index! + end[0].length : details.length);
    const first = Number(m[1]), last = Number(m[2] ?? m[1]);
    if (!title || first < 1 || last < first || last > 16) return;
    out.push({ title, periods: [first, last], ...recordDetails(joinCjk(details)) });
  });
  return out;
}

/** One ordinary line: title, weekday, time or periods, weeks, room and teacher in any order. */
function lineEntry(line: string, section: number | undefined): ClassEntry | null {
  let rest = line;
  const take = (re: RegExp) => {
    const m = re.exec(rest);
    if (m) rest = `${rest.slice(0, m.index)}\u0000${rest.slice(m.index + m[0].length)}`;
    return m;
  };
  const dayZh = take(DAY_ZH);
  const dayEn = dayZh ? null : take(DAY_EN);
  const weekday = dayZh ? ZH.weekdayDigits[dayZh[1]] : dayEn ? ENGLISH_DAYS[dayEn[1].slice(0, 3).toLowerCase()] : section;
  const time = take(CLOCKS);
  const periodMatch = time ? null : take(PERIODS_ZH) ?? take(PERIODS_EN);
  if (weekday === undefined || (!time && !periodMatch)) return null;

  let weeks: number[] | undefined;
  const english = take(WEEKS_EN);
  if (english) weeks = weeksFrom(english[1]);
  else {
    for (const m of rest.matchAll(WEEKS_ZH)) {
      if (!m[0].includes(ZH.week)) continue;
      weeks = weeksFrom(m[0]);
      rest = `${rest.slice(0, m.index)}\u0000${rest.slice(m.index! + m[0].length)}`;
      break;
    }
  }
  const locationMatch = take(LOCATION_LABEL);
  const teacherMatch = take(TEACHER_LABEL);
  let location = locationMatch ? tidy(locationMatch[1]) : undefined;
  let teacher = teacherMatch ? tidy(teacherMatch[1]) : undefined;

  // What is left: the title first, then unlabelled rooms and teachers.
  let title = '';
  for (const chunk of rest.split(/[\u0000,;|\t/]+/).map(tidy).filter(Boolean)) {
    const words = chunk.split(' ');
    while (words.length > 1 && (ROOMISH.test(words[words.length - 1]) || TEACHERISH.test(words[words.length - 1]))) {
      const word = words.pop()!;
      if (TEACHERISH.test(word)) teacher ??= word;
      else location ??= word;
    }
    const text = words.join(' ');
    if (!title && /[\p{L}\p{Script=Han}]/u.test(text) && !ROOMISH.test(text)) title = text;
    else if (!location && ROOMISH.test(text)) location = text;
    else if (!teacher && TEACHERISH.test(text)) teacher = text;
  }
  if (!title) return null;
  const entry: ClassEntry = { title: title.slice(0, 120), weekday };
  if (time) {
    const start = clock(time[1], time[2]), end = clock(time[3], time[4]);
    if (!start || !end) return null;
    entry.start = start;
    entry.end = end;
  } else {
    const first = Number(periodMatch![1]), last = Number(periodMatch![2] ?? periodMatch![1]);
    if (first < 1 || last < first || last > 16) return null;
    entry.periods = [first, last];
  }
  if (weeks) entry.weeks = weeks;
  if (location && !isPlaceholder(location)) entry.location = location.slice(0, 200);
  if (teacher) entry.teacher = teacher.slice(0, 100);
  return entry;
}

export function parseTimetableText(text: string, section?: number): TextResult {
  const entries: ClassEntry[] = [];
  let skipped = 0;
  let current = section;
  for (const raw of normalizeText(text).split('\n')) {
    const line = raw.replace(/^\s*\d{1,3}[.)]\s+/, '').trim();
    if (!line) continue;
    // A line that is only a weekday ("Monday", "<Chinese weekday>:") starts a section.
    const bare = line.replace(/[:\s]+$/, '');
    const day = weekdayIn(bare);
    if (day !== undefined && bare.replace(DAY_ZH, '').replace(DAY_EN, '').trim() === '') { current = day; continue; }

    if (new RegExp(RECORD.source).test(line)) {
      const weekday = weekdayIn(line) ?? current;
      const records = recordsIn(line.replace(DAY_ZH, ' ').replace(DAY_EN, ' '));
      if (weekday === undefined || !records.length) { skipped++; continue; }
      for (const r of records) entries.push({ ...r, weekday });
      continue;
    }
    const entry = lineEntry(line, current);
    if (entry) entries.push(entry);
    else skipped++;
  }
  return { entries, skipped };
}
