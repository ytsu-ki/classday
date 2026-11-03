import { ProblemError } from '../domain/problems';
import { toClock } from '../domain/time';
import { MAX_COLS, MAX_ROWS, tableOf, type Cell, type Table } from './table';

/**
 * Tables from Excel files without a spreadsheet library: an .xlsx is a zip of XML parts, opened
 * with the WebView's own deflate (DecompressionStream) and XML parser; Excel 2003's XML format
 * is one XML document. Only the parts that hold cells are read, each with a size limit.
 */

const PART_MAX_BYTES = 20 * 1024 * 1024;
const unreadable = () => new ProblemError({ code: 'file-unreadable' });

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

interface ZipEntry { method: number; packed: number; size: number; offset: number }

/** The files in a zip, from its central directory at the end. */
function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (u32(bytes, i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw unreadable();
  const count = u16(bytes, end + 10);
  if (count > 5000) throw unreadable();
  const entries = new Map<string, ZipEntry>();
  let at = u32(bytes, end + 16);
  const names = new TextDecoder('utf-8');
  for (let k = 0; k < count; k++) {
    if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50) throw unreadable();
    const nameLength = u16(bytes, at + 28);
    entries.set(names.decode(bytes.subarray(at + 46, at + 46 + nameLength)), {
      method: u16(bytes, at + 10), packed: u32(bytes, at + 20), size: u32(bytes, at + 24), offset: u32(bytes, at + 42),
    });
    at += 46 + nameLength + u16(bytes, at + 30) + u16(bytes, at + 32);
  }
  return entries;
}

/** Inflates raw deflate data, stopping once it grows past the limit (a zip bomb). */
async function inflate(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const input = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(data); controller.close(); } });
  const reader = input.pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { void reader.cancel(); throw unreadable(); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

async function zipText(bytes: Uint8Array, entry: ZipEntry | undefined): Promise<string | null> {
  if (!entry) return null;
  if (entry.size > PART_MAX_BYTES || u32(bytes, entry.offset) !== 0x04034b50) throw unreadable();
  const start = entry.offset + 30 + u16(bytes, entry.offset + 26) + u16(bytes, entry.offset + 28);
  const data = bytes.subarray(start, start + entry.packed);
  if (entry.method !== 0 && entry.method !== 8) throw unreadable();
  return new TextDecoder('utf-8').decode(entry.method === 0 ? data : await inflate(data, PART_MAX_BYTES));
}

/** An XML document, refusing any that declares entities (which can expand without end). */
export function parseXml(text: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw unreadable();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw unreadable();
  return doc;
}

/** Elements by local name, whatever prefix the file gives them. */
const all = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS('*', name));
const textOf = (node: Element) => all(node, 't').filter(t => !t.closest('rPh')).map(t => t.textContent ?? '').join('');

/** "C12" as a zero-based row and column. */
function position(ref: string): [number, number] | null {
  const m = /^([A-Z]{1,3})(\d{1,7})$/.exec(ref.toUpperCase());
  if (!m) return null;
  const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return [Number(m[2]) - 1, col];
}

/** A number that is a whole minute of a day, as Excel stores a time, reads as that time. */
function numberText(value: string): string {
  const n = Number(value);
  const minute = n * 1440;
  return n > 0 && n < 1 && Math.abs(minute - Math.round(minute)) < 0.01 ? toClock(Math.round(minute)) : value;
}

function sheetTable(doc: Document, shared: string[]): Table {
  const cells: Cell[] = [];
  const merged = all(doc, 'mergeCell').map(m => (m.getAttribute('ref') ?? '').split(':').map(position)).filter(([a, b]) => a && b) as [number, number][][];
  const coveredBy = (r: number, c: number) => merged.find(([[r1, c1], [r2, c2]]) => r >= r1 && r <= r2 && c >= c1 && c <= c2);
  let r = -1;
  for (const row of all(doc, 'row').slice(0, MAX_ROWS)) {
    const given = Number(row.getAttribute('r'));
    r = Number.isInteger(given) && given > 0 ? given - 1 : r + 1;
    let c = -1;
    for (const cell of all(row, 'c')) {
      const at = position(cell.getAttribute('r') ?? '');
      if (at) [r, c] = at; else c++;
      if (r < 0 || r >= MAX_ROWS || c >= MAX_COLS) continue;
      const value = all(cell, 'v')[0]?.textContent ?? '';
      const type = cell.getAttribute('t');
      const text = type === 's' ? shared[Number(value)] ?? '' : type === 'inlineStr' ? textOf(cell) : type === 'str' || type === 'b' || type === 'e' ? value : numberText(value);
      const area = coveredBy(r, c);
      // Only the top-left cell of a merged area holds its text; it spans the rest.
      if (area && (area[0][0] !== r || area[0][1] !== c)) continue;
      cells.push({ text: text.replace(/\r\n?/g, '\n'), row: r, col: c, rows: area ? area[1][0] - r + 1 : 1, cols: area ? area[1][1] - c + 1 : 1 });
    }
  }
  // A merged area whose top-left cell the file leaves out still covers its slots.
  for (const [[r1, c1], [r2, c2]] of merged) {
    if (!cells.some(cell => cell.row === r1 && cell.col === c1)) cells.push({ text: '', row: r1, col: c1, rows: r2 - r1 + 1, cols: c2 - c1 + 1 });
  }
  return tableOf(cells);
}

/** The tables in an .xlsx file, one per sheet, in the workbook's order. */
export async function xlsxTables(bytes: Uint8Array): Promise<Table[]> {
  const entries = zipEntries(bytes);
  const workbook = await zipText(bytes, entries.get('xl/workbook.xml'));
  // A zip without a workbook is some other kind of file, a .docx say.
  if (!workbook) throw new ProblemError({ code: 'file-unknown' });
  const rels = await zipText(bytes, entries.get('xl/_rels/workbook.xml.rels'));
  const targets = new Map(rels ? all(parseXml(rels), 'Relationship').map(r => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']) : []);
  const paths = all(parseXml(workbook), 'sheet')
    .map(s => targets.get(s.getAttribute('r:id') ?? s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')))
    .filter((t): t is string => !!t)
    .map(t => (t.startsWith('/') ? t.slice(1) : `xl/${t}`));
  const sheets = paths.length ? paths : [...entries.keys()].filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort();
  const strings = await zipText(bytes, entries.get('xl/sharedStrings.xml'));
  const shared = strings ? all(parseXml(strings), 'si').map(textOf) : [];
  const tables: Table[] = [];
  for (const path of sheets.slice(0, 20)) {
    const sheet = await zipText(bytes, entries.get(path));
    if (sheet) tables.push(sheetTable(parseXml(sheet), shared));
  }
  return tables;
}

const SS = 'urn:schemas-microsoft-com:office:spreadsheet';
const ssAttr = (el: Element, name: string) => Number(el.getAttributeNS(SS, name) ?? el.getAttribute(`ss:${name}`) ?? NaN);

/** The tables in an Excel 2003 XML file (also saved as .xls), one per worksheet. */
export function spreadsheetMlTables(xml: string): Table[] {
  const doc = parseXml(xml);
  return all(doc, 'Worksheet').slice(0, 20).map(sheet => {
    const cells: Cell[] = [];
    const taken = new Set<string>();
    let r = -1;
    for (const row of all(sheet, 'Row').slice(0, MAX_ROWS)) {
      const index = ssAttr(row, 'Index');
      r = Number.isInteger(index) && index > r + 1 ? index - 1 : r + 1;
      let c = -1;
      for (const cell of Array.from(row.children).filter(el => el.localName === 'Cell')) {
        const at = ssAttr(cell, 'Index');
        c = Number.isInteger(at) && at > c + 1 ? at - 1 : c + 1;
        while (taken.has(`${r}:${c}`)) c++;
        if (r >= MAX_ROWS || c >= MAX_COLS) continue;
        const across = ssAttr(cell, 'MergeAcross'), down = ssAttr(cell, 'MergeDown');
        const rows = Number.isInteger(down) && down > 0 ? Math.min(down + 1, MAX_ROWS - r) : 1;
        const cols = Number.isInteger(across) && across > 0 ? Math.min(across + 1, MAX_COLS - c) : 1;
        for (let y = r; y < r + rows; y++) for (let x = c; x < c + cols; x++) taken.add(`${y}:${x}`);
        const data = all(cell, 'Data')[0];
        cells.push({ text: (data?.textContent ?? '').replace(/\r\n?/g, '\n').trim(), row: r, col: c, rows, cols });
        c += cols - 1;
      }
    }
    return tableOf(cells);
  });
}
