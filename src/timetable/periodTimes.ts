import { MAX_PERIODS, periodsProblem } from '../domain/periods';
import { toClock } from '../domain/time';
import type { ClassPeriod } from '../domain/types';
import { normalizeText } from './text';
import { numeralValue, ZH } from './vocabulary.zh-Hans';

/**
 * Period times written beside a timetable grid, from the labels down its side: "1 08:00-08:45",
 * a period number with its times on the lines below, or "1-2" followed by four times. Labels
 * for double periods, or times that don't line up, give none.
 */

const CLOCK = /(\d{1,2}):(\d{2})/g;
const NUMERAL = new RegExp(ZH.numerals, 'g');
const minuteOf = (h: string, m: string) => (Number(h) < 24 && Number(m) < 60 ? Number(h) * 60 + Number(m) : null);
const arabic = (text: string) => normalizeText(text).replace(NUMERAL, n => String(numeralValue(n) ?? n));

/** The first and last period a label names, leaving its times aside; none when it has no period number. */
export function periodsInLabel(label: string): [number, number] | undefined {
  const numbers = [...arabic(label).replace(CLOCK, ' ').matchAll(/\d{1,2}/g)].map(m => Number(m[0])).filter(n => n >= 1 && n <= MAX_PERIODS);
  return numbers.length ? [Math.min(...numbers), Math.max(...numbers)] : undefined;
}

/** Class times for periods 1, 2, 3 … from the labels, in order; empty when they don't give a usable table. */
export function periodTimesIn(labels: string[]): ClassPeriod[] {
  type Token = { periods: [number, number] } | { minute: number };
  const tokens: Token[] = [];
  for (const label of labels) {
    if (label.includes(ZH.doublePeriod)) return [];
    const periods = periodsInLabel(label);
    if (periods) tokens.push({ periods });
    // A time written before its period number in the same row still belongs to that period.
    for (const m of arabic(label).matchAll(CLOCK)) {
      const minute = minuteOf(m[1], m[2]);
      if (minute !== null) tokens.push({ minute });
    }
  }
  const times = new Map<number, ClassPeriod>();
  let current: number[] = [];
  let clocks: number[] = [];
  for (const token of tokens) {
    if ('periods' in token) {
      const [first, last] = token.periods;
      current = Array.from({ length: last - first + 1 }, (_, k) => first + k);
      clocks = [];
    } else if (current.length) {
      clocks.push(token.minute);
      if (clocks.length < current.length * 2) continue;
      current.forEach((n, k) => times.set(n, { start: toClock(clocks[2 * k]), end: toClock(clocks[2 * k + 1]) }));
      current = [];
    }
  }
  const table: ClassPeriod[] = [];
  for (let n = 1; times.has(n); n++) table.push(times.get(n)!);
  return periodsProblem(table) ? [] : table;
}
