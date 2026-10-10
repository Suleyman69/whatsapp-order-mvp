/* Hatırlat Bana — Service Worker
 * - Sunucudan gelen Web Push mesajlarını bildirim olarak gösterir.
 * - Bildirim aksiyonlarını (Tamamlandı / 1 saat sonra / Yarın) uygulama kapalıyken işler:
 *   IndexedDB'yi günceller ve sunucuya yeni zamanlamayı bildirir.
 * - Uygulama kabuğunu önbelleğe alır (çevrimdışı açılış).
 */
const CACHE = "hb-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/badge-96.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    // Ağ önce; çevrimdışıysa önbellekteki ana sayfa
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === "/") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || SHELL.includes(url.pathname)) {
    // Değişmeyen dosyalar: önbellek önce
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// ---------- Push ----------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Hatırlat Bana";
  const options = {
    body: data.body || "Hatırlatman var",
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    tag: data.id || "hb-test",
    renotify: true,
    timestamp: data.dueAt || Date.now(),
    data: { id: data.id || null },
    // iOS aksiyon butonlarını göstermez; Android/masaüstü Chrome gösterir.
    actions: data.id
      ? [
          { action: "done", title: "Tamamlandı" },
          { action: "snooze", title: "1 saat sonra" },
          { action: "tomorrow", title: "Yarın hatırlat" },
        ]
      : [],
  };
  // iOS her push için görünür bildirim ister; aksi halde aboneliği iptal eder.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const id = n.data && n.data.id;
  n.close();

  if (id && (event.action === "done" || event.action === "snooze" || event.action === "tomorrow")) {
    event.waitUntil(applyAction(id, event.action));
    return;
  }

  const target = id ? `/?r=${encodeURIComponent(id)}` : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin) {
          client.postMessage({ type: "open-reminder", id });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// ---------- IndexedDB (src/lib/db.ts ile aynı şema) ----------

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("hatirlat-bana", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("reminders")) db.createObjectStore("reminders", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}

// src/lib/recurrence.ts ile aynı mantık
function nextOccurrence(dueAt, repeat, after) {
  if (repeat === "none") return null;
  for (let step = 1; step < 100000; step++) {
    const d = new Date(dueAt);
    let t;
    if (repeat === "daily") {
      d.setDate(d.getDate() + step);
      t = d.getTime();
    } else if (repeat === "weekly") {
      d.setDate(d.getDate() + step * 7);
      t = d.getTime();
    } else {
      const day = d.getDate();
      const target = new Date(d.getFullYear(), d.getMonth() + step, 1, d.getHours(), d.getMinutes());
      const dim = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(day, dim));
      t = target.getTime();
    }
    if (t > after) return t;
  }
  return null;
}

async function applyAction(id, action) {
  const db = await openDB();
  const r = await tx(db, "reminders", "readonly", (s) => s.get(id));
  if (!r) return;
  const now = Date.now();
  if (action === "done") {
    const next = r.dueAt ? nextOccurrence(r.dueAt, r.repeat, now) : null;
    if (next) r.dueAt = next;
    else {
      r.done = true;
      r.doneAt = now;
    }
  } else if (action === "snooze") {
    r.dueAt = Math.ceil((now + 3600000) / 60000) * 60000;
  } else if (action === "tomorrow") {
    const base = new Date(r.dueAt || now);
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    t.setHours(base.getHours(), base.getMinutes(), 0, 0);
    r.dueAt = t.getTime();
  }
  r.updatedAt = now;
  await tx(db, "reminders", "readwrite", (s) => s.put(r));
  await syncToServer(db);
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: "reminders-changed" }));
}

async function syncToServer(db) {
  const deviceId = await tx(db, "meta", "readonly", (s) => s.get("deviceId"));
  if (!deviceId) return;
  const all = await tx(db, "reminders", "readonly", (s) => s.getAll());
  const reminders = all
    .filter((r) => !r.done && r.dueAt)
    .map((r) => ({ id: r.id, title: r.title, dueAt: r.dueAt, repeat: r.repeat }));
  try {
    await fetch("/api/reminders/sync", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId, reminders }),
    });
  } catch {
    // çevrimdışı: uygulama açıldığında tekrar senkronize edilir
  }
}
