import { initialData, newItem } from '../src/domain/defaults';
import type { FixedEvent, Item, PlannerData } from '../src/domain/types';

/** A Tuesday in the middle of a semester. */
export const TODAY = '2026-10-13';

export function data(extra: Partial<PlannerData> = {}): PlannerData {
  return { ...initialData(), ...extra };
}

let n = 0;
export function todo(extra: Partial<Item> = {}): Item {
  return newItem(`To-do ${++n}`, { estimate: 60, createdAt: '2026-10-01T08:00:00.000Z', id: `todo-${n}`, ...extra });
}

/** A long-term event every week on one weekday (0 = Sunday), from the Monday of TODAY's week. */
export function weekly(title: string, weekday: number, start: string, end: string, extra: Partial<FixedEvent> = {}): FixedEvent {
  return { id: `event-${++n}`, title, category: 'long', weekday, start, end, repeat: 'weekly', date: '2026-10-12', from: '2026-10-12', until: '', parity: 'all', ...extra };
}

export function once(title: string, date: string, start: string, end: string, extra: Partial<FixedEvent> = {}): FixedEvent {
  return { id: `event-${++n}`, title, category: 'once', weekday: new Date(`${date}T12:00:00`).getDay(), start, end, repeat: 'once', date, from: date, until: '', parity: 'all', ...extra };
}
