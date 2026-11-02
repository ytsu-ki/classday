import type { StorageBackend } from '../platform/storage';

/** Platform services chosen once at startup and shared by screens that need them directly. */
export const services: { backend: StorageBackend | null } = { backend: null };
