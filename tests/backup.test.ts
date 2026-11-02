// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../src/app/store';
import * as act from '../src/domain/actions';
import { initialData } from '../src/domain/defaults';
import { BACKUP_MAX_BYTES, backupName, exportBackup, readBackupFile } from '../src/platform/backup';
import { todo } from './helpers';

const file = (text: string, name = 'backup.json') => new File([text], name, { type: 'application/json' });

afterEach(() => vi.restoreAllMocks());

describe('backup files', () => {
  it('reads a backup exactly', async () => {
    const data = { ...initialData(), items: [todo({ title: 'Thesis outline' })] };
    const report = await readBackupFile(file(JSON.stringify(data)));
    expect(report.data).toEqual(data);
  });

  it('keeps only what the planner knows, so login details never travel with a backup', async () => {
    const data: Record<string, any> = { ...initialData(), items: [{ ...todo({ title: 'Lab report' }), password: 'hunter2' }], password: 'hunter2' };
    data.timetable.semester = { firstMonday: '2026-09-07', periods: [], password: 'hunter2' };
    const report = await readBackupFile(file(JSON.stringify(data)));
    expect(JSON.stringify(report.data)).not.toContain('hunter2');
    expect(report.data.items[0].title).toBe('Lab report');
    expect(report.dropped).toBe(0);
  });

  it('refuses data from other versions or other apps', async () => {
    await expect(readBackupFile(file(JSON.stringify({ ...initialData(), schema: 3 })))).rejects.toThrow('backup-invalid');
    await expect(readBackupFile(file('{"version":1,"tasks":[]}'))).rejects.toThrow('backup-invalid');
  });

  it('refuses other files with a clear message and never throws raw errors', async () => {
    await expect(readBackupFile(file('not json'))).rejects.toThrow('backup-invalid');
    await expect(readBackupFile(file('{"hello":1}'))).rejects.toThrow('backup-invalid');
    const huge = { size: BACKUP_MAX_BYTES + 1, text: async () => '' } as unknown as File;
    await expect(readBackupFile(huge)).rejects.toThrow('backup-too-large');
  });

  it('downloads a dated file in the browser preview', async () => {
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this); });
    URL.createObjectURL = vi.fn(() => 'blob:backup');
    URL.revokeObjectURL = vi.fn();
    const result = await exportBackup(initialData(), '2026-10-13');
    expect(result).toBe('saved');
    expect(clicks[0].download).toBe(backupName('2026-10-13'));
    expect(backupName('2026-10-13')).toBe('classday-backup-2026-10-13.json');
  });
});

describe('restoring', () => {
  it('replaces everything and can be undone', () => {
    const store = new Store({ ...initialData(), items: [todo({ title: 'Current' })] }, null, () => new Date('2026-10-13T10:00:00'));
    const restored = { ...initialData(), items: [todo({ title: 'From backup' })] };
    store.replace(restored, 'Restored.');
    expect(store.get().data.items.map(i => i.title)).toEqual(['From backup']);
    store.act(d => act.complete(d, d.items[0].id));
    store.undo();
    store.undo();
    expect(store.get().data.items.map(i => i.title)).toEqual(['Current']);
  });
});
