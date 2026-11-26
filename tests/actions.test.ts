import { describe, expect, it } from 'vitest';
import * as act from '../src/domain/actions';
import { noteParts } from '../src/domain/notes';
import { data, TODAY, todo, weekly } from './helpers';

describe('to-dos', () => {
  it('are ticked off and opened again without touching anything else', () => {
    const t = todo({ due: TODAY, important: true });
    const d = data({ items: [t] });
    act.complete(d, t.id);
    expect(d.items[0]).toMatchObject({ status: 'done', important: true });
    expect(d.items[0].doneAt).toBeTruthy();
    act.reopen(d, t.id);
    expect(d.items[0].status).toBe('open');
    expect(d.items[0]).not.toHaveProperty('doneAt');
  });

  it('drop a deadline time along with the deadline', () => {
    const t = todo({ due: TODAY, dueTime: '18:00' });
    const d = data({ items: [t] });
    act.updateItem(d, t.id, { due: undefined });
    expect(d.items[0]).not.toHaveProperty('due');
    expect(d.items[0]).not.toHaveProperty('dueTime');
  });

  it('report a to-do that is gone', () => {
    expect(() => act.complete(data(), 'nope')).toThrow(act.ActionError);
  });
});

describe('events', () => {
  it('cancelling one occurrence frees that time only', () => {
    const e = weekly('Calculus', 2, '09:00', '10:40');
    const d = data({ events: [e] });
    act.cancelOccurrence(d, e.id, TODAY);
    expect(d.events[0].exclusions).toEqual([TODAY]);
    act.restoreOccurrence(d, e.id, TODAY);
    expect(d.events[0].exclusions).toEqual([]);
  });

  it('editing an imported class protects it from later imports; deleting remembers the choice', () => {
    const e = weekly('Data Structures', 3, '08:00', '09:40', { sourceKey: 'ds', importGroup: 'njit-2026-3' });
    const d = data({ events: [e] });
    act.saveEvent(d, { ...e, location: 'B105' });
    expect(d.events[0].importEdited).toBe(true);
    act.deleteEvent(d, e.id);
    expect(d.timetable.exclusions).toEqual(['njit-2026-3:ds']);
  });
});

describe('notes and notebooks', () => {
  it('saves, edits, moves notes between notebooks and clears the draft', () => {
    const d = data();
    d.noteDraft = 'draft';
    const bio = act.saveNotebook(d, null, '  Biology  ', 2);
    const chem = act.saveNotebook(d, null, 'Chemistry', 4);
    const note = act.saveNote(d, null, 'Lab prep', 'Bring goggles', bio.id);
    expect(d.noteDraft).toBe('');
    expect(note.notebookId).toBe(bio.id);
    expect(d.notebooks).toHaveLength(2);

    act.moveNote(d, note.id, chem.id);
    expect(d.notes[0].notebookId).toBe(chem.id);
    act.moveNote(d, note.id, null);
    expect(d.notes[0].notebookId).toBeUndefined();
    expect(() => act.saveNote(d, null, '   ', '\n ')).toThrow(act.ActionError);
    expect(() => act.saveNotebook(d, null, '   ', 0)).toThrow(act.ActionError);
    expect(() => act.moveNote(d, note.id, 'missing')).toThrow(act.ActionError);
  });

  it('keeps the title apart from the body, and a note without a title has none', () => {
    const d = data();
    const note = act.saveNote(d, null, '  Club  poster ', '\n\nColours\n  - blue\n\n');
    expect(note.text).toBe('Club poster\nColours\n  - blue');
    expect(noteParts(note.text)).toEqual({ title: 'Club poster', body: 'Colours\n  - blue' });
    const untitled = act.saveNote(d, null, '', 'Buy chalk\nand tape');
    expect(untitled.text).toBe('\nBuy chalk\nand tape');
    expect(noteParts(untitled.text)).toEqual({ title: '', body: 'Buy chalk\nand tape' });
    // Notes from before titles had their own field read the same way: the first line is the title.
    expect(noteParts('Ask about research\nhttps://example.edu/r')).toEqual({ title: 'Ask about research', body: 'https://example.edu/r' });
  });

  it('deleting a notebook preserves its notes safely in Quick notes (uncategorized)', () => {
    const d = data();
    const book = act.saveNotebook(d, null, 'Algorithms', 3);
    act.saveNote(d, null, 'Dynamic programming', 'Memoize subproblems', book.id);
    act.deleteNotebook(d, book.id);
    expect(d.notebooks).toEqual([]);
    expect(d.notes).toHaveLength(1);
    expect(d.notes[0].notebookId).toBeUndefined();
  });
});
