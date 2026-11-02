import { useState } from 'preact/hooks';
import { useAppState, useStore, useUi } from '../../app/context';
import { withDefaultPeriods } from '../../domain/defaults';
import { ProblemError, type Problem } from '../../domain/problems';
import { addDays, weekOf } from '../../domain/time';
import type { FixedEvent, SemesterPreferences } from '../../domain/types';
import { errorText, t } from '../../i18n';
import { pickFile, readText } from '../../platform/backup';
import { PDF_MAX_BYTES, readPdfText } from '../../platform/pdf';
import { buildEvents, usedPeriods, type ClassEntry } from '../../timetable/classes';
import { classesFromGrid } from '../../timetable/grid';
import type { IcsOptions } from '../../timetable/ics';
import { ICS_MAX_BYTES } from '../../timetable/limits';
import { applyImport, diffImport, importConflicts, type ImportConflict, type ImportDiff } from '../../timetable/merge';
import { parseTimetableText } from '../../timetable/text';
import { formatRanges } from '../../timetable/weeks';
import { Button, Field } from '../components/controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { TimeField } from '../components/TimeField';
import { clockTime, joinFacts, shortDate } from '../format';

const TEXT_MAX_BYTES = 200 * 1024;

type Source = 'file' | 'ics';

type Step =
  | { name: 'choose' }
  | { name: 'text' }
  | { name: 'semester'; entries: ClassEntry[]; skipped: number }
  | { name: 'ics' }
  | { name: 'preview'; source: Source; events: FixedEvent[]; group: string; diff: ImportDiff; conflicts: ImportConflict[]; semester?: SemesterPreferences };

function parseInWorker(text: string, options: IcsOptions): Promise<FixedEvent[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../timetable/ics.worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error(t.importer.tooSlow)); }, 15_000);
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    worker.onmessage = (e: MessageEvent<{ events?: FixedEvent[]; problem?: Problem }>) => {
      finish();
      if (e.data.problem) reject(new ProblemError(e.data.problem));
      else resolve(e.data.events ?? []);
    };
    worker.onerror = () => { finish(); reject(new Error(t.importer.calendarFailed)); };
    worker.postMessage({ text, options });
  });
}

export function ImportSheet() {
  const { data, today } = useAppState();
  const store = useStore();
  const ui = useUi();
  const saved = data.timetable.semester;
  const [step, setStep] = useState<Step>({ name: 'choose' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [firstMonday, setFirstMonday] = useState(saved?.firstMonday ?? weekOf(today));
  const [periods, setPeriods] = useState<SemesterPreferences['periods']>(() => withDefaultPeriods(saved?.periods));
  const [name, setName] = useState(t.importer.defaultName);
  const [from, setFrom] = useState(saved?.firstMonday ?? weekOf(today));
  const [until, setUntil] = useState(addDays(saved?.firstMonday ?? weekOf(today), 139));
  const [file, setFile] = useState<File | null>(null);
  const [removeMissing, setRemoveMissing] = useState(true);

  const preview = (source: Source, events: FixedEvent[], group: string, semester?: SemesterPreferences) => {
    setError('');
    setStep({ name: 'preview', source, events, group, diff: diffImport(data, events, group), conflicts: importConflicts(data, events), semester });
  };

  const found = (entries: ClassEntry[], skipped: number) => {
    if (!entries.length) return setError(t.problems['timetable-no-classes']());
    setError('');
    setStep({ name: 'semester', entries, skipped });
  };

  const readPdf = async () => {
    const chosen = await pickFile('.pdf,application/pdf');
    if (!chosen) return;
    if (chosen.size > PDF_MAX_BYTES) return setError(t.problems['pdf-too-large']());
    setBusy(true); setError('');
    try {
      const pages = await readPdfText(await chosen.arrayBuffer());
      const entries = classesFromGrid(pages);
      // Without a grid, the PDF's text may still be a list of classes.
      if (entries.length) found(entries, 0);
      else {
        const result = parseTimetableText(pages.map(items => items.map(i => i.text).join('\n')).join('\n'));
        found(result.entries, result.skipped);
      }
    } catch {
      setError(t.importer.pdfFailed);
    } finally {
      setBusy(false);
    }
  };

  const openText = async () => {
    const chosen = await pickFile('.txt,.csv,text/plain');
    if (!chosen) return;
    if (chosen.size > TEXT_MAX_BYTES) return setError(t.problems['text-too-large']());
    setText(await readText(chosen));
    setError('');
  };

  const readPasted = () => {
    if (text.length > TEXT_MAX_BYTES) return setError(t.problems['text-too-large']());
    const result = parseTimetableText(text);
    found(result.entries, result.skipped);
  };

  const buildFromEntries = (entries: ClassEntry[]) => {
    if (!name.trim()) return setError(t.importer.nameFirst);
    try {
      const semester: SemesterPreferences = { firstMonday, periods };
      preview('file', buildEvents(entries, semester, `file-${name.trim().slice(0, 80)}`), `file-${name.trim().slice(0, 80)}`, semester);
    } catch (e) {
      setError(errorText(e, t.importer.calendarFailed));
    }
  };

  const readIcs = async () => {
    if (!file) return setError(t.importer.chooseFileFirst);
    if (file.size > ICS_MAX_BYTES) return setError(t.problems['ics-size']());
    if (!name.trim()) return setError(t.importer.nameFirst);
    setBusy(true); setError('');
    try {
      const group = `ics-${name.trim().slice(0, 80)}`;
      preview('ics', await parseInWorker(await readText(file), { from, until, group }), group);
    } catch (e) {
      setError(errorText(e, t.importer.calendarFailed));
    } finally {
      setBusy(false);
    }
  };

  const confirm = (s: Extract<Step, { name: 'preview' }>) => {
    const done = store.act(d => {
      applyImport(d, s.events, s.group, removeMissing);
      if (s.semester) d.timetable.semester = s.semester;
      return true;
    }, { message: t.importer.imported });
    if (done) ui.close();
  };

  const errorLine = error && <p class="field-error" role="alert">{error}</p>;

  if (step.name === 'choose') {
    return (
      <Sheet title={t.importer.title} onClose={ui.close}>
        <div class="choice-list">
          <button type="button" class="choice" disabled={busy} onClick={readPdf}>
            <Icon name="notes" />
            <span><strong>{busy ? t.importer.readingPdf : t.importer.fromPdf}</strong><span>{t.importer.pdfHint}</span></span>
          </button>
          <button type="button" class="choice" onClick={() => { setError(''); setStep({ name: 'text' }); }}>
            <Icon name="edit" />
            <span><strong>{t.importer.fromText}</strong><span>{t.importer.textHint}</span></span>
          </button>
          <button type="button" class="choice" onClick={() => { setError(''); setStep({ name: 'ics' }); }}>
            <Icon name="calendar" />
            <span><strong>{t.importer.fromFile}</strong><span>{t.importer.fileHint}</span></span>
          </button>
        </div>
        {errorLine}
        <p class="field-hint">{t.importer.seeEveryChange}</p>
      </Sheet>
    );
  }

  if (step.name === 'text') {
    return (
      <Sheet title={t.importer.textTitle} onClose={ui.close} footer={<>
        <Button variant="ghost" onClick={() => setStep({ name: 'choose' })}>{t.common.back}</Button>
        <Button variant="primary" class="grow" disabled={!text.trim()} onClick={readPasted}>{t.importer.read}</Button>
      </>}>
        <div class="form-stack">
          <Field label={t.importer.textLabel} hint={t.importer.textFormat}>
            {fid => <textarea id={fid} class="timetable-text" rows={9} data-autofocus placeholder={t.importer.textPlaceholder} value={text}
              onInput={e => { setText((e.target as HTMLTextAreaElement).value); setError(''); }} />}
          </Field>
          <Button variant="soft" icon="download" onClick={openText}>{t.importer.openText}</Button>
          {errorLine}
        </div>
      </Sheet>
    );
  }

  if (step.name === 'semester') {
    const used = usedPeriods(step.entries);
    const setPeriod = (n: number, key: 'start' | 'end', value: string) => {
      setPeriods(current => {
        const next = Array.from({ length: Math.max(current.length, n) }, (_, i) => current[i] ?? { start: '' as const, end: '' as const });
        next[n - 1] = { ...next[n - 1], [key]: value };
        return next as SemesterPreferences['periods'];
      });
      setError('');
    };
    return (
      <Sheet title={t.importer.checkDetails} subtitle={t.importer.found(step.entries.length, step.skipped)} onClose={ui.close} footer={<>
        <Button variant="ghost" onClick={() => setStep({ name: 'choose' })}>{t.common.back}</Button>
        <Button variant="primary" class="grow" onClick={() => buildFromEntries(step.entries)}>{t.common.preview}</Button>
      </>}>
        <div class="form-stack">
          <Field label={t.importer.mondayWeekOne} hint={t.importer.remembered}>
            {fid => <input id={fid} type="date" value={firstMonday} onInput={e => { setFirstMonday((e.target as HTMLInputElement).value); setError(''); }} />}
          </Field>
          {used.length > 0 && (
            <fieldset class="group">
              <legend>{t.importer.periodTimes}</legend>
              <p class="field-hint">{t.importer.periodsHint}</p>
              <div class="period-grid">
                <span aria-hidden="true">{t.importer.period}</span><span aria-hidden="true">{t.importer.starts}</span><span aria-hidden="true">{t.importer.ends}</span>
                {used.map(n => (
                  <>
                    <span class="period-n">{n}</span>
                    <TimeField label={t.importer.periodStarts(n)} value={periods[n - 1]?.start ?? ''} onChange={v => setPeriod(n, 'start', v)} />
                    <TimeField label={t.importer.periodEnds(n)} value={periods[n - 1]?.end ?? ''} onChange={v => setPeriod(n, 'end', v)} />
                  </>
                ))}
              </div>
            </fieldset>
          )}
          <Field label={t.importer.timetableName} hint={t.importer.timetableNameHint}>
            {fid => <input id={fid} type="text" maxLength={80} value={name} onInput={e => setName((e.target as HTMLInputElement).value)} />}
          </Field>
          {errorLine}
        </div>
      </Sheet>
    );
  }

  if (step.name === 'ics') {
    return (
      <Sheet title={t.importer.calendarTitle} onClose={ui.close} footer={<>
        <Button variant="ghost" onClick={() => setStep({ name: 'choose' })}>{t.common.back}</Button>
        <Button variant="primary" class="grow" busy={busy} onClick={readIcs}>{busy ? t.importer.reading : t.common.preview}</Button>
      </>}>
        <div class="form-stack">
          <Button variant="soft" icon="calendar" onClick={async () => { const f = await pickFile('.ics,text/calendar'); if (f) { setFile(f); setError(''); } }}>
            {file ? file.name : t.importer.chooseFile}
          </Button>
          <Field label={t.importer.timetableName} hint={t.importer.timetableNameHint}>
            {fid => <input id={fid} type="text" maxLength={80} value={name} onInput={e => setName((e.target as HTMLInputElement).value)} />}
          </Field>
          <div class="form-grid">
            <Field label={t.importer.from}>{fid => <input id={fid} type="date" value={from} onInput={e => setFrom((e.target as HTMLInputElement).value)} />}</Field>
            <Field label={t.importer.until}>{fid => <input id={fid} type="date" value={until} onInput={e => setUntil((e.target as HTMLInputElement).value)} />}</Field>
          </div>
          {errorLine}
        </div>
      </Sheet>
    );
  }

  const { diff, conflicts } = step;
  const changes = [...diff.added.map(e => ({ e, isNew: true })), ...diff.updated.map(x => ({ e: x.after, isNew: false }))];
  const leaveOut = (event: FixedEvent) => {
    const events = step.events.filter(e => e.sourceKey !== event.sourceKey);
    if (events.length) preview(step.source, events, step.group, step.semester);
  };
  return (
    <Sheet title={t.importer.review} subtitle={t.importer.reviewSummary(diff.added.length, diff.updated.length, diff.unchanged.length)} onClose={ui.close} footer={<>
      <Button variant="ghost" onClick={() => setStep(step.source === 'ics' ? { name: 'ics' } : { name: 'choose' })}>{t.common.back}</Button>
      <Button variant="primary" class="grow" onClick={() => confirm(step)}>{t.importer.import}</Button>
    </>}>
      {diff.kept.length > 0 && <p class="field-hint">{t.importer.kept(diff.kept.length)}</p>}
      {changes.length ? (
        <ul class="plain-list import-list">
          {changes.slice(0, 60).map(({ e, isNew }) => (
            <li key={e.id}>
              <span class={`badge ${isNew ? 'badge-new' : ''}`}>{isNew ? t.importer.new : t.importer.changed}</span>
              <span class="grow">
                <strong>{e.title}</strong>
                <span>{joinFacts([`${e.repeat === 'once' ? shortDate(e.date) : t.common.weekdaysShort[e.weekday]} ${clockTime(e.start)}–${clockTime(e.end)}`, e.weeks && t.importer.weeks(formatRanges(e.weeks, t.format.parityRange)), e.location])}</span>
              </span>
              {step.source !== 'ics' && changes.length > 1 && (
                <button type="button" class="icon-btn" aria-label={t.importer.leaveOut(e.title)} onClick={() => leaveOut(e)}><Icon name="close" size={18} /></button>
              )}
            </li>
          ))}
          {changes.length > 60 && <li class="muted">{t.importer.andMore(changes.length - 60)}</li>}
        </ul>
      ) : <p>{t.importer.nothingChanged}</p>}
      {conflicts.length > 0 && (
        <div class="notice notice-warn">
          <strong>{t.importer.overlapTitle}</strong>
          <ul class="plain-list compact">{conflicts.slice(0, 6).map(c => <li>{t.importer.conflict(shortDate(c.date), c.first, c.second)}</li>)}</ul>
        </div>
      )}
      {diff.removed.length > 0 && (
        <label class="check-row">
          <input type="checkbox" checked={removeMissing} onChange={e => setRemoveMissing((e.target as HTMLInputElement).checked)} />
          <span>{t.importer.removeEarlier(diff.removed.length)}</span>
        </label>
      )}
      <p class="field-hint">{t.importer.undoLater}</p>
    </Sheet>
  );
}
