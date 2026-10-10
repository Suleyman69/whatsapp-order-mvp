import { runDueJobs } from "./push";

const INTERVAL_MS = 20_000;

const g = globalThis as unknown as { __hbScheduler?: NodeJS.Timeout };

/** `next start` ile çalışan uzun ömürlü sunucuda zamanı gelen push'ları gönderir. */
export function startScheduler() {
  if (g.__hbScheduler) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const res = await runDueJobs();
      if ("sent" in res && res.sent) console.log(`[scheduler] ${res.sent} bildirim gönderildi`);
    } catch (err) {
      console.error("[scheduler]", err);
    } finally {
      running = false;
    }
  };
  g.__hbScheduler = setInterval(tick, INTERVAL_MS);
  g.__hbScheduler.unref();
  void tick();
  console.log(`[scheduler] başladı (her ${INTERVAL_MS / 1000} sn), TZ=${process.env.TZ}`);
}
