import type { Problem } from './problems';
import { isClock, toClock, toMinutes } from './time';
import type { ClassPeriod, Clock, PlannerData } from './types';

/**
 * A school's class times: when each period starts and ends. The table is the student's own (set
 * in the import or under Settings → Timetable), and imported classes remember their periods, so
 * a new table (the switch to summer hours, say) moves them.
 */

export const MAX_PERIODS = 16;
/** The longest gap between two periods of one block (morning, afternoon, evening); longer is lunch or dinner. */
export const BLOCK_GAP = 40;
/** Class length and break when the table doesn't show them. */
const LENGTH = 45, BREAK = 10;
const LAST_MINUTE = 23 * 60 + 59;

/** Example times to start from: one university's periods 1–12. */
export const EXAMPLE_PERIODS: readonly ClassPeriod[] = [
  { start: '08:00', end: '08:45' },
  { start: '08:55', end: '09:40' },
  { start: '10:10', end: '10:55' },
  { start: '11:05', end: '11:50' },
  { start: '13:40', end: '14:25' },
  { start: '14:35', end: '15:20' },
  { start: '15:40', end: '16:25' },
  { start: '16:35', end: '17:20' },
  { start: '18:30', end: '19:15' },
  { start: '19:25', end: '20:10' },
  { start: '20:20', end: '21:05' },
  { start: '21:15', end: '22:00' },
];

interface Span { start: number; end: number }
const spans = (table: readonly ClassPeriod[]): Span[] => table.map(p => ({ start: toMinutes(p.start), end: toMinutes(p.end) }));
const clocks = (rows: Span[]): ClassPeriod[] | null =>
  rows.every(r => r.start >= 0 && r.end <= LAST_MINUTE && r.end > r.start) ? rows.map(r => ({ start: toClock(r.start), end: toClock(r.end) })) : null;

/** Whether period i + 1 follows period i within the same block. */
const sameBlock = (rows: Span[], i: number) => {
  const gap = rows[i + 1].start - rows[i].end;
  return gap >= 0 && gap <= BLOCK_GAP;
};

const mostCommon = (values: number[], fallback: number) => {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? fallback;
};

/** The usual class length in the table, in minutes. */
export function classLength(table: readonly ClassPeriod[]): number {
  return mostCommon(spans(table).map(r => r.end - r.start), LENGTH);
}

/** The usual break between two periods of a block, in minutes. */
export function breakLength(table: readonly ClassPeriod[]): number {
  const rows = spans(table);
  return mostCommon(rows.slice(1).flatMap((r, i) => (sameBlock(rows, i) ? [r.start - rows[i].end] : [])), BREAK);
}

/**
 * Lays each block out again from its first period, with each period's length and each break
 * given by the callbacks. A table that would run past midnight is left as it was.
 */
function relay(table: readonly ClassPeriod[], length: (row: Span) => number, gap: (gap: number) => number): ClassPeriod[] {
  const rows = spans(table);
  const out: Span[] = [];
  rows.forEach((row, i) => {
    const start = i > 0 && sameBlock(rows, i - 1) ? out[i - 1].end + gap(row.start - rows[i - 1].end) : row.start;
    out.push({ start, end: start + length(row) });
  });
  return clocks(out) ?? [...table];
}

/** Every period the given length, the breaks as they were. */
export const withLength = (table: readonly ClassPeriod[], minutes: number) => relay(table, () => minutes, g => g);

/** Every usual break the given length; longer breaks within a block stay as they were. */
export function withBreak(table: readonly ClassPeriod[], minutes: number): ClassPeriod[] {
  const usual = breakLength(table);
  return relay(table, r => r.end - r.start, g => (g === usual ? minutes : g));
}

/**
 * A new start or end for period n (counting from 1). A new start keeps the period's length, and
 * the periods after it in the same block move by as much, keeping their lengths and breaks, so
 * moving the first afternoon period moves the whole afternoon. When that would run past
 * midnight, only period n changes; when even that can't fit, only the time given does.
 */
export function withTime(table: readonly ClassPeriod[], n: number, key: 'start' | 'end', clock: Clock): ClassPeriod[] {
  const rows = spans(table);
  const i = n - 1;
  if (!rows[i] || !isClock(clock)) return [...table];
  const delta = toMinutes(clock) - rows[i][key];
  const only = table.map((p, k) => (k === i ? { ...p, [key]: clock } : p));
  if (!delta) return only;
  let last = i;
  while (last + 1 < rows.length && sameBlock(rows, last)) last++;
  const shift = (r: Span) => ({ start: r.start + delta, end: r.end + delta });
  const self = (r: Span) => (key === 'start' ? shift(r) : { start: r.start, end: r.end + delta });
  return clocks(rows.map((r, k) => (k === i ? self(r) : k > i && k <= last ? shift(r) : r)))
    ?? clocks(rows.map((r, k) => (k === i ? self(r) : r)))
    ?? only;
}

/** One more period after the last, with the usual break and length; null when the day or the table is full. */
export function withPeriodAdded(table: readonly ClassPeriod[]): ClassPeriod[] | null {
  if (table.length >= MAX_PERIODS) return null;
  const last = spans(table).at(-1);
  const start = last ? last.end + breakLength(table) : 8 * 60;
  const added = clocks([{ start, end: start + classLength(table) }]);
  return added ? [...table, ...added] : null;
}

/** The highest period any class is linked to, or 0. */
export function periodsInUse(data: PlannerData): number {
  return Math.max(0, ...data.events.map(e => e.periods?.[1] ?? 0));
}

/** Why a table can't be saved: a period that ends before it starts, two that overlap, or a period classes still use is missing. */
export function periodsProblem(table: readonly ClassPeriod[], inUse = 0): Problem | null {
  if (table.length > MAX_PERIODS) return { code: 'semester-period', period: MAX_PERIODS + 1 };
  const rows = spans(table);
  for (let i = 0; i < rows.length; i++) {
    if (!isClock(table[i].start) || !isClock(table[i].end) || rows[i].end <= rows[i].start) return { code: 'semester-period', period: i + 1 };
    if (i > 0 && rows[i].start < rows[i - 1].end) return { code: 'semester-periods-overlap' };
  }
  if (inUse > table.length) return { code: 'semester-period-in-use', period: table.length + 1 };
  return null;
}

/**
 * Moves the classes linked to periods from the old table's times to the new one's, and returns
 * how many moved. A class whose times no longer match its periods was changed by hand, so it
 * keeps its times and loses the link.
 */
export function retimeClasses(data: PlannerData, before: readonly ClassPeriod[], after: readonly ClassPeriod[]): number {
  let moved = 0;
  for (const event of data.events) {
    if (!event.periods) continue;
    const [first, last] = event.periods;
    const was = { start: before[first - 1]?.start, end: before[last - 1]?.end };
    const now = { start: after[first - 1]?.start, end: after[last - 1]?.end };
    if (event.start !== was.start || event.end !== was.end || !now.start || !now.end) {
      delete event.periods;
      continue;
    }
    if (event.start === now.start && event.end === now.end) continue;
    event.start = now.start;
    event.end = now.end;
    moved++;
  }
  return moved;
}
