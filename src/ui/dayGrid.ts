import { dayWindow, fixedFor, type FixedBlock, type Interval } from '../domain/schedule';
import type { DateKey, PlannerData } from '../domain/types';
import { inLanes } from './weekGrid';

/**
 * Today as a time axis: one scale from the first hour to the last, so an hour is always the same
 * height and every event, meal and free stretch is as tall as it is long.
 */

/** Pixels per minute: 72 px an hour, room for a title and its times in a 45-minute class. */
export const DAY_SCALE = 1.2;
/** Free stretches shorter than this stay blank: too short to offer an event. */
export const FREE_MIN = 20;

export type DayEntry =
  | { kind: 'event'; start: number; end: number; block: FixedBlock; lane: number; lanes: number }
  | { kind: 'meal'; start: number; end: number; block: FixedBlock }
  | { kind: 'free'; start: number; end: number };

export interface DayLayout {
  /** The whole hours the axis runs between. */
  start: number;
  end: number;
  /** In time order. */
  entries: DayEntry[];
}

/** What is left of a stretch once the cuts are taken out of it. */
function minus(span: Interval, cuts: Interval[]): Interval[] {
  let parts = [span];
  for (const c of cuts) {
    parts = parts.flatMap(p => c.end <= p.start || c.start >= p.end ? [p] : [
      ...(c.start > p.start ? [{ start: p.start, end: c.start }] : []),
      ...(c.end < p.end ? [{ start: c.end, end: p.end }] : []),
    ]);
  }
  return parts;
}

/**
 * The day's axis and what sits on it. The axis covers the waking day and stretches to whole hours
 * around any event outside it. Events overlapping each other share the width in lanes; a meal
 * gives way to any event at the same time; free time is the rest of the waking day, split at
 * `now` so the part already gone can show apart from the part still ahead.
 */
export function dayLayout(data: PlannerData, day: DateKey, now?: number): DayLayout {
  const fixed = fixedFor(data, day);
  const events = fixed.filter(f => f.kind === 'event');
  const window = dayWindow(data.settings);
  const start = Math.floor(Math.min(window.start, ...events.map(e => e.start)) / 60) * 60;
  const end = Math.min(24 * 60, Math.ceil(Math.max(window.end, ...events.map(e => e.end)) / 60) * 60);

  const meals = fixed.filter(f => f.kind === 'meal')
    .flatMap(m => minus(m, events).map(p => ({ kind: 'meal' as const, ...p, block: m })));
  const free = minus(window, [...events, ...meals])
    .flatMap(f => now !== undefined && now > f.start && now < f.end ? [{ start: f.start, end: now }, { start: now, end: f.end }] : [f])
    .filter(f => f.end - f.start >= FREE_MIN)
    .map(f => ({ kind: 'free' as const, ...f }));
  const laid = inLanes(events.map(e => ({ value: e, start: e.start, end: e.end })))
    .map(({ value, start, end, lane, lanes }) => ({ kind: 'event' as const, start, end, block: value, lane, lanes }));

  const entries: DayEntry[] = [...laid, ...meals, ...free].sort((a, b) => a.start - b.start || a.end - b.end);
  return { start, end, entries };
}

/** Whole hours to mark down the side, the last one included. */
export function hourMarks(layout: DayLayout): number[] {
  const out: number[] = [];
  for (let h = layout.start; h <= layout.end; h += 60) out.push(h);
  return out;
}
