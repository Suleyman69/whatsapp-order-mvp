export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Tekrarlayan hatırlatmalar sunucuda yerel takvime göre ilerletilir (her ayın 5'i vb.).
  process.env.TZ = process.env.APP_TIMEZONE || process.env.TZ || "Europe/Istanbul";

  if (process.env.DISABLE_INTERNAL_SCHEDULER === "1") return;
  const { startScheduler } = await import("./lib/server/scheduler");
  startScheduler();
}
