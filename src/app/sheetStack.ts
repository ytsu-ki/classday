import type { DateKey } from '../domain/types';
import type { SheetSpec, View } from './context';

/** Parent screen for settings subpages, used by Android Back and subpage headers. */
export const PARENT_VIEW: Partial<Record<View, View>> = {
  day: 'settings',
  reminders: 'settings',
  appearance: 'settings',
  timetable: 'settings',
  data: 'settings',
};

export interface NavState {
  view: View;
  day: DateKey;
  sheets: readonly SheetSpec[];
}

export type NavAction =
  | { type: 'go'; view: View; today: DateKey }
  | { type: 'showDay'; day: DateKey }
  | { type: 'rollover'; previousToday: DateKey; nextToday: DateKey }
  | { type: 'open'; sheet: SheetSpec }
  | { type: 'push'; sheet: SheetSpec }
  | { type: 'pop' }
  | { type: 'closeAll' }
  | { type: 'replace'; state: NavState };

export function initialNav(today: DateKey): NavState {
  return { view: 'today', day: today, sheets: [] };
}

/** Pure transition function for screen navigation, day focus, and the sheet stack. */
export function reduceNav(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'go':
      return {
        view: action.view,
        day: action.view === 'today' && state.view !== 'today' ? action.today : state.day,
        sheets: [],
      };
    case 'showDay':
      return state.day === action.day ? state : { ...state, day: action.day };
    case 'rollover':
      // Advance the shown day at midnight only if the student was looking at Today.
      return state.day === action.previousToday ? { ...state, day: action.nextToday } : state;
    case 'open':
      return { ...state, sheets: [action.sheet] };
    case 'push':
      return { ...state, sheets: [...state.sheets, action.sheet] };
    case 'pop':
      return state.sheets.length ? { ...state, sheets: state.sheets.slice(0, -1) } : state;
    case 'closeAll':
      return state.sheets.length ? { ...state, sheets: [] } : state;
    case 'replace':
      return action.state;
  }
}

/**
 * Resolves Android Back when no inner sheet handler intercepted it:
 * pop top sheet -> parent settings screen -> Today -> reset day to today -> minimize app.
 */
export function reduceBack(state: NavState, today: DateKey): { state: NavState; minimize: boolean } {
  if (state.sheets.length > 0) return { state: reduceNav(state, { type: 'pop' }), minimize: false };
  const parent = PARENT_VIEW[state.view];
  if (parent) return { state: reduceNav(state, { type: 'go', view: parent, today }), minimize: false };
  if (state.view !== 'today') return { state: reduceNav(state, { type: 'go', view: 'today', today }), minimize: false };
  if (state.day !== today) return { state: reduceNav(state, { type: 'showDay', day: today }), minimize: false };
  return { state, minimize: true };
}
