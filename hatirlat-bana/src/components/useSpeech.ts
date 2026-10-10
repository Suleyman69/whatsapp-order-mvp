"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechResultEvent {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Mikrofon izni verilmedi. Ayarlar'dan izin verebilir ya da kalemle yazabilirsin.",
  "service-not-allowed": "Bu cihazda sesle yazma kullanılamıyor. Kalemle yazabilirsin.",
  "no-speech": "Ses duyulmadı. Tekrar dene.",
  "audio-capture": "Mikrofon bulunamadı. Kalemle yazabilirsin.",
  network: "Ses tanıma için internet bağlantısı gerekli.",
  "language-not-supported": "Türkçe ses tanıma bu cihazda desteklenmiyor. Kalemle yazabilirsin.",
};

export const UNSUPPORTED_MSG = "Bu tarayıcı sesle yazmayı desteklemiyor. Kalem ikonuyla yazabilirsin.";

/** Bu kadar süre hiç yeni kelime gelmezse konuşma bitti sayılır. */
const SILENCE_MS = 4500;

/** Bir oturumdaki (start → end) sonuçları tek metne çevirir; Chrome'un tekrarlı/kümülatif sonuçlarını eler. */
function sessionText(e: SpeechResultEvent): string {
  const parts: string[] = [];
  for (const r of Array.from(e.results)) {
    const t = r[0].transcript.trim();
    if (!t) continue;
    const last = parts[parts.length - 1];
    if (last && t.startsWith(last)) parts[parts.length - 1] = t;
    else parts.push(t);
  }
  return parts.join(" ");
}

const join = (a: string, b: string) => [a, b].filter(Boolean).join(" ");

/**
 * Tarayıcının yerleşik konuşma tanıma özelliği (Chrome, Safari).
 * Sürekli dinler: kısa duraklamalarda kapanmaz, tarayıcı oturumu bitirirse otomatik yeniden
 * başlatılır ve önceki kelimeler korunur. Son kelimeden SILENCE_MS sonra ya da kullanıcı
 * butona tekrar basınca biter.
 */
export function useSpeech(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(
    () => () => {
      // Sayfadan çıkarken sonuç üretmeden kapat
      stopRef.current = null;
      recRef.current?.abort();
    },
    [],
  );

  const stop = useCallback(() => stopRef.current?.(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setError(UNSUPPORTED_MSG);
      return false;
    }
    setError(null);
    setInterim("");

    let committed = ""; // biten oturumlardan biriken metin
    let current = ""; // şu anki oturumun metni
    let stopping = false;
    let failed = false;
    let silence: ReturnType<typeof setTimeout> | undefined;

    const armSilence = () => {
      clearTimeout(silence);
      silence = setTimeout(finish, SILENCE_MS);
    };

    function finish() {
      stopping = true;
      clearTimeout(silence);
      try {
        recRef.current?.stop();
      } catch {
        /* zaten durmuş */
      }
    }

    const finalize = () => {
      clearTimeout(silence);
      recRef.current = null;
      stopRef.current = null;
      setListening(false);
      setInterim("");
      const text = join(committed, current).trim();
      if (text) onFinalRef.current(text);
      else if (!failed) setError("Ses duyulmadı. Tekrar dene.");
    };

    const open = (): boolean => {
      const rec = new Ctor();
      rec.lang = "tr-TR";
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      current = "";

      rec.onresult = (e) => {
        current = sessionText(e);
        setInterim(join(committed, current));
        armSilence(); // yeni kelime geldi: sessizlik sayacı sıfırlanır
      };
      rec.onerror = (e) => {
        if (e.error === "aborted") return;
        if (e.error === "no-speech" && !stopping) return; // sessizlik sayacı karar verir
        failed = true;
        stopping = true;
        setError(ERRORS[e.error] ?? "Ses anlaşılamadı. Tekrar dene ya da kalemle yaz.");
      };
      rec.onend = () => {
        if (stopping) return finalize();
        // Tarayıcı oturumu kendisi bitirdi (iOS/Chrome zaman aşımı): metni koru, yeniden başlat
        committed = join(committed, current);
        current = "";
        try {
          if (!open()) finalize();
        } catch {
          finalize();
        }
      };

      try {
        rec.start();
      } catch {
        return false;
      }
      recRef.current = rec;
      return true;
    };

    stopRef.current = finish;
    if (!open()) {
      stopRef.current = null;
      setError("Mikrofon başlatılamadı. Tekrar dene.");
      return false;
    }
    setListening(true);
    armSilence(); // hiç konuşulmazsa da bir süre sonra kapanır
    return true;
  }, []);

  return { listening, interim, error, setError, start, stop, isSupported: () => getCtor() !== null };
}
