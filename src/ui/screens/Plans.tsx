import { useState } from 'preact/hooks';
import { useAppState, useStore, useUi } from '../../app/context';
import * as act from '../../domain/actions';
import { moment } from '../../domain/reminders';
import { addDays, dayKey, toClock } from '../../domain/time';
import { GROUP_ORDER, groupOf, isDueSoon, orderTodos, type TodoGroup } from '../../domain/todos';
import type { Item } from '../../domain/types';
import { Button, Empty, IconButton, Segmented } from '../components/controls';
import { Icon } from '../components/Icon';
import { t } from '../../i18n';
import { dueLabel, duration, inlineDay, joinFacts } from '../format';

type Tab = 'todos' | 'done';

/**
 * The to-do list, in Eisenhower order: overdue first (greyed, still waiting to be ticked off),
 * then important and urgent, important, urgent, and the rest. A to-do within 12 hours of its
 * deadline carries a red warning.
 */
export function PlansScreen() {
  const { data, today, minute } = useAppState();
  const ui = useUi();
  const [tab, setTab] = useState<Tab>('todos');
  // The app's clock moves every minute, which keeps the order and warnings current.
  const now = moment(today, toClock(minute));
  const open = orderTodos(data.items, now);
  const since = addDays(today, -30);
  const done = data.items.filter(i => i.status === 'done' && i.doneAt && dayKey(new Date(i.doneAt)) >= since)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  const groups = GROUP_ORDER.map(group => ({ group, items: open.filter(i => groupOf(i, now) === group) })).filter(g => g.items.length);

  return (
    <section class="screen plans" aria-labelledby="plans-title">
      <header class="page-head">
        <div class="page-title">
          <p class="eyebrow">{t.plans.eyebrow}</p>
          <h1 id="plans-title">{t.plans.title}</h1>
        </div>
        <div class="page-actions">
          <IconButton icon="plus" tone="accent" label={t.plans.addTodo} onClick={() => ui.open({ type: 'capture' })} />
        </div>
      </header>
      <Segmented<Tab> label={t.plans.show} size="sm" value={tab} onChange={setTab}
        options={[{ value: 'todos', label: t.plans.todosTab(open.length) }, { value: 'done', label: t.plans.doneTab }]} />

      {tab === 'todos' && (
        open.length === 0
          ? <Empty icon="check" title={t.plans.noTodos} action={<Button variant="soft" icon="plus" onClick={() => ui.open({ type: 'capture' })}>{t.plans.addTodo}</Button>}>{t.plans.tryTyping}</Empty>
          : groups.map(({ group, items }) => <Group key={group} group={group} items={items} now={now} />)
      )}

      {tab === 'done' && (
        done.length === 0
          ? <Empty icon="leaf" title={t.plans.nothingFinished}>{t.plans.finishedHint}</Empty>
          : (
            <section class="panel">
              <h2 class="todo-group-title">{t.plans.last30}<span class="count">{done.length}</span></h2>
              <ul class="plain-list item-list">{done.map(item => <ItemRow item={item} now={now} key={item.id} />)}</ul>
            </section>
          )
      )}
    </section>
  );
}

function Group({ group, items, now }: { group: TodoGroup; items: Item[]; now: Date }) {
  return (
    <section class={`panel todo-group group-${group}`} aria-labelledby={`group-${group}`}>
      <h2 id={`group-${group}`} class="todo-group-title">
        {(group === 'both' || group === 'important') && <span class="flag-important" aria-hidden="true"><Icon name="flag" size={15} /></span>}
        {(group === 'both' || group === 'urgent') && <span class="flag-urgent" aria-hidden="true"><Icon name="timer" size={15} /></span>}
        {t.plans.groups[group]}<span class="count">{items.length}</span>
      </h2>
      <ul class="plain-list item-list">{items.map(item => <ItemRow item={item} now={now} key={item.id} />)}</ul>
    </section>
  );
}

function ItemRow({ item, now }: { item: Item; now: Date }) {
  const { today } = useAppState();
  const store = useStore();
  const ui = useUi();
  const isDone = item.status === 'done';
  const overdue = !isDone && groupOf(item, now) === 'overdue';
  const soon = !isDone && isDueSoon(item, now);
  const meta = isDone
    ? [item.doneAt ? t.plans.doneOn(inlineDay(dayKey(new Date(item.doneAt)), today)) : t.common.done]
    : [item.due && dueLabel(item.due, item.dueTime, today), item.estimate !== null && duration(item.estimate)];
  return (
    <li class={`item-row ${isDone ? 'is-done' : ''} ${overdue ? 'is-overdue' : ''}`}>
      <button type="button" class={`check ${isDone ? 'is-checked' : ''}`}
        aria-label={isDone ? t.plans.reopen(item.title) : t.common.markDone(item.title)}
        onClick={() => isDone
          ? store.act(d => act.reopen(d, item.id), { message: t.common.reopened })
          : store.act(d => act.complete(d, item.id), { message: t.common.doneTitle(item.title) })}>
        <Icon name="check" size={16} />
      </button>
      <button type="button" class="item-main" onClick={() => ui.open({ type: 'item', id: item.id })}>
        <span class="item-title">
          {soon && <span class="due-soon" role="img" aria-label={t.plans.dueSoon}>!</span>}
          {item.title}
        </span>
        <span class="item-meta">{joinFacts(meta)}</span>
      </button>
      {!isDone && (item.important || item.urgent) && (
        <span class="item-flags">
          {item.important && <span class="flag-important" role="img" aria-label={t.todo.important}><Icon name="flag" size={16} /></span>}
          {item.urgent && <span class="flag-urgent" role="img" aria-label={t.todo.urgent}><Icon name="timer" size={16} /></span>}
        </span>
      )}
    </li>
  );
}
