import type { TextItem } from '../timetable/grid';

/**
 * Text and positions from a PDF, through Mozilla's pdf.js (legacy build, for older Android
 * WebViews). It is loaded only when a PDF is chosen. Chinese timetables often use fonts the
 * file doesn't embed; the Chinese character maps they need are bundled under cmaps/ (see
 * vite.config.ts).
 */
export const PDF_MAX_BYTES = 10 * 1024 * 1024;

export async function readPdfText(data: ArrayBuffer): Promise<TextItem[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapUrl: new URL('cmaps/', document.baseURI).href,
    cMapPacked: true,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await task.promise;
  try {
    const pages: TextItem[][] = [];
    for (let n = 1; n <= Math.min(doc.numPages, 10); n++) {
      const page = await doc.getPage(n);
      // The viewport turns rotated pages upright, so columns always run left to right.
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        items.push({ x, y, width: item.width, text: item.str });
      }
      pages.push(items);
    }
    return pages;
  } finally {
    void task.destroy();
  }
}
