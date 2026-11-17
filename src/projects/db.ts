import type { Project, ProjectData, ProjectMeta } from './types';

const DB_NAME = 'tridge';
const VERSION = 1;
const META = 'meta';
const DATA = 'data';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // another tab upgrading the database, or the browser closing it: reopen next time
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      db.onclose = () => {
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error('Could not open the project storage.'));
    };
    req.onblocked = () => {
      opening = null;
      reject(new Error('The project storage is busy. Close other TRIDGE tabs and try again.'));
    };
  });
  return opening;
}

/** Forget the open connection (used by tests that swap the database). */
export function resetDb() {
  opening?.then((db) => db.close()).catch(() => undefined);
  opening = null;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('The project could not be stored.'));
    tx.onabort = () => reject(tx.error ?? new Error('The project could not be stored.'));
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Write a project (both its gallery card and its contents) in one step, so a half-saved project cannot exist. */
export async function saveProject(project: Project): Promise<void> {
  const db = await open();
  const tx = db.transaction([META, DATA], 'readwrite');
  tx.objectStore(META).put(project.meta);
  tx.objectStore(DATA).put(project.data);
  await done(tx);
}

/** Every project's gallery card, newest first. Does not read the heavy contents. */
export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await open();
  const all = await request(
    db.transaction(META).objectStore(META).getAll() as IDBRequest<ProjectMeta[]>,
  );
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<Project | null> {
  const db = await open();
  const tx = db.transaction([META, DATA]);
  const [meta, data] = await Promise.all([
    request(tx.objectStore(META).get(id) as IDBRequest<ProjectMeta | undefined>),
    request(tx.objectStore(DATA).get(id) as IDBRequest<ProjectData | undefined>),
  ]);
  return meta && data ? { meta, data } : null;
}

export async function removeProject(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction([META, DATA], 'readwrite');
  tx.objectStore(META).delete(id);
  tx.objectStore(DATA).delete(id);
  await done(tx);
}

export async function renameProject(id: string, name: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(META, 'readwrite');
  const store = tx.objectStore(META);
  const meta = (await request(store.get(id))) as ProjectMeta | undefined;
  if (meta) store.put({ ...meta, name: name.trim() || meta.name });
  await done(tx);
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Make an independent copy, named "<name> copy". Returns the new id. */
export async function duplicateProject(id: string): Promise<string | null> {
  const p = await loadProject(id);
  if (!p) return null;
  const copyId = newId();
  const now = Date.now();
  await saveProject({
    meta: { ...p.meta, id: copyId, name: `${p.meta.name} copy`, createdAt: now, updatedAt: now },
    data: { ...p.data, id: copyId },
  });
  return copyId;
}

/** How much of the browser's storage this site uses and may use. Null when the browser will not say. */
export async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e || !e.quota) return null;
    return { usage: e.usage ?? 0, quota: e.quota };
  } catch {
    return null;
  }
}

/** True when storage is nearly full and a warning is due. */
export function nearlyFull(u: { usage: number; quota: number } | null, threshold = 0.85): boolean {
  return Boolean(u && u.usage / u.quota >= threshold);
}
