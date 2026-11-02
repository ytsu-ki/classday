import type { Clock, DateKey } from '../../domain/types';
import { t } from '../../i18n';
import { Chip, DurationPicker, IconButton } from '../components/controls';
import { Icon } from '../components/Icon';
import { clockTime, relativeDay } from '../format';

export interface TodoDraft {
  due?: DateKey;
  dueTime?: Clock;
  estimate: number | null;
  important: boolean;
  urgent: boolean;
}

/** "Tomorrow 18:00", "Thu", "12 Nov": a deadline in a few words. */
export const deadlineText = (due: DateKey, dueTime: Clock | undefined, today: DateKey) =>
  dueTime ? `${relativeDay(due, today)} ${clockTime(dueTime)}` : relativeDay(due, today);

/**
 * A to-do's deadline, time needed, and the two priorities: the flag for important and the
 * clock for urgent. Everything starts unset. The deadline opens a calendar (`onPickDeadline`).
 */
export function TodoFields({ draft, set, onPickDeadline, today }: {
  draft: TodoDraft; set: (patch: Partial<TodoDraft>) => void; onPickDeadline: () => void; today: DateKey;
}) {
  const when = draft.due ? deadlineText(draft.due, draft.dueTime, today) : null;
  return (
    <>
      <fieldset class="group">
        <legend>{t.todo.deadline}</legend>
        <div class="deadline-row">
          <button type="button" class={`chip deadline-chip ${when ? 'is-selected' : ''}`} onClick={onPickDeadline}
            aria-label={when ? t.todo.changeDeadline(when) : t.todo.pickDeadline}>
            <Icon name="calendar" size={16} />
            <span>{when ?? t.todo.noDeadline}</span>
          </button>
          {when && <IconButton icon="close" label={t.todo.clearDeadline} onClick={() => set({ due: undefined, dueTime: undefined })} />}
        </div>
      </fieldset>
      <fieldset class="group">
        <legend>{t.todo.timeNeeded}</legend>
        <DurationPicker label={t.todo.timeNeeded} allowNone value={draft.estimate} onChange={v => set({ estimate: v })} />
      </fieldset>
      <fieldset class="group">
        <legend>{t.todo.priority}</legend>
        <div class="chips">
          <Chip icon="flag" class="toggle-important" selected={draft.important} onClick={() => set({ important: !draft.important })}>{t.todo.important}</Chip>
          <Chip icon="timer" class="toggle-urgent" selected={draft.urgent} onClick={() => set({ urgent: !draft.urgent })}>{t.todo.urgent}</Chip>
        </div>
      </fieldset>
    </>
  );
}
