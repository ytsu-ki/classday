import { ACCENTS, DEFAULT_ACCENT, defaultReminders, defaultSettings, LANGUAGES, LIMITS, THEMES } from './defaults';
import { MAX_PERIODS } from './periods';
import { ProblemError, type Problem } from './problems';
import { isClock, isDateKey, toMinutes } from './time';
import type { ClassPeriod, FixedEvent, ImportHistory, Item, Note, PlannerData, SemesterPreferences, Settings } from './types';

/**
 * Rebuilds planner data from untrusted JSON (storage and backups).
 * Only known fields are copied, so nothing unexpected — such as login details —
 * can travel into the planner or its backups. Invalid entries are dropped and counted.
 */
export interface NormalizeReport {
  data: PlannerData;
  dropped: number;
}

/** Stored data or a backup that can't be used. */
export class DataError extends ProblemError {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isSafeId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isInt = (v: unknown, min: number, max: number): v is number => isNum(v, min, max) && Number.isInteger(v);
const text = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.length <= max ? v : undefined;
const title = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && s.length <= LIMITS.title ? s : undefined;
};
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
const pick = <T extends string | number>(v: unknown, options: readonly T[]): T | undefined =>
  options.includes(v as T) ? (v as T) : undefined;

export function normalizeItem(raw: unknown): Item | null {
  if (!isObj(raw) || !isSafeId(raw.id)) return null;
  const name = title(raw.title);
  const status = pick(raw.status, ['open', 'done'] as const);
  if (!name || !status || !isIso(raw.createdAt)) return null;
  if (raw.estimate !== null && !isInt(raw.estimate, 1, 100_000)) return null;
  const item: Item = {
    id: raw.id,
    title: name,
    details: text(raw.details, LIMITS.text) ?? '',
    status,
    createdAt: raw.createdAt,
    estimate: raw.estimate as number | null,
    important: raw.important === true,
    urgent: raw.urgent === true,
  };
  if (isIso(raw.doneAt)) item.doneAt = raw.doneAt;
  if (isDateKey(raw.due)) {
    item.due = raw.due;
    if (isClock(raw.dueTime)) item.dueTime = raw.dueTime;
  }
  return item;
}

/** Reminder choices an event can have, in minutes before it starts. */
export const REMINDER_LEADS = [0, 5, 15, 30, 60, 1440] as const;

export function normalizeEvent(raw: unknown): FixedEvent | null {
  if (!isObj(raw) || !isSafeId(raw.id)) return null;
  const name = title(raw.title);
  // The category decides whether an event repeats.
  const category = pick(raw.category, ['once', 'short', 'long'] as const);
  const repeat = category === 'once' ? 'once' : 'weekly';
  const parity = pick(raw.parity, ['all', 'odd', 'even'] as const) ?? 'all';
  const weekday = Number(raw.weekday);
  const allDay = raw.allDay === true;
  const start = allDay ? '00:00' : raw.start, end = allDay ? '23:59' : raw.end;
  if (!name || !category || !isClock(start) || !isClock(end) || toMinutes(end) <= toMinutes(start)) return null;
  if (!isInt(weekday, 0, 6) || !isDateKey(raw.date) || !isDateKey(raw.from)) return null;
  const until = raw.until === '' || raw.until === undefined ? '' : isDateKey(raw.until) ? raw.until : null;
  if (until === null) return null;
  // A short-term event repeats until a set day.
  if (category === 'short' && (!until || until < raw.from)) return null;
  const event: FixedEvent = {
    id: raw.id, title: name, category, start, end, repeat, date: raw.date, weekday, from: raw.from, until, parity,
  };
  if (allDay) event.allDay = true;
  if (Array.isArray(raw.days) && raw.days.length > 1 && raw.days.length <= 7 && raw.days.every(d => isInt(d, 0, 6))) {
    event.days = [...new Set(raw.days as number[])].sort((a, b) => a - b);
    if (!event.days.includes(weekday)) event.weekday = event.days[0];
  }
  const remind = pick(raw.remind, REMINDER_LEADS);
  if (remind !== undefined) event.remind = remind;
  if (raw.weeks !== undefined) {
    if (!Array.isArray(raw.weeks) || !raw.weeks.length || raw.weeks.length > 54 || !raw.weeks.every(w => isInt(w, 1, 54))) return null;
    event.weeks = [...new Set(raw.weeks as number[])].sort((a, b) => a - b);
  }
  if (Array.isArray(raw.exclusions)) event.exclusions = raw.exclusions.filter(isDateKey).slice(0, 400);
  const periods = raw.periods;
  if (!allDay && Array.isArray(periods) && periods.length === 2 && isInt(periods[0], 1, MAX_PERIODS) && isInt(periods[1], periods[0], MAX_PERIODS))
    event.periods = [periods[0], periods[1]];
  for (const key of ['location', 'teacher'] as const) {
    const value = text(raw[key], 500);
    if (value) event[key] = value;
  }
  const sourceKey = text(raw.sourceKey, 500), importGroup = text(raw.importGroup, 200);
  if (sourceKey && importGroup) {
    event.sourceKey = sourceKey;
    event.importGroup = importGroup;
    if (raw.importEdited === true) event.importEdited = true;
  }
  return event;
}

function normalizeNote(raw: unknown): Note | null {
  if (!isObj(raw) || !isSafeId(raw.id)) return null;
  const body = text(raw.text, LIMITS.text);
  if (!body?.trim() || !isIso(raw.createdAt) || !isIso(raw.updatedAt)) return null;
  const note: Note = { id: raw.id, text: body, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
  if (isSafeId(raw.itemId)) note.itemId = raw.itemId;
  return note;
}

export function settingsProblem(s: Settings): Problem | null {
  const times = [s.dayStart, s.dayEnd, s.lunch, s.dinner];
  if (!times.every(isClock)) return { code: 'settings-times' };
  const start = toMinutes(s.dayStart), end = toMinutes(s.dayEnd);
  if (end - start < 240) return { code: 'settings-short-day' };
  for (const meal of [s.lunch, s.dinner])
    if (toMinutes(meal) < start || toMinutes(meal) + s.mealMinutes > end) return { code: 'settings-meals-outside' };
  if (Math.abs(toMinutes(s.lunch) - toMinutes(s.dinner)) < s.mealMinutes) return { code: 'settings-meals-overlap' };
  if (!isInt(s.mealMinutes, 15, 120)) return { code: 'settings-meal-length' };
  return null;
}

function normalizeSettings(raw: unknown): Settings {
  const base = defaultSettings();
  if (!isObj(raw)) return base;
  const next: Settings = {
    dayStart: isClock(raw.dayStart) ? raw.dayStart : base.dayStart,
    dayEnd: isClock(raw.dayEnd) ? raw.dayEnd : base.dayEnd,
    lunch: isClock(raw.lunch) ? raw.lunch : base.lunch,
    dinner: isClock(raw.dinner) ? raw.dinner : base.dinner,
    mealMinutes: isInt(raw.mealMinutes, 15, 120) ? raw.mealMinutes : base.mealMinutes,
  };
  return settingsProblem(next) ? base : next;
}

/**
 * When week one starts and when each period runs. Periods are kept up to the first one that is
 * unreadable or overlaps the one before, so the numbers of those kept never change.
 */
export function normalizeSemester(raw: unknown): SemesterPreferences | undefined {
  if (!isObj(raw)) return undefined;
  const firstMonday = isDateKey(raw.firstMonday) ? raw.firstMonday : '';
  const periods: ClassPeriod[] = [];
  for (const p of Array.isArray(raw.periods) ? raw.periods.slice(0, MAX_PERIODS) : []) {
    if (!isObj(p) || !isClock(p.start) || !isClock(p.end) || toMinutes(p.end) <= toMinutes(p.start)) break;
    if (periods.length && toMinutes(p.start) < toMinutes(periods[periods.length - 1].end)) break;
    periods.push({ start: p.start, end: p.end });
  }
  return firstMonday || periods.length ? { firstMonday, periods } : undefined;
}

function normalizeHistory(raw: unknown): ImportHistory | undefined {
  if (!isObj(raw) || !Array.isArray(raw.before) || !Array.isArray(raw.after) || !isIso(raw.at)) return undefined;
  const before = raw.before.map(normalizeEvent), after = raw.after.map(normalizeEvent);
  if (before.some(e => !e) || after.some(e => !e)) return undefined;
  return { before: before as FixedEvent[], after: after as FixedEvent[], at: raw.at };
}

function list<T>(raw: unknown, limit: number, fn: (v: unknown) => T | null, counter: { dropped: number }): T[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new DataError({ code: 'data-format' });
  const out: T[] = [];
  for (const entry of raw.slice(0, limit)) {
    const value = fn(entry);
    if (value) out.push(value);
    else counter.dropped++;
  }
  counter.dropped += Math.max(0, raw.length - limit);
  return out;
}

function unique<T extends { id: string }>(values: T[], counter: { dropped: number }): T[] {
  const seen = new Set<string>();
  return values.filter(v => {
    if (seen.has(v.id)) { counter.dropped++; return false; }
    seen.add(v.id);
    return true;
  });
}

export function normalizeData(raw: unknown): NormalizeReport {
  if (!isObj(raw) || raw.schema !== 1) throw new DataError({ code: 'data-format' });
  const counter = { dropped: 0 };
  const items = unique(list(raw.items, LIMITS.items, normalizeItem, counter), counter);
  const ids = new Set(items.map(i => i.id));
  const events = unique(list(raw.events, LIMITS.events, normalizeEvent, counter), counter);
  const notes = unique(list(raw.notes, LIMITS.notes, normalizeNote, counter), counter);
  for (const note of notes) if (note.itemId && !ids.has(note.itemId)) delete note.itemId;
  const timetableRaw = isObj(raw.timetable) ? raw.timetable : {};
  const exclusions = Array.isArray(timetableRaw.exclusions)
    ? timetableRaw.exclusions.filter((v): v is string => typeof v === 'string' && v.length <= 750).slice(0, 2000) : [];
  const timetable: PlannerData['timetable'] = { exclusions };
  const lastImport = normalizeHistory(timetableRaw.lastImport);
  if (lastImport) timetable.lastImport = lastImport;
  const semester = normalizeSemester(timetableRaw.semester);
  if (semester) timetable.semester = semester;
  const look = isObj(raw.appearance) ? raw.appearance : {};
  const appearance: PlannerData['appearance'] = {
    accent: pick(look.accent, ACCENTS) ?? DEFAULT_ACCENT,
    theme: pick(look.theme, THEMES) ?? 'system',
    language: pick(look.language, LANGUAGES) ?? 'system',
  };
  const remind = isObj(raw.reminders) ? raw.reminders : {};
  const base = defaultReminders();
  const reminders: PlannerData['reminders'] = {
    deadlines: typeof remind.deadlines === 'boolean' ? remind.deadlines : base.deadlines,
    deadlineDays: pick(remind.deadlineDays, [0, 1, 2] as const) ?? base.deadlineDays,
    at: isClock(remind.at) ? remind.at : base.at,
    asked: remind.asked === true,
  };
  const metaRaw = isObj(raw.meta) ? raw.meta : {};
  const fallback = new Date().toISOString();
  const meta: PlannerData['meta'] = {
    createdAt: isIso(metaRaw.createdAt) ? metaRaw.createdAt : fallback,
    updatedAt: isIso(metaRaw.updatedAt) ? metaRaw.updatedAt : fallback,
  };
  return {
    data: {
      schema: 1, items, events, notes,
      noteDraft: text(raw.noteDraft, LIMITS.text) ?? '',
      settings: normalizeSettings(raw.settings),
      appearance, reminders, timetable, meta,
    },
    dropped: counter.dropped,
  };
}

/** Planner data from saved or backed-up JSON text. Throws if the text isn't planner data. */
export const parseData = (json: string): NormalizeReport => normalizeData(JSON.parse(json));
