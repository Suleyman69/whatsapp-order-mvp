import webpush, { type PushSubscription, WebPushError } from "web-push";
import { nextOccurrence } from "../recurrence";
import { mutate } from "./store";

/** Bu süreden daha eski kaçırılmış hatırlatmalar için push gönderilmez (sunucu uzun süre kapalı kaldıysa). */
const MAX_LATENESS = 12 * 3_600_000;

let configured = false;

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  id?: string;
  dueAt?: number;
}

/** true: gönderildi, "gone": abonelik geçersiz (silinmeli), false: geçici hata. */
export async function sendPush(sub: PushSubscription, payload: PushPayload): Promise<true | false | "gone"> {
  if (!configure()) throw new Error("VAPID anahtarları tanımlı değil (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).");
  try {
    // urgency=high: iOS/Android'in bildirimi geciktirmemesi için.
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
    return true;
  } catch (err) {
    if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) return "gone";
    console.error("[push] gönderim hatası", err instanceof WebPushError ? `${err.statusCode} ${err.body}` : err);
    return false;
  }
}

/** Zamanı gelen tüm hatırlatmalar için push gönderir. Hem iç zamanlayıcı hem /api/cron bunu çağırır. */
export async function runDueJobs(now = Date.now()) {
  if (!configure()) return { sent: 0, skipped: "no-vapid" as const };
  return mutate(async (data) => {
    let sent = 0;
    for (const [key, job] of Object.entries(data.jobs)) {
      if (job.dueAt > now || (job.sentDue !== undefined && job.dueAt <= job.sentDue)) continue;
      const device = data.devices[job.deviceId];
      if (!device) {
        delete data.jobs[key];
        continue;
      }
      if (now - job.dueAt <= MAX_LATENESS) {
        const res = await sendPush(device.subscription, {
          title: "Hatırlat Bana",
          body: job.title,
          id: job.id,
          dueAt: job.dueAt,
        });
        if (res === "gone") {
          delete data.devices[job.deviceId];
          for (const [k, j] of Object.entries(data.jobs)) if (j.deviceId === job.deviceId) delete data.jobs[k];
          continue;
        }
        if (res === false) continue; // bir sonraki turda tekrar dene
        sent++;
      }
      job.sentDue = job.dueAt;
      const next = nextOccurrence(job.dueAt, job.repeat, now);
      if (next !== null) job.dueAt = next;
    }
    return { sent };
  });
}
