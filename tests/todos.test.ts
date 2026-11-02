import { describe, expect, it } from 'vitest';
import { normalizeData } from '../src/domain/schema';
import { allDayFor, fixedFor, freeTime, occurs } from '../src/domain/schedule';
import { groupOf, isDueSoon, isOverdue, orderTodos } from '../src/domain/todos';
import { initialData } from '../src/domain/defaults';
import { data, once, TODAY, todo, weekly } from './helpers';

const NOW = new Date('2026-10-13T10:00:00'); // Tuesday morning

describe('the to-do list', () => {
  it('follows the Eisenhower order, nearest deadline first within a group', () => {
    const relaxed = todo({ title: 'relaxed' });
    const both = todo({ title: 'both', important: true, urgent: true });
    const importantLater = todo({ title: 'important later', important: true, due: '2026-10-20' });
    const importantSoon = todo({ title: 'important soon', important: true, due: '2026-10-15' });
    const urgent = todo({ title: 'urgent', urgent: true });
    const order = orderTodos([relaxed, urgent, importantLater, both, importantSoon], NOW).map(i => i.title);
    expect(order).toEqual(['both', 'important soon', 'important later', 'urgent', 'relaxed']);
  });

  it('keeps overdue to-dos first and open, never done', () => {
    const late = todo({ title: 'late', due: '2026-10-12', important: false });
    const both = todo({ title: 'both', important: true, urgent: true });
    expect(orderTodos([both, late], NOW).map(i => i.title)).toEqual(['late', 'both']);
    expect(isOverdue(late, NOW)).toBe(true);
    expect(late.status).toBe('open');
    // A deadline without a time lasts the whole day.
    expect(isOverdue(todo({ due: TODAY }), NOW)).toBe(false);
    expect(isOverdue(todo({ due: TODAY, dueTime: '09:00' }), NOW)).toBe(true);
    expect(orderTodos([todo({ status: 'done' })], NOW)).toEqual([]);
  });

  it('warns within 12 hours of a deadline', () => {
    expect(isDueSoon(todo({ due: TODAY, dueTime: '21:00' }), NOW)).toBe(true);
    expect(isDueSoon(todo({ due: TODAY }), NOW)).toBe(false); // 23:59 is more than 12 hours away
    expect(isDueSoon(todo({ due: '2026-10-14', dueTime: '08:00' }), NOW)).toBe(false);
    expect(isDueSoon(todo({ due: TODAY, dueTime: '21:00', status: 'done' }), NOW)).toBe(false);
    expect(groupOf(todo({ due: TODAY, dueTime: '21:00', urgent: true }), NOW)).toBe('urgent');
  });
});

describe('the timetable', () => {
  it('repeats an event on each of its days, and only within its dates', () => {
    const gym = weekly('Gym', 1, '19:00', '20:00', { days: [1, 3, 5], until: '2026-10-31', category: 'short' });
    expect(['2026-10-12', '2026-10-14', '2026-10-16'].every(day => occurs(gym, day))).toBe(true);
    expect(occurs(gym, TODAY)).toBe(false);
    expect(occurs(gym, '2026-11-02')).toBe(false);
  });

  it('lists all-day events apart from the hours, and shows the free time between events', () => {
    const d = data({ events: [once('Sports day', TODAY, '00:00', '23:59', { allDay: true }), weekly('Physics', 2, '10:00', '11:40')] });
    expect(allDayFor(d, TODAY).map(e => e.title)).toEqual(['Sports day']);
    expect(fixedFor(d, TODAY).filter(f => f.kind === 'event').map(f => f.title)).toEqual(['Physics']);
    expect(freeTime(d, TODAY)).toEqual([{ start: 480, end: 600 }, { start: 700, end: 1380 }]);
  });

  it('keeps every event in exactly one category, which decides whether it repeats', () => {
    const saved = { ...initialData(), events: [
      once('Exam', TODAY, '09:00', '11:00'),
      weekly('Exam week', 2, '14:00', '15:00', { category: 'short', until: '2026-11-30' }),
      weekly('Physics', 2, '08:00', '09:40', { repeat: 'once' }),
      { ...weekly('No kind', 2, '08:00', '09:00'), category: undefined },
      weekly('Short with no end', 2, '08:00', '09:00', { category: 'short', until: '' }),
    ] };
    const { data, dropped } = normalizeData(saved);
    expect(data.events.map(e => [e.title, e.category, e.repeat])).toEqual([['Exam', 'once', 'once'], ['Exam week', 'short', 'weekly'], ['Physics', 'long', 'weekly']]);
    expect(dropped).toBe(2);
  });
});
