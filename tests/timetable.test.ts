import { describe, expect, it } from 'vitest';
import { initialData } from '../src/domain/defaults';
import { normalizeEvent } from '../src/domain/schema';
import { occurs } from '../src/domain/schedule';
import { addDays } from '../src/domain/time';
import type { FixedEvent } from '../src/domain/types';
import { parseIcs } from '../src/timetable/ics';
import { applyImport, diffImport, importConflicts, undoImport } from '../src/timetable/merge';
import { buildEvents } from '../src/timetable/classes';
import { parseTimetableText } from '../src/timetable/text';
import { formatRanges, parseRanges } from '../src/timetable/weeks';

const MONDAY = '2026-10-19';
const GROUP = 'njit-2026-3';

describe('week ranges', () => {
  it('reads English notation with parity and lists', () => {
    expect(parseRanges('1-6 weeks (odd), 8, 10-12 weeks (even)')).toEqual([1, 3, 5, 8, 10, 12]);
    expect(() => parseRanges('0-20')).toThrow();
    expect(() => parseRanges('1-99999')).toThrow();
    expect(() => parseRanges('soon')).toThrow();
  });

  it('still reads the school portal notation', () => {
    const week = String.fromCodePoint(0x5468), odd = String.fromCodePoint(0x5355), even = String.fromCodePoint(0x53cc);
    expect(parseRanges(`1-6${week}(${odd}),8,10-12${week}(${even})`)).toEqual([1, 3, 5, 8, 10, 12]);
  });

  it('writes ranges back compactly and losslessly', () => {
    for (const weeks of [[1, 3, 5, 7, 10, 11, 12], [2, 4, 6, 8], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], [5]]) {
      expect(parseRanges(formatRanges(weeks))).toEqual(weeks);
    }
    expect(formatRanges([1, 3, 5, 7, 10, 11, 12])).toBe('1-7 (odd), 10-12');
  });
});

describe('building classes into weekly events', () => {
  const times = Array.from({ length: 6 }, (_, i) => ({ start: `${String(8 + i).padStart(2, '0')}:00`, end: `${String(8 + i).padStart(2, '0')}:45` }));

  it('turns periods and teaching weeks into weekly events', () => {
    const [event] = buildEvents([{ title: 'Math', weekday: 1, periods: [1, 2], weeks: [2, 4], location: 'Room', teacher: 'Teacher' }], { firstMonday: MONDAY, periods: times }, 'file-x');
    expect(event).toMatchObject({ start: '08:00', end: '09:45', weekday: 1, location: 'Room', teacher: 'Teacher', importGroup: 'file-x' });
    expect(occurs(event, MONDAY)).toBe(false); // week 1 is not a teaching week
    expect(occurs(event, addDays(MONDAY, 7))).toBe(true);
    expect(occurs(event, addDays(MONDAY, 28))).toBe(false); // after week 4
  });

  it('needs the Monday of week one and every period it uses', () => {
    const entry = { title: 'Math', weekday: 1, periods: [5, 6] as [number, number] };
    expect(() => buildEvents([entry], { firstMonday: addDays(MONDAY, 1), periods: times }, 'g')).toThrow('semester-first-monday');
    expect(() => buildEvents([entry], { firstMonday: MONDAY, periods: times.slice(0, 5) }, 'g')).toThrow('semester-period');
    expect(() => buildEvents([], { firstMonday: MONDAY, periods: times }, 'g')).toThrow('timetable-no-classes');
  });

  it('imports a class listed twice only once', () => {
    const entry = { title: 'Math', weekday: 2, start: '10:00', end: '11:00' };
    expect(buildEvents([entry, { ...entry }], { firstMonday: MONDAY, periods: [] }, 'g')).toHaveLength(1);
  });
});

describe('reading timetable text', () => {
  it('reads English lines with fields in any order', () => {
    const { entries, skipped } = parseTimetableText([
      'Calculus, Mon 08:00-09:40, weeks 1-16, Room A101, Teacher: Dr. Wang',
      'Physics Wed periods 3-4 B204',
      'Friday',
      '14:00-15:30 Chemistry Lab',
      'Bring a calculator',
    ].join('\n'));
    expect(entries).toEqual([
      { title: 'Calculus', weekday: 1, start: '08:00', end: '09:40', weeks: Array.from({ length: 16 }, (_, i) => i + 1), location: 'A101', teacher: 'Dr. Wang' },
      { title: 'Physics', weekday: 3, periods: [3, 4], location: 'B204' },
      { title: 'Chemistry Lab', weekday: 5, start: '14:00', end: '15:30' },
    ]);
    expect(skipped).toBe(1);
  });
});

const course = (title = 'Math', extra: Partial<FixedEvent> = {}): FixedEvent => ({
  id: 'course1', title, category: 'long', repeat: 'weekly', weekday: 1, weeks: [1, 2], date: MONDAY, from: MONDAY, until: addDays(MONDAY, 13),
  parity: 'all', start: '09:00', end: '10:00', sourceKey: 'math', importGroup: GROUP, ...extra,
});

describe('merging imports', () => {
  it('deduplicates, updates, keeps manual edits and can be undone', () => {
    const d = initialData();
    applyImport(d, [course()], GROUP, false);
    expect(diffImport(d, [course()], GROUP).unchanged).toHaveLength(1);
    applyImport(d, [course()], GROUP, false);
    expect(d.events).toHaveLength(1);
    applyImport(d, [course('Math', { id: 'new-id', start: '10:00', end: '11:00' })], GROUP, false);
    expect(d.events[0]).toMatchObject({ id: 'course1', start: '10:00' });
    const copy = structuredClone(d);
    undoImport(copy);
    expect(copy.events[0].start).toBe('09:00');
    d.events[0] = { ...d.events[0], importEdited: true, location: 'My room' };
    const diff = diffImport(d, [course('Math', { location: 'New room' })], GROUP);
    expect(diff.kept).toHaveLength(1);
    expect(diff.updated).toHaveLength(0);
    expect(undoImport(d)).toBe(1); // the later edit is kept
    expect(d.events[0].location).toBe('My room');
  });

  it('keeps cancelled single classes when the timetable is imported again', () => {
    const d = initialData();
    applyImport(d, [course()], GROUP, false);
    d.events[0].exclusions = [MONDAY];
    applyImport(d, [course('Math', { location: 'Room 2' })], GROUP, false);
    expect(d.events[0]).toMatchObject({ location: 'Room 2', exclusions: [MONDAY] });
  });

  it('respects imported classes the student deleted', () => {
    const d = initialData();
    d.timetable.exclusions.push(`${GROUP}:math`);
    const diff = diffImport(d, [course()], GROUP);
    expect(diff.added).toHaveLength(0);
    expect(diff.kept).toHaveLength(1);
  });

  it('leaves data untouched when an import fails', () => {
    const d = initialData();
    d.events = [course()];
    const before = JSON.stringify(d);
    expect(() => applyImport(d, [], GROUP, true)).toThrow();
    expect(() => applyImport(d, [course('Bad', { start: '11:00', end: '10:00', sourceKey: 'bad' })], GROUP, true)).toThrow();
    expect(JSON.stringify(d)).toBe(before);
  });

  it('lists overlapping classes before confirming', () => {
    const d = initialData();
    d.events = [{ ...course('Physics', { id: 'p', sourceKey: undefined, importGroup: undefined, weeks: undefined }) }];
    const conflicts = importConflicts(d, [course('Math', { start: '09:30', end: '10:30' })]);
    expect([conflicts[0].first, conflicts[0].second].sort()).toEqual(['Math', 'Physics']);
  });
});

const calendar = (rows: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Classday Test//EN\r\n${rows}\r\nEND:VCALENDAR`;
const vevent = (fields: string) => `BEGIN:VEVENT\r\n${fields}\r\nEND:VEVENT`;

describe('calendar files', () => {
  it('handles repeats, excluded weeks, moved lessons and time zones', () => {
    const text = calendar(
      vevent('UID:math\r\nSUMMARY:Math\r\nDTSTART;TZID=Asia/Shanghai:20261019T090000\r\nDTEND;TZID=Asia/Shanghai:20261019T100000\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE;TZID=Asia/Shanghai:20261026T090000')
      + '\r\n' + vevent('UID:math\r\nRECURRENCE-ID;TZID=Asia/Shanghai:20261102T090000\r\nSUMMARY:Moved Math\r\nDTSTART;TZID=Asia/Shanghai:20261103T110000\r\nDTEND;TZID=Asia/Shanghai:20261103T120000'),
    );
    const events = parseIcs(text, { from: MONDAY, until: '2026-11-15', group: 'ics-test', timeZone: 'Asia/Shanghai' });
    expect(events).toHaveLength(3);
    expect(events[0].start).toBe('09:00');
    expect(events.some(e => e.date === '2026-11-03' && e.start === '11:00' && e.title === 'Moved Math')).toBe(true);
    expect(events.some(e => e.date === '2026-10-26')).toBe(false);
    expect(events.every(e => normalizeEvent(e))).toBe(true);
    const utc = parseIcs(calendar(vevent('UID:utc\r\nSUMMARY:UTC\r\nDTSTART:20261019T010000Z\r\nDTEND:20261019T020000Z')), { from: MONDAY, until: MONDAY, group: 'ics-test', timeZone: 'Asia/Shanghai' });
    expect(utc[0].start).toBe('09:00');
  });

  it('shows zoned lessons in the device time zone', () => {
    const utc = parseIcs(calendar(vevent('UID:utc\r\nSUMMARY:UTC\r\nDTSTART:20261019T130000Z\r\nDTEND:20261019T140000Z')), { from: MONDAY, until: MONDAY, group: 'g', timeZone: 'Europe/London' });
    expect(utc[0].start).toBe('14:00');
  });

  it('rejects all-day entries, unknown zones, unsupported repeats and bad ranges', () => {
    for (const fields of [
      'DTSTART;VALUE=DATE:20261019\r\nDTEND;VALUE=DATE:20261020',
      'DTSTART;TZID=Unknown/Zone:20261019T090000\r\nDTEND;TZID=Unknown/Zone:20261019T100000',
      'DTSTART:20261019T090000\r\nDTEND:20261019T100000\r\nRRULE:FREQ=SECONDLY',
    ]) expect(() => parseIcs(calendar(vevent(`UID:bad\r\nSUMMARY:Bad\r\n${fields}`)), { from: MONDAY, until: MONDAY, group: 'g' })).toThrow();
    expect(() => parseIcs(calendar(''), { from: MONDAY, until: '2028-01-01', group: 'g' })).toThrow('ics-range');
    expect(() => parseIcs('not a calendar', { from: MONDAY, until: MONDAY, group: 'g' })).toThrow();
  });
});
