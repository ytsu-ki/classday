import { useAppState, useStore, useUi } from '../../app/context';
import { daysOf, occurs } from '../../domain/schedule';
import { dayKey, toMinutes } from '../../domain/time';
import type { FixedEvent } from '../../domain/types';
import { undoImport } from '../../timetable/merge';
import { formatRanges } from '../../timetable/weeks';
import { Button, Empty, IconButton, SectionTitle } from '../components/controls';
import { t } from '../../i18n';
import { clockTime, joinFacts, shortDate } from '../format';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

function repeatText(e: FixedEvent) {
  const kind = t.event.categories[e.category];
  if (e.weeks) return joinFacts([kind, t.timetable.weeks(formatRanges(e.weeks, t.format.parityRange))]);
  if (e.parity !== 'all') return joinFacts([kind, e.parity === 'odd' ? t.timetable.oddWeeks : t.timetable.evenWeeks]);
  return joinFacts([kind, e.until && t.timetable.until(shortDate(e.until))]);
}

export function TimetableScreen() {
  const { data, today } = useAppState();
  const store = useStore();
  const ui = useUi();
  const weekly = data.events.filter(e => e.repeat === 'weekly' && (!e.until || e.until >= today));
  const once = data.events.filter(e => e.repeat === 'once' && e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const ended = data.events.length - weekly.length - once.length;
  const history = data.timetable.lastImport;


  return (
    <section class="screen timetable" aria-labelledby="timetable-title">
      <header class="page-head">
        <div class="page-title">
          <IconButton icon="back" label={t.timetable.backToSettings} onClick={() => ui.go('settings')} class="back-btn" />
          <div>
            <p class="eyebrow">{t.timetable.eyebrow}</p>
            <h1 id="timetable-title">{t.timetable.title}</h1>
          </div>
        </div>
      </header>

      <div class="button-row">
        <Button variant="primary" icon="download" onClick={() => ui.open({ type: 'import' })}>{t.timetable.importTimetable}</Button>
        <Button variant="soft" icon="plus" onClick={() => ui.open({ type: 'event', id: null })}>{t.timetable.addCommitment}</Button>
      </div>

      {history && (
        <div class="notice">
          <span>{t.timetable.lastImport(shortDate(dayKey(new Date(history.at))))}</span>
          <Button size="sm" variant="ghost" icon="undo" onClick={() => store.act(d => undoImport(d), { message: t.timetable.importUndone })}>{t.timetable.undoImport}</Button>
        </div>
      )}

      {!data.events.length ? (
        <Empty icon="school" title={t.timetable.noClasses}>{t.timetable.noClassesBody}</Empty>
      ) : (
        <>
          {ORDER.map(day => {
            const rows = weekly.filter(e => daysOf(e).includes(day)).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
            if (!rows.length) return null;
            return (
              <section class="panel" key={day}>
                <SectionTitle>{t.common.weekdays[day]}</SectionTitle>
                <ul class="plain-list event-list">
                  {rows.map(e => (
                    <li key={e.id}>
                      <button type="button" class="event-row" onClick={() => ui.open({ type: 'event', id: e.id })}>
                        <span class="event-time">{clockTime(e.start)}<small>{clockTime(e.end)}</small></span>
                        <span class="grow">
                          <strong>{e.title}</strong>
                          <span>{joinFacts([repeatText(e), e.location, e.teacher])}</span>
                        </span>
                        {occurs(e, today) && <span class="badge">{t.common.today}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {once.length > 0 && (
            <section class="panel">
              <SectionTitle count={once.length}>{t.timetable.oneOff}</SectionTitle>
              <ul class="plain-list event-list">
                {once.slice(0, 40).map(e => (
                  <li key={e.id}>
                    <button type="button" class="event-row" onClick={() => ui.open({ type: 'event', id: e.id })}>
                      <span class="event-time">{shortDate(e.date)}<small>{clockTime(e.start)}</small></span>
                      <span class="grow"><strong>{e.title}</strong><span>{e.location}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
              {once.length > 40 && <p class="panel-sub">{t.timetable.andMore(once.length - 40)}</p>}
            </section>
          )}
          {ended > 0 && <p class="muted center">{t.timetable.pastHidden(ended)}</p>}
        </>
      )}

    </section>
  );
}
