export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Tekrarlayan hatırlatmalar Europe/Berlin takvimine göre ilerletilir (src/lib/tz.ts);
  // sunucunun TZ ayarından bağımsızdır.
  if (process.env.DISABLE_INTERNAL_SCHEDULER === "1") return;
  const { startScheduler } = await import("./lib/server/scheduler");
  startScheduler();
}
