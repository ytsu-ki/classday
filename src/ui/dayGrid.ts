import { dayWindow, fixedFor, type FixedBlock, type Interval } from '../domain/schedule';
import type { DateKey, PlannerData } from '../domain/types';
import { inLanes, type Axis } from './weekGrid';

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
    .flatMap(m => minus(m, events).filter(p => p.end - p.start >= FREE_MIN).map(p => ({ kind: 'meal' as const, ...p, block: m })));
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

/**
 * Elastic single-screen axis for Today: scheduled events stay readable while empty stretches and
 * meals compress so the entire waking day fits cleanly inside one mobile viewport.
 */
export function dayAxis(layout: Pick<DayLayout, 'start' | 'end' | 'entries'>): Axis {
  const marks = [...new Set([layout.start, layout.end, ...layout.entries.flatMap(e => [e.start, e.end])])]
    .filter(m => m >= layout.start && m <= layout.end)
    .sort((a, b) => a - b);

  type SegmentKind = 'event' | 'meal' | 'free';
  const segments: { from: number; to: number; kind: SegmentKind }[] = [];
  let eventMin = 0, mealMin = 0, freeMin = 0;

  for (let i = 1; i < marks.length; i++) {
    const from = marks[i - 1], to = marks[i];
    const span = to - from;
    const hasEvent = layout.entries.some(e => e.kind === 'event' && e.start <= from && from < e.end);
    const hasMeal = !hasEvent && layout.entries.some(e => e.kind === 'meal' && e.start <= from && from < e.end);
    const kind: SegmentKind = hasEvent ? 'event' : hasMeal ? 'meal' : 'free';
    segments.push({ from, to, kind });
    if (kind === 'event') eventMin += span;
    else if (kind === 'meal') mealMin += span;
    else freeMin += span;
  }

  let eventRate = 0.78;
  let mealRate = 0.34;
  let freeRate = 0.28;
  const rawH = eventMin * eventRate + mealMin * mealRate + freeMin * freeRate;

  if (rawH > 520) {
    const nonEventMin = freeMin + mealMin;
    if (nonEventMin > 0) {
      const targetNonEvent = Math.max(0, 520 - eventMin * eventRate);
      const ratio = targetNonEvent / (freeMin * freeRate + mealMin * mealRate);
      freeRate = Math.max(0.18, freeRate * ratio);
      mealRate = Math.max(0.24, mealRate * ratio);
    }
    const afterNonEvent = eventMin * eventRate + mealMin * mealRate + freeMin * freeRate;
    if (afterNonEvent > 540 && eventMin > 0) {
      eventRate = Math.max(0.54, (540 - (mealMin * mealRate + freeMin * freeRate)) / eventMin);
    }
  } else if (rawH < 400 && freeMin > 0) {
    freeRate = Math.min(0.45, Math.max(freeRate, (420 - eventMin * eventRate - mealMin * mealRate) / freeMin));
  }

  const rate = (kind: SegmentKind) => (kind === 'event' ? eventRate : kind === 'meal' ? mealRate : freeRate);
  const points: [minute: number, y: number][] = [[layout.start, 0]];
  let y = 0;
  for (const s of segments) {
    y += (s.to - s.from) * rate(s.kind);
    points.push([s.to, y]);
  }

  const at = (minute: number) => {
    if (minute <= layout.start) return 0;
    for (let i = 1; i < points.length; i++) {
      const [m1, y1] = points[i];
      if (minute > m1) continue;
      const [m0, y0] = points[i - 1];
      return y0 + ((minute - m0) * (y1 - y0)) / (m1 - m0);
    }
    return y;
  };
  const minuteAt = (py: number) => {
    if (py <= 0) return layout.start;
    if (py >= y) return layout.end;
    for (let i = 1; i < points.length; i++) {
      const [m1, y1] = points[i];
      const [m0, y0] = points[i - 1];
      if (y1 > y0 && py <= y1) return Math.round(m0 + ((py - y0) * (m1 - m0)) / (y1 - y0));
    }
    return layout.end;
  };
  return { height: Math.round(y), y: minute => Math.round(at(minute)), minuteAt };
}

/** Filters whole-hour axis ticks so adjacent labels never overlap vertically on compressed spans. */
export function visibleHourMarks(layout: DayLayout, axis: Axis, minGap = 24): number[] {
  const out: number[] = [];
  for (const h of hourMarks(layout)) {
    if (!out.length || axis.y(h) - axis.y(out[out.length - 1]) >= minGap) out.push(h);
  }
  return out;
}
