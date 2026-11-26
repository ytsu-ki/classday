import { describe, expect, it } from 'vitest';
import { dayAxis, dayLayout, hourMarks, visibleHourMarks } from '../src/ui/dayGrid';
import { data, once, TODAY, weekly } from './helpers';

const plain = (layout: ReturnType<typeof dayLayout>) =>
  layout.entries.map(e => [e.kind, e.start, e.end, e.kind === 'event' ? e.block.title : e.kind === 'meal' ? e.block.id : '']);

describe('the day axis', () => {
  it('runs over the waking day in whole hours, stretching for an event outside it', () => {
    expect(dayLayout(data(), TODAY)).toMatchObject({ start: 8 * 60, end: 23 * 60 });
    const early = dayLayout(data({ events: [once('Run', TODAY, '06:30', '07:15')] }), TODAY);
    expect(early).toMatchObject({ start: 6 * 60, end: 23 * 60 });
    expect(hourMarks(early)).toHaveLength(18);
  });

  it('lays out events, meals and free time in order, the free time as long as it is', () => {
    const d = data({ events: [weekly('Physics', 2, '08:00', '09:40'), weekly('Lab', 2, '12:30', '14:00')] });
    expect(plain(dayLayout(d, TODAY))).toEqual([
      ['event', 480, 580, 'Physics'],
      ['free', 580, 720, ''],
      // Lunch gives way to the lab that starts halfway through it.
      ['meal', 720, 750, 'lunch'],
      ['event', 750, 840, 'Lab'],
      ['free', 840, 1080, ''],
      ['meal', 1080, 1140, 'dinner'],
      ['free', 1140, 1380, ''],
    ]);
  });

  it('splits free time at the current time, and leaves stretches too short to use blank', () => {
    const d = data({ events: [weekly('Physics', 2, '08:00', '09:40'), weekly('Chemistry', 2, '09:50', '11:00')] });
    const free = dayLayout(d, TODAY, 11 * 60 + 30).entries.filter(e => e.kind === 'free').slice(0, 2);
    expect(free.map(f => [f.start, f.end])).toEqual([[660, 690], [690, 720]]);
  });

  it('puts overlapping events side by side', () => {
    const d = data({ events: [once('Seminar', TODAY, '10:00', '11:00'), once('Office hours', TODAY, '10:30', '11:30')] });
    const events = dayLayout(d, TODAY).entries.filter(e => e.kind === 'event');
    expect(events.map(e => e.kind === 'event' && [e.lane, e.lanes])).toEqual([[0, 2], [1, 2]]);
  });

  it('fits a full day inside one phone screen on a monotonic elastic axis without overlapping hours', () => {
    const busy = data({
      events: [
        once('P1-2', TODAY, '08:00', '09:40'),
        once('P3-4', TODAY, '10:10', '11:50'),
        once('P5-6', TODAY, '13:40', '15:20'),
        once('P7-8', TODAY, '15:30', '17:10'),
        once('P9-10', TODAY, '18:30', '20:10'),
      ],
    });
    const layout = dayLayout(busy, TODAY);
    const axis = dayAxis(layout);
    expect(axis.height).toBeGreaterThanOrEqual(360);
    expect(axis.height).toBeLessThanOrEqual(560);
    for (let m = layout.start; m < layout.end; m += 5) expect(axis.y(m + 5)).toBeGreaterThanOrEqual(axis.y(m));
    // Inverse lookup maps pixel coordinates near an event's midpoint back within a few minutes.
    const mid = Math.round((axis.y(480) + axis.y(580)) / 2);
    expect(Math.abs(axis.minuteAt(mid) - 530)).toBeLessThanOrEqual(4);
    const marks = visibleHourMarks(layout, axis);
    for (let i = 1; i < marks.length; i++) {
      expect(axis.y(marks[i]) - axis.y(marks[i - 1])).toBeGreaterThanOrEqual(24);
    }
  });
});
