import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const androidDir = path.join(root, 'android');

/** Finds the Android SDK from ANDROID_HOME, android/local.properties, or the usual install folders. */
export function androidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(homedir(), 'Library/Android/sdk'),
    path.join(homedir(), 'Android/Sdk'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android/Sdk'),
  ].filter(Boolean);
  if (existsSync(path.join(androidDir, 'local.properties'))) return null; // Gradle reads it directly.
  return candidates.find(dir => existsSync(path.join(dir, 'platforms'))) ?? null;
}

/** The newest installed apksigner, if any. */
export function apksigner(sdk) {
  const base = sdk ?? process.env.ANDROID_HOME;
  if (!base) return null;
  const tools = path.join(base, 'build-tools');
  if (!existsSync(tools)) return null;
  const versions = readdirSync(tools).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const version of versions.reverse()) {
    const file = path.join(tools, version, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
    if (existsSync(file)) return file;
  }
  return null;
}
