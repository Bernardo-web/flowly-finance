/**
 * fetch com limite de tempo para as chamadas ao Supabase.
 * Se o banco estiver pausado ou fora do ar, a chamada falha em poucos segundos
 * em vez de travar a página até a Vercel derrubar a requisição (erro 504).
 */
export function fetchWithTimeout(ms: number): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal });
  };
}

/** Resolve com `fallback` se a promessa demorar mais que `ms` (ou falhar). */
export async function withTimeout<T>(promise: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
