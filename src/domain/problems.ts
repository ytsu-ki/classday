/**
 * Everything the domain, timetable and platform code can refuse or report, as data. The
 * interface puts each one into words in the student's language (src/i18n), so no layer below
 * the interface holds English or Chinese sentences.
 */
export type Problem =
  // Changing plans
  | { code: 'item-gone' }
  | { code: 'too-many-items' }
  | { code: 'note-empty' }
  | { code: 'note-too-long' }
  | { code: 'note-gone' }
  | { code: 'too-many-notes' }
  | { code: 'too-many-events' }
  | { code: 'event-gone' }
  | { code: 'choice-unknown' }
  // Settings
  | { code: 'settings-times' }
  | { code: 'settings-short-day' }
  | { code: 'settings-meals-outside' }
  | { code: 'settings-meals-overlap' }
  | { code: 'settings-meal-length' }
  // Stored data and backups
  | { code: 'data-format' }
  | { code: 'backup-too-large' }
  | { code: 'backup-invalid' }
  // Timetables
  | { code: 'timetable-size' }
  | { code: 'timetable-unreadable' }
  | { code: 'timetable-duplicate' }
  | { code: 'timetable-too-many' }
  | { code: 'range-empty' }
  | { code: 'range-format'; text: string }
  | { code: 'range-bounds'; maximum: number }
  | { code: 'range-none' }
  | { code: 'semester-first-monday' }
  | { code: 'semester-period'; period: number }
  | { code: 'semester-periods-overlap' }
  | { code: 'semester-period-in-use'; period: number }
  | { code: 'timetable-no-classes' }
  | { code: 'text-too-large' }
  | { code: 'pdf-too-large' }
  | { code: 'pdf-unreadable' }
  | { code: 'ics-size' }
  | { code: 'ics-range' }
  | { code: 'ics-unreadable' }
  | { code: 'ics-not-calendar' }
  | { code: 'ics-too-large' }
  | { code: 'ics-timezone'; zone: string }
  | { code: 'ics-repeat' }
  | { code: 'ics-entry' }
  | { code: 'ics-all-day'; title: string }
  | { code: 'ics-too-many-repeats' }
  | { code: 'ics-overnight'; title: string }
  | { code: 'ics-too-many-lessons' }
  | { code: 'ics-no-lessons' };

export type ProblemCode = Problem['code'];

/** An error that carries a Problem; its message is the code, for logs and tests. */
export class ProblemError extends Error {
  constructor(readonly problem: Problem) {
    const { code, ...details } = problem;
    super(Object.keys(details).length ? `${code} ${JSON.stringify(details)}` : code);
  }
}

export const problemOf = (error: unknown): Problem | null => (error instanceof ProblemError ? error.problem : null);
