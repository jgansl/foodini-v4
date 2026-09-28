import type { GroceryLine } from "@/lib/grocery";
import type { ListChange } from "@/lib/offline-queue";

export type Snapshot = { week: string; sections: { section: string; lines: GroceryLine[] }[]; generatedAt: string };

// Everything this app stores on the device starts with "foodini-" so sign-out can clear it.
const DB_NAME = "foodini-offline";
const SNAPSHOTS = "snapshots";
const QUEUES = "queues";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS);
      if (!db.objectStoreNames.contains(QUEUES)) db.createObjectStore(QUEUES);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs one request in a transaction. Returns undefined if storage is unavailable (e.g. private browsing). */
async function run<T>(store: string, mode: IDBTransactionMode, makeRequest: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = makeRequest(tx.objectStore(store));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result as T);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    return undefined;
  }
}

export const loadSnapshot = (userId: string, week: string) => run<Snapshot>(SNAPSHOTS, "readonly", (s) => s.get(`${userId}:${week}`));
export const saveSnapshot = (userId: string, snapshot: Snapshot) => run(SNAPSHOTS, "readwrite", (s) => s.put(snapshot, `${userId}:${snapshot.week}`));
export const loadQueue = async (userId: string) => (await run<ListChange[]>(QUEUES, "readonly", (s) => s.get(userId))) ?? [];
export const saveQueue = (userId: string, queue: ListChange[]) => run(QUEUES, "readwrite", (s) => s.put(queue, userId));

/** Removes lists and queues saved on this device, and the service worker's caches. */
export async function clearOfflineData(): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
  try {
    for (const key of await caches.keys()) if (key.startsWith("foodini-")) await caches.delete(key);
  } catch {
    // Cache Storage unavailable: nothing to clear.
  }
}
