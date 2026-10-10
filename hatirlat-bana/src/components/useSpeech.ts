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

/** Tarayıcının yerleşik konuşma tanıma özelliği (Chrome, Safari). */
export function useSpeech(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => () => recRef.current?.abort(), []);

  const stop = useCallback(() => recRef.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setError(UNSUPPORTED_MSG);
      return false;
    }
    setError(null);
    setInterim("");
    const rec = new Ctor();
    rec.lang = "tr-TR";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let text = "";
    let failed = false;
    let silence: ReturnType<typeof setTimeout> | undefined;

    rec.onresult = (e) => {
      text = Array.from(e.results, (r) => r[0].transcript).join(" ");
      setInterim(text);
      // iOS Safari bazen kendiliğinden durmaz: 2 sn sessizlikten sonra bitir.
      clearTimeout(silence);
      silence = setTimeout(() => rec.stop(), 2000);
    };
    rec.onerror = (e) => {
      if (e.error === "aborted") return;
      failed = true;
      setError(ERRORS[e.error] ?? "Ses anlaşılamadı. Tekrar dene ya da kalemle yaz.");
    };
    rec.onend = () => {
      clearTimeout(silence);
      recRef.current = null;
      setListening(false);
      setInterim("");
      const final = text.trim();
      if (final) onFinalRef.current(final);
      else if (!failed) setError("Ses duyulmadı. Tekrar dene.");
    };

    try {
      rec.start();
    } catch {
      setError("Mikrofon başlatılamadı. Tekrar dene.");
      return false;
    }
    recRef.current = rec;
    setListening(true);
    return true;
  }, []);

  return { listening, interim, error, setError, start, stop, isSupported: () => getCtor() !== null };
}
