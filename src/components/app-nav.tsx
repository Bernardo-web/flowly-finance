"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  FileUp,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Tags,
  Ticket,
  Wallet,
} from "lucide-react";
import { signOut } from "@/app/(auth)/actions";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

export function AppNav({ isAdmin, name }: { isAdmin: boolean; name: string }) {
  const path = usePathname();
  const items: Item[] = [
    { href: "/painel", label: "Painel", icon: LayoutDashboard },
    { href: "/lancamentos", label: "Lançamentos", icon: ArrowLeftRight },
    { href: "/contas", label: "Contas", icon: Wallet },
    { href: "/importar", label: "Importar extrato", icon: FileUp },
    { href: "/categorias", label: "Categorias", icon: Tags },
    ...(isAdmin ? [{ href: "/convites", label: "Convites", icon: Ticket }] : []),
  ];
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  const inMore = ["/importar", "/categorias", "/convites", "/mais"].some(active);

  const tab = (href: string, label: string, Icon: Item["icon"], on: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
        on ? "text-brand-700 dark:text-brand-500" : "muted"
      }`}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );

  return (
    <>
      {/* Computador: menu lateral */}
      <aside className="card fixed inset-y-3 left-3 hidden w-60 flex-col p-4 md:flex">
        <Link href="/painel" className="mb-6 flex items-center gap-2 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-8" />
          <span className="text-lg font-bold tracking-tight">Flowly</span>
        </Link>
        <Link href="/lancamentos/novo" className="btn-primary mb-4">
          <Plus className="size-4" /> Novo lançamento
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active(href)
                  ? "bg-brand-50 text-brand-800 dark:bg-brand-800/30 dark:text-brand-100"
                  : "muted hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-[var(--border)] pt-4">
          <p className="truncate px-3 text-sm font-medium">{name}</p>
          <form action={signOut}>
            <button className="muted mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
              <LogOut className="size-4" /> Sair
            </button>
          </form>
        </div>
      </aside>

      {/* Celular: barra inferior com o botão de lançar no meio */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-[var(--border)] bg-[var(--surface)] md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tab("/painel", "Painel", LayoutDashboard, active("/painel"))}
        {tab("/lancamentos", "Lançamentos", ArrowLeftRight, active("/lancamentos") && !active("/lancamentos/novo"))}
        <div className="flex flex-1 items-center justify-center">
          <Link
            href="/lancamentos/novo"
            aria-label="Novo lançamento"
            className="-mt-6 flex size-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg shadow-brand-700/30"
          >
            <Plus className="size-7" />
          </Link>
        </div>
        {tab("/contas", "Contas", Wallet, active("/contas"))}
        {tab("/mais", "Mais", Menu, inMore)}
      </nav>
    </>
  );
}
