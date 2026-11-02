import { describe, expect, it } from 'vitest';
import { parseNotice } from '../src/domain/notice';
import { TODAY } from './helpers';

// TODAY is Tuesday 13 October 2026.
const read = (text: string) => parseNotice(text, TODAY);

describe('reading a pasted notice in Chinese', () => {
  it('takes the event out of a group announcement', () => {
    expect(read('全体成员，本周三下午2点在报告厅举行年级大会')).toEqual({
      title: '年级大会', date: '2026-10-14', start: '14:00', location: '报告厅', found: ['date', 'time', 'place'],
    });
  });

  it('reads a date, a time range and a place written in front of the title', () => {
    expect(read('11月5日 14:00-16:00 体育馆羽毛球比赛')).toMatchObject({
      title: '羽毛球比赛', date: '2026-11-05', start: '14:00', end: '16:00', location: '体育馆',
    });
  });

  it('drops the heading, greeting and sign-off of a longer notice', () => {
    expect(read('通知：各位同学，11月5日（周三）下午2:00-4:00在西区操场举行运动会开幕式，请准时参加。')).toMatchObject({
      title: '运动会开幕式', date: '2026-11-05', start: '14:00', end: '16:00', location: '西区操场',
    });
  });

  it('keeps a verb that is the event itself, and reads a length', () => {
    expect(read('明天下午3点在主楼A101开会1小时')).toMatchObject({
      title: '开会', date: '2026-10-14', start: '15:00', minutes: 60, location: '主楼A101',
    });
  });

  it('understands next week, evenings, half hours and a written-out place', () => {
    expect(read('下周一晚上7点半 图书馆讲座')).toMatchObject({ title: '讲座', date: '2026-10-19', start: '19:30', location: '图书馆' });
    expect(read('【提醒】今晚7点班会，地点：三教302')).toMatchObject({ title: '班会', date: '2026-10-13', start: '19:00', location: '三教302' });
  });

  it('reads an unmarked 2 o’clock as the afternoon and an end without its own 下午', () => {
    expect(read('周五2点30分 班会')).toMatchObject({ title: '班会', date: '2026-10-16', start: '14:30' });
    expect(read('@所有人 下午2-4点 实验室安全培训，在实验楼B201集中')).toMatchObject({
      title: '实验室安全培训', start: '14:00', end: '16:00', location: '实验楼B201',
    });
    expect(read('上午10点到12点 志愿者培训')).toMatchObject({ start: '10:00', end: '12:00' });
  });

  it('keeps titles that only look like places, and reads 关于…的通知 headings', () => {
    expect(read('课堂测验 周四上午10点')).toMatchObject({ title: '课堂测验', date: '2026-10-15', start: '10:00' });
    expect(read('关于举办秋季运动会的通知')).toMatchObject({ title: '秋季运动会' });
    expect(read('关于期末考试安排')).not.toHaveProperty('location');
  });

  it('leaves out what it cannot find', () => {
    expect(read('读书分享会')).toEqual({ title: '读书分享会', found: [] });
  });
});
