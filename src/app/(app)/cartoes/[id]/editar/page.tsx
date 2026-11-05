import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import { PageHeader } from "@/components/page-header";
import { CardForm } from "../../card-form";
import { setCardArchived, updateCard } from "../../actions";

export const metadata: Metadata = { title: "Editar cartão" };

export default async function EditCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await getUser();
  const { data: card } = await supabase
    .from("credit_cards")
    .select("id, name, limit_cents, closing_day, due_day, color, archived")
    .eq("id", id)
    .maybeSingle();
  if (!card) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={`Editar ${card.name}`} back={`/cartoes/${id}`} />
      <CardForm
        action={updateCard.bind(null, id)}
        defaults={{
          name: card.name,
          limit: (Number(card.limit_cents) / 100).toFixed(2).replace(".", ","),
          closing_day: card.closing_day,
          due_day: card.due_day,
          color: card.color,
        }}
      />
      <form action={setCardArchived} className="card p-5">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="archived" value={String(!card.archived)} />
        <button className="btn-ghost w-full justify-center">{card.archived ? "Reativar cartão" : "Arquivar cartão"}</button>
        <p className="muted mt-2 text-xs">Mudar os dias de fechamento ou vencimento vale para compras novas; as faturas já criadas continuam como estão.</p>
      </form>
    </div>
  );
}
