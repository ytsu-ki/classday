import { useState } from 'preact/hooks';
import { useAppState, useStore, useUi } from '../../app/context';
import * as act from '../../domain/actions';
import type { Item } from '../../domain/types';
import { Button, Field } from '../components/controls';
import { useDatePage } from '../components/DatePage';
import { Sheet } from '../components/Sheet';
import { t } from '../../i18n';
import { dayKey } from '../../domain/time';
import { inlineDay, linkParts } from '../format';
import { TodoFields, type TodoDraft } from './TodoFields';

export function Linkified({ text }: { text: string }) {
  return (
    <p class="linkified">
      {linkParts(text).map(p => (p.href ? <a href={p.href} target="_blank" rel="noopener noreferrer">{p.text}</a> : p.text))}
    </p>
  );
}

/** One to-do: change it, tick it off or open it again, or delete it. */
export function ItemSheet({ id }: { id: string }) {
  const { data, today } = useAppState();
  const store = useStore();
  const ui = useUi();
  const original = data.items.find(i => i.id === id);
  const [draft, setDraft] = useState<Item | null>(original ? { ...original } : null);
  const [error, setError] = useState('');
  const dates = useDatePage(today);
  if (!original || !draft) return null;
  const set = (patch: Partial<Item>) => { setError(''); setDraft({ ...draft, ...patch }); };
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  const save = (e?: Event) => {
    e?.preventDefault();
    const title = draft.title.trim();
    if (!title) return setError(t.common.giveName);
    store.act(d => act.updateItem(d, id, { ...draft, title }), { message: t.item.saved });
    ui.close();
  };

  const page = dates.page;
  return (
    <Sheet title={page?.title ?? t.common.kinds.todo}
      subtitle={page ? undefined : original.status === 'done' && original.doneAt ? t.plans.doneOn(inlineDay(dayKey(new Date(original.doneAt)), today)) : undefined}
      onClose={page?.onClose ?? ui.close} footer={page?.footer ?? (
        dirty ? (
          <>
            <Button variant="ghost" onClick={() => setDraft({ ...original })}>{t.common.discard}</Button>
            <Button variant="primary" type="submit" form="item-form" class="grow">{t.common.saveChanges}</Button>
          </>
        ) : original.status === 'open' ? (
          <Button variant="primary" icon="check" class="grow" onClick={() => {
            store.act(d => act.complete(d, id), { message: t.common.doneTitle(original.title) });
            ui.close();
          }}>{t.item.markDone}</Button>
        ) : (
          <Button variant="soft" class="grow" onClick={() => {
            store.act(d => act.reopen(d, id), { message: t.common.reopened });
            ui.close();
          }}>{t.item.reopen}</Button>
        )
      )}>
      {page?.body ?? (
        <form id="item-form" class="form-stack" onSubmit={save} noValidate>
          <Field label={t.common.name}>{fid => <input id={fid} type="text" value={draft.title} maxLength={200} onInput={e => set({ title: (e.target as HTMLInputElement).value })} />}</Field>
          <TodoFields draft={draft as TodoDraft} set={patch => set(patch)} today={today} onPickDeadline={() => dates.open({
            title: t.todo.deadline, date: draft.due ?? null, time: draft.dueTime, withTime: true,
            done: (due, dueTime) => set({ due, dueTime }),
          })} />
          <Field label={t.common.details}>{fid => <textarea id={fid} rows={3} maxLength={10000} placeholder={t.common.detailsPlaceholder} value={draft.details} onInput={e => set({ details: (e.target as HTMLTextAreaElement).value })} />}</Field>
          {draft.details && /https?:\/\//.test(draft.details) && <Linkified text={draft.details} />}
          {error && <p class="field-error" role="alert">{error}</p>}
          <div class="status-actions">
            <Button size="sm" variant="danger" icon="trash" onClick={() => ui.open({
              type: 'confirm', title: t.item.deleteTitle, danger: true, confirm: t.common.delete,
              message: t.item.deleteMessage(original.title),
              onConfirm: () => store.act(d => act.deleteItem(d, id), { message: t.item.deleted }),
            })}>{t.common.delete}</Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
