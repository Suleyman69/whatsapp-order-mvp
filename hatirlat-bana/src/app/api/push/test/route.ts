import { mutate } from "@/lib/server/store";
import { sendPush } from "@/lib/server/push";
import { isDeviceId } from "@/lib/server/validate";

/** Hemen bir deneme bildirimi gönderir (Ayarlar → "Deneme bildirimi"). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { deviceId?: unknown } | null;
  if (!isDeviceId(body?.deviceId)) return Response.json({ error: "Geçersiz cihaz" }, { status: 400 });
  const deviceId = body.deviceId;
  const device = await mutate((data) => data.devices[deviceId]);
  if (!device) return Response.json({ error: "Bu cihaz için abonelik yok" }, { status: 404 });
  try {
    const res = await sendPush(device.subscription, {
      title: "Hatırlat Bana",
      body: "Bildirimler çalışıyor ✓",
    });
    if (res === "gone") {
      await mutate((data) => {
        delete data.devices[deviceId];
      });
      return Response.json({ error: "Abonelik geçersiz, tekrar izin verin" }, { status: 410 });
    }
    return Response.json({ ok: res });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 503 });
  }
}
