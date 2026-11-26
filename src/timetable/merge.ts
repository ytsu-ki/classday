import { normalizeEvent } from '../domain/schema';
import { occurs } from '../domain/schedule';
import { addDays, daysBetween, toMinutes } from '../domain/time';
import type { DateKey, FixedEvent, PlannerData } from '../domain/types';
import { ProblemError } from '../domain/problems';

export interface ImportDiff {
  added: FixedEvent[];
  updated: { before: FixedEvent; after: FixedEvent }[];
  removed: FixedEvent[];
  unchanged: FixedEvent[];
  /** Imported events the student edited or deleted; imports leave them alone. */
  kept: FixedEvent[];
}

// Cancelled single occurrences belong to the student, so they are not compared.
const FIELDS = ['title', 'category', 'repeat', 'weekday', 'days', 'weeks', 'date', 'from', 'until', 'parity', 'start', 'end', 'periods', 'location', 'teacher'] as const;
// Both sides are compared as they are stored, so an event saved and read back (trimmed, without
// empty fields) still equals the same entry imported again.
const signature = (e: FixedEvent) => {
  const stored = normalizeEvent(e) ?? e;
  return JSON.stringify(FIELDS.map(k => stored[k] ?? null));
};

export function diffImport(data: PlannerData, incoming: FixedEvent[], group: string): ImportDiff {
  if (!incoming.length || incoming.length > 2000 || incoming.some(e => e.importGroup !== group))
    throw new ProblemError({ code: 'timetable-size' });
  if (incoming.some(e => !normalizeEvent(e))) throw new ProblemError({ code: 'timetable-unreadable' });
  const previous = data.events.filter(e => e.importGroup === group);
  const keys = new Set<string>();
  const diff: ImportDiff = { added: [], updated: [], removed: [], unchanged: [], kept: [] };
  for (const event of incoming) {
    if (keys.has(event.sourceKey!)) throw new ProblemError({ code: 'timetable-duplicate' });
    keys.add(event.sourceKey!);
    const old = previous.find(e => e.sourceKey === event.sourceKey);
    if (data.timetable.exclusions.includes(`${group}:${event.sourceKey}`)) diff.kept.push(event);
    else if (!old) diff.added.push(event);
    else if (old.importEdited) diff.kept.push(old);
    else if (signature(old) === signature(event)) diff.unchanged.push(old);
    else diff.updated.push({ before: old, after: { ...event, id: old.id, ...(old.exclusions ? { exclusions: old.exclusions } : {}) } });
  }
  diff.removed = previous.filter(e => !keys.has(e.sourceKey!) && !e.importEdited);
  return diff;
}

export function applyImport(data: PlannerData, incoming: FixedEvent[], group: string, removeMissing: boolean): ImportDiff {
  const diff = diffImport(data, incoming, group);
  const removed = new Set(removeMissing ? diff.removed.map(e => e.id) : []);
  const updates = new Map(diff.updated.map(x => [x.before.id, x.after]));
  const after = data.events.filter(e => !removed.has(e.id)).map(e => updates.get(e.id) ?? e).concat(diff.added);
  if (after.length > 2000) throw new ProblemError({ code: 'timetable-too-many' });
  data.events = after;
  // Only what changed is kept for undoing: the earlier form of updated and removed events, and
  // the new form of updated and added ones. Everything else is as it was.
  const copy = (e: FixedEvent) => ({ ...e });
  data.timetable.lastImport = {
    before: [...diff.updated.map(x => x.before), ...diff.removed.filter(e => removed.has(e.id))].map(copy),
    after: [...diff.updated.map(x => x.after), ...diff.added].map(copy),
    at: new Date().toISOString(),
  };
  return diff;
}

/** Undo the last import while keeping any edits made since. Returns how many later edits were kept. */
export function undoImport(data: PlannerData): number {
  const history = data.timetable.lastImport;
  if (!history) return 0;
  const current = new Map(data.events.map(e => [e.id, e]));
  const before = new Map(history.before.map(e => [e.id, e]));
  let kept = 0;
  for (const event of history.after) {
    const now = current.get(event.id), original = before.get(event.id);
    if (now && JSON.stringify(now) === JSON.stringify(event)) {
      if (original) current.set(event.id, original);
      else current.delete(event.id);
    } else if (!original || JSON.stringify(original) !== JSON.stringify(event)) kept++;
  }
  for (const event of history.before)
    if (!history.after.some(e => e.id === event.id) && !current.has(event.id)) current.set(event.id, event);
  data.events = [...current.values()];
  delete data.timetable.lastImport;
  return kept;
}

/** Overlapping classes after the import, as short readable lines (at most 20). */
export interface ImportConflict { date: DateKey; first: string; second: string }

/** Pairs of entries that would overlap after the import, at most 20. */
export function importConflicts(data: PlannerData, incoming: FixedEvent[]): ImportConflict[] {
  const diff = diffImport(data, incoming, incoming[0].importGroup!);
  const updates = new Map(diff.updated.map(x => [x.before.id, x.after]));
  const combined = data.events.map(e => updates.get(e.id) ?? e).concat(diff.added);
  const first = incoming.reduce((d, e) => (e.from < d ? e.from : d), incoming[0].from);
  const last = incoming.reduce((d, e) => { const end = e.repeat === 'once' ? e.date : e.until || e.from; return end > d ? end : d; }, first);
  const days = Math.min(378, daysBetween(first, last) + 1);
  const out = new Map<string, ImportConflict>();
  for (let i = 0; i < days && out.size < 20; i++) {
    const date = addDays(first, i);
    // An all-day event (a holiday, a birthday) doesn't clash with a class.
    const rows = combined.filter(e => !e.allDay && occurs(e, date));
    for (let a = 0; a < rows.length; a++)
      for (let b = a + 1; b < rows.length; b++)
        if (toMinutes(rows[a].start) < toMinutes(rows[b].end) && toMinutes(rows[a].end) > toMinutes(rows[b].start))
          out.set(`${date}|${rows[a].title}|${rows[b].title}`, { date, first: rows[a].title, second: rows[b].title });
  }
  return [...out.values()].slice(0, 20);
}
