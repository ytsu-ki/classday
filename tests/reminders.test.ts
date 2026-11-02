import { describe, expect, it } from 'vitest';
import { initialData } from '../src/domain/defaults';
import { upcomingReminders } from '../src/domain/reminders';
import { normalizeData } from '../src/domain/schema';
import { data, once, todo, weekly } from './helpers';

const NOW = new Date('2026-10-13T08:00:00'); // Tuesday morning
const local = (iso: string) => new Date(iso).getTime();

describe('deadline reminders', () => {
  it('arrive the chosen number of days before, at the reminder time', () => {
    const d = data({ items: [todo({ id: 'essay', due: '2026-10-16' })] });
    expect(upcomingReminders(d, NOW)).toMatchObject([{ kind: 'deadline', itemId: 'essay' }]);
    expect(upcomingReminders(d, NOW)[0].at.getTime()).toBe(local('2026-10-15T09:00:00'));
    d.reminders.deadlineDays = 0;
    expect(upcomingReminders(d, NOW)[0].at.getTime()).toBe(local('2026-10-16T09:00:00'));
  });

  it('fall back to the morning of the due day when the usual moment has passed', () => {
    const d = data({ items: [todo({ due: '2026-10-14' })] });
    d.reminders.deadlineDays = 2;
    expect(upcomingReminders(d, NOW)[0].at.getTime()).toBe(local('2026-10-14T09:00:00'));
  });

  it('skip finished to-dos, past deadlines and deadlines before the reminder time', () => {
    const d = data({
      items: [
        todo({ due: '2026-10-15', status: 'done' }),
        todo({ due: '2026-10-12' }),
        todo({ due: '2026-10-13', dueTime: '08:30' }),
      ],
    });
    expect(upcomingReminders(d, NOW)).toEqual([]);
  });
});

describe('event reminders', () => {
  it('come before each occurrence an event asks for, and not for others', () => {
    const d = data({ events: [weekly('Physics', 3, '14:00', '15:40', { remind: 30 }), weekly('Chemistry', 4, '10:00', '11:00')] });
    d.reminders.deadlines = false;
    const reminders = upcomingReminders(d, NOW, 7);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ kind: 'event', day: '2026-10-14' });
    expect(reminders[0].at.getTime()).toBe(local('2026-10-14T13:30:00'));
  });

  it('come at the reminder time for all-day events, on the day or the day before', () => {
    const fair = once('Career fair', '2026-10-15', '00:00', '23:59', { allDay: true, remind: 1440 });
    const d = data({ events: [fair] });
    expect(upcomingReminders(d, NOW)[0].at.getTime()).toBe(local('2026-10-14T09:00:00'));
    d.events[0].remind = 0;
    expect(upcomingReminders(d, NOW)[0].at.getTime()).toBe(local('2026-10-15T09:00:00'));
  });

  it('skip a moment that has passed', () => {
    const d = data({ events: [once('Seminar', '2026-10-13', '08:15', '09:00', { remind: 30 })] });
    expect(upcomingReminders(d, NOW)).toEqual([]);
  });
});

describe('reminder settings', () => {
  it('default to on, and turn unknown values into the defaults', () => {
    expect(initialData().reminders).toEqual({ deadlines: true, deadlineDays: 1, at: '09:00', asked: false });
    const { reminders: _, ...older } = initialData();
    expect(normalizeData(older).data.reminders).toEqual(initialData().reminders);
    const odd = normalizeData({ ...initialData(), reminders: { deadlines: false, deadlineDays: 9, at: '25:00', asked: true, token: 'x' } }).data.reminders;
    expect(odd).toEqual({ deadlines: false, deadlineDays: 1, at: '09:00', asked: true });
  });
});
