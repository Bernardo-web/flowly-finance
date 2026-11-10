"use client";

import { RefreshCw, WifiOff } from "lucide-react";

/** Mostrada quando uma tela não consegue carregar (ex.: banco fora do ar). */
export default function AppError() {
  return (
    <div className="card mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
      <div className="rounded-full bg-amber-50 p-3 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
        <WifiOff className="size-6" />
      </div>
      <h1 className="text-lg font-semibold">Não foi possível carregar</h1>
      <p className="muted text-sm">
        O servidor do Flowly demorou para responder. Seus dados estão seguros; tente de novo em alguns instantes.
      </p>
      <button onClick={() => window.location.reload()} className="btn-primary">
        <RefreshCw className="size-4" /> Tentar de novo
      </button>
    </div>
  );
}
