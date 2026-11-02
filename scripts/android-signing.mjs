import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Checks that the release signing key is present. Android only installs an update over an
 * existing app when both are signed by the same key, so a missing key is an error — a new key is
 * created only when explicitly requested with --new-identity.
 */
const dir = fileURLToPath(new URL('../.android-signing/', import.meta.url));
const key = path.join(dir, 'release.jks');
const properties = path.join(dir, 'signing.properties');
const exists = file => access(file).then(() => true, () => false);
const [hasKey, hasProperties] = await Promise.all([exists(key), exists(properties)]);

if (hasKey && hasProperties) {
  console.log('Using the existing release signing key.');
} else if (hasKey || hasProperties) {
  throw new Error('The signing files are incomplete. Restore both release.jks and signing.properties from your private backup.');
} else if (!process.argv.includes('--new-identity')) {
  throw new Error([
    'No release signing key in .android-signing/.',
    'Restore release.jks and signing.properties from your private backup so the APK can update existing installs.',
    'Only for a brand-new install base, run: node scripts/android-signing.mjs --new-identity',
  ].join('\n'));
} else {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const secret = randomBytes(32).toString('hex');
  const keytool = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'keytool') : 'keytool';
  const result = spawnSync(keytool, ['-genkeypair', '-keystore', key, '-storetype', 'PKCS12', '-alias', 'planner', '-keyalg', 'RSA',
    '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Classday Android App',
    '-storepass:env', 'PLANNER_KEY_PASSWORD', '-keypass:env', 'PLANNER_KEY_PASSWORD'], {
    env: { ...process.env, PLANNER_KEY_PASSWORD: secret }, stdio: 'pipe',
  });
  if (result.status !== 0) throw new Error('Creating the signing key failed. Check the JDK installation.');
  await chmod(key, 0o600);
  await writeFile(properties, `storeFile=${key.replace(/\\/g, '\\\\')}\nstorePassword=${secret}\nkeyAlias=planner\nkeyPassword=${secret}\n`, { mode: 0o600 });
  console.log('Created a NEW signing identity in .android-signing/. Back up both files privately; every future update needs them.');
}
