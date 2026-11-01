import type { FechamentoParse } from "@/lib/parse-fechamento";

const DB_NAME = "prazo-em-campo";
const STORE = "fechamento";
const KEY = "atual";

export type SavedFechamento = FechamentoParse & {
  fileName: string;
  uploadedAt: string;
};

export function emptyFechamento(): SavedFechamento | null {
  return null;
}

export async function loadFechamento(): Promise<SavedFechamento | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as SavedFechamento | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function saveFechamento(saved: SavedFechamento): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(saved, KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
