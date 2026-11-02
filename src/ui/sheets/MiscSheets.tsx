import { useEffect, useRef, useState } from 'preact/hooks';
import { useAppState, useStore, useUi } from '../../app/context';
import { services } from '../../app/services';
import * as act from '../../domain/actions';
import type { NormalizeReport } from '../../domain/schema';
import { dayKey } from '../../domain/time';
import { Button } from '../components/controls';
import { Sheet } from '../components/Sheet';
import { t } from '../../i18n';
import { inlineDay, shortDate } from '../format';
import { Linkified } from './ItemSheet';

export function NoteSheet({ id }: { id: string | null }) {
  const { data, today } = useAppState();
  const store = useStore();
  const ui = useUi();
  const note = id ? data.notes.find(n => n.id === id) : undefined;
  const [text, setText] = useState(note?.text ?? data.noteDraft);
  const [editing, setEditing] = useState(!note);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (note) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (text !== store.get().data.noteDraft) store.act(d => { d.noteDraft = text; }, { undoable: false });
    }, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [text]);
  if (id && !note) return null;
  const linked = note?.itemId ? data.items.find(i => i.id === note.itemId) : undefined;
  const save = (e?: Event) => {
    e?.preventDefault();
    if (!text.trim()) return setError(t.problems['note-empty']());
    store.act(d => act.saveNote(d, id, text), { message: t.capture.noteSaved });
    ui.close();
  };
  return (
    <Sheet title={note ? t.noteSheet.title : t.noteSheet.newNote} subtitle={note ? t.noteSheet.edited(inlineDay(dayKey(new Date(note.updatedAt)), today)) : t.common.draftsKept}
      onClose={ui.close} footer={editing ? <Button variant="primary" type="submit" form="note-form" class="grow">{t.capture.saveNote}</Button> : undefined}>
      {editing ? (
        <form id="note-form" onSubmit={save}>
          <label class="sr-only" for="note-text">{t.common.note}</label>
          <textarea id="note-text" class="capture-note" data-autofocus rows={8} maxLength={10000} placeholder={t.common.notePlaceholder}
            value={text} onInput={e => { setText((e.target as HTMLTextAreaElement).value); setError(''); }} />
          {error && <p class="field-error" role="alert">{error}</p>}
        </form>
      ) : (
        <>
          <div class="note-body"><Linkified text={note!.text} /></div>
          <div class="action-grid">
            <Button variant="soft" icon="edit" onClick={() => setEditing(true)}>{t.common.edit}</Button>
            {linked ? (
              <Button variant="soft" icon="check" onClick={() => ui.open({ type: 'item', id: linked.id })}>{t.noteSheet.openTodo}</Button>
            ) : (
              <Button variant="soft" icon="check" onClick={() => {
                const item = store.act(d => act.noteToTodo(d, note!.id), { message: t.noteSheet.turnedIntoTodo });
                if (item) ui.open({ type: 'item', id: item.id });
              }}>{t.noteSheet.makeTodo}</Button>
            )}
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

export function ConfirmSheet({ title, message, confirm, danger, onConfirm }: { title: string; message: string; confirm: string; danger?: boolean; onConfirm: () => void }) {
  const ui = useUi();
  return (
    <Sheet title={title} onClose={ui.close} footer={<>
      <Button variant="ghost" onClick={ui.close}>{t.common.cancel}</Button>
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

