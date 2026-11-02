import { describe, expect, it } from 'vitest';
import { eventEnd, parseNotice } from '../src/domain/notice';
import { toMinutes } from '../src/domain/time';
import { periodRows } from '../src/ui/weekGrid';
import { data, TODAY } from './helpers';

// TODAY is Tuesday 13 October 2026.
const read = (text: string) => parseNotice(text, TODAY);

describe('reading a pasted notice in English', () => {
  it('reads a reminder', () => {
    expect(read('Reminder: Club meeting tomorrow 3pm in Room 204')).toEqual({
      title: 'Club meeting', date: '2026-10-14', start: '15:00', location: 'Room 204', found: ['date', 'time', 'place'],
    });
  });

  it('reads a changed time and a room written on its own', () => {
    expect(read('Physics lab moved to Friday 3pm, Room B204')).toEqual({
      title: 'Physics lab', date: '2026-10-16', start: '15:00', location: 'Room B204', found: ['date', 'time', 'place'],
    });
    expect(read('Office hours have been moved to Thu 2pm, rm 3.12')).toMatchObject({ title: 'Office hours', start: '14:00' });
    expect(read('The quiz is postponed until Monday 10am in Room 101')).toMatchObject({ title: 'quiz', date: '2026-10-19', location: 'Room 101' });
    // A room with no number is not a place.
    expect(read('Movie night Friday 8pm, room for everyone').location).toBeUndefined();
  });

  it('reads a longer message with a range and a named hall', () => {
    expect(read('Hi all, the career fair is on Nov 5 from 10am to 2pm at the Main Hall. Please bring your CV.')).toMatchObject({
      title: 'career fair', date: '2026-11-05', start: '10:00', end: '14:00', location: 'Main Hall',
    });
  });

  it('reads weekdays, short ranges, numeric dates and lengths', () => {
    expect(read('Study group Fri 4-6pm')).toMatchObject({ title: 'Study group', date: '2026-10-16', start: '16:00', end: '18:00' });
    expect(read('Lab safety talk 11/4 14:00 for 45 minutes in Lab 2')).toMatchObject({
      title: 'Lab safety talk', date: '2026-11-04', start: '14:00', minutes: 45, location: 'Lab 2',
    });
    expect(read('Movie night tonight 8:00')).toMatchObject({ title: 'Movie night', date: '2026-10-13', start: '20:00' });
  });

  it('does not take a month for a place', () => {
    expect(read('Exams start in November')).not.toHaveProperty('location');
  });
});

describe('how long an event lasts', () => {
  const periods = periodRows(data());
  const end = (start: string, given: { end?: string; minutes?: number } = {}, p = periods) => eventEnd(toMinutes(start), given, p);
  const at = (clock: string) => toMinutes(clock);

  it('keeps the end or length the text gave', () => {
    expect(end('14:00', { end: '16:00' })).toBe(at('16:00'));
    expect(end('14:00', { minutes: 60 })).toBe(at('15:00'));
  });

  it('otherwise lasts one double period, lined up with the timetable', () => {
    expect(end('08:00')).toBe(at('09:40'));
    expect(end('10:10')).toBe(at('11:50'));
    expect(end('13:40')).toBe(at('15:20'));
    // Not at a period's start: as long as periods 1 and 2 together.
    expect(end('14:00')).toBe(at('15:40'));
    expect(end('14:00', {}, [])).toBe(at('15:30'));
    expect(end('23:00')).toBe(at('23:59'));
  });
});
