import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import preact from '@preact/preset-vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Serves and bundles pdf.js's character maps for Chinese (GB) fonts at cmaps/, so PDFs whose
 * Chinese font isn't embedded can still be read offline. Other scripts' maps are left out.
 */
function chineseCMaps(): Plugin {
  const dir = fileURLToPath(new URL('./node_modules/pdfjs-dist/cmaps/', import.meta.url));
  const names = readdirSync(dir).filter(name => /GB/.test(name) && name.endsWith('.bcmap'));
  return {
    name: 'chinese-cmaps',
    configureServer(server) {
      server.middlewares.use('/cmaps/', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').slice(1).split('?')[0]);
        if (!names.includes(name)) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(readFileSync(dir + name));
      });
    },
    generateBundle() {
      for (const name of names) this.emitFile({ type: 'asset', fileName: `cmaps/${name}`, source: readFileSync(dir + name) });
    },
  };
}

export default defineConfig({
  plugins: [preact(), chineseCMaps()],
  base: './',
  define: { 'import.meta.env.APP_VERSION': JSON.stringify(version) },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Android System WebView 105 is the oldest supported engine.
    target: 'chrome105',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
});
