/**
 * IndexedDB erişimi. Aynı şema public/sw.js içinde de kullanılır (bildirim
 * aksiyonları uygulama kapalıyken veriyi günceller) — değişiklikleri iki yerde de yapın.
 */
import type { Reminder } from "./types";

const DB_NAME = "hatirlat-bana";
const DB_VERSION = 1;
const STORE = "reminders";
const META = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export const getAllReminders = () => run<Reminder[]>(STORE, "readonly", (s) => s.getAll());
export const getReminder = (id: string) => run<Reminder | undefined>(STORE, "readonly", (s) => s.get(id));
export const putReminder = (r: Reminder) => run(STORE, "readwrite", (s) => s.put(r));
export const deleteReminder = (id: string) => run(STORE, "readwrite", (s) => s.delete(id));

export const getMeta = <T>(key: string) => run<T | undefined>(META, "readonly", (s) => s.get(key));
export const setMeta = (key: string, value: unknown) => run(META, "readwrite", (s) => s.put(value, key));

export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // HTTP (güvenli olmayan bağlam) üzerinde randomUUID yoktur.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function getDeviceId(): Promise<string> {
  let id = await getMeta<string>("deviceId");
  if (!id) {
    id = newId();
    await setMeta("deviceId", id);
  }
  return id;
}
