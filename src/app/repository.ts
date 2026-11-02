import { initialData } from '../domain/defaults';
import { parseData } from '../domain/schema';
import type { DateKey, PlannerData } from '../domain/types';
import type { StorageBackend } from '../platform/storage';

/**
 * Loading and saving. Boot never throws: it returns data to show, or a broken state with the
 * raw text so the student can save it before deciding what to do.
 */
export type BootNotice =
  | { code: 'dropped'; count: number }
  | { code: 'restored-previous' }
  | { code: 'restored-snapshot'; day: DateKey };

export type BootError = 'storage' | 'unreadable';

export type BootResult =
  | { status: 'ready'; data: PlannerData; notice?: BootNotice }
  | { status: 'fresh'; data: PlannerData }
  | { status: 'broken'; raw: string | null; error: BootError };

export async function boot(backend: StorageBackend): Promise<BootResult> {
  let raw: string | null;
  try {
    raw = await backend.read();
  } catch {
    return { status: 'broken', raw: null, error: 'storage' };
  }
  if (raw !== null) {
    try {
      const report = parseData(raw);
      return {
        status: 'ready', data: report.data,
        notice: report.dropped ? { code: 'dropped', count: report.dropped } : undefined,
      };
    } catch {
      // Try the copy from before the last save, then the daily copies, newest first.
      const candidates: { notice: BootNotice; load: () => Promise<string | null> }[] = [
        { notice: { code: 'restored-previous' }, load: () => backend.readPrevious() },
      ];
      try {
        for (const s of await backend.listSnapshots()) candidates.push({ notice: { code: 'restored-snapshot', day: s.day }, load: () => backend.readSnapshot(s.day) });
      } catch { /* no daily copies available */ }
      for (const candidate of candidates) {
        try {
          const text = await candidate.load();
          if (!text) continue;
          const report = parseData(text);
          await backend.write(JSON.stringify(report.data));
          return { status: 'ready', data: report.data, notice: candidate.notice };
        } catch { /* keep looking */ }
      }
      return { status: 'broken', raw, error: 'unreadable' };
    }
  }
  return { status: 'fresh', data: initialData() };
}

export type SaveStatus = 'saved' | 'saving' | 'failed';

/**
 * Debounced, ordered writes with retries. A failed write keeps the latest data in memory
 * and reports the failure so the interface can offer a backup.
 */
export class Saver {
  private pending: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> | null = null;
  private attempt = 0;
  private snapshotDay = '';
  status: SaveStatus = 'saved';

  constructor(
    private backend: StorageBackend,
    private onStatus: (status: SaveStatus) => void,
    private today: () => string,
    private delay = 400,
  ) {}

  schedule(data: PlannerData) {
    this.pending = JSON.stringify(data);
    this.setStatus('saving');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.writing) await this.writing;
    const json = this.pending;
    if (json === null) return;
    this.pending = null;
    this.writing = this.write(json);
    try {
      await this.writing;
    } finally {
      this.writing = null;
    }
  }

  private async write(json: string) {
    try {
      await this.backend.write(json);
      this.attempt = 0;
      const day = this.today();
      if (day !== this.snapshotDay) {
        this.snapshotDay = day;
        await this.backend.snapshot(json, day).catch(() => { this.snapshotDay = ''; });
      }
      if (this.pending === null) this.setStatus('saved');
    } catch {
      // Keep the newest data queued and retry with growing pauses.
      if (this.pending === null) this.pending = json;
      this.attempt++;
      this.setStatus('failed');
      const wait = [2000, 5000, 15_000, 30_000][Math.min(this.attempt - 1, 3)];
      if (!this.timer) this.timer = setTimeout(() => void this.flush(), wait);
    }
  }

  private setStatus(status: SaveStatus) {
    if (status === this.status) return;
    this.status = status;
    this.onStatus(status);
  }
}
