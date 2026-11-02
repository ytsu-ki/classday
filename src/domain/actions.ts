import { ACCENTS, LANGUAGES, LIMITS, newItem, THEMES } from './defaults';
import { ProblemError } from './problems';
import { nowIso, uid } from './time';
import type { AccentId, DateKey, FixedEvent, Item, LanguageChoice, Note, PlannerData, Reminders, Settings, ThemeMode } from './types';

/**
 * State transitions. Each one mutates a draft copy that the store has already cloned,
 * so the previous version stays available for undo.
 */
export interface Moment { today: DateKey; minute: number }

/** A change the student asked for that can't be made; the store shows its problem and keeps the old data. */
export class ActionError extends ProblemError {}

const findItem = (d: PlannerData, id: string) => {
  const item = d.items.find(i => i.id === id);
  if (!item) throw new ActionError({ code: 'item-gone' });
  return item;
};

export function addItem(d: PlannerData, item: Item): Item {
  if (d.items.length >= LIMITS.items) throw new ActionError({ code: 'too-many-items' });
  d.items.push(item);
  return item;
}

export function updateItem(d: PlannerData, id: string, patch: Partial<Item>): Item {
  const item = findItem(d, id);
  Object.assign(item, patch);
  for (const key of ['due', 'dueTime', 'doneAt'] as const)
    if (item[key] === undefined || item[key] === '') delete item[key];
  if (!item.due) delete item.dueTime;
  return item;
}

/** Tick a to-do off. It moves to Done; an overdue one too, but only when the student says so. */
export function complete(d: PlannerData, id: string) {
  const item = findItem(d, id);
  item.status = 'done';
  item.doneAt = nowIso();
}

export function reopen(d: PlannerData, id: string) {
  const item = findItem(d, id);
  item.status = 'open';
  delete item.doneAt;
}

export function setReminders(d: PlannerData, patch: Partial<Reminders>) {
  d.reminders = { ...d.reminders, ...patch };
}

export function deleteItem(d: PlannerData, id: string) {
  findItem(d, id);
  d.items = d.items.filter(i => i.id !== id);
  for (const note of d.notes) if (note.itemId === id) delete note.itemId;
}

export function saveNote(d: PlannerData, id: string | null, text: string): Note {
  const body = text.trim();
  if (!body) throw new ActionError({ code: 'note-empty' });
  if (body.length > LIMITS.text) throw new ActionError({ code: 'note-too-long' });
  const at = nowIso();
  if (id) {
    const note = d.notes.find(n => n.id === id);
    if (!note) throw new ActionError({ code: 'note-gone' });
    note.text = body;
    note.updatedAt = at;
    return note;
  }
  if (d.notes.length >= LIMITS.notes) throw new ActionError({ code: 'too-many-notes' });
  const note: Note = { id: uid(), text: body, createdAt: at, updatedAt: at };
  d.notes.unshift(note);
  d.noteDraft = '';
  return note;
}

export function deleteNote(d: PlannerData, id: string) {
  d.notes = d.notes.filter(n => n.id !== id);
}

/** Turn a note into a to-do; the whole note becomes its details. */
export function noteToTodo(d: PlannerData, noteId: string): Item {
  const note = d.notes.find(n => n.id === noteId);
  if (!note) throw new ActionError({ code: 'note-gone' });
  const linked = note.itemId && d.items.find(i => i.id === note.itemId);
  if (linked) return linked;
  const firstLine = note.text.trim().split('\n')[0].slice(0, LIMITS.title).trim();
  const item = addItem(d, newItem(firstLine || 'Note', { details: note.text }));
  note.itemId = item.id;
  return item;
}

export function saveEvent(d: PlannerData, event: FixedEvent) {
  const old = d.events.find(e => e.id === event.id);
  if (!old && d.events.length >= LIMITS.events) throw new ActionError({ code: 'too-many-events' });
  const next = { ...event };
  if (old?.sourceKey) next.importEdited = true;
  d.events = old ? d.events.map(e => (e.id === event.id ? next : e)) : [...d.events, next];
}

export function deleteEvent(d: PlannerData, id: string) {
  const event = d.events.find(e => e.id === id);
  if (!event) return;
  if (event.sourceKey && event.importGroup) d.timetable.exclusions.push(`${event.importGroup}:${event.sourceKey}`);
  d.events = d.events.filter(e => e.id !== id);
}

/** "Not happening today": free the time of one occurrence without changing the series. */
export function cancelOccurrence(d: PlannerData, id: string, day: DateKey) {
  const event = d.events.find(e => e.id === id);
  if (!event) throw new ActionError({ code: 'event-gone' });
  if (event.repeat === 'once') return deleteEvent(d, id);
  event.exclusions = [...new Set([...(event.exclusions ?? []), day])].sort();
}

export function restoreOccurrence(d: PlannerData, id: string, day: DateKey) {
  const event = d.events.find(e => e.id === id);
  if (event?.exclusions) event.exclusions = event.exclusions.filter(x => x !== day);
}

export function setSettings(d: PlannerData, settings: Settings) {
  d.settings = settings;
}

export function setAccent(d: PlannerData, accent: AccentId) {
  if (!ACCENTS.includes(accent)) throw new ActionError({ code: 'choice-unknown' });
  d.appearance.accent = accent;
}

export function setTheme(d: PlannerData, theme: ThemeMode) {
  if (!THEMES.includes(theme)) throw new ActionError({ code: 'choice-unknown' });
  d.appearance.theme = theme;
}

export function setLanguage(d: PlannerData, language: LanguageChoice) {
  if (!LANGUAGES.includes(language)) throw new ActionError({ code: 'choice-unknown' });
  d.appearance.language = language;
}
