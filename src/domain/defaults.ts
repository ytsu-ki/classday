import { nowIso, uid } from './time';
import type { AccentId, Clock, Item, LanguageChoice, PlannerData, Reminders, SemesterPreferences, Settings, ThemeMode } from './types';

/** Accent choices in the order the picker shows them: around the color wheel from the default. */
export const ACCENTS: readonly AccentId[] = ['indigo', 'violet', 'orchid', 'rose', 'coral', 'amber', 'green', 'teal', 'blue', 'wallpaper'];
export const DEFAULT_ACCENT: AccentId = 'indigo';
export const THEMES: readonly ThemeMode[] = ['system', 'light', 'dark'];
export const LANGUAGES: readonly LanguageChoice[] = ['system', 'en', 'zh-Hans'];

/** Period times filled in before a timetable is imported; the student can change any of them. */
export const DEFAULT_PERIODS: readonly { start: Clock; end: Clock }[] = [
  { start: '08:00', end: '08:45' },
  { start: '08:55', end: '09:40' },
  { start: '10:10', end: '10:55' },
  { start: '11:05', end: '11:50' },
  { start: '13:40', end: '14:25' },
  { start: '14:35', end: '15:20' },
  { start: '15:40', end: '16:25' },
  { start: '16:35', end: '17:20' },
  { start: '18:30', end: '19:15' },
  { start: '19:25', end: '20:10' },
  { start: '20:20', end: '21:05' },
  { start: '21:15', end: '22:00' },
];

/** Saved period times, with the defaults wherever a period has none. */
export function withDefaultPeriods(saved: SemesterPreferences['periods'] = []): SemesterPreferences['periods'] {
  return Array.from({ length: Math.max(saved.length, DEFAULT_PERIODS.length) }, (_, i) =>
    saved[i]?.start && saved[i]?.end ? saved[i] : DEFAULT_PERIODS[i] ?? { start: '', end: '' });
}

export function defaultReminders(): Reminders {
  return { deadlines: true, deadlineDays: 1, at: '09:00', asked: false };
}

export const LIMITS = {
  items: 1000,
  events: 2000,
  notes: 2000,
  title: 200,
  text: 10_000,
} as const;

export function defaultSettings(): Settings {
  return {
    dayStart: '08:00',
    dayEnd: '23:00',
    lunch: '12:00',
    dinner: '18:00',
    mealMinutes: 60,
  };
}

export function initialData(): PlannerData {
  const at = nowIso();
  return {
    schema: 1,
    items: [],
    events: [],
    notes: [],
    noteDraft: '',
    settings: defaultSettings(),
    appearance: { accent: DEFAULT_ACCENT, theme: 'system', language: 'system' },
    reminders: defaultReminders(),
    timetable: { exclusions: [] },
    meta: { createdAt: at, updatedAt: at },
  };
}

export function newItem(title: string, extra: Partial<Item> = {}): Item {
  return {
    id: uid(),
    title: title.trim(),
    details: '',
    status: 'open',
    createdAt: nowIso(),
    estimate: null,
    important: false,
    urgent: false,
    ...extra,
  };
}

/** Quick picks for how long a to-do takes; anything else is typed in. */
export const DURATION_PICKS = [30, 60];
