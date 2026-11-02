import { describe, expect, it } from 'vitest';
import { classesFromGrid, type TextItem } from '../src/timetable/grid';

/**
 * A made-up timetable in the layout of a Chinese academic-system PDF, as pdf.js reports it in
 * page coordinates: weekday headers, cells whose records wrap across lines, a title and student
 * details above the grid, a second page without headers, and notes below the grid.
 */
const COLUMN = (day: number) => 104 + (day - 1) * 103.85;
const item = (x: number, y: number, text: string, width = 90): TextItem => ({ x, y, width, text });
const headers = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'].map((text, k) => item(133 + k * 103.85, 74, text, 36));

const page1: TextItem[] = [
  item(20, 21, '2026-2027学年第1学期'),
  item(361, 50, '张三课表', 120),
  item(703, 42, '学号：20260001', 57),
  item(21, 74, '时间段', 36),
  item(69, 74, '节次', 24),
  ...headers,
  item(78, 89, '1', 5),
  // Monday: a title broken across two lines, a room broken from its building.
  item(COLUMN(1), 89.5, '数字电路与硬件描述语'),
  item(COLUMN(1), 103, '言', 9),
  item(COLUMN(1), 115, '(1-2节)1-4周,7-16周/本部/南'),
  item(COLUMN(1), 127, 'A202/李老师/数字电路-0001/计算机'),
  item(COLUMN(1), 139, '251/考试//理论学时:48/4/64/4.0'),
  // Wednesday: two records in one cell.
  item(COLUMN(3), 89.5, '线性代数A'),
  item(COLUMN(3), 101.5, '(1-2节)第3周/本部/东302/王'),
  item(COLUMN(3), 113.5, '老师/线性代数-0018/计算机251/考试//理论学时:32/3/33/2.0'),
  item(COLUMN(3), 175, '离散数学'),
  item(COLUMN(3), 187, '(3-4节)1-3周,7-15周/本部/西A203/赵老师/离散-0005'),
  item(COLUMN(3), 199, '/考试//理论学时:48/4/48/3.0'),
  // Thursday: a lab with no room yet, the record running to the bottom of the page.
  item(COLUMN(4), 89.5, '大学物理实验'),
  item(COLUMN(4), 101.5, '(1-4节)1周,6周,9周/本部/未排地点/周老师/物理实验-0029/2025/未安排'),
  item(COLUMN(4), 113.5, '//实验学时'),
];

const page2: TextItem[] = [
  // The end of a Thursday record from page one, then a new class in the same column.
  item(COLUMN(4), 28, ':24/2/20/1.0'),
  item(55, 78, '7', 5),
  item(COLUMN(4), 55.5, '飞镖运动-III'),
  item(COLUMN(4), 67.5, '(7-8节)1-4周,7-20周/本部/体育馆A105（多媒体'),
  item(COLUMN(4), 79.5, '）/孙老师/飞镖-0003/2025/未安排//理论学时:36/2/38/0.5'),
  // A make-up class on Sunday.
  item(COLUMN(7), 55.5, '大学物理AⅡ'),
  item(COLUMN(7), 67.5, '(5-6节)第3周/本部/东C301/钱老师/大学物理-0018/考试//理论学时:48/4/48/3.0'),
  // Notes below the grid have no periods and are not classes.
  item(18, 231, '实践课程：社会实践(共2周)/1-2周/无;', 253),
  item(277, 231, '课程设计(共1周)/第17周/无;', 210),
];

describe('reading a timetable PDF grid', () => {
  const entries = classesFromGrid([page1, page2]);

  it('finds every class with its weekday, periods and weeks', () => {
    expect(entries.map(e => [e.weekday, e.title, e.periods, e.weeks])).toEqual([
      [1, '数字电路与硬件描述语言', [1, 2], [1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]],
      [3, '线性代数A', [1, 2], [3]],
      [3, '离散数学', [3, 4], [1, 2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 15]],
      [4, '大学物理实验', [1, 4], [1, 6, 9]],
      [4, '飞镖运动-III', [7, 8], [1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]],
      [0, '大学物理AⅡ', [5, 6], [3]],
    ]);
  });

  it('joins rooms and names broken across lines, and skips placeholders', () => {
    const by = (title: string) => entries.find(e => e.title === title)!;
    expect(by('数字电路与硬件描述语言')).toMatchObject({ location: '南A202', teacher: '李老师' });
    expect(by('线性代数A')).toMatchObject({ location: '东302', teacher: '王老师' });
    expect(by('飞镖运动-III')).toMatchObject({ location: '体育馆A105(多媒体)', teacher: '孙老师' });
    expect(by('大学物理实验').location).toBeUndefined();
    expect(by('大学物理实验').teacher).toBe('周老师');
  });

  it('ignores the title and student details above the grid', () => {
    expect(entries.some(e => /张三|学号/.test(e.title))).toBe(false);
  });
});
