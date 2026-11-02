import { useEffect, useState } from 'preact/hooks';
import { useAppState, useStore, useUi } from '../../app/context';
import { services } from '../../app/services';
import { parseData } from '../../domain/schema';
import { exportBackup, pickFile, readBackupFile } from '../../platform/backup';
import type { Snapshot } from '../../platform/native';
import { Button, IconButton, SectionTitle } from '../components/controls';
import { Icon } from '../components/Icon';
import { errorText, t } from '../../i18n';
import { inlineDay, relativeDay } from '../format';

export function DataScreen() {
  const { data, today, save } = useAppState();
  const store = useStore();
  const ui = useUi();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);

  useEffect(() => {
    services.backend?.listSnapshots().then(setSnapshots).catch(() => setSnapshots([]));
  }, []);

  const doExport = async () => {
    setBusy('export');
    try {
      await store.flush();
      const result = await exportBackup(data, today);
      store.showToast(result === 'saved' ? t.data.backupSaved : t.data.backupCancelled);
    } catch {
      store.showToast(t.data.backupFailed, 'error');
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    setBusy('import');
    try {
      const file = await pickFile('.json,application/json');
      if (!file) return;
      const report = await readBackupFile(file);
      ui.open({ type: 'restore', report, source: file.name });
    } catch (error) {
      store.showToast(errorText(error, t.data.backupUnreadable), 'error');
    } finally {
      setBusy(null);
    }
  };

  const restoreSnapshot = async (day: string) => {
    try {
      const report = parseData(await services.backend!.readSnapshot(day));
      ui.open({ type: 'restore', report, source: t.data.copyFrom(inlineDay(day, today)) });
    } catch {
      store.showToast(t.data.copyUnreadable, 'error');
    }
  };

  return (
    <section class="screen data" aria-labelledby="data-title">
      <header class="page-head">
        <div class="page-title">
          <IconButton icon="back" label={t.timetable.backToSettings} onClick={() => ui.go('settings')} class="back-btn" />
          <div>
            <p class="eyebrow">{t.data.eyebrow}</p>
            <h1 id="data-title">{t.data.title}</h1>
          </div>
        </div>
      </header>

      <section class={`panel status-panel ${save === 'failed' ? 'is-failed' : ''}`} role="status">
        <Icon name={save === 'failed' ? 'alert' : 'shield'} />
        <div>
          <strong>{save === 'failed' ? t.data.saveFailing : save === 'saving' ? t.data.saving : t.data.allSaved}</strong>
          <p>{save === 'failed'
            ? t.data.failingBody
            : t.data.summary(data.items.length, data.events.length, data.notes.length, services.backend?.kind === 'browser')}</p>
        </div>
      </section>

      <section class="panel">
        <SectionTitle>{t.data.backup}</SectionTitle>
        <p class="panel-sub">{t.data.backupBody}</p>
        <div class="button-row">
          <Button variant="primary" icon="upload" busy={busy === 'export'} onClick={doExport}>{t.data.export}</Button>
          <Button variant="soft" icon="download" busy={busy === 'import'} onClick={doImport}>{t.data.restoreFile}</Button>
        </div>
      </section>

      <section class="panel">
        <SectionTitle>{t.data.copies}</SectionTitle>
        <p class="panel-sub">{t.data.copiesBody}</p>
        {snapshots === null ? <p class="muted">{t.data.looking}</p> : !snapshots.length ? <p class="muted">{t.data.noCopies}</p> : (
          <ul class="plain-list snapshot-list">
            {snapshots.map(s => (
              <li key={s.day}>
                <span class="grow">{relativeDay(s.day, today)}<small>{t.data.kilobytes(Math.max(1, Math.round(s.size / 1024)))}</small></span>
                <Button size="sm" variant="ghost" onClick={() => restoreSnapshot(s.day)}>{t.data.restore}</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
