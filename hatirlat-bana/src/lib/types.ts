export type Repeat = "none" | "daily" | "weekly" | "monthly";

export interface Reminder {
  id: string;
  title: string;
  /** Epoch ms. null = tarihsiz. */
  dueAt: number | null;
  repeat: Repeat;
  done: boolean;
  doneAt?: number;
  createdAt: number;
  updatedAt: number;
  /** Hedef konum/adres (navigasyon için). Eski kayıtlarda yoktur; yoksa navigasyon gösterilmez. */
  location?: string;
  /** Kullanıcının söylediği / yazdığı ham metin. */
  source?: string;
  /** Uygulama açıkken gösterilen yedek bildirim için: en son hangi dueAt bildirildi. */
  notifiedDue?: number;
}

/** Sunucuya gönderilen, push zamanlaması için gereken minimum veri. */
export interface SyncItem {
  id: string;
  title: string;
  dueAt: number;
  repeat: Repeat;
}

export const REPEAT_LABELS: Record<Repeat, string> = {
  none: "Tekrar yok",
  daily: "Her gün",
  weekly: "Her hafta",
  monthly: "Her ay",
};
