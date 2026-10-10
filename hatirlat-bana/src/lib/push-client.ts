import { getAllReminders, getDeviceId } from "./db";
import type { SyncItem } from "./types";

export type PushStatus =
  | "unsupported" // tarayıcı push desteklemiyor
  | "ios-install" // iPhone Safari: önce ana ekrana eklenmeli
  | "default" // henüz izin istenmedi
  | "denied"
  | "server-off" // sunucuda VAPID yok
  | "error" // abonelik oluşturulamadı (push servisine ulaşılamadı vb.)
  | "on";

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function fetchPublicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/public-key", { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { key: string }).key;
  } catch {
    return null;
  }
}

export async function currentPushStatus(): Promise<PushStatus> {
  if (isIOS() && !isStandalone()) return "ios-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "default") return "default";
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? "on" : "default";
}

/**
 * Bildirim izni ister ve push aboneliği oluşturur.
 * iOS'ta izin isteği mutlaka bir dokunma olayından çağrılmalı; bu yüzden
 * requestPermission ilk await'ten önce çağrılır.
 */
export async function enablePush(): Promise<PushStatus> {
  if (!pushSupported()) return isIOS() && !isStandalone() ? "ios-install" : "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "default";
  return ensureSubscribed();
}

/** İzin verilmişse aboneliği oluşturur/yeniler ve sunucuya kaydeder. */
export async function ensureSubscribed(): Promise<PushStatus> {
  const key = await fetchPublicKey();
  if (!key) return "server-off";
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Sunucu anahtarı değiştiyse eski aboneliği yenile
  const currentKey = sub?.options.applicationServerKey;
  if (sub && currentKey) {
    const a = new Uint8Array(currentKey);
    const b = urlBase64ToUint8Array(key);
    if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  } catch (err) {
    console.error("Push aboneliği oluşturulamadı", err);
    return "error";
  }
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId: await getDeviceId(), subscription: sub.toJSON() }),
  });
  if (!res.ok) return "server-off";
  await syncReminders();
  return "on";
}

/** Aktif hatırlatmaların tam listesini sunucuya gönderir (push zamanlaması için). */
export async function syncReminders(): Promise<boolean> {
  try {
    const reminders: SyncItem[] = (await getAllReminders())
      .filter((r) => !r.done && r.dueAt !== null)
      .map((r) => ({ id: r.id, title: r.title, dueAt: r.dueAt as number, repeat: r.repeat }));
    const res = await fetch("/api/reminders/sync", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: await getDeviceId(), reminders }),
    });
    return res.ok;
  } catch {
    return false; // çevrimdışı: bir sonraki açılışta tekrar denenir
  }
}

export async function sendTestPush(): Promise<string | null> {
  const res = await fetch("/api/push/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId: await getDeviceId() }),
  });
  if (res.ok) return null;
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Gönderilemedi";
}
