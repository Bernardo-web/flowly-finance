import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { CardForm } from "../card-form";
import { createCard } from "../actions";

export const metadata: Metadata = { title: "Novo cartão" };

export default function NewCardPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Novo cartão" back="/cartoes" />
      <CardForm action={createCard} />
    </div>
  );
}
