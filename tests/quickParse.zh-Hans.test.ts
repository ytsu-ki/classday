import { describe, expect, it } from 'vitest';
import { quickParse } from '../src/domain/quickParse';
import { peelChinese } from '../src/domain/quickParse.zh-Hans';

const TODAY = '2026-10-13'; // Tuesday

describe('capture parsing in Chinese', () => {
  it('reads phrases typed without spaces', () => {
    expect(quickParse('实验报告周五2小时', TODAY)).toMatchObject({ title: '实验报告', due: '2026-10-16', minutes: 120 });
    expect(quickParse('背单词20分钟重要', TODAY)).toMatchObject({ title: '背单词', minutes: 20, important: true });
    expect(quickParse('给家里打电话明天晚上7点', TODAY)).toMatchObject({ title: '给家里打电话', due: '2026-10-14', dueTime: '19:00' });
  });

  it('reads the same phrases with spaces, and mixed with English', () => {
    expect(quickParse('实验报告 周五 2小时', TODAY)).toMatchObject({ title: '实验报告', due: '2026-10-16', minutes: 120 });
    expect(quickParse('Essay 周五 2h', TODAY)).toMatchObject({ title: 'Essay', due: '2026-10-16', minutes: 120 });
    expect(quickParse('高数作业 fri 一个半小时', TODAY)).toMatchObject({ title: '高数作业', due: '2026-10-16', minutes: 90 });
  });

  it('reads dates, deadlines and connector words', () => {
    expect(quickParse('交作业下周一前', TODAY)).toMatchObject({ title: '交作业', due: '2026-10-19' });
    expect(quickParse('论文截止11月3日', TODAY)).toMatchObject({ title: '论文', due: '2026-11-03' });
    expect(quickParse('还书后天', TODAY)).toMatchObject({ title: '还书', due: '2026-10-15' });
    expect(quickParse('小组展示大后天', TODAY)).toMatchObject({ title: '小组展示', due: '2026-10-16' });
    expect(quickParse('打扫宿舍周末', TODAY)).toMatchObject({ title: '打扫宿舍', due: '2026-10-18' });
    expect(quickParse('复印资料3天后', TODAY)).toMatchObject({ title: '复印资料', due: '2026-10-16' });
  });

  it('reads times of day, importance and urgency', () => {
    expect(quickParse('项目会议下午3点半', TODAY)).toMatchObject({ title: '项目会议', due: TODAY, dueTime: '15:30' });
    expect(quickParse('交表中午', TODAY)).toMatchObject({ title: '交表', due: TODAY, dueTime: '12:00' });
    expect(quickParse('读书半小时', TODAY)).toMatchObject({ title: '读书', minutes: 30 });
    expect(quickParse('交学费紧急', TODAY)).toMatchObject({ title: '交学费', urgent: true });
    expect(quickParse('交学费 重要 紧急', TODAY)).toMatchObject({ title: '交学费', important: true, urgent: true });
    // Repeats are for events now; in a to-do they stay part of the title.
    expect(quickParse('跑步每周3次', TODAY)).toMatchObject({ title: '跑步每周3次' });
  });

  it('leaves titles alone when nothing is a phrase', () => {
    expect(quickParse('复习周一的笔记', TODAY)).toMatchObject({ title: '复习周一的笔记', tokens: [] });
    expect(quickParse('写周报', TODAY)).toMatchObject({ title: '写周报', tokens: [] });
    expect(quickParse('明天', TODAY)).toMatchObject({ title: '明天', tokens: [] });
    expect(quickParse('第3章 习题', TODAY)).toMatchObject({ title: '第3章 习题', tokens: [] });
  });

  it('keeps a removed phrase in the title exactly as typed', () => {
    const parsed = quickParse('实验报告周五2小时', TODAY, new Set(['due']));
    expect(parsed).toMatchObject({ title: '实验报告周五', minutes: 120 });
    expect(parsed.due).toBeUndefined();
  });

  it('splits phrases only off the end of a word', () => {
    expect(peelChinese('实验报告截止周五')).toEqual(['实验报告', '截止', '周五']);
    expect(peelChinese('大后天')).toEqual(['大后天']);
    expect(peelChinese('我要')).toEqual(['我要']);
    expect(peelChinese('CS101')).toEqual(['CS101']);
  });
});
