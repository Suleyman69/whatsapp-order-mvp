import type { PushSubscription } from "web-push";
import { mutate } from "@/lib/server/store";
import { isDeviceId } from "@/lib/server/validate";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    deviceId?: unknown;
    subscription?: PushSubscription;
  } | null;
  const sub = body?.subscription;
  if (!body || !isDeviceId(body.deviceId) || typeof sub?.endpoint !== "string" || !sub.keys?.p256dh || !sub.keys?.auth) {
    return Response.json({ error: "Geçersiz abonelik" }, { status: 400 });
  }
  const deviceId = body.deviceId;
  await mutate((data) => {
    data.devices[deviceId] = {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
      updatedAt: Date.now(),
    };
  });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { deviceId?: unknown } | null;
  if (!isDeviceId(body?.deviceId)) return Response.json({ error: "Geçersiz cihaz" }, { status: 400 });
  const deviceId = body.deviceId;
  await mutate((data) => {
    delete data.devices[deviceId];
  });
  return Response.json({ ok: true });
}
