import { describe, expect, it } from 'vitest';
import * as act from '../src/domain/actions';
import { breakLength, classLength, EXAMPLE_PERIODS, MAX_PERIODS, periodsProblem, retimeClasses, withBreak, withLength, withPeriodAdded, withTime } from '../src/domain/periods';
import { normalizeEvent, normalizeSemester } from '../src/domain/schema';
import type { ClassPeriod } from '../src/domain/types';
import { buildEvents } from '../src/timetable/classes';
import { applyImport, diffImport } from '../src/timetable/merge';
import { data, weekly, withClassTimes } from './helpers';

const table = (): ClassPeriod[] => EXAMPLE_PERIODS.map(p => ({ ...p }));
const starts = (rows: ClassPeriod[]) => rows.map(p => p.start);

describe('class times', () => {
  it('know the usual class length and break, leaving out lunch and dinner', () => {
    expect(classLength(table())).toBe(45);
    expect(breakLength(table())).toBe(10);
    expect(classLength([])).toBe(45);
  });

  it('move the rest of a block with a period, and nothing past the next long break', () => {
    // The afternoon starts half an hour later, as for summer hours.
    const summer = withTime(table(), 5, 'start', '14:10');
    expect(starts(summer)).toEqual(['08:00', '08:55', '10:10', '11:05', '14:10', '15:05', '16:10', '17:05', '18:30', '19:25', '20:20', '21:15']);
    expect(summer[4].end).toBe('14:55');
    // The long morning break belongs to the morning, so moving period 1 moves periods 1–4.
    expect(starts(withTime(table(), 1, 'start', '08:30')).slice(0, 5)).toEqual(['08:30', '09:25', '10:40', '11:35', '13:40']);
    // A later end keeps the break after it.
    const longer = withTime(table(), 2, 'end', '09:45');
    expect(longer[1]).toEqual({ start: '08:55', end: '09:45' });
    expect(longer[2].start).toBe('10:15');
    expect(longer[0].start).toBe('08:00');
  });

  it('change only the period itself when its block would run past midnight', () => {
    const late = withTime(table(), 9, 'start', '22:30');
    expect(late[8]).toEqual({ start: '22:30', end: '23:15' });
    expect(late[9]).toEqual(EXAMPLE_PERIODS[9]);
  });

  it('take a new class length or break for every period, keeping the long breaks', () => {
    const fifty = withLength(table(), 50);
    expect(fifty.slice(0, 5)).toEqual([
      { start: '08:00', end: '08:50' }, { start: '09:00', end: '09:50' }, { start: '10:20', end: '11:10' },
      { start: '11:20', end: '12:10' }, { start: '13:40', end: '14:30' },
    ]);
    expect(classLength(fifty)).toBe(50);
    const five = withBreak(table(), 5);
    expect(starts(five).slice(0, 4)).toEqual(['08:00', '08:50', '10:05', '10:55']);
    expect(breakLength(five)).toBe(5);
    expect(five[6].start).toBe('15:35'); // the 20-minute afternoon break stays
  });

  it('add a period after the last with the usual break and length, up to the limit', () => {
    expect(withPeriodAdded(table())!.at(-1)).toEqual({ start: '22:10', end: '22:55' });
    expect(withPeriodAdded([])).toEqual([{ start: '08:00', end: '08:45' }]);
    expect(withPeriodAdded([{ start: '23:00', end: '23:45' }])).toBeNull();
    let full = table();
    while (full.length < MAX_PERIODS) full = [...full, { start: '23:58', end: '23:59' }];
    expect(withPeriodAdded(full)).toBeNull();
  });

  it('must run forwards without overlapping, and keep every period classes use', () => {
    expect(periodsProblem(table())).toBeNull();
    expect(periodsProblem([])).toBeNull();
    expect(periodsProblem([{ start: '09:00', end: '08:45' }])).toEqual({ code: 'semester-period', period: 1 });
    expect(periodsProblem([{ start: '08:00', end: '08:45' }, { start: '08:30', end: '09:15' }])).toEqual({ code: 'semester-periods-overlap' });
    expect(periodsProblem(table().slice(0, 10), 12)).toEqual({ code: 'semester-period-in-use', period: 11 });
  });
});

describe('classes linked to their periods', () => {
  it('move with new class times, unless their times were changed by hand', () => {
    const d = withClassTimes(data({
      events: [
        weekly('Linked', 1, '13:40', '15:20', { periods: [5, 6] }),
        weekly('Changed', 2, '14:00', '15:20', { periods: [5, 6] }),
        weekly('Plain', 3, '13:40', '15:20'),
      ],
    }));
    const moved = retimeClasses(d, table(), withTime(table(), 5, 'start', '14:10'));
    expect(moved).toBe(1);
    expect(d.events.map(e => [e.title, e.start, e.end, e.periods ?? null])).toEqual([
      ['Linked', '14:10', '15:50', [5, 6]],
      ['Changed', '14:00', '15:20', null],
      ['Plain', '13:40', '15:20', null],
    ]);
  });

  it('are saved with the class times, which create the semester when there is none', () => {
    const d = data({ events: [weekly('Linked', 1, '08:00', '09:40', { periods: [1, 2] })] });
    expect(() => act.setClassTimes(d, [{ start: '08:00', end: '08:45' }])).toThrow('semester-period-in-use');
    d.timetable.semester = undefined;
    const two = [{ start: '08:30', end: '09:15' }, { start: '09:25', end: '10:10' }];
    // No times were set before, so nothing was linked to them yet.
    expect(act.setClassTimes(d, two)).toBe(0);
    expect(d.timetable.semester).toEqual({ firstMonday: '', periods: two });
    d.events = [];
    act.setClassTimes(d, []);
    expect(d.timetable.semester).toBeUndefined();
  });

  it('stop following their periods when given other times', () => {
    const d = withClassTimes(data({ events: [weekly('Math', 1, '08:00', '09:40', { periods: [1, 2], sourceKey: 'k', importGroup: 'g' })] }));
    act.saveEvent(d, { ...d.events[0], location: 'A101' });
    expect(d.events[0].periods).toEqual([1, 2]);
    act.saveEvent(d, { ...d.events[0], start: '08:10' });
    expect(d.events[0].periods).toBeUndefined();
  });

  it('stay the same classes when a timetable is imported again under new class times', () => {
    const d = withClassTimes(data());
    d.timetable.semester!.firstMonday = '2026-09-07';
    const entries = [{ title: 'Math', weekday: 1, periods: [5, 6] as [number, number] }];
    const first = buildEvents(entries, d.timetable.semester!, 'file-x');
    expect(first[0]).toMatchObject({ start: '13:40', end: '15:20', periods: [5, 6] });
    applyImport(d, first, 'file-x', true);
    const summer = withTime(table(), 5, 'start', '14:10');
    expect(act.setClassTimes(d, summer)).toBe(1);
    expect(d.events[0]).toMatchObject({ start: '14:10', end: '15:50' });
    const again = buildEvents(entries, d.timetable.semester!, 'file-x');
    const diff = diffImport(d, again, 'file-x');
    expect([diff.added.length, diff.updated.length, diff.removed.length, diff.unchanged.length]).toEqual([0, 0, 0, 1]);
  });
});

describe('stored class times', () => {
  it('keep the periods up to the first unreadable or overlapping one', () => {
    expect(normalizeSemester({ firstMonday: '2026-09-07', periods: [{ start: '08:00', end: '08:45' }, { start: '', end: '' }, { start: '10:00', end: '10:45' }] }))
      .toEqual({ firstMonday: '2026-09-07', periods: [{ start: '08:00', end: '08:45' }] });
    expect(normalizeSemester({ periods: [{ start: '08:00', end: '08:45' }, { start: '08:30', end: '09:15' }] }))
      .toEqual({ firstMonday: '', periods: [{ start: '08:00', end: '08:45' }] });
    expect(normalizeSemester({ firstMonday: 'soon', periods: [] })).toBeUndefined();
  });

  it('keep a class’s periods only when they make sense', () => {
    const base = weekly('Math', 1, '08:00', '09:40');
    expect(normalizeEvent({ ...base, periods: [1, 2] })?.periods).toEqual([1, 2]);
    for (const periods of [[2, 1], [0, 1], [1, 17], [1], '1-2'])
      expect(normalizeEvent({ ...base, periods })?.periods).toBeUndefined();
    expect(normalizeEvent({ ...base, allDay: true, periods: [1, 2] })?.periods).toBeUndefined();
  });
});
