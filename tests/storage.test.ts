// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { boot, Saver } from '../src/app/repository';
import { Store } from '../src/app/store';
import * as act from '../src/domain/actions';
import { initialData } from '../src/domain/defaults';
import { browserBackend, type StorageBackend } from '../src/platform/storage';
import { todo } from './helpers';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.get(key) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
}

function setup() {
  const store = new MemoryStorage();
  return { store, backend: browserBackend(store) };
}

describe('starting up', () => {
  it('starts fresh with no data at all', async () => {
    const { backend } = setup();
    const result = await boot(backend);
    expect(result.status).toBe('fresh');
  });

  it('reads back what was saved', async () => {
    const { backend } = setup();
    const saved = { ...initialData(), items: [todo({ title: 'Saved' })] };
    await backend.write(JSON.stringify(saved));
    const result = await boot(backend);
    expect(result).toMatchObject({ status: 'ready', data: saved });
    expect(result.status === 'ready' && result.notice).toBeFalsy();
  });

  it('falls back to the previous save when the latest is corrupt', async () => {
    const { backend } = setup();
    const good = { ...initialData(), items: [todo({ title: 'Keep me' })] };
    await backend.write(JSON.stringify(good));
    await backend.write('{"schema":1,"items":[tru');
    const result = await boot(backend);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.data.items[0].title).toBe('Keep me');
      expect(result.notice).toEqual({ code: 'restored-previous' });
    }
  });

  it('falls back to a daily copy, then reports a broken state with the raw text', async () => {
    const { store, backend } = setup();
    const good = { ...initialData(), items: [todo({ title: 'From copy' })] };
    await backend.snapshot(JSON.stringify(good), '2026-10-20');
    store.setItem('classday.state', 'garbage');
    const restored = await boot(backend);
    expect(restored.status === 'ready' && restored.data.items[0].title).toBe('From copy');

    const empty = setup();
    empty.store.setItem('classday.state', 'garbage');
    const broken = await boot(empty.backend);
    expect(broken).toMatchObject({ status: 'broken', raw: 'garbage' });
  });

  it('keeps at most seven daily copies', async () => {
    const { backend } = setup();
    for (let day = 1; day <= 10; day++) await backend.snapshot('{}', `2026-10-${String(day).padStart(2, '0')}`);
    const days = (await backend.listSnapshots()).map(s => s.day);
    expect(days).toEqual(['2026-10-10', '2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05', '2026-10-04']);
  });
});

describe('saving', () => {
  it('debounces writes, makes a daily copy, and retries after a failure', async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    let fail = true;
    const backend: StorageBackend = {
      ...browserBackend(new MemoryStorage()),
      write: async json => { if (fail) throw new Error('disk full'); writes.push(json); },
      snapshot: vi.fn(async () => {}),
    };
    const statuses: string[] = [];
    const saver = new Saver(backend, s => statuses.push(s), () => '2026-10-13', 100);
    saver.schedule(initialData());
    saver.schedule({ ...initialData(), noteDraft: 'latest' });
    await vi.advanceTimersByTimeAsync(150);
    expect(statuses).toEqual(['saving', 'failed']);
    fail = false;
    await vi.advanceTimersByTimeAsync(2500);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]).noteDraft).toBe('latest');
    expect(statuses.at(-1)).toBe('saved');
    expect(backend.snapshot).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('store', () => {
  const clock = () => new Date('2026-10-13T10:00:00');

  it('applies changes, offers Undo, and undoes them in order', () => {
    const store = new Store(initialData(), null, clock);
    const item = todo({ estimate: 60 });
    store.act(d => act.addItem(d, item), { message: 'Added.' });
    expect(store.get().toast).toMatchObject({ message: 'Added.', undo: true });
    store.act(d => act.complete(d, item.id));
    expect(store.get().data.items[0].status).toBe('done');
    store.undo();
    expect(store.get().data.items[0].status).toBe('open');
    store.undo();
    expect(store.get().data.items).toEqual([]);
  });

  it('turns rule violations into a friendly message without changing data', () => {
    const store = new Store(initialData(), null, clock);
    const before = store.get().data;
    store.act(d => act.saveNote(d, null, ''));
    expect(store.get().data).toBe(before);
    expect(store.get().toast).toMatchObject({ tone: 'error', message: 'Write something first.' });
  });

  it('rolls over to a new day without changing the data', () => {
    let now = new Date('2026-10-13T23:50:00');
    const store = new Store({ ...initialData(), items: [todo({ estimate: 600 })] }, null, () => now);
    const before = store.get().data;
    now = new Date('2026-10-14T08:05:00');
    store.refresh();
    expect(store.get().today).toBe('2026-10-14');
    expect(store.get().minute).toBe(8 * 60 + 5);
    expect(store.get().data).toBe(before);
  });
});