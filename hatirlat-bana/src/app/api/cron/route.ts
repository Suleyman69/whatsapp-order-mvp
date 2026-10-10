import { runDueJobs } from "@/lib/server/push";

/**
 * Harici zamanlayıcı için (serverless kurulum veya iç zamanlayıcı kapalıyken):
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://alanadi/api/cron
 * Uzun ömürlü `next start` sunucusunda gerekmez; iç zamanlayıcı zaten çalışır.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Yetkisiz" }, { status: 401 });
  }
  return Response.json(await runDueJobs());
}
