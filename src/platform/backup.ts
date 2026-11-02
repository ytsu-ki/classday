import { DataError, normalizeData, type NormalizeReport } from '../domain/schema';
import type { PlannerData } from '../domain/types';
import { Backup, isNative } from './native';

export const BACKUP_MAX_BYTES = 10 * 1024 * 1024;

export function backupName(day: string) {
  return `classday-backup-${day}.json`;
}

/** Saves a backup through the Android document picker, or as a download in a browser. */
export async function saveFile(filename: string, json: string): Promise<'saved' | 'cancelled'> {
  if (isNative()) return (await Backup.save({ filename, data: json })).cancelled ? 'cancelled' : 'saved';
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}

export function exportBackup(data: PlannerData, day: string) {
  return saveFile(backupName(day), JSON.stringify(data, null, 2));
}

/** File contents as text, with a FileReader fallback for engines without Blob.text(). */
export function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Reads a backup made by this app. */
export async function readBackupFile(file: File): Promise<NormalizeReport> {
  if (file.size > BACKUP_MAX_BYTES) throw new DataError({ code: 'backup-too-large' });
  let raw: unknown;
  try {
    raw = JSON.parse(await readText(file));
  } catch {
    throw new DataError({ code: 'backup-invalid' });
  }
  try {
    return normalizeData(raw);
  } catch (error) {
    throw error instanceof DataError ? new DataError({ code: 'backup-invalid' }) : error;
  }
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}
