/** Cihaz kimliği istemcide crypto.randomUUID() ile üretilir. */
export function isDeviceId(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
}
