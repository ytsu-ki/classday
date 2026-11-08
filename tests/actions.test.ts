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

describe('notes', () => {
  it('saves, edits and turns a note into a to-do once', () => {
    const d = data();
    d.noteDraft = 'draft';
    const note = act.saveNote(d, null, 'Ask about research', 'https://example.edu/r');
    expect(d.noteDraft).toBe('');
    const item = act.noteToTodo(d, note.id);
    expect(item).toMatchObject({ title: 'Ask about research', estimate: null, important: false, urgent: false });
    expect(item.details).toContain('https://example.edu/r');
    expect(act.noteToTodo(d, note.id).id).toBe(item.id);
    expect(d.items).toHaveLength(1);
    expect(() => act.saveNote(d, null, '   ', '\n ')).toThrow(act.ActionError);
  });

  it('keeps the title apart from the body, and a note without a title has none', () => {
    const d = data();
    const note = act.saveNote(d, null, '  Club  poster ', '\n\nColours\n  - blue\n\n');
    expect(note.text).toBe('Club poster\nColours\n  - blue');
    expect(noteParts(note.text)).toEqual({ title: 'Club poster', body: 'Colours\n  - blue' });
    const untitled = act.saveNote(d, null, '', 'Buy chalk\nand tape');
    expect(untitled.text).toBe('\nBuy chalk\nand tape');
    expect(noteParts(untitled.text)).toEqual({ title: '', body: 'Buy chalk\nand tape' });
    expect(act.noteToTodo(d, untitled.id)).toMatchObject({ title: 'Buy chalk', details: 'Buy chalk\nand tape' });
    // Notes from before titles had their own field read the same way: the first line is the title.
    expect(noteParts('Ask about research\nhttps://example.edu/r')).toEqual({ title: 'Ask about research', body: 'https://example.edu/r' });
  });

  it('deleting a to-do unlinks its note instead of deleting it', () => {
    const d = data();
    const note = act.saveNote(d, null, 'Idea', '');
    const item = act.noteToTodo(d, note.id);
    act.deleteItem(d, item.id);
    expect(d.notes[0].itemId).toBeUndefined();
  });
});
