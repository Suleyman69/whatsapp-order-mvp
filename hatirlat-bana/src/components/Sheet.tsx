"use client";

import type { ReactNode } from "react";

/** Alttan açılan basit panel. */
export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Kapat" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-3xl bg-background px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        {children}
      </div>
    </div>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`h-14 w-full rounded-2xl bg-indigo-600 text-lg font-semibold text-white active:bg-indigo-700 disabled:opacity-40 ${props.className ?? ""}`}
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`h-14 w-full rounded-2xl bg-zinc-100 text-lg font-medium active:bg-zinc-200 dark:bg-zinc-800 dark:active:bg-zinc-700 ${props.className ?? ""}`}
    />
  );
}
