import { MAX_COLS, MAX_ROWS, tableOf, type Cell, type Table } from './table';

/**
 * Tables from web pages: a page saved from the academic system (.html), the same page as Chrome
 * on Android saves it (.mhtml), and the "Excel" exports that are really a web page. The page is
 * parsed into an inert document — its scripts never run and nothing it links to is fetched —
 * and only the text of its table cells is read.
 */

/** Bytes as text in the declared encoding, else the page's own, else UTF-8, else GB18030 (which covers GBK). */
export function decodeText(bytes: Uint8Array, declared?: string): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const head = latin1(bytes.subarray(0, 4096));
  const label = declared ?? /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(head)?.[1] ?? /encoding\s*=\s*["']([\w-]+)/i.exec(head)?.[1];
  for (const [encoding, fatal] of [[label, false], ['utf-8', true]] as const) {
    if (!encoding) continue;
    try {
      return new TextDecoder(encoding, { fatal }).decode(bytes);
    } catch {
      // An unknown label or text that isn't valid UTF-8: try the next.
    }
  }
  return new TextDecoder('gb18030').decode(bytes);
}

/** Bytes as one character each, which keeps binary parts of a file intact for looking through. */
export function latin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return out;
}

const fromLatin1 = (text: string) => Uint8Array.from(text, c => c.charCodeAt(0) & 0xff);

function quotedPrintable(text: string): Uint8Array {
  const body = text.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const hex = body[i] === '=' ? body.slice(i + 1, i + 3) : '';
    if (/^[0-9A-Fa-f]{2}$/.test(hex)) { out.push(parseInt(hex, 16)); i += 2; } else out.push(body.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(out);
}

function base64(text: string): Uint8Array {
  try {
    return fromLatin1(atob(text.replace(/[^A-Za-z0-9+/=]/g, '')));
  } catch {
    return new Uint8Array();
  }
}

/** The web pages inside an MHTML file (the page and any frames), given the file as latin1 text. */
export function mhtmlPages(text: string): string[] {
  const boundary = /boundary\s*=\s*"?([^";\r\n]+)"?/i.exec(text)?.[1];
  if (!boundary) return [];
  const pages: string[] = [];
  for (const part of text.split(`--${boundary}`).slice(1, 60)) {
    const split = /\r?\n\r?\n/.exec(part);
    if (!split) continue;
    const headers = part.slice(0, split.index), body = part.slice(split.index + split[0].length);
    const type = /^content-type:\s*([^;\r\n]+)(?:;[^\r\n]*?charset\s*=\s*"?([\w-]+))?/im.exec(headers);
    if (!type || type[1].trim().toLowerCase() !== 'text/html') continue;
    const encoding = /^content-transfer-encoding:\s*([\w-]+)/im.exec(headers)?.[1].toLowerCase();
    const bytes = encoding === 'quoted-printable' ? quotedPrintable(body) : encoding === 'base64' ? base64(body) : fromLatin1(body);
    pages.push(decodeText(bytes, type[2]));
  }
  return pages;
}

const BLOCK = new Set(['ADDRESS', 'ARTICLE', 'DD', 'DIV', 'DL', 'DT', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'SELECT', 'BUTTON', 'INPUT', 'TEXTAREA']);
/** Marks the edge of a block element until the text is tidied. */
const EDGE = '\u0001';

function textIn(node: Node): string {
  let out = '';
  node.childNodes.forEach(child => {
    if (child.nodeType === 3) out += (child.nodeValue ?? '').replace(/\s+/g, ' ');
    if (child.nodeType !== 1) return;
    const tag = (child as Element).tagName.toUpperCase();
    if (tag === 'BR') out += '\n';
    else if (tag === 'HR') out += '\n---\n';
    else if (BLOCK.has(tag)) out += `${EDGE}${textIn(child)}${EDGE}`;
    else if (!SKIP.has(tag)) out += textIn(child);
  });
  return out;
}

/**
 * A cell's text as it reads on the page: one line per line break or block, and a blank line
 * where the page leaves one (<br><br>), which separates two classes in a cell.
 */
export function cellText(node: Node): string {
  return textIn(node).replace(new RegExp(`\\s*${EDGE}[\\s${EDGE}]*`, 'g'), '\n')
    .split('\n').map(line => line.trim()).join('\n').trim();
}

/** A table's cells in the HTML table model: a cell spanning rows takes its slots from the rows below. */
function cellsOf(table: HTMLTableElement): Cell[] {
  const taken: boolean[][] = [];
  const cells: Cell[] = [];
  Array.from(table.rows).slice(0, MAX_ROWS).forEach((row, r) => {
    taken[r] ??= [];
    let c = 0;
    for (const td of Array.from(row.cells)) {
      while (taken[r][c]) c++;
      if (c >= MAX_COLS) break;
      const rows = Math.min(Math.max(1, Number(td.getAttribute('rowspan')) || 1), MAX_ROWS - r);
      const cols = Math.min(Math.max(1, Number(td.getAttribute('colspan')) || 1), MAX_COLS - c);
      for (let y = r; y < r + rows; y++) for (let x = c; x < c + cols; x++) (taken[y] ??= [])[x] = true;
      cells.push({ text: cellText(td), row: r, col: c, rows, cols });
      c += cols;
    }
  });
  return cells;
}

/** Every table in a web page, nested ones included. */
export function htmlTables(html: string): Table[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('table')).slice(0, 200).map(table => tableOf(cellsOf(table)));
}
