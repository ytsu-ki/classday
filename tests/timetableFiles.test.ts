import { describe, expect, it } from 'vitest';
import { FILE_MAX_BYTES, fileKind, readTimetableFile } from '../src/timetable/files';
import { periodTimesIn } from '../src/timetable/periodTimes';
import { zip } from './zip';

const utf8 = (text: string) => new TextEncoder().encode(text);
const file = (bytes: Uint8Array | string) => new Blob([(typeof bytes === 'string' ? utf8(bytes) : bytes) as BlobPart]);
const problem = (promise: Promise<unknown>) => promise.then(() => 'read', (e: { problem?: { code: string } }) => e.problem?.code ?? String(e));

describe('telling files apart', () => {
  it('goes by what a file holds, not its name', () => {
    expect(fileKind(utf8('%PDF-1.7\n'))).toBe('pdf');
    expect(fileKind(utf8('﻿BEGIN:VCALENDAR\r\nVERSION:2.0'))).toBe('calendar');
    expect(fileKind(zip({ 'xl/workbook.xml': '<workbook/>' }))).toBe('xlsx');
    expect(fileKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))).toBe('old-excel');
    expect(fileKind(utf8('From: <Saved by Blink>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="b"'))).toBe('mhtml');
    expect(fileKind(utf8('<?xml version="1.0"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">'))).toBe('excel-xml');
    expect(fileKind(utf8('<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table>'))).toBe('html');
    expect(fileKind(utf8('Calculus, Mon 08:00-09:40'))).toBe('text');
  });

  it('asks for an older binary Excel file to be saved as .xlsx', async () => {
    expect(await problem(readTimetableFile(file(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(600).fill(0)]))))).toBe('file-old-excel');
  });

  it('turns away files that aren’t timetables, or are too large', async () => {
    expect(await problem(readTimetableFile(file(zip({ 'word/document.xml': '<w:document/>' }))))).toBe('file-unknown');
    expect(await problem(readTimetableFile(file(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0xff, 0xfe]))))).toBe('file-unknown');
    expect(await problem(readTimetableFile(new Blob([new Uint8Array(FILE_MAX_BYTES + 1)])))).toBe('file-too-large');
  });

  it('stops unpacking a spreadsheet part that grows far past its size', async () => {
    // The sheet claims 100 bytes but inflates to 21 MB of spaces.
    const bomb = zip({
      'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': ' '.repeat(21 * 1024 * 1024),
    }, { sizes: { 'xl/worksheets/sheet1.xml': 100 } });
    expect(await problem(readTimetableFile(file(bomb)))).toBe('file-unreadable');
  });

  it('refuses spreadsheet XML that declares entities', async () => {
    const xml = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet/></Workbook>';
    expect(await problem(readTimetableFile(file(xml)))).toBe('file-unreadable');
  });
});

describe('reading tables in English', () => {
  it('reads a weekday grid with period labels and times', async () => {
    const page = `<html><body><table>
      <tr><th></th><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
      <tr><td>Period 1<br>8:00 – 8:50</td><td rowspan="2">Calculus<br>Room A101<br>Dr. Wang</td><td></td><td></td><td></td><td></td></tr>
      <tr><td>Period 2<br>9:00 – 9:50</td><td>Physics<br>weeks 1-8<br>B204</td><td></td><td></td><td></td></tr>
    </table></body></html>`;
    const result = await readTimetableFile(file(page));
    expect(result.kind === 'classes' && result.entries).toEqual([
      { title: 'Calculus', weekday: 1, periods: [1, 2], location: 'A101', teacher: 'Dr. Wang' },
      { title: 'Physics', weekday: 2, periods: [2, 2], weeks: [1, 2, 3, 4, 5, 6, 7, 8], location: 'B204' },
    ]);
    expect(result.kind === 'classes' && result.periods).toEqual([{ start: '08:00', end: '08:50' }, { start: '09:00', end: '09:50' }]);
  });

  it('reads a table of one class per row, and a plain text file', async () => {
    const list = `<table><tr><td>Course</td><td>Day</td><td>Time</td><td>Room</td></tr>
      <tr><td>Calculus</td><td>Mon</td><td>08:00-09:40</td><td>A101</td></tr>
      <tr><td>Physics</td><td>Wed</td><td>periods 3-4</td><td>B204</td></tr></table>`;
    const result = await readTimetableFile(file(list));
    expect(result.kind === 'classes' && result.entries.map(e => [e.title, e.weekday, e.start ?? e.periods, e.location])).toEqual([
      ['Calculus', 1, '08:00', 'A101'], ['Physics', 3, [3, 4], 'B204'],
    ]);
    expect(result.kind === 'classes' && result.skipped).toBe(1);
    const text = await readTimetableFile(file('Calculus, Mon 08:00-09:40, Room A101'));
    expect(text.kind === 'classes' && text.entries[0]).toMatchObject({ title: 'Calculus', start: '08:00', end: '09:40' });
  });

  it('give no times when a timetable doesn’t start at period 1', () => {
    expect(periodTimesIn(['Period 3 10:00-10:45', 'Period 4 10:55-11:40'])).toEqual([]);
    expect(periodTimesIn(['Period 1 8:00-8:45', 'Period 3 10:00-10:45'])).toEqual([{ start: '08:00', end: '08:45' }]);
  });
});
