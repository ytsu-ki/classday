import { useMemo, useState } from 'preact/hooks';
import { useAppState, useStore, useUi } from '../../app/context';
import * as act from '../../domain/actions';
import { newItem } from '../../domain/defaults';
import { quickParse, type TokenKind } from '../../domain/quickParse';
import type { DateKey } from '../../domain/types';
import { Button, Chip } from '../components/controls';
import { useDatePage } from '../components/DatePage';
import { Sheet } from '../components/Sheet';
import { t } from '../../i18n';
import { clockTime, dueLabel, duration } from '../format';
import { TodoFields, type TodoDraft } from './TodoFields';

/**
 * Add a to-do: one line, with what it says about the deadline, time needed and priority shown as
 * chips (see quickParse); the fields below start unset and can say the same or more.
 */
export function CaptureSheet({ due: initialDue }: { due?: DateKey }) {
  const { today } = useAppState();
  const store = useStore();
  const ui = useUi();
  const [text, setText] = useState('');
  const [ignore, setIgnore] = useState<Set<TokenKind>>(new Set());
  const [chosen, setChosen] = useState<Partial<TodoDraft>>(initialDue ? { due: initialDue } : {});
  const [details, setDetails] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState('');
  const dates = useDatePage(today);

  const parsed = useMemo(() => quickParse(text, today, ignore), [text, today, ignore]);
  // What was chosen below wins over what the line says.
  const draft: TodoDraft = {
    due: 'due' in chosen ? chosen.due : parsed.due,
    dueTime: 'due' in chosen ? chosen.dueTime : parsed.dueTime,
    estimate: 'estimate' in chosen ? chosen.estimate ?? null : parsed.minutes ?? null,
    important: chosen.important ?? parsed.important ?? false,
    urgent: chosen.urgent ?? parsed.urgent ?? false,
  };
  const set = (patch: Partial<TodoDraft>) => { setChosen({ ...chosen, ...patch }); setError(''); };

  const removeToken = (k: TokenKind) => {
    setIgnore(new Set([...ignore, k]));
    const next = { ...chosen };
    if (k === 'due' || k === 'time') { delete next.due; delete next.dueTime; }
    if (k === 'duration') delete next.estimate;
    if (k === 'important') delete next.important;
    if (k === 'urgent') delete next.urgent;
    setChosen(next);
  };

  const submit = (e?: Event) => {
    e?.preventDefault();
    const title = parsed.title.trim();
    if (!title) { setError(t.common.giveName); return; }
    if (title.length > 200) { setError(t.capture.nameTooLong); return; }
    const item = newItem(title, {
      details, estimate: draft.estimate, important: draft.important, urgent: draft.urgent,
      ...(draft.due ? { due: draft.due } : {}), ...(draft.due && draft.dueTime ? { dueTime: draft.dueTime } : {}),
    });
    store.act(d => act.addItem(d, item), { message: t.capture.added });
    ui.close();
  };

  const tokenLabel = (k: TokenKind, raw: string) => {
    if (k === 'due' && parsed.due) return dueLabel(parsed.due, undefined, today);
    if (k === 'time' && parsed.dueTime) return t.capture.atTime(clockTime(parsed.dueTime));
    if (k === 'duration' && parsed.minutes) return duration(parsed.minutes);
    if (k === 'important') return t.todo.important;
    if (k === 'urgent') return t.todo.urgent;
    return raw;
  };

  const page = dates.page;
  return (
    <Sheet title={page?.title ?? t.capture.title} onClose={page?.onClose ?? ui.close} footer={page?.footer ?? (
      <Button variant="primary" type="submit" form="capture-form" class="grow">{t.capture.addTodo}</Button>
    )}>
      {page?.body ?? (
        <form id="capture-form" class="capture" onSubmit={submit} noValidate>
          <label class="sr-only" for="capture-title">{t.common.kinds.todo}</label>
          <input id="capture-title" class="capture-input" data-autofocus type="text" autocomplete="off" enterkeyhint="done"
            placeholder={t.capture.todoPlaceholder} value={text} maxLength={400}
            onInput={e => { setText((e.target as HTMLInputElement).value); setError(''); }} />
          {parsed.tokens.length > 0 && (
            <div class="chips understood" aria-label={t.capture.understood}>
              {parsed.tokens.map(token => (
                <Chip tone="removable" onClick={() => removeToken(token.kind)} label={t.capture.removeToken(tokenLabel(token.kind, token.text))}>{tokenLabel(token.kind, token.text)}</Chip>
              ))}
            </div>
          )}

          <TodoFields draft={draft} set={set} today={today} onPickDeadline={() => dates.open({
            title: t.todo.deadline, date: draft.due ?? null, time: draft.dueTime, withTime: true, min: today,
            done: (due, dueTime) => set({ due, dueTime }),
          })} />

          {showDetails ? (
            <div class="field">
              <label for="capture-details">{t.common.details}</label>
              <textarea id="capture-details" rows={3} maxLength={10000} placeholder={t.common.detailsPlaceholder} value={details}
                onInput={e => setDetails((e.target as HTMLTextAreaElement).value)} />
            </div>
          ) : (
            <button type="button" class="link-btn" onClick={() => setShowDetails(true)}>{t.capture.addDetails}</button>
          )}

          {error && <p class="field-error" role="alert">{error}</p>}
        </form>
      )}
    </Sheet>
  );
}
