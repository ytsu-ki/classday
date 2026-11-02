import { isNative, PlannerStore, type Snapshot } from './native';

/**
 * Where planner data lives. On Android it is a file in app-private storage, written
 * atomically, with the previous version and daily copies kept for recovery.
 * The browser backend exists for development previews and tests.
 */
export interface StorageBackend {
  kind: 'device' | 'browser';
  read(): Promise<string | null>;
  readPrevious(): Promise<string | null>;
  write(json: string): Promise<void>;
  snapshot(json: string, day: string): Promise<void>;
  listSnapshots(): Promise<Snapshot[]>;
  readSnapshot(day: string): Promise<string>;
}

export const SNAPSHOTS_KEPT = 7;

export function deviceBackend(): StorageBackend {
  return {
    kind: 'device',
    read: async () => (await PlannerStore.read()).data ?? null,
    readPrevious: async () => (await PlannerStore.readPrevious()).data ?? null,
    write: data => PlannerStore.write({ data }),
    snapshot: (data, day) => PlannerStore.snapshot({ data, day, keep: SNAPSHOTS_KEPT }),
    listSnapshots: async () => (await PlannerStore.listSnapshots()).snapshots,
    readSnapshot: async day => (await PlannerStore.readSnapshot({ day })).data,
  };
}

export function browserBackend(store: Storage = localStorage, prefix = 'classday'): StorageBackend {
  const key = (name: string) => `${prefix}.${name}`;
  const snapshotDays = () => {
    const days: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const name = store.key(i);
      if (name?.startsWith(key('snapshot.'))) days.push(name.slice(key('snapshot.').length));
    }
    return days.sort();
  };
  return {
    kind: 'browser',
    read: async () => store.getItem(key('state')),
    readPrevious: async () => store.getItem(key('previous')),
    write: async data => {
      const current = store.getItem(key('state'));
      if (current !== null) store.setItem(key('previous'), current);
      store.setItem(key('state'), data);
    },
    snapshot: async (data, day) => {
      store.setItem(key(`snapshot.${day}`), data);
      const days = snapshotDays();
      for (const old of days.slice(0, Math.max(0, days.length - SNAPSHOTS_KEPT))) store.removeItem(key(`snapshot.${old}`));
    },
    listSnapshots: async () => snapshotDays().reverse().map(day => ({ day, size: store.getItem(key(`snapshot.${day}`))?.length ?? 0 })),
    readSnapshot: async day => {
      const data = store.getItem(key(`snapshot.${day}`));
      if (data === null) throw new Error('That copy is no longer available.');
      return data;
    },
  };
}

export function defaultBackend(): StorageBackend {
  return isNative() ? deviceBackend() : browserBackend();
}
