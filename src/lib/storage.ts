// 書類のデータは端末の中（IndexedDB）にだけ保存する。サーバーには送らない。
// （書類の読み取りのときだけ、その書類の画像・PDF を Claude API に送る）

import { withDemoIcons } from "./avatars";
import type { Household } from "./types";

const DB_NAME = "culalog";
const STORE = "household";
const KEY = "current";
/** 受け取り箱に入れた写真・PDF（家のデータとは分けて置く。保存のたびに何十枚もの画像を書き直さないため） */
const FILES = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = STORE,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadHousehold(): Promise<Household | null> {
  try {
    const household = (await run("readonly", (s) => s.get(KEY))) as Household | undefined;
    // 前に始めた架空の家族にも、既定のアイコンを足す（変えていない人だけ）
    return household ? withDemoIcons(household) : null;
  } catch {
    return null;
  }
}

export async function saveHousehold(household: Household): Promise<void> {
  await run("readwrite", (s) => s.put(household, KEY));
}

/** この端末に保存したデータをすべて消す（受け取り箱の写真・PDF も） */
export async function clearHousehold(): Promise<void> {
  await run("readwrite", (s) => s.delete(KEY));
  await run("readwrite", (s) => s.clear(), FILES);
}

/** 受け取り箱の写真・PDF（data URL）を置く・読む・消す */
export async function putFile(id: string, dataUrl: string): Promise<void> {
  await run("readwrite", (s) => s.put(dataUrl, id), FILES);
}

export async function getFile(id: string): Promise<string | null> {
  try {
    return ((await run("readonly", (s) => s.get(id), FILES)) as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function deleteFile(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id), FILES).catch(() => undefined);
}
