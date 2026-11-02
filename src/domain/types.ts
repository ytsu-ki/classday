/** Calendar date in the device time zone, formatted YYYY-MM-DD. */
export type DateKey = string;
/** Wall-clock time, formatted HH:MM (24-hour). */
export type Clock = string;

export type ItemStatus = 'open' | 'done';

/**
 * A to-do: something to finish once. To-dos live in their own list, ordered by importance and
 * urgency; the timetable holds only events. Nothing is placed on the timetable for them.
 */
export interface Item {
  id: string;
  title: string;
  details: string;
  status: ItemStatus;
  createdAt: string;
  doneAt?: string;
  /** About how long it takes, in minutes. */
  estimate: number | null;
  due?: DateKey;
  dueTime?: Clock;
  /** The flag: it matters. */
  important: boolean;
  /** The clock: it can't wait. */
  urgent: boolean;
}

export interface Note {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  /** Set once the note has been turned into a to-do. */
  itemId?: string;
}

/**
 * How long an event goes on: once; short-term, repeating until an end date (an exam week, a
 * course of a few weeks); or long-term, repeating with no planned end (classes, the gym).
 */
export type EventCategory = 'once' | 'short' | 'long';

/** An event on the timetable: a class, a meeting, an exam, a regular activity. */
export interface FixedEvent {
  id: string;
  title: string;
  category: EventCategory;
  start: Clock;
  end: Clock;
  /** Follows the category: `once` for one-off events, `weekly` for the others. */
  repeat: 'once' | 'weekly';
  /** The date of a one-off event. */
  date: DateKey;
  /** 0 = Sunday … 6 = Saturday, for weekly events; the first of `days` when there are several. */
  weekday: number;
  /** Every weekday a repeating event happens on, when more than one (all seven for daily). */
  days?: number[];
  /** Takes the whole day; `start` and `end` are then 00:00 and 23:59. */
  allDay?: boolean;
  /** Minutes before the start to send a reminder; absent for none. */
  remind?: number;
  /** First day a weekly event applies; week numbers count from here. */
  from: DateKey;
  until: DateKey | '';
  parity: 'all' | 'odd' | 'even';
  /** Explicit teaching weeks, counted from `from`. Overrides parity. */
  weeks?: number[];
  exclusions?: DateKey[];
  location?: string;
  teacher?: string;
  /** Present on imported events: identifies the source entry within its import group. */
  sourceKey?: string;
  importGroup?: string;
  /** The student changed an imported event; later imports leave it alone. */
  importEdited?: boolean;
}

/** Remembered from the last timetable import: when week one starts and when each period runs. */
export interface SemesterPreferences {
  firstMonday: DateKey;
  periods: { start: Clock | ''; end: Clock | '' }[];
}

export interface ImportHistory {
  before: FixedEvent[];
  after: FixedEvent[];
  at: string;
}

export interface TimetableState {
  /** `${importGroup}:${sourceKey}` of imported events the student deleted. */
  exclusions: string[];
  lastImport?: ImportHistory;
  semester?: SemesterPreferences;
}

/** The shape of a day on the timetable: when it starts and ends, and the meals in it. */
export interface Settings {
  dayStart: Clock;
  dayEnd: Clock;
  lunch: Clock;
  dinner: Clock;
  mealMinutes: number;
}

/** Classday's indigo, Tuck's eight hues, or the phone's wallpaper colors (Android 12+). */
export type AccentId = 'indigo' | 'violet' | 'orchid' | 'rose' | 'coral' | 'amber' | 'green' | 'teal' | 'blue' | 'wallpaper';

/** Light, dark, or whatever the phone is set to. */
export type ThemeMode = 'system' | 'light' | 'dark';

/** The phone's language, or a fixed one. */
export type LanguageChoice = 'system' | 'en' | 'zh-Hans';

export interface Appearance {
  accent: AccentId;
  theme: ThemeMode;
  language: LanguageChoice;
}

/** Notification reminders before to-do deadlines. Each event sets its own reminder. */
export interface Reminders {
  deadlines: boolean;
  /** How many days before the due date: 0 is the morning of the day itself. */
  deadlineDays: 0 | 1 | 2;
  /** When in the day deadline reminders, and reminders for all-day events, arrive. */
  at: Clock;
  /** The app has asked once whether to allow notifications. */
  asked: boolean;
}

export interface PlannerData {
  schema: 1;
  items: Item[];
  events: FixedEvent[];
  notes: Note[];
  noteDraft: string;
  settings: Settings;
  appearance: Appearance;
  reminders: Reminders;
  timetable: TimetableState;
  meta: {
    createdAt: string;
    updatedAt: string;
  };
}
