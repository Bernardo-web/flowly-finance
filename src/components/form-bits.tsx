"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function SubmitButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`btn-primary w-full ${className}`}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function FormMessage({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (!state?.error && !state?.ok) return null;
  const isError = Boolean(state.error);
  return (
    <p
      role={isError ? "alert" : "status"}
      className={`rounded-xl px-3 py-2.5 text-sm ${
        isError ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-brand-50 text-brand-800"
      }`}
    >
      {state.error ?? state.ok}
    </p>
  );
}
