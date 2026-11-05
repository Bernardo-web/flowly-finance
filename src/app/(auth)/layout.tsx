export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-14" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Flowly</h1>
            <p className="muted text-sm">Seu dinheiro, em fluxo e sob controle.</p>
          </div>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
