import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative, extname } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
// Generated output, archives and dependencies are not project-owned text.
const excluded = new Set(['.git', 'node_modules', '.gradle', '.android-signing', 'build', 'dist', 'archive', 'releases']);
const excludedPaths = new Set(['android/app/src/main/assets']);
const textTypes = new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.css','.html','.json','.md','.txt','.xml','.java','.kt','.kts','.gradle','.properties','.webmanifest','.ics','.yml','.yaml','.toml','.svg','.sh','.bat','.sha256']);
const cjk = /[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/u;
// Simplified Chinese lives only in its own files (names containing zh-Hans), the Android
// values-zh-rCN resources, and lines of index.html marked lang="zh-Hans". Everything else,
// including code, comments and documentation, stays English.
const chineseFile = name => /zh-Hans/.test(name) || name.startsWith('android/app/src/main/res/values-zh-rCN/');
const chineseLine = (name, line) => name === 'index.html' && line.includes('lang="zh-Hans"');
const failures = [];
let files = 0;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), name = relative(root, path);
    if (excluded.has(entry.name) || excludedPaths.has(name)) continue;
    if (cjk.test(entry.name)) failures.push(`${name}: Chinese characters in a filename`);
    if (entry.isDirectory()) { await scan(path); continue; }
    if (!entry.isFile()) continue;
    if (!textTypes.has(extname(entry.name)) && !['gradlew','.gitignore'].includes(entry.name)) continue;
    const text = await readFile(path, 'utf8'); files++;
    if (chineseFile(name)) continue;
    text.split('\n').forEach((line, index) => {
      if (cjk.test(line) && !chineseLine(name, line)) failures.push(`${name}:${index + 1}: Chinese text outside the Simplified Chinese files`);
    });
  }
}
await scan(root);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`English audit passed: ${files} text files; Chinese text only in the Simplified Chinese files.`);
