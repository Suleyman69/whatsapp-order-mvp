import { connection } from "next/server";
import { vapidPublicKey } from "@/lib/server/push";

export async function GET() {
  await connection(); // anahtar build anında değil, çalışma anında okunmalı
  const key = vapidPublicKey();
  if (!key) return Response.json({ error: "Sunucuda VAPID anahtarları tanımlı değil." }, { status: 503 });
  return Response.json({ key });
}
