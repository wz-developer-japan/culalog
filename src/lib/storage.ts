// 書類のデータは端末の中（IndexedDB）にだけ保存する。サーバーには送らない。
// （書類の読み取りのときだけ、その書類の画像・PDF を Claude API に送る）

import type { Household } from "./types";

const DB_NAME = "culalog";
const STORE = "household";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadHousehold(): Promise<Household | null> {
  try {
    return ((await run("readonly", (s) => s.get(KEY))) as Household | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveHousehold(household: Household): Promise<void> {
  await run("readwrite", (s) => s.put(household, KEY));
}

/** この端末に保存したデータをすべて消す */
export async function clearHousehold(): Promise<void> {
  await run("readwrite", (s) => s.delete(KEY));
}
