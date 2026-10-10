import { isRepeat, replaceDeviceJobs } from "@/lib/server/store";
import { isDeviceId } from "@/lib/server/validate";
import type { SyncItem } from "@/lib/types";

/**
 * Cihazdaki aktif (tarihli, tamamlanmamış) hatırlatmaların tam listesini alır.
 * Sunucu sadece push zamanlaması için gereken veriyi tutar; asıl veri cihazdaki IndexedDB'dedir.
 */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as { deviceId?: unknown; reminders?: unknown } | null;
  if (!isDeviceId(body?.deviceId) || !Array.isArray(body.reminders) || body.reminders.length > 1000) {
    return Response.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const items: SyncItem[] = [];
  for (const r of body.reminders as Record<string, unknown>[]) {
    if (
      typeof r?.id !== "string" ||
      r.id.length > 64 ||
      typeof r.title !== "string" ||
      typeof r.dueAt !== "number" ||
      !Number.isFinite(r.dueAt) ||
      !isRepeat(r.repeat)
    ) {
      return Response.json({ error: "Geçersiz hatırlatma" }, { status: 400 });
    }
    items.push({ id: r.id, title: r.title.slice(0, 200), dueAt: r.dueAt, repeat: r.repeat });
  }
  const count = await replaceDeviceJobs(body.deviceId, items);
  return Response.json({ ok: true, count });
}
