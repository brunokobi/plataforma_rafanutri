// RN-149 — Armazenamento da fila offline no IndexedDB (respostas, fotos e conclusão pendentes).
import { compact, superseded, type OfflineOp } from './ops';

const DB = 'rafanutri-offline';
const STORE = 'ops';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('runId', 'runId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req ? req.result : undefined);
    };
    t.onerror = () => reject(t.error);
  });
}

export async function enqueue(op: OfflineOp): Promise<void> {
  await tx('readwrite', (s) => s.add(op));
}

/** Fila do checklist já compactada (apaga do armazenamento o que ficou obsoleto). */
export async function pending(runId: string): Promise<OfflineOp[]> {
  const all = ((await tx<OfflineOp[]>('readonly', (s) => s.index('runId').getAll(runId))) ?? []) as OfflineOp[];
  const drop = superseded(all);
  if (drop.length) await tx('readwrite', (s) => void drop.forEach((id) => s.delete(id)));
  return compact(all);
}

export async function remove(id: number): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

export const offlineSupported = () => typeof indexedDB !== 'undefined';
