import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { deleteInvite } from "./actions";
import { InviteForm, ShareInvite } from "./invite-form";

export const metadata: Metadata = { title: "Convites" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });

export default async function InvitesPage() {
  const { supabase, user } = await getUser();
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user!.id).single();
  if (!profile?.is_admin) redirect("/painel");

  const { data: invites } = await supabase
    .from("invites")
    .select("code, note, uses, max_uses, expires_at, created_at")
    .order("created_at", { ascending: false });

  const h = await headers();
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? `https://${h.get("host")}`).replace(/\/$/, "");
  const now = Date.now();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Convites</h1>
        <p className="muted text-sm">Só quem recebe um link seu consegue criar conta. Cada link vale por 14 dias.</p>
      </header>

      <InviteForm />

      <section className="space-y-2">
        <h2 className="font-semibold">Seus convites</h2>
        {(invites ?? []).length === 0 && <p className="muted text-sm">Nenhum convite ainda.</p>}
        <ul className="space-y-2">
          {(invites ?? []).map((inv) => {
            const expired = new Date(inv.expires_at).getTime() < now;
            const usedUp = inv.uses >= inv.max_uses;
            const status = usedUp ? "Usado" : expired ? "Expirado" : "Ativo";
            return (
              <li key={inv.code} className="card flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{inv.note || "Convite"}</p>
                  <p className="muted text-xs">
                    <span className="font-mono">{inv.code}</span> · {inv.uses}/{inv.max_uses} usos · {status}
                    {!usedUp && !expired && ` até ${dateFmt.format(new Date(inv.expires_at))}`}
                  </p>
                </div>
                {!usedUp && !expired && <ShareInvite url={`${base}/cadastro?convite=${inv.code}`} />}
                <form action={deleteInvite}>
                  <input type="hidden" name="code" value={inv.code} />
                  <button className="muted rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5" aria-label="Apagar convite">
                    <Trash2 className="size-4" />
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
