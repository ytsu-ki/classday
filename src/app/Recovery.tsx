import { useState } from 'preact/hooks';
import { parseData } from '../domain/schema';
import { dayKey } from '../domain/time';
import type { PlannerData } from '../domain/types';
import { pickFile, readBackupFile, saveFile } from '../platform/backup';
import type { StorageBackend } from '../platform/storage';
import { Button } from '../ui/components/controls';
import { Icon } from '../ui/components/Icon';
import { errorText, t } from '../i18n';
import { shortDate } from '../ui/format';
import type { BootError } from './repository';

/**
 * Shown when saved data cannot be opened. Nothing is overwritten until the student
 * chooses: save a copy of the unreadable data, restore a backup, or start over.
 */
export function Recovery({ raw, error, backend, onRecovered }: {
  raw: string | null; error: BootError; backend: StorageBackend; onRecovered: (data: PlannerData | null, message: string) => void;
}) {
  const [message, setMessage] = useState('');
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [busy, setBusy] = useState(false);

  const keepCopy = async () => {
    if (!raw) return;
    try {
      const result = await saveFile(`classday-unreadable-${dayKey()}.json`, raw);
      setMessage(result === 'saved' ? t.recovery.copySaved : t.recovery.copyCancelled);
    } catch {
      setMessage(t.recovery.copyFailed);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const file = await pickFile('.json,application/json');
      if (!file) return;
      const report = await readBackupFile(file);
      await backend.write(JSON.stringify(report.data));
      onRecovered(report.data, t.recovery.backupRestored);
    } catch (e) {
      setMessage(errorText(e, t.recovery.backupUnreadable));
    } finally {
      setBusy(false);
    }
  };

  const latestCopy = async () => {
    setBusy(true);
    try {
      for (const s of await backend.listSnapshots()) {
        try {
          const report = parseData(await backend.readSnapshot(s.day));
          await backend.write(JSON.stringify(report.data));
          onRecovered(report.data, t.recovery.restoredCopy(shortDate(s.day)));
          return;
        } catch { /* try an older one */ }
      }
      setMessage(t.recovery.noUsableCopy);
    } catch {
      setMessage(t.recovery.noCopies);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="recovery" id="main">
      <span class="empty-mark"><Icon name="alert" size={28} /></span>
      <h1>{t.recovery.title}</h1>
      <p>{t.recovery.body(t.boot.errors[error])}</p>
      <div class="recovery-actions">
        {raw && <Button variant="soft" icon="upload" onClick={keepCopy}>{t.recovery.saveCopy}</Button>}
        <Button variant="primary" icon="download" busy={busy} onClick={restore}>{t.recovery.restore}</Button>
        <Button variant="soft" icon="undo" busy={busy} onClick={latestCopy}>{t.recovery.latest}</Button>
        {confirmFresh ? (
          <div class="notice notice-warn">
            <p>{t.recovery.startOverWarning(Boolean(raw))}</p>
            <Button variant="danger" onClick={() => onRecovered(null, t.recovery.startedFresh)}>{t.recovery.startOver}</Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmFresh(true)}>{t.recovery.startOver}</Button>
        )}
      </div>
      {message && <p class="recovery-message" role="status">{message}</p>}
    </main>
  );
}
