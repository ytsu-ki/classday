import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { useAppState, useStore, useUi } from '../../app/context';
import { services } from '../../app/services';
import * as act from '../../domain/actions';
import { LIMITS } from '../../domain/defaults';
import { noteParts, noteText } from '../../domain/notes';
import type { NormalizeReport } from '../../domain/schema';
import { dayKey } from '../../domain/time';
import { t } from '../../i18n';
import { Button, Field, radioKeys } from '../components/controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { inlineDay, shortDate } from '../format';
import { COURSE_COLORS } from '../weekGrid';
import { Linkified } from './ItemSheet';

const BOOK_COLORS = Array.from({ length: COURSE_COLORS }, (_, i) => i);

export function NoteSheet({ id, notebookId }: { id: string | null; notebookId?: string | null }) {
  const { data, today } = useAppState();
  const store = useStore();
  const ui = useUi();
  const note = id ? data.notes.find(n => n.id === id) : undefined;
  const [parts, setParts] = useState(() => noteParts(note?.text ?? data.noteDraft));
  const [selectedBook, setSelectedBook] = useState<string | null>(() => (note ? (note.notebookId ?? null) : (notebookId ?? null)));
  const [editing, setEditing] = useState(!note);
  const [error, setError] = useState('');
  const body = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What a new note holds right now, kept as the draft until it is saved as a note.
  const latest = useRef(parts);
  latest.current = parts;
  const saved = useRef(false);
  const keepDraft = () => {
    if (id || saved.current) return;
    const draft = noteText(latest.current.title, latest.current.body);
    if (draft !== store.get().data.noteDraft) store.act(d => { d.noteDraft = draft; }, { undoable: false });
  };
  useEffect(() => {
    if (note) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(keepDraft, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [parts]);
  // Closing the sheet before the pause is over still keeps what was typed.
  useEffect(() => keepDraft, []);
  if (id && !note) return null;

  const edit = (patch: Partial<typeof parts>) => { setParts({ ...parts, ...patch }); setError(''); };
  const save = (e?: Event) => {
    e?.preventDefault();
    if (!noteText(parts.title, parts.body)) return setError(t.problems['note-empty']());
    // A note that can't be saved (too long, say) stays open with its text.
    if (!store.act(d => act.saveNote(d, id, parts.title, parts.body, selectedBook), { message: t.capture.noteSaved })) return;
    saved.current = true;
    ui.close();
  };
  const chooseBook = (nextBook: string | null) => {
    setSelectedBook(nextBook);
    if (note && !editing) {
      const targetName = nextBook ? (data.notebooks.find(b => b.id === nextBook)?.name ?? t.notes.quickNotes) : t.notes.quickNotes;
      store.act(d => act.moveNote(d, note.id, nextBook), { message: t.notes.movedTo(targetName) });
    }
  };

  const shown = note && noteParts(note.text);
  const currentBook = note ? (note.notebookId ?? null) : selectedBook;
  const pickerLabel = (
    <div class="notebook-picker" role="group" aria-label={t.noteSheet.notebook}>
      <button type="button" class={`chip chip-book ${currentBook === null ? 'is-selected' : ''}`}
        aria-pressed={currentBook === null} onClick={() => chooseBook(null)}>
        {t.notes.quickNotes}
      </button>
      {data.notebooks.map(book => (
        <button key={book.id} type="button" class={`chip chip-book ${currentBook === book.id ? 'is-selected' : ''}`}
          aria-pressed={currentBook === book.id} onClick={() => chooseBook(book.id)}>
          <span class={`book-dot course-${book.color}`} aria-hidden="true" />
          <span>{book.name}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Sheet title={note ? t.noteSheet.title : t.noteSheet.newNote} subtitle={note ? t.noteSheet.edited(inlineDay(dayKey(new Date(note.updatedAt)), today)) : t.common.draftsKept}
      onClose={ui.close} footer={editing ? <Button variant="primary" type="submit" form="note-form" class="grow">{t.capture.saveNote}</Button> : undefined}>
      {data.notebooks.length > 0 && pickerLabel}
      {editing ? (
        <form id="note-form" class="note-editor" onSubmit={save}>
          <label class="sr-only" for="note-title">{t.noteSheet.noteTitle}</label>
          {/* Enter in the title moves on to the body, as the title is one line. */}
          <input id="note-title" class="note-title-input" data-autofocus maxLength={LIMITS.title} placeholder={t.noteSheet.noteTitle}
            enterKeyHint="next" autoComplete="off" value={parts.title}
            onInput={e => edit({ title: (e.target as HTMLInputElement).value })}
            onKeyDown={e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); body.current?.focus(); } }} />
          <label class="sr-only" for="note-text">{t.common.note}</label>
          <textarea ref={body} id="note-text" class="capture-note note-body-input" rows={8} maxLength={10000} placeholder={t.common.notePlaceholder}
            value={parts.body} onInput={e => edit({ body: (e.target as HTMLTextAreaElement).value })} />
          {error && <p class="field-error" role="alert">{error}</p>}
        </form>
      ) : (
        <>
          <div class="note-body">
            {shown!.title && <h3 class="note-heading"><Linkified inline text={shown!.title} /></h3>}
            {shown!.body && <Linkified text={shown!.body} />}
          </div>
          <div class="action-grid">
            <Button variant="soft" icon="edit" onClick={() => setEditing(true)}>{t.common.edit}</Button>
            <Button variant="danger" icon="trash" onClick={() => {
              store.act(d => act.deleteNote(d, note!.id), { message: t.noteSheet.deleted });
              ui.close();
            }}>{t.common.delete}</Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Create, rename or recolor a notebook. Deleting keeps its notes safely in Quick notes. */
export function NotebookSheet({ id }: { id: string | null }) {
  const { data } = useAppState();
  const store = useStore();
  const ui = useUi();
  const existing = id ? data.notebooks.find(b => b.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState<number>(() => existing?.color ?? (data.notebooks.length % COURSE_COLORS));
  const [error, setError] = useState('');
  const formId = useId();
  if (id && !existing) return null;

  const count = existing ? data.notes.filter(n => n.notebookId === existing.id).length : 0;
  const submit = (e?: Event) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(t.problems['notebook-empty']());
    const ok = store.act(d => act.saveNotebook(d, id, trimmed, color), { message: existing ? t.notes.notebookSaved : t.notes.notebookCreated });
    if (ok) ui.close();
  };

  return (
    <Sheet title={existing ? t.notes.editNotebook : t.notes.newNotebook} onClose={ui.close} footer={
      <>
        {existing && (
          <Button variant="danger" icon="trash" onClick={() => ui.push({
            type: 'confirm', title: t.notes.deleteNotebookTitle, danger: true, confirm: t.common.delete,
            message: t.notes.deleteNotebookMessage(existing.name, count),
            onConfirm: () => store.act(d => act.deleteNotebook(d, existing.id), { message: t.notes.notebookDeleted }),
          })}>{t.common.delete}</Button>
        )}
        <Button variant="primary" type="submit" form={formId} class="grow">{t.common.save}</Button>
      </>
    }>
      <form id={formId} class="form-stack" onSubmit={submit} noValidate>
        <div class={`notebook-preview course-${color}`} aria-hidden="true">
          <strong>{name.trim() || t.notes.notebookNamePlaceholder}</strong>
          <span>{t.notes.notebookCount(count)}</span>
        </div>
        <Field label={t.notes.notebookName} error={error}>
          {fid => <input id={fid} data-autofocus type="text" maxLength={LIMITS.notebookName} placeholder={t.notes.notebookNamePlaceholder}
            value={name} onInput={e => { setName((e.target as HTMLInputElement).value); setError(''); }} />}
        </Field>
        <div class="field">
          <span class="field-label">{t.notes.notebookColor}</span>
          <div class="book-swatches" role="radiogroup" aria-label={t.notes.notebookColor}
            onKeyDown={e => radioKeys(e, BOOK_COLORS, BOOK_COLORS.indexOf(color), setColor)}>
            {BOOK_COLORS.map(c => (
              <button key={c} type="button" role="radio" aria-checked={color === c} tabIndex={color === c ? 0 : -1}
                class={`book-swatch course-${c}`} aria-label={t.notes.colorLabel(c)} onClick={() => setColor(c)}>
                {color === c && <Icon name="check" size={18} />}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Sheet>
  );
}

export function ConfirmSheet({ title, message, confirm, danger, onConfirm }: { title: string; message: string; confirm: string; danger?: boolean; onConfirm: () => void }) {
  const ui = useUi();
  return (
    <Sheet title={title} onClose={ui.pop} footer={<>
      <Button variant="ghost" onClick={ui.pop}>{t.common.cancel}</Button>
      <Button variant={danger ? 'danger' : 'primary'} class="grow" data-autofocus onClick={() => { ui.close(); onConfirm(); }}>{confirm}</Button>
    </>}>
      <p>{message}</p>
    </Sheet>
  );
}

export function RestoreSheet({ report, source }: { report: NormalizeReport; source: string }) {
  const { data, today } = useAppState();
  const store = useStore();
  const ui = useUi();
  const [busy, setBusy] = useState(false);
  const c = { items: report.data.items.length, events: report.data.events.length, notes: report.data.notes.length };
  const restore = async () => {
    setBusy(true);
    try {
      // Keep today's automatic copy as the state from just before the restore.
      await services.backend?.snapshot(JSON.stringify(data), today).catch(() => undefined);
      store.replace(report.data, t.restore.restored);
      ui.close();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={t.restore.title} subtitle={t.restore.from(source)} onClose={ui.close} footer={<>
      <Button variant="ghost" onClick={ui.close}>{t.common.cancel}</Button>
      <Button variant="primary" class="grow" busy={busy} onClick={restore}>{t.restore.replace}</Button>
    </>}>
      <p>{t.restore.holds(c)}{report.dropped ? t.restore.dropped(report.dropped) : ''}</p>
      <p class="muted">{t.restore.replaces}</p>
      {report.data.meta.updatedAt && <p class="field-hint">{t.restore.lastChanged(shortDate(dayKey(new Date(report.data.meta.updatedAt))))}</p>}
    </Sheet>
  );
}
