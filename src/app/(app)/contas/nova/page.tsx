import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { AccountForm } from "../account-form";
import { createAccount } from "../actions";

export const metadata: Metadata = { title: "Nova conta" };

export default function NewAccountPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Nova conta" back="/contas" />
      <AccountForm action={createAccount} />
    </div>
  );
}
