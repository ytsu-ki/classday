import type { NoticeDate, NoticeTime, NoticeVocabulary, Rule } from './notice';

/**
 * Chinese wording for reading a pasted notice or chat message (notice.ts does the reading), e.g.
 * 全体成员，本周三下午2点在报告厅举行年级大会, or 11月5日 14:00-16:00 体育馆羽毛球比赛.
 * The text arrives with full-width digits and punctuation already made half-width.
 */

const NUMERALS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
};
const WEEKDAYS: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

const HOUR = '(\\d{1,2}|十[一二]?|[一二两三四五六七八九])';
const PART = '(上午|早上|早晨|凌晨|中午|下午|傍晚|晚上|晚)';
const WEEKDAY = '([一二三四五六日天])';
/** The minutes after 点: 30, 30分, 半, 一刻, 三刻, 整. */
const MINUTES = '(?:(\\d{1,2})分?|(半)|(一刻)|(三刻)|整)?';
const TO = '\\s*(?:-|~|至|到)\\s*';

const number = (text: string) => (/^\d/.test(text) ? Number(text) : NUMERALS[text] ?? Number.NaN);
const g = (source: string) => new RegExp(source, 'g');
const pair = (a: NoticeTime | null, b: NoticeTime | null): [NoticeTime, NoticeTime] | null => (a && b ? [a, b] : null);

function half(part: string | undefined): NoticeTime['half'] {
  if (!part) return undefined;
  if (part === '中午') return 'noon';
  return ['上午', '早上', '早晨', '凌晨'].includes(part) ? 'am' : 'pm';
}

function minutesOf(m: RegExpExecArray, at: number): number {
  if (m[at + 1]) return 30;
  if (m[at + 2]) return 15;
  if (m[at + 3]) return 45;
  return Number(m[at] ?? 0);
}

function time(part: string | undefined, hour: string, minute: number): NoticeTime | null {
  const h = number(hour);
  return Number.isInteger(h) && h <= 24 && minute <= 59 ? { hour: h, minute, half: half(part) } : null;
}

const ranges: Rule<[NoticeTime, NoticeTime]>[] = [
  // 下午2:00-4:00, 14:00至16:00
  {
    pattern: g(`${PART}?(\\d{1,2}):(\\d{2})${TO}${PART}?(\\d{1,2}):(\\d{2})`),
    read: m => pair(time(m[1], m[2], Number(m[3])), time(m[4], m[5], Number(m[6]))),
  },
  // 下午2点到4点半, 2点30-3点
  {
    pattern: g(`${PART}?${HOUR}(?:点|时)${MINUTES}${TO}${PART}?${HOUR}(?:点|时)${MINUTES}`),
    read: m => pair(time(m[1], m[2], minutesOf(m, 3)), time(m[7], m[8], minutesOf(m, 9))),
  },
  // 下午2-4点
  {
    pattern: g(`${PART}?${HOUR}${TO}${HOUR}(?:点|时)${MINUTES}`),
    read: m => pair(time(m[1], m[2], 0), time(undefined, m[3], minutesOf(m, 4))),
  },
];

const times: Rule<NoticeTime>[] = [
  { pattern: g(`${PART}(\\d{1,2}):(\\d{2})`), read: m => time(m[1], m[2], Number(m[3])) },
  { pattern: g(`${PART}?${HOUR}(?:点|时)${MINUTES}`), read: m => time(m[1], m[2], minutesOf(m, 3)) },
  { pattern: g('中午'), read: () => ({ hour: 12, minute: 0, half: 'noon' }) },
];

const dates: Rule<NoticeDate>[] = [
  { pattern: g('(\\d{4})年(\\d{1,2})月(\\d{1,2})[日号]?'), read: m => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }) },
  { pattern: g('(\\d{1,2})月(\\d{1,2})[日号]?'), read: m => ({ month: Number(m[1]), day: Number(m[2]) }) },
];

const days: Rule<NoticeDate>[] = [
  { pattern: g('(?:今天|今日)'), read: () => ({ offset: 0 }) },
  { pattern: g('今晚'), read: () => ({ offset: 0, evening: true }) },
  { pattern: g('(?:明天|明日)'), read: () => ({ offset: 1 }) },
  { pattern: g('明晚'), read: () => ({ offset: 1, evening: true }) },
  { pattern: g('大后天'), read: () => ({ offset: 3 }) },
  { pattern: g('后天'), read: () => ({ offset: 2 }) },
  { pattern: g(`(?:下周|下星期|下礼拜|下个星期|下个礼拜)${WEEKDAY}`), read: m => ({ weekday: WEEKDAYS[m[1]], week: 'next' }) },
  { pattern: g(`(?:本周|这周|本星期|这星期|这个星期|这礼拜)${WEEKDAY}`), read: m => ({ weekday: WEEKDAYS[m[1]], week: 'this' }) },
  { pattern: g(`(?:周|星期|礼拜)${WEEKDAY}`), read: m => ({ weekday: WEEKDAYS[m[1]], week: 'coming' }) },
];

const durations: Rule<number>[] = [
  { pattern: g('半个?小时'), read: () => 30 },
  { pattern: g(`${HOUR}个?半(?:小时|钟头)`), read: m => number(m[1]) * 60 + 30 },
  { pattern: g('(\\d+(?:\\.\\d+)?|[一二两三四五六七八九十])个?(?:小时|钟头)(?:(\\d{1,2})分钟?)?'), read: m => Math.round(number(m[1]) * 60) + Number(m[2] ?? 0) },
  { pattern: g('(\\d{1,3})分钟'), read: m => Number(m[1]) },
];

/** Verbs that only say an event is held; the title is what follows them. */
const HELD = '举行|举办|召开|开展|进行|组织';
/** Verbs that can be the event itself, kept for the title: 在302开会 → 开会. */
const DOING = '开会|集合|集中|上课|见面|报到|签到|领取|考试';
const STOP = '\\s,;。、!?()';

/**
 * A clause that starts with a place: 体育馆羽毛球比赛, 主楼A101 期中考试. A one-character ending
 * needs two characters before it, so 课堂测验 and 市场营销讲座 stay titles.
 */
const PLACE_WORDS = '报告厅|会议室|教室|实验室|体育馆|图书馆|礼堂|操场|广场|食堂|中心|校区';
const PLACE_ENDS = '楼|馆|厅|室|场|堂';
const ROOM = '(?:[A-Za-z]?\\d{2,4}室?)?';
const places: Rule<string>[] = [
  { pattern: g(`地点[:]\\s*([^\\n,;。]+)`), read: m => m[1] },
  // A place after 在 at the end of a clause: 心理讲座在报告厅.
  {
    pattern: g(`(?<![现正存所实])在\\s*((?:[^${STOP}]{0,10}(?:${PLACE_WORDS}|${PLACE_ENDS})${ROOM})|(?:[^${STOP}]{0,6}[A-Za-z]{0,2}\\d{2,4}室?))(?=[${STOP}]|$)`),
    read: m => m[1],
  },
  // 在报告厅举行年级大会, 于西区操场举办, 到体育馆集合
  {
    pattern: g(`(?:(?<![现正存所实])在|(?<![关对属由等])于|(?<![迟报收达得])到)\\s*([^${STOP}]{1,20}?)\\s*(?=${HELD}|${DOING})(?:${HELD})?`),
    read: m => m[1],
  },
];

const placeHead = new RegExp(
  `^((?:[\\p{Script=Han}A-Za-z0-9-]{0,10}?(?:${PLACE_WORDS})${ROOM})|(?:[\\p{Script=Han}A-Za-z0-9-]{2,10}?(?:${PLACE_ENDS})${ROOM})|(?:\\p{Script=Han}{0,6}[A-Za-z]{1,2}-?\\d{2,4}))\\s*(?=\\S)`,
  'u',
);

export const CHINESE: NoticeVocabulary = {
  ranges,
  times,
  dates,
  days,
  durations,
  places,
  placeHead,
  lead: /^\s*(?:[【[][^】\]]{0,12}[】\]]\s*)?(?:(?:紧急|重要)?通知|公告|提醒|温馨提示)?\s*[:]?\s*/,
  boilerplate: [
    /^@?(?:所有人|全体成员)$/,
    /^(?:各位|全体|亲爱的)?(?:同学们?|成员|老师们?|同仁|家长|学生|党员|团员|小伙伴们?)(?:好|们)?$/,
    /^(?:各位|全体|大家好?|你们好|同学们好?|好)$/,
    /^(?:请|望|务必|敬请)(?:各位|大家|同学们|全体)?(?:同学)?(?:务必|准时|按时|积极|提前)?(?:参加|出席|到场|参与|报名|到达|入场).*$/,
    /^(?:收到请回复.*|收到请回.*|谢谢.*|特此通知|互相转告|相互转告|望周知|请周知)$/,
  ],
  greeting: /^(?:@?所有人|@?全体成员|各位同学|全体同学|同学们|大家好|各位)\s*/,
  joiners: {
    start: new RegExp(`^(?:关于|将于|将|定于|拟于|计划于|于|在|参加|参与|出席|${HELD}|的|是)+`),
    end: new RegExp(`(?:的通知|通知|改到|改在|改为|调整到|调整为|推迟到|提前到|延期到|${HELD}|的|啦|了)+$`),
  },
  weak: /^(?:集合|集中|报到|签到|见面)$/,
};
