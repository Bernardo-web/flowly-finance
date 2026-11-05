/**
 * Aparece na hora em que você toca num link, enquanto a próxima tela carrega.
 * Assim a navegação responde imediatamente, mesmo antes dos dados chegarem.
 */
export default function Loading() {
  const bar = "animate-pulse rounded-lg bg-black/[0.06] dark:bg-white/[0.07]";
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      <div className="space-y-2">
        <div className={`${bar} h-4 w-32`} />
        <div className={`${bar} h-7 w-56`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className={`${bar} h-4 w-24`} />
            <div className={`${bar} h-7 w-32`} />
          </div>
        ))}
      </div>
      <div className="card space-y-4 p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={`${bar} size-3 rounded-full`} />
            <div className={`${bar} h-4 flex-1`} />
            <div className={`${bar} h-4 w-20`} />
          </div>
        ))}
      </div>
    </div>
  );
}
