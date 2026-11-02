import type { Clock } from './types';

/**
 * Chinese phrases quick capture understands, e.g. 实验报告周五2小时 重要,
 * 给家里打电话明天晚上7点. Chinese has no spaces between words, so phrases are peeled off the end
 * of a word before quickParse reads the line from the end, exactly as it does for English.
 */

export type ChineseDate =
  | { offset: number }
  | { weekday: number; nextWeek: boolean }
  | { month: number; day: number };

export type ChineseMatch =
  | { kind: 'duration'; minutes: number }
  | { kind: 'due'; date: ChineseDate }
  | { kind: 'time'; clock: Clock }
  | { kind: 'important' }
  | { kind: 'urgent' };

/** Words that only connect a title to what follows, as in 实验报告截止周五 or 大约2小时. */
export const CHINESE_CONNECTORS = new Set(['截止', '截至', '在', '于', '约', '大约', '大概', '需要', '要', '用时', '共']);

const NUMERALS: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
const WEEKDAYS: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const NUM = '(\\d+(?:\\.\\d+)?|十[一二]?|[一二两三四五六七八九])';
const WEEKDAY = '([一二三四五六日天])';
const BEFORE = '(?:前|之前|以前|截止)?';

const number = (text: string) => (/^\d/.test(text) ? Number(text) : NUMERALS[text] ?? Number.NaN);
const whole = (pattern: string) => new RegExp(`^${pattern}$`);
const dated = (pattern: string) => new RegExp(`^${pattern}${BEFORE}$`);
const PERIOD = '(上午|早上|早晨|中午|下午|晚上|傍晚|凌晨)';

const PATTERNS = {
  halfHour: whole('半个?小时'),
  hoursAndHalf: whole(`${NUM}个?半(?:小时|钟头)`),
  hours: whole(`${NUM}个?(?:小时|钟头)(?:(\\d+)分钟?)?`),
  minutes: whole('(\\d+)分钟?'),
  today: dated('(?:今天|今晚|今日)'),
  tomorrow: dated('(?:明天|明早|明晚|明日)'),
  inThreeDays: dated('大后天'),
  inTwoDays: dated('后天'),
  thisWeekday: dated(`(?:周|星期|礼拜|这周|本周|这星期|这个星期)${WEEKDAY}`),
  nextWeekday: dated(`(?:下周|下星期|下礼拜|下个星期)${WEEKDAY}`),
  weekend: dated('(?:周末|这周末|本周末)'),
  nextWeek: dated('(?:下周|下周末)'),
  monthDay: dated('(\\d{1,2})月(\\d{1,2})[日号]?'),
  daysLater: whole(`${NUM}天[后以]后?`),
  weeksLater: whole(`${NUM}(?:周|个星期|星期)[后以]后?`),
  clock: whole(`${PERIOD}?${NUM}(?:点|时|：)(?:(\\d{1,2})分?|(半)|整)?`),
  colonClock: whole(`${PERIOD}(\\d{1,2}):(\\d{2})`),
  important: whole('(?:重要|很重要|[!！]{1,3})'),
  urgent: whole('(?:紧急|很急|加急)'),
};
const pad = (n: number) => String(n).padStart(2, '0');

function clock(period: string | undefined, hour: number, minute: number): Clock | null {
  let h = hour;
  if ((period === '下午' || period === '晚上' || period === '傍晚') && h < 12) h += 12;
  if (period === '中午' && h <= 2) h += 12;
  if (period === '凌晨' && h === 12) h = 0;
  if (!Number.isInteger(h) || h > 23 || minute > 59) return null;
  return `${pad(h)}:${pad(minute)}`;
}

/** One whole word read as a phrase, or null. */
export function matchChinese(word: string): ChineseMatch | null {
  const p = PATTERNS;
  let m: RegExpExecArray | null;

  // Durations: 2小时, 1.5小时, 45分钟, 半小时, 一个半小时, 1小时30分
  if (p.halfHour.test(word)) return minutes(30);
  if ((m = p.hoursAndHalf.exec(word))) return minutes(number(m[1]) * 60 + 30);
  if ((m = p.hours.exec(word))) return minutes(number(m[1]) * 60 + Number(m[2] ?? 0));
  if ((m = p.minutes.exec(word))) return minutes(Number(m[1]));

  // Dates, optionally followed by 前 / 之前 / 截止: 今天, 明天, 后天, 周五, 下周一, 周末, 11月3日, 3天后
  if (p.today.test(word)) return due({ offset: 0 });
  if (p.tomorrow.test(word)) return due({ offset: 1 });
  if (p.inThreeDays.test(word)) return due({ offset: 3 });
  if (p.inTwoDays.test(word)) return due({ offset: 2 });
  if ((m = p.thisWeekday.exec(word))) return due({ weekday: WEEKDAYS[m[1]], nextWeek: false });
  if ((m = p.nextWeekday.exec(word))) return due({ weekday: WEEKDAYS[m[1]], nextWeek: true });
  if (p.weekend.test(word)) return due({ weekday: 0, nextWeek: false });
  if (p.nextWeek.test(word)) return due({ weekday: 0, nextWeek: true });
  if ((m = p.monthDay.exec(word))) return due({ month: Number(m[1]), day: Number(m[2]) });
  if ((m = p.daysLater.exec(word))) return offset(number(m[1]));
  if ((m = p.weeksLater.exec(word))) return offset(number(m[1]) * 7);

  // Times: 下午3点, 晚上7点半, 9点, 中午, 早上8:30
  if (word === '中午') return { kind: 'time', clock: '12:00' };
  m = p.clock.exec(word);
  const time = m ? clock(m[1], number(m[2]), m[4] ? 30 : Number(m[3] ?? 0))
    : (m = p.colonClock.exec(word)) ? clock(m[1], Number(m[2]), Number(m[3])) : null;
  if (time) return { kind: 'time', clock: time };

  if (p.important.test(word)) return { kind: 'important' };
  if (p.urgent.test(word)) return { kind: 'urgent' };
  return null;
}

function minutes(value: number): ChineseMatch | null {
  return Number.isFinite(value) ? { kind: 'duration', minutes: Math.round(value) } : null;
}

function due(date: ChineseDate): ChineseMatch {
  return { kind: 'due', date };
}

function offset(days: number): ChineseMatch | null {
  return Number.isInteger(days) ? due({ offset: days }) : null;
}

const HAN = /\p{Script=Han}/u;

/**
 * Splits Chinese phrases off the end of a word: 实验报告截止周五 → 实验报告, 截止, 周五. The longest
 * phrase wins, so 大后天 stays whole; a connector splits off only in front of a phrase. A word
 * with nothing to split, including any word without Chinese, comes back alone.
 */
export function peelChinese(word: string): string[] {
  if (matchChinese(word)) return [word];
  for (let start = 1; start < word.length; start++) {
    const tail = word.slice(start);
    if (HAN.test(tail) && matchChinese(tail)) return [...peelBefore(word.slice(0, start)), tail];
  }
  return [word];
}

function peelBefore(text: string): string[] {
  for (let start = 1; start < text.length; start++) {
    const tail = text.slice(start);
    if (CHINESE_CONNECTORS.has(tail)) return [...peelChinese(text.slice(0, start)), tail];
  }
  return peelChinese(text);
}
