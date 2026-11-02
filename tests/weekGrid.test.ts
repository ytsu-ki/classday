import { describe, expect, it } from 'vitest';
import { DEFAULT_PERIODS, withDefaultPeriods } from '../src/domain/defaults';
import { courseColors, DENSE, inLanes, passingBreaks, periodRows, semesterWeek, SPARSE, weekAxis } from '../src/ui/weekGrid';
import { data, weekly } from './helpers';

/** Positions are whole pixels, so allow one pixel of rounding. */
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);

describe('week grid axis', () => {
  const periods = [{ start: 480, end: 525 }, { start: 535, end: 580 }, { start: 840, end: 885 }];

  it('gives periods full height and compresses the time between them', () => {
    const axis = weekAxis({ start: 480, end: 1320 }, periods);
    expect(axis.y(480)).toBe(0);
    expect(axis.y(525)).toBe(Math.round(45 * DENSE));
    near(axis.y(535) - axis.y(525), 10 * SPARSE);
    // A long lunch break takes far less room than the same time in class.
    expect(axis.y(840) - axis.y(580)).toBeLessThan(260 * DENSE * 0.3);
    expect(axis.height).toBe(axis.y(1320));
  });

  it('gives anything planned in a gap full height too', () => {
    const axis = weekAxis({ start: 480, end: 1320 }, [...periods, { start: 720, end: 780 }]);
    near(axis.y(780) - axis.y(720), 60 * DENSE);
  });

  it('closes passing periods, so classes either side of one sit flush', () => {
    const axis = weekAxis({ start: 480, end: 1320 }, periods, [{ start: 525, end: 535 }]);
    expect(axis.y(535)).toBe(axis.y(525));
    // A class over periods 1 and 2 is exactly two periods tall.
    near(axis.y(580) - axis.y(480), 90 * DENSE);
  });

  it('keeps time moving down the page', () => {
    const axis = weekAxis({ start: 420, end: 1380 }, [{ start: 600, end: 700 }, { start: 650, end: 760 }]);
    for (let m = 420; m < 1380; m += 5) expect(axis.y(m + 5)).toBeGreaterThanOrEqual(axis.y(m));
  });
});

describe('passing periods', () => {
  const rows = periodRows(data());

  it('are the short breaks between periods, not lunch or dinner', () => {
    expect(passingBreaks(rows, [])).toEqual([
      { start: 525, end: 535 }, { start: 580, end: 610 }, { start: 655, end: 665 },
      { start: 865, end: 875 }, { start: 920, end: 940 }, { start: 985, end: 995 },
      { start: 1155, end: 1165 }, { start: 1210, end: 1220 }, { start: 1265, end: 1275 },
    ]);
  });

  it('stay open when something planned starts or ends inside one', () => {
    const breaks = passingBreaks(rows, [{ start: 585, end: 640 }, { start: 480, end: 580 }]);
    expect(breaks).not.toContainEqual({ start: 580, end: 610 });
    expect(breaks).toContainEqual({ start: 525, end: 535 });
  });
});

describe('week grid lanes', () => {
  it('puts overlapping things side by side and the rest full width', () => {
    const out = inLanes([
      { value: 'class', start: 480, end: 580 },
      { value: 'plan', start: 540, end: 600 },
      { value: 'later', start: 700, end: 760 },
    ]);
    expect(out.map(o => [o.value, o.lane, o.lanes])).toEqual([['class', 0, 2], ['plan', 1, 2], ['later', 0, 1]]);
  });
});

describe('week grid colors and periods', () => {
  it('gives a course the same color all week and different courses different colors', () => {
    const colors = courseColors([weekly('Physics', 1, '08:00', '09:40'), weekly('Physics', 3, '10:00', '11:40'), weekly('Calculus', 2, '08:00', '09:40')]);
    expect(colors.size).toBe(2);
    expect(colors.get('Physics')).not.toBe(colors.get('Calculus'));
  });

  it('shows the semester’s period times, with the defaults wherever one is not set', () => {
    const d = data();
    d.timetable.semester = { firstMonday: '2026-09-07', periods: [{ start: '08:00', end: '08:45' }, { start: '', end: '' }, { start: '10:00', end: '10:45' }] };
    const rows = periodRows(d);
    expect(rows[0]).toEqual({ n: 1, start: 480, end: 525 });
    expect(rows.find(r => r.n === 3)).toEqual({ n: 3, start: 600, end: 645 });
    expect(withDefaultPeriods(d.timetable.semester.periods)[1]).toEqual(DEFAULT_PERIODS[1] ?? { start: '', end: '' });
  });

  it('fills in periods 1–12 before any timetable is imported', () => {
    const rows = periodRows(data());
    expect(rows.map(r => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(rows[0]).toEqual({ n: 1, start: 8 * 60, end: 8 * 60 + 45 });
    expect(rows[4]).toEqual({ n: 5, start: 13 * 60 + 40, end: 14 * 60 + 25 });
    expect(rows[9]).toEqual({ n: 10, start: 19 * 60 + 25, end: 20 * 60 + 10 });
    expect(rows[10]).toEqual({ n: 11, start: 20 * 60 + 20, end: 21 * 60 + 5 });
    expect(rows[11]).toEqual({ n: 12, start: 21 * 60 + 15, end: 22 * 60 });
    expect(withDefaultPeriods([])).toEqual(DEFAULT_PERIODS);
  });

  it('numbers the weeks of the semester', () => {
    const d = data();
    expect(semesterWeek(d, '2026-10-12')).toBeNull();
    d.timetable.semester = { firstMonday: '2026-09-07', periods: [] };
    expect(semesterWeek(d, '2026-09-07')).toBe(1);
    expect(semesterWeek(d, '2026-10-12')).toBe(6);
    expect(semesterWeek(d, '2026-08-31')).toBeNull();
  });
});
