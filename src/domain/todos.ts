import { moment } from './reminders';
import type { Item } from './types';

/**
 * The order of the to-do list. Overdue to-dos come first, greyed but still open until ticked
 * off; then the Eisenhower groups: important and urgent, important, urgent, then the rest. Within a
 * group the nearest deadline leads.
 */
export type TodoGroup = 'overdue' | 'both' | 'important' | 'urgent' | 'other';
export const GROUP_ORDER: readonly TodoGroup[] = ['overdue', 'both', 'important', 'urgent', 'other'];

/** A deadline without a time is the end of that day. */
export function deadlineOf(item: Item): Date | null {
  return item.due ? moment(item.due, item.dueTime ?? '23:59') : null;
}

export function isOverdue(item: Item, now: Date): boolean {
  const deadline = deadlineOf(item);
  return item.status === 'open' && deadline !== null && deadline < now;
}

/** Within 12 hours of its deadline and not done yet: worth a warning. */
export function isDueSoon(item: Item, now: Date): boolean {
  const deadline = deadlineOf(item);
  return item.status === 'open' && deadline !== null && deadline >= now && deadline.getTime() - now.getTime() <= 12 * 3_600_000;
}

export function groupOf(item: Item, now: Date): TodoGroup {
  if (isOverdue(item, now)) return 'overdue';
  if (item.important && item.urgent) return 'both';
  if (item.important) return 'important';
  return item.urgent ? 'urgent' : 'other';
}

export function orderTodos(items: Item[], now: Date): Item[] {
  const rank = (item: Item) => GROUP_ORDER.indexOf(groupOf(item, now));
  const when = (item: Item) => deadlineOf(item)?.getTime() ?? Number.POSITIVE_INFINITY;
  return items
    .filter(i => i.status === 'open')
    .sort((a, b) => rank(a) - rank(b) || when(a) - when(b) || a.createdAt.localeCompare(b.createdAt));
}
