import type { ClassEntry } from './classes';
import { normalizeText, parseTimetableText, recordsIn, weekdayIn } from './text';

/**
 * Reads a timetable grid from a PDF's text: weekday headers mark the columns, and each column's
 * text is read top to bottom as academic-system records (or as ordinary lines when it has none).
 * Pages without headers, such as the second page of a long timetable, reuse the last columns.
 */

/** A piece of text on a page, in page coordinates: x to the right, y down. */
export interface TextItem { x: number; y: number; width: number; text: string }

interface Column { weekday: number; left: number; right: number }
/** The columns, and where the header row is: text above it (title, student details) is not a class. */
interface Layout { columns: Column[]; top: number }

function layoutOf(items: TextItem[]): Layout | null {
  const headers = items
    .map(i => ({ i, day: i.text.trim().length <= 10 ? weekdayIn(i.text.trim()) : undefined }))
    .filter((h): h is { i: TextItem; day: number } => h.day !== undefined)
    .map(h => ({ day: h.day, center: h.i.x + h.i.width / 2, y: h.i.y }));
  // A header row has at least five weekdays on (nearly) the same line, each once.
  const rows = new Map<number, typeof headers>();
  for (const h of headers) {
    const key = [...rows.keys()].find(y => Math.abs(y - h.y) < 4) ?? h.y;
    rows.set(key, [...(rows.get(key) ?? []), h]);
  }
  const row = [...rows.values()].filter(r => new Set(r.map(h => h.day)).size >= 5).sort((a, b) => b.length - a.length)[0];
  if (!row) return null;
  const sorted = [...row].sort((a, b) => a.center - b.center);
  const gaps = sorted.slice(1).map((h, k) => h.center - sorted[k].center).sort((a, b) => a - b);
  const half = gaps[Math.floor(gaps.length / 2)] / 2;
  return {
    columns: sorted.map(h => ({ weekday: h.day, left: h.center - half, right: h.center + half })),
    top: Math.max(...row.map(h => h.y)),
  };
}

/** Pieces of one cell's text, in reading order; Chinese text was only split by line breaks. */
function columnText(items: TextItem[]): string[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x).map(i => i.text);
}

/** Text left of the grid, one line per row, top to bottom: the period numbers and any times beside them. */
function labelsOf(items: TextItem[], left: number, top: number): string[] {
  const rows: TextItem[][] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (item.y <= top || item.x + item.width > left + 1) continue;
    const row = rows.find(r => Math.abs(r[0].y - item.y) < 4);
    if (row) row.push(item); else rows.push([item]);
  }
  return rows.map(r => r.sort((a, b) => a.x - b.x).map(i => i.text.trim()).join(' ')).filter(Boolean);
}

export interface GridResult {
  entries: ClassEntry[];
  /** The labels down the left of the grid, for reading period times from (see periodTimes.ts). */
  labels: string[];
}

export function readGrid(pages: TextItem[][]): GridResult {
  const entries: ClassEntry[] = [];
  const labels: string[] = [];
  let columns: Column[] | null = null;
  for (const items of pages) {
    const layout = layoutOf(items);
    // A page without headers continues the grid of the page before it, from its very top.
    columns = layout?.columns ?? columns;
    const top = layout ? layout.top + 2 : -Infinity;
    if (!columns) continue;
    labels.push(...labelsOf(items, Math.min(...columns.map(c => c.left)), top));
    for (const column of columns) {
      const inColumn = items.filter(i => {
        const start = i.x + 1;
        return i.y > top && start >= column.left && start < column.right;
      });
      if (!inColumn.length) continue;
      const pieces = columnText(inColumn);
      const records = recordsIn(normalizeText(pieces.join('\n')));
      if (records.length) for (const r of records) entries.push({ ...r, weekday: column.weekday });
      else entries.push(...parseTimetableText(pieces.join('\n'), column.weekday).entries);
    }
  }
  return { entries, labels };
}

export const classesFromGrid = (pages: TextItem[][]): ClassEntry[] => readGrid(pages).entries;
