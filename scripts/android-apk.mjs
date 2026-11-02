import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { androidDir, androidSdk, apksigner, root } from './android-env.mjs';

/**
 * Builds the Android app.
 *   node scripts/android-apk.mjs debug    → releases/classday-<version>-debug.apk
 *   node scripts/android-apk.mjs release  → releases/classday-<version>.apk (signed, certificate checked)
 *   node scripts/android-apk.mjs test     → native unit tests
 *   node scripts/android-apk.mjs lint     → Android lint (report in android/app/build/reports)
 */
const mode = process.argv[2] ?? 'release';
const allowNewIdentity = process.argv.includes('--allow-new-identity');
const tasks = { debug: ['assembleDebug'], release: ['assembleRelease'], test: ['testDebugUnitTest'], lint: ['lintDebug'] }[mode];
if (!tasks) throw new Error(`Unknown mode "${mode}". Use debug, release, test or lint.`);

const sdk = androidSdk();
const env = { ...process.env, ...(sdk ? { ANDROID_HOME: sdk } : {}) };
const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(gradle, ['--no-daemon', ...tasks], { cwd: androidDir, stdio: 'inherit', shell: process.platform === 'win32', env });
if (result.status !== 0) throw new Error(`Gradle ${tasks.join(' ')} failed.`);
if (mode === 'test' || mode === 'lint') process.exit(0);

const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const built = path.join(androidDir, `app/build/outputs/apk/${mode}/app-${mode}.apk`);
const name = mode === 'release' ? `classday-${version}.apk` : `classday-${version}-debug.apk`;
const output = path.join(root, 'releases', name);

if (mode === 'release') {
  // An update only installs over an earlier release signed by the same certificate.
  const expected = (await readFile(path.join(androidDir, 'release-certificate.sha256'), 'utf8')).trim();
  const signer = apksigner(sdk);
  if (!signer) throw new Error('apksigner was not found, so the release certificate could not be checked.');
  const check = spawnSync(signer, ['verify', '--print-certs', built], { encoding: 'utf8', env });
  const actual = /SHA-256 digest: ([0-9a-f]+)/.exec(check.stdout ?? '')?.[1];
  if (check.status !== 0 || !actual) throw new Error('The release APK signature could not be verified.');
  if (actual !== expected && !allowNewIdentity)
    throw new Error(`The APK is signed with a different certificate (${actual}). Phones with an earlier release could not update. Restore the original signing key, or pass --allow-new-identity for a deliberately separate install base.`);
}

await mkdir(path.join(root, 'releases'), { recursive: true });
await copyFile(built, output);
const sha = createHash('sha256').update(await readFile(output)).digest('hex');
await writeFile(`${output}.sha256`, `${sha}  ${name}\n`);
console.log(`${mode === 'release' ? 'Signed release' : 'Debug'} APK: ${path.relative(root, output)}`);
