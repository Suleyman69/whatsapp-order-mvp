/**
 * Minimum push sunucusu deposu: tek bir JSON dosyası.
 * Tek sunucu (VPS) kurulumu için yeterli. Birden çok sunucu / serverless için
 * aynı arayüzü bir veritabanı (SQLite, Postgres, Redis) ile değiştirmek gerekir.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { PushSubscription } from "web-push";
import type { Repeat, SyncItem } from "../types";

export interface Job extends SyncItem {
  deviceId: string;
  /** En son push gönderilen dueAt. Aynı zaman için ikinci kez gönderilmez. */
  sentDue?: number;
}

export interface StoreData {
  devices: Record<string, { subscription: PushSubscription; updatedAt: number }>;
  /** Anahtar: `${deviceId}:${reminderId}` */
  jobs: Record<string, Job>;
}

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "push-store.json");

// Next.js route'ları ve instrumentation ayrı paketlerde derlenir; durumu tüm modül
// kopyaları arasında paylaşmak için globalThis kullanılır.
const g = globalThis as unknown as {
  __hbStore?: { data: StoreData | null; lock: Promise<unknown> };
};
const state = (g.__hbStore ??= { data: null, lock: Promise.resolve() });

async function load(): Promise<StoreData> {
  if (state.data) return state.data;
  try {
    state.data = JSON.parse(await fs.readFile(FILE, "utf8")) as StoreData;
  } catch {
    state.data = { devices: {}, jobs: {} };
  }
  return state.data;
}

async function save(data: StoreData) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, FILE);
}

/** Depoyu sıralı (kilitli) şekilde okuyup değiştirir ve diske yazar. */
export function mutate<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
  const run = state.lock.then(async () => {
    const data = await load();
    const result = await fn(data);
    await save(data);
    return result;
  });
  state.lock = run.catch(() => undefined);
  return run;
}

export function jobKey(deviceId: string, id: string) {
  return `${deviceId}:${id}`;
}

/**
 * Cihazın tüm aktif hatırlatmalarını sunucudakiyle değiştirir.
 * Daha önce gönderilmiş bir zaman tekrar gelirse yeniden gönderilmez; tekrarlayan
 * hatırlatmalarda sunucunun ileri aldığı zaman korunur.
 */
export function replaceDeviceJobs(deviceId: string, items: SyncItem[]) {
  return mutate((data) => {
    const next: Record<string, Job> = {};
    for (const [key, job] of Object.entries(data.jobs)) {
      if (job.deviceId !== deviceId) next[key] = job;
    }
    for (const item of items) {
      const key = jobKey(deviceId, item.id);
      const prev = data.jobs[key];
      if (prev?.sentDue !== undefined && item.dueAt <= prev.sentDue) {
        next[key] =
          item.repeat !== "none" && prev.repeat === item.repeat
            ? { ...prev, title: item.title }
            : { ...item, deviceId, sentDue: prev.sentDue };
      } else {
        next[key] = { ...item, deviceId, sentDue: prev?.sentDue };
      }
    }
    data.jobs = next;
    return Object.values(next).filter((j) => j.deviceId === deviceId).length;
  });
}

export function isRepeat(v: unknown): v is Repeat {
  return v === "none" || v === "daily" || v === "weekly" || v === "monthly";
}
