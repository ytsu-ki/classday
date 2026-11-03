import { ProblemError } from '../domain/problems';
import type { ClassPeriod } from '../domain/types';
import { readPdfText } from '../platform/pdf';
import type { ClassEntry } from './classes';
import { readGrid } from './grid';
import { decodeText, htmlTables, latin1, mhtmlPages } from './html';
import { periodTimesIn } from './periodTimes';
import { classesFromTables, type Table } from './table';
import { parseTimetableText } from './text';
import { spreadsheetMlTables, xlsxTables } from './xlsx';

/**
 * "From a file": what a file holds decides how it is read, whatever its name says, since saved
 * pages and academic-system exports often carry the wrong extension (an "Excel" file that is a
 * web page, say). Loaded only when a file is chosen, with the PDF, web page and Excel readers.
 */

export const FILE_MAX_BYTES = 10 * 1024 * 1024;
/** As long as text pasted into the import can be. */
const TEXT_MAX_CHARS = 200 * 1024;

export type FileKind = 'pdf' | 'calendar' | 'xlsx' | 'old-excel' | 'mhtml' | 'excel-xml' | 'html' | 'text';

export type FileTimetable =
  | { kind: 'classes'; entries: ClassEntry[]; skipped: number; periods: ClassPeriod[] }
  /** A calendar goes on to the calendar step, which asks for its dates. */
  | { kind: 'calendar' };

const starts = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);

/** What kind of file the bytes are, from how they begin. */
export function fileKind(bytes: Uint8Array): FileKind {
  if (starts(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'xlsx';
  if (starts(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'old-excel';
  if (latin1(bytes.subarray(0, 1024)).includes('%PDF-')) return 'pdf';
  const head = decodeText(bytes.subarray(0, 4096)).replace(/^﻿/, '').trimStart();
  if (/^BEGIN:VCALENDAR/i.test(head)) return 'calendar';
  if (/^MIME-Version:/im.test(head) && /multipart\/related/i.test(head)) return 'mhtml';
  if (/<Workbook[\s>]/.test(head) && /urn:schemas-microsoft-com:office:spreadsheet/.test(head) && !/<html[\s>]/i.test(head)) return 'excel-xml';
  if (/<(?:!doctype\s+html|html|head|body|table|meta)[\s>]/i.test(head)) return 'html';
  return 'text';
}

async function bytesOf(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function fromTables(tables: Table[]): FileTimetable {
  const { entries, skipped, labels } = classesFromTables(tables);
  return { kind: 'classes', entries, skipped, periods: periodTimesIn(labels) };
}

async function fromPdf(bytes: Uint8Array): Promise<FileTimetable> {
  let pages;
  try {
    pages = await readPdfText(bytes.slice().buffer);
  } catch {
    throw new ProblemError({ code: 'file-unreadable' });
  }
  const { entries, labels } = readGrid(pages);
  if (entries.length) return { kind: 'classes', entries, skipped: 0, periods: periodTimesIn(labels) };
  // Without a grid, the PDF's text may still be a list of classes.
  const result = parseTimetableText(pages.map(items => items.map(i => i.text).join('\n')).join('\n'));
  return { kind: 'classes', ...result, periods: [] };
}

/** Reads a timetable file of any supported kind. */
export async function readTimetableFile(file: Blob): Promise<FileTimetable> {
  if (file.size > FILE_MAX_BYTES) throw new ProblemError({ code: 'file-too-large' });
  const bytes = await bytesOf(file);
  switch (fileKind(bytes)) {
    case 'pdf': return fromPdf(bytes);
    case 'calendar': return { kind: 'calendar' };
    case 'old-excel': throw new ProblemError({ code: 'file-old-excel' });
    case 'xlsx': return fromTables(await xlsxTables(bytes));
    case 'mhtml': return fromTables(mhtmlPages(latin1(bytes)).flatMap(htmlTables));
    case 'excel-xml': return fromTables(spreadsheetMlTables(decodeText(bytes)));
    case 'html': return fromTables(htmlTables(decodeText(bytes)));
    case 'text': {
      const text = decodeText(bytes);
      // Binary data decodes to replacement characters and control codes, not a timetable.
      if (/[\u0000-\u0008�]/.test(text.slice(0, 4096))) throw new ProblemError({ code: 'file-unknown' });
      if (text.length > TEXT_MAX_CHARS) throw new ProblemError({ code: 'text-too-large' });
      return { kind: 'classes', ...parseTimetableText(text), periods: [] };
    }
  }
}
