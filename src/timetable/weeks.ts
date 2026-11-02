import { ProblemError } from '../domain/problems';

/**
 * Week and period ranges such as "1-16 (odd), 18".
 * Also accepts Chinese timetable notation (full-width punctuation, the week, period and
 * ordinal characters, odd/even markers), written here as escapes so this file stays English.
 */
export function parseRanges(text: string, maximum = 54): number[] {
  const value = String(text)
    .replace(/\uFF08/g, '(').replace(/\uFF09/g, ')')
    .replace(/[\uFF0C\u3001;]/g, ',').replace(/[\u2014\u2013~\u81F3]/g, '-')
    .replace(/[\u5468\u8282\u7B2C]/g, '').replace(/\u5355/g, 'odd').replace(/\u53CC/g, 'even')
    .replace(/weeks?|periods?/gi, '').replace(/\s/g, '').toLowerCase();
  if (!value || value.length > 500) throw new ProblemError({ code: 'range-empty' });
  const result = new Set<number>();
  for (const part of value.split(',')) {
    if (!part) continue;
    const match = /^(\d+)(?:-(\d+))?(?:\((odd|even)\))?$/.exec(part);
    if (!match) throw new ProblemError({ code: 'range-format', text });
    const start = Number(match[1]), end = Number(match[2] ?? start);
    if (start < 1 || end > maximum || end < start) throw new ProblemError({ code: 'range-bounds', maximum });
    for (let n = start; n <= end; n++) if (!match[3] || n % 2 === (match[3] === 'odd' ? 1 : 0)) result.add(n);
  }
  if (!result.size) throw new ProblemError({ code: 'range-none' });
  return [...result].sort((a, b) => a - b);
}

const englishParity = (range: string, odd: boolean) => `${range} (${odd ? 'odd' : 'even'})`;

/**
 * The shortest readable form, e.g. [1,3,5,7,10,11,12] → "1-7 (odd), 10-12". The interface
 * passes its language's odd/even wording; parseRanges reads both back.
 */
export function formatRanges(values: number[], parity: (range: string, odd: boolean) => string = englishParity): string {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 1) { parts.push(`${sorted[i]}-${sorted[j]}`); i = j + 1; continue; }
    let k = i;
    while (k + 1 < sorted.length && sorted[k + 1] === sorted[k] + 2) k++;
    if (k - i >= 2) {
      parts.push(parity(`${sorted[i]}-${sorted[k]}`, sorted[i] % 2 === 1));
      i = k + 1;
    } else {
      parts.push(String(sorted[i]));
      i++;
    }
  }
  return parts.join(', ');
}
