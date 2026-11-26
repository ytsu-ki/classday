import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useAppState, useUi } from '../../app/context';
import { noteParts } from '../../domain/notes';
import { dayKey } from '../../domain/time';
import type { Note, Notebook } from '../../domain/types';
import { t } from '../../i18n';
import { Button, Empty, IconButton } from '../components/controls';
import { Icon } from '../components/Icon';
import { relativeDay } from '../format';

const INBOX = '__inbox__';

export function NotesScreen() {
  const { data, today } = useAppState();
  const ui = useUi();
  const [openBook, setOpenBook] = useState<string | null>(null);
  const [navDir, setNavDir] = useState<'in' | 'out' | ''>('');
  const [query, setQuery] = useState('');

  const activeBook = openBook && openBook !== INBOX ? data.notebooks.find(b => b.id === openBook) : undefined;
  useEffect(() => {
    if (openBook && openBook !== INBOX && !activeBook) setOpenBook(null);
  }, [openBook, activeBook]);

  useEffect(() => {
    if (!openBook) return;
    return ui.registerBack(() => {
      if (ui.sheet) return false;
      setNavDir('out');
      setOpenBook(null);
      return true;
    });
  }, [openBook, ui]);

  const enterBook = (target: string) => {
    setQuery('');
    setNavDir('in');
    setOpenBook(target);
  };
  const leaveBook = () => {
    setQuery('');
    setNavDir('out');
    setOpenBook(null);
  };

  const bookMap = new Map(data.notebooks.map(b => [b.id, b]));
  const uncategorized = data.notes.filter(n => !n.notebookId || !bookMap.has(n.notebookId));
  const q = query.trim().toLowerCase();

  const showOpenBook = openBook === INBOX || Boolean(activeBook);
  if (showOpenBook && openBook) {
    const isInbox = openBook === INBOX;
    const bookNotes = isInbox ? uncategorized : data.notes.filter(n => n.notebookId === openBook);
    const filtered = q ? bookNotes.filter(n => n.text.toLowerCase().includes(q)) : bookNotes;
    const title = isInbox ? t.notes.quickNotes : activeBook!.name;
    return (
      <section key={openBook} class={`screen notes notebook-view ${navDir === 'in' ? 'slide-next' : ''}`} aria-labelledby="notebook-title">
        <header class="page-head">
          <div class="page-title">
            <IconButton class="back-btn" icon="back" label={t.notes.backToShelf} onClick={leaveBook} />
            <div class="grow">
              <p class="eyebrow">{t.notes.title}</p>
              <h1 id="notebook-title" class="notebook-head-title">
                {activeBook && <span class={`book-dot course-${activeBook.color}`} aria-hidden="true" />}
                {title}
              </h1>
            </div>
          </div>
          <div class="page-actions">
            {activeBook && <IconButton icon="edit" label={t.notes.editNotebook} onClick={() => ui.open({ type: 'notebook', id: activeBook.id })} />}
            <Button size="sm" variant="soft" icon="plus" onClick={() => ui.open({ type: 'note', id: null, notebookId: isInbox ? null : openBook })}>{t.notes.newNote}</Button>
          </div>
        </header>

        {bookNotes.length > 3 && (
          <label class="search">
            <Icon name="search" size={18} />
            <span class="sr-only">{t.notes.search}</span>
            <input type="search" placeholder={t.notes.search} value={query} onInput={e => setQuery((e.target as HTMLInputElement).value)} />
          </label>
        )}

        {!bookNotes.length ? (
          <Empty icon="notes" title={t.notes.notebookEmpty}
            action={<Button variant="soft" icon="plus" onClick={() => ui.open({ type: 'note', id: null, notebookId: isInbox ? null : openBook })}>{t.notes.writeNote}</Button>} />
        ) : !filtered.length ? (
          <p class="muted center">{t.notes.noMatch(query)}</p>
        ) : (
          <NoteCards notes={filtered} today={today} onOpen={id => ui.open({ type: 'note', id })} />
        )}
      </section>
    );
  }

  const allFiltered = q ? data.notes.filter(n => n.text.toLowerCase().includes(q)) : data.notes;
  const showSearch = data.notes.length > 4 || (data.notebooks.length > 0 && data.notes.length > 0);
  const showShelf = data.notebooks.length > 0;

  return (
    <section class={`screen notes ${navDir === 'out' ? 'slide-previous' : ''}`} aria-labelledby="notes-title">
      <header class="page-head">
        <div class="page-title">
          <p class="eyebrow">{t.notes.eyebrow}</p>
          <h1 id="notes-title">{t.notes.title}</h1>
        </div>
        <div class="page-actions">
          <Button size="sm" variant="quiet" icon="book" onClick={() => ui.open({ type: 'notebook', id: null })}>{t.notes.newNotebook}</Button>
          <Button size="sm" variant="soft" icon="plus" onClick={() => ui.open({ type: 'note', id: null })}>{t.notes.newNote}</Button>
        </div>
      </header>

      {data.noteDraft.trim() && (
        <button type="button" class="draft-row" onClick={() => ui.open({ type: 'note', id: null })}>
          <Icon name="edit" size={18} />
          <span class="grow"><strong>{t.notes.unfinished}</strong><span>{data.noteDraft.trim().replace(/\s+/g, ' ').slice(0, 80)}</span></span>
          <span class="muted">{t.notes.continue}</span>
        </button>
      )}

      {showSearch && (
        <label class="search">
          <Icon name="search" size={18} />
          <span class="sr-only">{t.notes.search}</span>
          <input type="search" placeholder={t.notes.search} value={query} onInput={e => setQuery((e.target as HTMLInputElement).value)} />
        </label>
      )}

      {q ? (
        allFiltered.length ? (
          <NoteCards notes={allFiltered} today={today} bookMap={bookMap} onOpen={id => ui.open({ type: 'note', id })} />
        ) : (
          <p class="muted center">{t.notes.noMatch(query)}</p>
        )
      ) : !data.notes.length && !data.notebooks.length ? (
        <Empty icon="notes" title={t.notes.emptyTitle}
          action={
            <div class="button-row">
              <Button variant="soft" icon="plus" onClick={() => ui.open({ type: 'note', id: null })}>{t.notes.writeNote}</Button>
              <Button variant="quiet" icon="book" onClick={() => ui.open({ type: 'notebook', id: null })}>{t.notes.newNotebook}</Button>
            </div>
          }>
          {t.notes.emptyBody}
        </Empty>
      ) : showShelf ? (
        <ul class="notebook-shelf">
          {data.notebooks.map((book, idx) => {
            const notesInBook = data.notes.filter(n => n.notebookId === book.id);
            const newest = notesInBook[0];
            const snippet = newest ? (noteParts(newest.text).title || noteParts(newest.text).body.replace(/\s+/g, ' ')) : '';
            return (
              <li key={book.id} style={{ '--i': idx } as JSX.CSSProperties}>
                <button type="button" class={`notebook-card course-${book.color}`} onClick={() => enterBook(book.id)}>
                  <div class="notebook-card-head">
                    <strong>{book.name}</strong>
                    <span class="notebook-count">{t.notes.notebookCount(notesInBook.length)}</span>
                  </div>
                  <span class="notebook-snippet">{snippet || t.notes.notebookEmpty}</span>
                  <span class="notebook-foot">{relativeDay(dayKey(new Date(newest ? newest.updatedAt : book.updatedAt)), today)}</span>
                </button>
              </li>
            );
          })}
          {uncategorized.length > 0 && (
            <li key={INBOX} style={{ '--i': data.notebooks.length } as JSX.CSSProperties}>
              <button type="button" class="notebook-card is-inbox" onClick={() => enterBook(INBOX)}>
                <div class="notebook-card-head">
                  <strong>{t.notes.quickNotes}</strong>
                  <span class="notebook-count">{t.notes.notebookCount(uncategorized.length)}</span>
                </div>
                <span class="notebook-snippet">{noteParts(uncategorized[0].text).title || noteParts(uncategorized[0].text).body.replace(/\s+/g, ' ')}</span>
                <span class="notebook-foot">{relativeDay(dayKey(new Date(uncategorized[0].updatedAt)), today)}</span>
              </button>
            </li>
          )}
          <li key="add-book" style={{ '--i': data.notebooks.length + (uncategorized.length > 0 ? 1 : 0) } as JSX.CSSProperties}>
            <button type="button" class="notebook-card is-new" onClick={() => ui.open({ type: 'notebook', id: null })}>
              <Icon name="plus" size={22} />
              <span>{t.notes.newNotebook}</span>
            </button>
          </li>
        </ul>
      ) : (
        <>
          <button type="button" class="shelf-invite" onClick={() => ui.open({ type: 'notebook', id: null })}>
            <Icon name="book" size={18} />
            <span class="grow">{t.notes.shelfBanner}</span>
            <Icon name="forward" size={16} />
          </button>
          <NoteCards notes={data.notes} today={today} onOpen={id => ui.open({ type: 'note', id })} />
        </>
      )}
    </section>
  );
}

function NoteCards({ notes, today, bookMap, onOpen }: { notes: Note[]; today: string; bookMap?: Map<string, Notebook>; onOpen: (id: string) => void }) {
  return (
    <ul class="note-grid">
      {notes.map((n, idx) => {
        const { title, body } = noteParts(n.text);
        const preview = body.replace(/\s+/g, ' ');
        const book = n.notebookId && bookMap ? bookMap.get(n.notebookId) : undefined;
        return (
          <li key={n.id} style={{ '--i': idx } as JSX.CSSProperties}>
            <button type="button" class="note-card" onClick={() => onOpen(n.id)}>
              {title && <strong>{title}</strong>}
              {preview && <span class={`note-preview ${title ? '' : 'is-untitled'}`}>{preview}</span>}
              <span class="note-meta">
                <span>{relativeDay(dayKey(new Date(n.updatedAt)), today)}</span>
                {book && <span class={`badge badge-book course-${book.color}`}>{book.name}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
