/**
 * Blitzer.de PRO bağlantısı (harici trafik uygulaması).
 *
 * Blitzer.de PRO için belgelenmiş bir URL şeması / universal link yoktur (uygulama yalnızca
 * Siri Kestirmeleri ve CarPlay sunar). Bu yüzden varsayılan yol Apple'ın belgelenmiş
 * `shortcuts://run-shortcut?name=…` bağlantısıdır: kullanıcının Kestirmeler uygulamasında
 * "Uygulamayı Aç → Blitzer.de PRO" eylemiyle oluşturduğu kestirmeyi çalıştırır.
 *
 * Blitzer.de ileride gerçek bir bağlantı yayınlarsa kodu değiştirmeden
 * `NEXT_PUBLIC_BLITZER_URL` (örn. `blitzer://…`) ile kullanılabilir; tanımlıysa önceliklidir.
 * Kestirme adını `NEXT_PUBLIC_BLITZER_SHORTCUT` ile değiştirebilirsin.
 */
export const DEFAULT_SHORTCUT_NAME = "Yola Çık";

export interface BlitzerLink {
  href: string;
  kind: "deeplink" | "shortcut";
  shortcutName?: string;
}

/** Yalnızca düz bir uygulama bağlantısı kabul edilir (javascript:, data: vb. reddedilir). */
function isSafeAppUrl(u: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(u) && !/^(?:javascript|data|vbscript|file|blob):/i.test(u);
}

export function blitzerLink(
  deepLink: string | undefined = process.env.NEXT_PUBLIC_BLITZER_URL,
  shortcut: string | undefined = process.env.NEXT_PUBLIC_BLITZER_SHORTCUT,
): BlitzerLink {
  const url = deepLink?.trim();
  if (url && isSafeAppUrl(url)) return { href: url, kind: "deeplink" };
  const name = shortcut?.trim() || DEFAULT_SHORTCUT_NAME;
  return { href: `shortcuts://run-shortcut?name=${encodeURIComponent(name)}`, kind: "shortcut", shortcutName: name };
}
