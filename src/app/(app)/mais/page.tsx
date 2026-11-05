import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileUp, LogOut, Tags, Ticket } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Mais" };

export default async function MorePage() {
  const { supabase, user } = await getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name, is_admin").eq("id", user!.id).single();

  const links = [
    { href: "/importar", label: "Importar extrato", icon: FileUp },
    { href: "/categorias", label: "Categorias", icon: Tags },
    ...(profile?.is_admin ? [{ href: "/convites", label: "Convites", icon: Ticket }] : []),
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{profile?.full_name || "Mais"}</h1>
        <p className="muted text-sm">{user!.email}</p>
      </header>
      <ul className="card divide-y divide-[var(--border)]">
        {links.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 px-4 py-3.5">
              <Icon className="size-5 text-brand-700" />
              <span className="flex-1 font-medium">{label}</span>
              <ChevronRight className="muted size-4" />
            </Link>
          </li>
        ))}
        <li>
          <form action={signOut}>
            <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-expense">
              <LogOut className="size-5" />
              <span className="flex-1 font-medium">Sair</span>
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
}
