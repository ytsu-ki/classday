import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { NormalizeReport } from '../domain/schema';
import type { DateKey } from '../domain/types';
import type { AppState, Store } from './store';

export type View = 'today' | 'week' | 'plans' | 'notes' | 'settings' | 'day' | 'reminders' | 'appearance' | 'timetable' | 'data';

export type SheetSpec =
  /** Add a to-do. */
  | { type: 'capture'; due?: DateKey }
  | { type: 'item'; id: string }
  | { type: 'note'; id: string | null }
  /** Add (id null) or change an event; `start` comes from a tapped stretch of free time. */
  | { type: 'event'; id: string | null; day?: DateKey; start?: number }
  | { type: 'fixed'; eventId: string; day: DateKey }
  | { type: 'import' }
  | { type: 'restore'; report: NormalizeReport; source: string }
  | { type: 'confirm'; title: string; message: string; confirm: string; danger?: boolean; onConfirm: () => void };

export interface Ui {
  view: View;
  go: (view: View) => void;
  /** The day shown on the Today screen. */
  day: DateKey;
  showDay: (day: DateKey) => void;
  sheet: SheetSpec | null;
  open: (sheet: SheetSpec) => void;
  close: () => void;
}

export const StoreContext = createContext<Store | null>(null);
export const UiContext = createContext<Ui | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('Store is missing');
  return store;
}

export function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error('UI context is missing');
  return ui;
}

/** The current app state; re-renders on every change (the state is small). */
export function useAppState(): AppState {
  const store = useStore();
  const [state, setState] = useState(store.get());
  useEffect(() => {
    setState(store.get());
    return store.subscribe(setState);
  }, [store]);
  return state;
}
