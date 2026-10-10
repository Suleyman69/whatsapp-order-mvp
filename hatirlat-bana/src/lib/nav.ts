/**
 * Google Maps "Maps URLs" (API anahtarı gerekmez). Mobilde Google Maps kuruluysa uygulamayı
 * açar, değilse tarayıcıda Google Maps rota ekranı açılır.
 * https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */
export function mapsUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination.trim())}`;
}
