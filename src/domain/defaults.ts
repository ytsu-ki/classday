import { nowIso, uid } from './time';
import type { AccentId, Item, LanguageChoice, PlannerData, Reminders, Settings, ThemeMode } from './types';

/** Accent choices in the order the picker shows them: around the color wheel from the default. */
export const ACCENTS: readonly AccentId[] = ['indigo', 'violet', 'orchid', 'rose', 'coral', 'amber', 'green', 'teal', 'blue', 'wallpaper'];
export const DEFAULT_ACCENT: AccentId = 'indigo';
export const THEMES: readonly ThemeMode[] = ['system', 'light', 'dark'];
export const LANGUAGES: readonly LanguageChoice[] = ['system', 'en', 'zh-Hans'];

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
