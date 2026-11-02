import { ActionError, type Moment } from '../domain/actions';
import { DataError } from '../domain/schema';
import { problemText, t } from '../i18n';
import { dayKey, minuteOfDay, nowIso } from '../domain/time';
import type { PlannerData } from '../domain/types';
import type { SaveStatus, Saver } from './repository';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  undo: boolean;
}

export interface AppState {
  data: PlannerData;
  today: string;
  minute: number;
  save: SaveStatus;
  toast: Toast | null;
  canUndo: boolean;
}

export interface ActOptions<R = unknown> {
  /** Shown after the change, with an Undo button when undoable. */
  message?: string | ((result: R, data: PlannerData) => string);
  undoable?: boolean;
}

type Listener = (state: AppState) => void;
const UNDO_DEPTH = 20;

/**
 * Holds the planner data, persists it through the saver, keeps the clock current,
 * and keeps a short undo history. Domain rules live in ../domain.
 */
export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();
  private history: PlannerData[] = [];
  private toastId = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(data: PlannerData, private saver: Saver | null, private clock: () => Date = () => new Date()) {
    const now = this.clock();
    this.state = { data, today: dayKey(now), minute: minuteOfDay(now), save: 'saved', toast: null, canUndo: false };
  }

  get = () => this.state;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  moment(): Moment {
    return { today: this.state.today, minute: this.state.minute };
  }

  private emit(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private tick() {
    const now = this.clock();
    return { today: dayKey(now), minute: minuteOfDay(now) };
  }

  /** Keep the clock current (on resume, a new day, or a timer). */
  refresh(force = false) {
    const now = this.tick();
    if (force || now.today !== this.state.today || now.minute !== this.state.minute) this.emit(now);
  }

  /**
   * Apply a change. The action mutates a copy; on success the copy becomes current,
   * the change is saved, and Undo becomes available.
   */
  act<R>(action: (draft: PlannerData, at: Moment) => R, options: ActOptions<R> = {}): R | undefined {
    const { undoable = true } = options;
    const now = this.tick();
    const draft = structuredClone(this.state.data);
    let result: R;
    try {
      result = action(draft, now);
    } catch (error) {
      if (error instanceof ActionError || error instanceof DataError) {
        this.showToast(problemText(error.problem), 'error', false);
        return undefined;
      }
      throw error;
    }
    draft.meta.updatedAt = nowIso();
    if (undoable) this.history = [...this.history.slice(-(UNDO_DEPTH - 1)), this.state.data];
    this.emit({ ...now, data: draft, canUndo: this.history.length > 0 });
    this.persist();
    const message = typeof options.message === 'function' ? options.message(result, draft) : options.message;
    if (message) this.showToast(message, 'info', undoable);
    return result;
  }

  /** Replace everything, e.g. after restoring a backup. The previous data stays undoable. */
  replace(data: PlannerData, message: string) {
    this.act(draft => {
      for (const key of Object.keys(draft) as (keyof PlannerData)[]) delete draft[key];
      Object.assign(draft, structuredClone(data));
    }, { message });
  }

  undo() {
    const previous = this.history.pop();
    if (!previous) return;
    const now = this.tick();
    const draft = structuredClone(previous);
    // The look of the app is not part of the history: Undo never changes the accent or theme.
    draft.appearance = structuredClone(this.state.data.appearance);
    this.emit({ ...now, data: draft, canUndo: this.history.length > 0 });
    this.persist();
    this.showToast(t.app.undone, 'info', false);
  }

  showToast(message: string, tone: Toast['tone'] = 'info', undo = false) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    const toast = { id: ++this.toastId, message, tone, undo };
    this.emit({ toast });
    this.toastTimer = setTimeout(() => {
      if (this.state.toast?.id === toast.id) this.emit({ toast: null });
    }, undo ? 6000 : 4000);
  }

  dismissToast() {
    if (this.state.toast) this.emit({ toast: null });
  }

  setSaveStatus(save: SaveStatus) {
    this.emit({ save });
  }

  private persist() {
    this.saver?.schedule(this.state.data);
  }

  flush() {
    return this.saver?.flush() ?? Promise.resolve();
  }
}
