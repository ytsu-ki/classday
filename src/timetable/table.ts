import type { ClassEntry } from './classes';
import { periodsInLabel } from './periodTimes';
import { parseTimetableText, recordsIn, weekdayIn } from './text';

/**
 * Reads classes from the tables in spreadsheets and web pages (see html.ts and xlsx.ts). A
 * timetable grid has a header row of weekdays and period labels down the left; a cell's class
 * takes its weekday from the header, and, when its text doesn't say, its periods from the rows it
 * spans. A table without a weekday header is read as a list, one class per row.
 */

/** One cell of a table, which may span several rows and columns. */
export interface Cell { text: string; row: number; col: number; rows: number; cols: number }
/** A table as rows of slots; a cell spanning several fills every slot it covers. */
export type Table = (Cell | undefined)[][];

export const MAX_ROWS = 400;
export const MAX_COLS = 60;

export interface TableResult {
  entries: ClassEntry[];
  skipped: number;
  /** The text beside each row of a grid, top to bottom, for reading period times from. */
  labels: string[];
}

/** Lays cells out as rows of slots; cells past the size limits are left out. */
export function tableOf(cells: Cell[]): Table {
  const table: Table = [];
  for (const cell of cells) {
    for (let r = cell.row; r < Math.min(cell.row + cell.rows, MAX_ROWS); r++) {
      table[r] ??= [];
      for (let c = cell.col; c < Math.min(cell.col + cell.cols, MAX_COLS); c++) table[r][c] ??= cell;
    }
  }
  for (let r = 0; r < table.length; r++) table[r] ??= [];
  return table;
}

/** The header row: at least five different weekdays in short cells, and the column of each. */
function headerOf(table: Table): { row: number; days: Map<number, number> } | null {
  for (let r = 0; r < Math.min(table.length, 15); r++) {
    const days = new Map<number, number>();
    table[r].forEach((cell, c) => {
      const text = cell?.text.trim() ?? '';
      const day = text.length <= 20 ? weekdayIn(text) : undefined;
      if (day !== undefined) days.set(c, day);
    });
    if (new Set(days.values()).size >= 5) return { row: r, days };
  }
  return null;
}

/** Classes in a cell separated by a blank line or a rule of dashes. */
const blocks = (text: string) => text.split(/\n\s*\n|\n?\s*[-=*_]{3,}\s*\n?/).map(b => b.trim()).filter(Boolean);
const oneLine = (text: string) => text.split('\n').map(l => l.trim()).filter(Boolean).join(', ');

/** The classes in one grid cell: academic-system records, or lines of name, room, teacher and weeks. */
function cellClasses(text: string, weekday: number, periods: [number, number] | undefined): { entries: ClassEntry[]; skipped: number } {
  const records = recordsIn(text);
  if (records.length) return { entries: records.map(r => ({ ...r, weekday })), skipped: 0 };
  const entries: ClassEntry[] = [];
  let skipped = 0;
  for (const block of blocks(text)) {
    const line = oneLine(block);
    let found = parseTimetableText(line, weekday).entries;
    // Most cells name only the course; the rows the cell spans say which periods it takes.
    if (!found.length && periods) found = parseTimetableText(`${line}, periods ${periods[0]}-${periods[1]}`, weekday).entries;
    if (found.length) entries.push(found[0]);
    else skipped++;
  }
  return { entries, skipped };
}

function readGridTable(table: Table, header: { row: number; days: Map<number, number> }): TableResult {
  const firstDay = Math.min(...header.days.keys());
  const labelOf = (r: number) => [...new Set(table[r].slice(0, firstDay).filter((c): c is Cell => !!c && c.col + c.cols <= firstDay))]
    .map(c => c.text.trim()).filter(Boolean).join(' ');
  const rowPeriods: ([number, number] | undefined)[] = [];
  const labels: string[] = [];
  for (let r = header.row + 1; r < table.length; r++) {
    const label = labelOf(r);
    rowPeriods[r] = periodsInLabel(label);
    if (label && label !== labels[labels.length - 1]) labels.push(label);
  }
  const out: TableResult = { entries: [], skipped: 0, labels };
  const seen = new Set<Cell>();
  for (let r = header.row + 1; r < table.length; r++) {
    for (const [c, weekday] of header.days) {
      const cell = table[r][c];
      if (!cell || seen.has(cell) || cell.row <= header.row || cell.col < firstDay) continue;
      seen.add(cell);
      if (!cell.text.trim()) continue;
      const spanned = rowPeriods.slice(cell.row, cell.row + cell.rows).filter((p): p is [number, number] => !!p);
      const periods: [number, number] | undefined = spanned.length ? [Math.min(...spanned.map(p => p[0])), Math.max(...spanned.map(p => p[1]))] : undefined;
      const found = cellClasses(cell.text, weekday, periods);
      out.entries.push(...found.entries);
      out.skipped += found.skipped;
    }
  }
  return out;
}

/** A table without a weekday header: one class per row, its cells read as one line. */
function readListTable(table: Table): TableResult {
  const lines = table.map(row => [...new Set(row.filter((c): c is Cell => !!c))].map(c => c.text.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join(', '));
  const { entries, skipped } = parseTimetableText(lines.filter(Boolean).join('\n'));
  return { entries, skipped, labels: [] };
}

/**
 * The classes in a file's tables. Every grid with a weekday header is read; when there is none,
 * the table that yields the most classes as a list.
 */
export function classesFromTables(tables: Table[]): TableResult {
  const grids = tables.map(table => ({ table, header: headerOf(table) })).filter(g => g.header);
  if (grids.length) {
    const results = grids.map(g => readGridTable(g.table, g.header!));
    return { entries: results.flatMap(r => r.entries), skipped: results.reduce((n, r) => n + r.skipped, 0), labels: results.flatMap(r => r.labels) };
  }
  return tables.map(readListTable).sort((a, b) => b.entries.length - a.entries.length)[0] ?? { entries: [], skipped: 0, labels: [] };
}
