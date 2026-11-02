/**
 * Chinese words found in timetables, for the text and PDF readers (text.ts, grid.ts). Chinese
 * lives only in *.zh-Hans.* files; these are pattern fragments, not interface text.
 */
export const ZH = {
  /** 星期一, 周一, 礼拜一 … 星期日 / 星期天. */
  weekdayPrefix: '(?:星期|周|礼拜)',
  weekdayDigits: { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 } as Record<string, number>,
  /** Period and week markers: (1-2节), 第3周, 1-16周(单). */
  period: '节',
  week: '周',
  ordinal: '第',
  /** Words between two times or periods: 8:00至9:40. */
  to: '至',
  /** Labelled fields in pasted text: 地点：A101, 教师：王老师. */
  locationLabel: '(?:上课地点|地点|教室|场地)',
  teacherLabel: '(?:任课教师|授课教师|教师|老师)',
  /** A name ending in one of these is a teacher: 王老师, 李教授. */
  teacherSuffix: '(?:老师|教授)',
  /** Placeholders meaning there is no room yet. */
  noLocation: ['未排地点', '无', '待定', '未安排'],
  /** Words that mark a room or building. */
  roomHint: '(?:楼|室|馆|厅|机房|实验|中心)',
  /** Full-width punctuation, read as its ASCII counterpart. */
  fullWidth: { '（': '(', '）': ')', '，': ',', '、': ',', '：': ':', '；': ';', '～': '~', '－': '-', '—': '-', '–': '-' } as Record<string, string>,
};
