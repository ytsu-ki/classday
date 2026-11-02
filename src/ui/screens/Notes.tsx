import { useState } from 'preact/hooks';
import { useAppState, useUi } from '../../app/context';
import { dayKey } from '../../domain/time';
import { Button, Empty } from '../components/controls';
import { Icon } from '../components/Icon';
import { t } from '../../i18n';
import { relativeDay } from '../format';

export function NotesScreen() {
  const { data, today } = useAppState();
  const ui = useUi();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const notes = q ? data.notes.filter(n => n.text.toLowerCase().includes(q)) : data.notes;
  const items = new Map(data.items.map(i => [i.id, i]));

  return (
    <section class="screen notes" aria-labelledby="notes-title">
      <header class="page-head">
        <div class="page-title">
          <p class="eyebrow">{t.notes.eyebrow}</p>
          <h1 id="notes-title">{t.notes.title}</h1>
        </div>
        <div class="page-actions">
          <Button size="sm" variant="soft" icon="plus" onClick={() => ui.open({ type: 'note', id: null })}>{t.notes.newNote}</Button>
        </div>
      </header>

      {data.noteDraft.trim() && (
        <button type="button" class="draft-row" onClick={() => ui.open({ type: 'note', id: null })}>
          <Icon name="edit" size={18} />
          <span class="grow"><strong>{t.notes.unfinished}</strong><span>{data.noteDraft.slice(0, 80)}</span></span>
          <span class="muted">{t.notes.continue}</span>
        </button>
      )}

      {data.notes.length > 4 && (
        <label class="search">
          <Icon name="search" size={18} />
          <span class="sr-only">{t.notes.search}</span>
          <input type="search" placeholder={t.notes.search} value={query} onInput={e => setQuery((e.target as HTMLInputElement).value)} />
        </label>
      )}

      {!data.notes.length ? (
        <Empty icon="notes" title={t.notes.emptyTitle}
          action={<Button variant="soft" icon="plus" onClick={() => ui.open({ type: 'note', id: null })}>{t.notes.writeNote}</Button>}>
          {t.notes.emptyBody}
        </Empty>
      ) : !notes.length ? (
        <p class="muted center">{t.notes.noMatch(query)}</p>
      ) : (
        <ul class="note-grid">
          {notes.map(n => {
            const [first, ...rest] = n.text.split('\n');
            const linked = n.itemId ? items.get(n.itemId) : undefined;
            return (
              <li key={n.id}>
                <button type="button" class="note-card" onClick={() => ui.open({ type: 'note', id: n.id })}>
                  <strong>{first}</strong>
                  {rest.join(' ').trim() && <span class="note-preview">{rest.join(' ').trim()}</span>}
                  <span class="note-meta">
                    {relativeDay(dayKey(new Date(n.updatedAt)), today)}
                    {linked && <span class="badge"><Icon name="check" size={12} /> {t.notes.todoBadge}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
