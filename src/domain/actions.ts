import { ACCENTS, LANGUAGES, LIMITS, THEMES } from './defaults';
import { noteText } from './notes';
import { periodsInUse, periodsProblem, retimeClasses } from './periods';
import { ProblemError } from './problems';
import { nowIso, uid } from './time';
import type { AccentId, ClassPeriod, DateKey, FixedEvent, Item, LanguageChoice, Note, Notebook, PlannerData, Reminders, Settings, ThemeMode } from './types';

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
}

/** Saves a note's title, body and optional notebook assignment. */
export function saveNote(d: PlannerData, id: string | null, title: string, content: string, notebookId?: string | null): Note {
  const body = noteText(title, content);
  if (!body.trim()) throw new ActionError({ code: 'note-empty' });
  if (body.length > LIMITS.text) throw new ActionError({ code: 'note-too-long' });
  const at = nowIso();
  const resolvedBook = notebookId && d.notebooks.some(b => b.id === notebookId) ? notebookId : undefined;
  if (id) {
    const note = d.notes.find(n => n.id === id);
    if (!note) throw new ActionError({ code: 'note-gone' });
    note.text = body;
    note.updatedAt = at;
    if (notebookId !== undefined) {
      if (resolvedBook) note.notebookId = resolvedBook;
      else delete note.notebookId;
    }
    if (note.notebookId) {
      const book = d.notebooks.find(b => b.id === note.notebookId);
      if (book) book.updatedAt = at;
    }
    return note;
  }
  if (d.notes.length >= LIMITS.notes) throw new ActionError({ code: 'too-many-notes' });
  const note: Note = { id: uid(), text: body, createdAt: at, updatedAt: at, ...(resolvedBook ? { notebookId: resolvedBook } : {}) };
  d.notes.unshift(note);
  d.noteDraft = '';
  if (resolvedBook) {
    const book = d.notebooks.find(b => b.id === resolvedBook);
    if (book) book.updatedAt = at;
  }
  return note;
}

export function deleteNote(d: PlannerData, id: string) {
  d.notes = d.notes.filter(n => n.id !== id);
}

export function moveNote(d: PlannerData, noteId: string, notebookId: string | null): Note {
  const note = d.notes.find(n => n.id === noteId);
  if (!note) throw new ActionError({ code: 'note-gone' });
  const at = nowIso();
  if (notebookId) {
    const book = d.notebooks.find(b => b.id === notebookId);
    if (!book) throw new ActionError({ code: 'notebook-gone' });
    note.notebookId = book.id;
    book.updatedAt = at;
  } else {
    delete note.notebookId;
  }
  note.updatedAt = at;
  return note;
}

export function saveNotebook(d: PlannerData, id: string | null, name: string, color: number): Notebook {
  const trimmed = name.trim().slice(0, LIMITS.notebookName);
  if (!trimmed) throw new ActionError({ code: 'notebook-empty' });
  const safeColor = ((Math.trunc(color) % 10) + 10) % 10;
  const at = nowIso();
  if (id) {
    const book = d.notebooks.find(b => b.id === id);
    if (!book) throw new ActionError({ code: 'notebook-gone' });
    book.name = trimmed;
    book.color = safeColor;
    book.updatedAt = at;
    return book;
  }
  if (d.notebooks.length >= LIMITS.notebooks) throw new ActionError({ code: 'too-many-notebooks' });
  const book: Notebook = { id: uid(), name: trimmed, color: safeColor, createdAt: at, updatedAt: at };
  d.notebooks.unshift(book);
  return book;
}

/** Deletes a notebook and keeps all its notes in Quick notes (uncategorized). */
export function deleteNotebook(d: PlannerData, id: string) {
  const book = d.notebooks.find(b => b.id === id);
  if (!book) throw new ActionError({ code: 'notebook-gone' });
  d.notebooks = d.notebooks.filter(b => b.id !== id);
  for (const note of d.notes) if (note.notebookId === id) delete note.notebookId;
}

export function saveEvent(d: PlannerData, event: FixedEvent) {
  const old = d.events.find(e => e.id === event.id);
  if (!old && d.events.length >= LIMITS.events) throw new ActionError({ code: 'too-many-events' });
  const next = { ...event };
  if (old?.sourceKey) next.importEdited = true;
  // A class given other times no longer follows its periods.
  if (next.periods && (next.allDay || next.start !== old?.start || next.end !== old?.end)) delete next.periods;
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

/** Saves the school's class times and moves the classes linked to them; returns how many moved. */
export function setClassTimes(d: PlannerData, table: ClassPeriod[]): number {
  const problem = periodsProblem(table, periodsInUse(d));
  if (problem) throw new ActionError(problem);
  const semester = d.timetable.semester;
  const moved = retimeClasses(d, semester?.periods ?? [], table);
  const firstMonday = semester?.firstMonday ?? '';
  if (!firstMonday && !table.length) delete d.timetable.semester;
  else d.timetable.semester = { firstMonday, periods: table.map(p => ({ ...p })) };
  return moved;
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
