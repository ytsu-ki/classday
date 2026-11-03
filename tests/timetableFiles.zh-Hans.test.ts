import { describe, expect, it } from 'vitest';
import { readTimetableFile, type FileTimetable } from '../src/timetable/files';
import { readGrid, type TextItem } from '../src/timetable/grid';
import { periodTimesIn } from '../src/timetable/periodTimes';
import { xlsx } from './zip';

/**
 * Made-up timetables in the layouts Chinese academic systems export: a saved web page (in UTF-8,
 * in GBK, and inside an MHTML file), the same page renamed .xls, an .xlsx with merged cells and
 * times stored as numbers, and an Excel 2003 XML file. Period times sit beside the period numbers.
 */

const DAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const empty = (n: number) => '<td></td>'.repeat(n);

const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>学生课表</title>
<script>document.write('not run')</script></head><body>
<p>2026-2027学年第1学期 张三 20260001</p>
<table class="layout"><tr><td>
<table id="timetable">
<tr><td>时间段</td><td>节次</td>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr>
<tr><td rowspan="4">上午</td><td>第1节<br>08:30-09:15</td>
  <td rowspan="2">高等数学<br>1-16周<br>东A101<br>王老师</td>${empty(1)}
  <td rowspan="2">大学英语<br>1-8周<br>外语楼203<br>Ms. Li<br><br>英语听说<br>9-16周<br>外语楼205<br>Ms. Li</td>${empty(4)}</tr>
<tr><td>第2节<br>09:25-10:10</td>${empty(5)}</tr>
<tr><td>第3节<br>10:30-11:15</td>${empty(1)}
  <td rowspan="2"><div>线性代数</div><div>(3-4节)1-16周/本部/西302/赵老师/线代-0001/考试//理论学时:48/4/48/3.0</div></td>${empty(2)}
  <td rowspan="2">体育(羽毛球)<br>1-16周<br>体育馆</td>${empty(2)}</tr>
<tr><td>第4节<br>11:25-12:10</td>${empty(5)}</tr>
<tr><td rowspan="2">下午</td><td>第5节<br>14:00-14:45</td>${empty(3)}
  <td rowspan="2">大学物理<br>2-17周<br>东C301<br>钱老师</td>${empty(3)}</tr>
<tr><td>第6节<br>14:55-15:40</td>${empty(6)}</tr>
<tr><td colspan="9">实践课程：社会实践(共2周)/1-2周/无;</td></tr>
</table></td></tr></table></body></html>`;

const CLASSES = [
  [1, '高等数学', [1, 2], '1-16', '东A101', '王老师'],
  [3, '大学英语', [1, 2], '1-8', '外语楼203', 'Ms. Li'],
  [3, '英语听说', [1, 2], '9-16', '外语楼205', 'Ms. Li'],
  [2, '线性代数', [3, 4], '1-16', '西302', '赵老师'],
  [5, '体育(羽毛球)', [3, 4], '1-16', '体育馆', undefined],
  [4, '大学物理', [5, 6], '2-17', '东C301', '钱老师'],
];
const TIMES = [
  { start: '08:30', end: '09:15' }, { start: '09:25', end: '10:10' }, { start: '10:30', end: '11:15' },
  { start: '11:25', end: '12:10' }, { start: '14:00', end: '14:45' }, { start: '14:55', end: '15:40' },
];

const range = (text: string) => { const [a, b] = text.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, k) => a + k); };
const sorted = <T extends { weekday: number; title: string }>(list: T[]) => [...list].sort((a, b) => a.weekday - b.weekday || a.title.localeCompare(b.title));

function expectTimetable(result: FileTimetable) {
  if (result.kind !== 'classes') throw new Error('expected classes');
  expect(sorted(result.entries).map(e => [e.weekday, e.title, e.periods, e.weeks, e.location, e.teacher])).toEqual(
    sorted(CLASSES.map(([weekday, title, periods, weeks, location, teacher]) => ({ weekday: weekday as number, title: title as string, periods, weeks: range(weeks as string), location, teacher })))
      .map(c => [c.weekday, c.title, c.periods, c.weeks, c.location, c.teacher]),
  );
  expect(result.skipped).toBe(0);
  expect(result.periods).toEqual(TIMES);
}

const utf8 = (text: string) => new TextEncoder().encode(text);
const file = (bytes: Uint8Array | string) => new Blob([(typeof bytes === 'string' ? utf8(bytes) : bytes) as BlobPart]);
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/** Quoted-printable, as Chrome writes the page inside an MHTML file. */
function quotedPrintable(text: string): string {
  let out = '', line = '';
  for (const byte of utf8(text)) {
    const piece = byte === 10 ? '\r\n' : (byte >= 33 && byte <= 126 && byte !== 61) || byte === 32 ? String.fromCharCode(byte) : `=${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    if (piece === '\r\n') { out += `${line}\r\n`; line = ''; continue; }
    if (line.length + piece.length > 75) { out += `${line}=\r\n`; line = ''; }
    line += piece;
  }
  return out + line;
}

describe('reading a timetable from a saved web page', () => {
  it('finds every class, its periods from the rows it spans, and the period times beside them', async () => {
    expectTimetable(await readTimetableFile(file(PAGE)));
  });

  it('reads the same page saved by Chrome on Android as MHTML', async () => {
    const boundary = '----MultipartBoundary--abc123----';
    const mhtml = [
      'From: <Saved by Blink>', 'Snapshot-Content-Location: https://jw.example.edu/kbcx', 'Subject: =?utf-8?Q?=E8=AF=BE=E8=A1=A8?=',
      'MIME-Version: 1.0', `Content-Type: multipart/related;\r\n\ttype="text/html";\r\n\tboundary="${boundary}"`, '',
      `--${boundary}`, 'Content-Type: text/css', 'Content-Location: https://jw.example.edu/style.css', '', 'td { color: red; }', '',
      `--${boundary}`, 'Content-Type: text/html', 'Content-ID: <frame-1@mhtml.blink>', 'Content-Transfer-Encoding: quoted-printable',
      'Content-Location: https://jw.example.edu/kbcx', '', quotedPrintable(PAGE.replace('<meta charset="utf-8">', '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">')), '',
      `--${boundary}--`, '',
    ].join('\r\n');
    expectTimetable(await readTimetableFile(file(mhtml)));
  });

  it('reads the page renamed .xls, as some systems export it', async () => {
    const exported = PAGE.replace('<html>', '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">');
    expectTimetable(await readTimetableFile(new File([utf8(exported)], 'kb.xls', { type: 'application/vnd.ms-excel' })));
  });

  it('reads pages in GBK, whether or not they say so', async () => {
    const table = fromBase64('PHRhYmxlPjx0cj48dGQ+vdq0zjwvdGQ+PHRkPtDHxtrSuzwvdGQ+PHRkPtDHxtq2/jwvdGQ+PHRkPtDHxtrI/TwvdGQ+PHRkPtDHxtrLxDwvdGQ+PHRkPtDHxtrO5TwvdGQ+PC90cj48dHI+PHRkPrXaMb3aPC90ZD48dGQ+uN+1yMr90ac8YnI+tqtBMTAxPGJyPs31wM/KpjwvdGQ+PHRkPjwvdGQ+PHRkPjwvdGQ+PHRkPjwvdGQ+PHRkPjwvdGQ+PC90cj48L3RhYmxlPg==');
    const declared = new Uint8Array([...utf8('<html><head><meta http-equiv="Content-Type" content="text/html; charset=gbk"></head><body>'), ...table]);
    for (const bytes of [declared, new Uint8Array([...utf8('<html><body>'), ...table])]) {
      const result = await readTimetableFile(file(bytes));
      expect(result.kind === 'classes' && result.entries).toEqual([{ title: '高等数学', weekday: 1, periods: [1, 1], location: '东A101', teacher: '王老师' }]);
    }
  });
});

describe('reading a timetable from Excel', () => {
  const columns = 'ABCDEFGHIJK';
  const strings: string[] = [];
  const s = (text: string) => { if (!strings.includes(text)) strings.push(text); return strings.indexOf(text); };
  const cell = (ref: string, value: string | number) =>
    typeof value === 'number' ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="s"><v>${s(value)}</v></c>`;
  const row = (n: number, cells: Record<string, string | number>) =>
    `<row r="${n}">${Object.entries(cells).map(([col, value]) => cell(`${col}${n}`, value)).join('')}</row>`;
  // Excel keeps a time as a fraction of a day.
  const day = (clock: string) => (Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3))) / 1440;
  const times = (n: number) => ({ C: day(TIMES[n - 1].start), D: day(TIMES[n - 1].end) });
  const sheet = [
    row(1, { A: '2026-2027学年第1学期 学生课表' }),
    row(2, { A: '时间段', B: '节次', C: '开始', D: '结束', ...Object.fromEntries(DAYS.map((d, k) => [columns[4 + k], d])) }),
    row(3, { A: '上午', B: 1, ...times(1), E: '高等数学\n1-16周\n东A101\n王老师', G: '大学英语\n1-8周\n外语楼203\nMs. Li\n\n英语听说\n9-16周\n外语楼205\nMs. Li' }),
    row(4, { B: 2, ...times(2), E: '', G: '' }),
    row(5, { B: 3, ...times(3), F: '线性代数\n(3-4节)1-16周/本部/西302/赵老师/线代-0001/考试//理论学时:48/4/48/3.0', I: '体育(羽毛球)\n1-16周\n体育馆' }),
    row(6, { B: 4, ...times(4) }),
    `<row r="7"><c r="A7" t="inlineStr"><is><t>下午</t></is></c>${cell('B7', 5)}${cell('C7', day('14:00'))}${cell('D7', day('14:45'))}${cell('H7', '大学物理\n2-17周\n东C301\n钱老师')}</row>`,
    row(8, { B: 6, ...times(6) }),
    row(10, { A: '实践课程：社会实践(共2周)/1-2周/无;' }),
  ].join('');
  const merges = ['A1:K1', 'A3:A6', 'E3:E4', 'G3:G4', 'F5:F6', 'I5:I6', 'A7:A8', 'H7:H8', 'A10:K10'];

  it('reads an .xlsx with merged cells and times stored as numbers', async () => {
    expectTimetable(await readTimetableFile(file(xlsx(sheet, strings, merges))));
    expectTimetable(await readTimetableFile(file(xlsx(sheet, strings, merges, { stored: true }))));
  });

  it('reads an Excel 2003 XML file', async () => {
    const data = (text: string) => `<Data ss:Type="String">${text.replace(/\n/g, '&#10;')}</Data>`;
    const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="课表"><Table>
<Row><Cell>${data('节次')}</Cell>${DAYS.map(d => `<Cell>${data(d)}</Cell>`).join('')}</Row>
<Row><Cell>${data('第1节 08:30-09:15')}</Cell><Cell ss:MergeDown="1">${data('高等数学\n1-16周\n东A101\n王老师')}</Cell><Cell ss:Index="4" ss:MergeDown="1">${data('大学英语\n1-8周\n外语楼203\nMs. Li')}</Cell></Row>
<Row><Cell>${data('第2节 09:25-10:10')}</Cell></Row>
</Table></Worksheet></Workbook>`;
    const result = await readTimetableFile(file(xml));
    expect(result.kind === 'classes' && result.entries.map(e => [e.weekday, e.title, e.periods])).toEqual([[1, '高等数学', [1, 2]], [3, '大学英语', [1, 2]]]);
    expect(result.kind === 'classes' && result.periods).toEqual(TIMES.slice(0, 2));
  });
});

describe('period times beside a grid', () => {
  it('pair each period number with the times next to it or below it', () => {
    expect(periodTimesIn(['上午 第一节 8:30-9:15', '第二节 9:25～10:10', '第三节', '10:30', '11:15'])).toEqual(TIMES.slice(0, 3));
    expect(periodTimesIn(['08:30-09:15 1', '09:25-10:10 2'])).toEqual(TIMES.slice(0, 2));
    expect(periodTimesIn(['1-2节 08:30-09:15 09:25-10:10'])).toEqual(TIMES.slice(0, 2));
    expect(periodTimesIn(['第十二节 21:15-22:00'])).toEqual([]);
  });

  it('give none for double periods, times that overlap, or none at all', () => {
    expect(periodTimesIn(['第一大节 08:00-09:40', '第二大节 10:00-11:40'])).toEqual([]);
    expect(periodTimesIn(['1-2节 08:00-09:40'])).toEqual([]);
    expect(periodTimesIn(['1 08:00-08:45', '2 08:30-09:15'])).toEqual([]);
    expect(periodTimesIn(['上午', '1', '2'])).toEqual([]);
  });

  it('are read from the left of a timetable PDF', () => {
    const item = (x: number, y: number, text: string, width = 60): TextItem => ({ x, y, width, text });
    const page = [
      ...DAYS.map((d, k) => item(133 + k * 103.85, 74, d, 36)),
      item(60, 90, '1', 5), item(70, 90, '08:30', 25), item(70, 100, '09:15', 25),
      item(60, 130, '2', 5), item(70, 130, '09:25-10:10', 30),
      item(104, 90, '高等数学'), item(104, 102, '(1-2节)1-16周/本部/东A101/王老师/高数-01/考试//理论学时:64/4/64/4.0', 90),
      item(18, 300, '实践课程：社会实践(共2周)/1-2周/无;', 253),
    ];
    const { entries, labels } = readGrid([page]);
    expect(entries.map(e => e.title)).toEqual(['高等数学']);
    expect(periodTimesIn(labels)).toEqual(TIMES.slice(0, 2));
  });
});
