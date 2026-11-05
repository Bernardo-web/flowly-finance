import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacidade" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href="/" className="text-sm text-brand-700">← Voltar</Link>
      <h1 className="text-2xl font-bold tracking-tight">Privacidade no Flowly</h1>
      <p className="muted text-sm">
        O Flowly é um projeto pessoal, usado por convite. Esta página explica, sem juridiquês, o que é guardado e como.
      </p>

      <section className="space-y-2">
        <h2 className="font-semibold">O que é guardado</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Seu nome e e-mail, para o login.</li>
          <li>O que você cadastra: contas, cartões (só nome, limite e datas), categorias, lançamentos, recorrências e orçamentos.</li>
          <li>As regras de categoria que o app aprende com as suas escolhas.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">O que nunca é pedido nem guardado</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Senha do banco, número de cartão, agência ou número de conta.</li>
          <li>O arquivo do extrato: ele é lido no seu próprio aparelho, e só as movimentações que você confirma são salvas.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Quem vê seus dados</h2>
        <p className="text-sm">
          Só você. Cada pessoa tem a própria conta, e o banco de dados bloqueia o acesso de uma pessoa aos dados de outra —
          inclusive do administrador pelo app. A senha é guardada de forma criptografada pelo serviço de login (Supabase)
          e a conexão é sempre segura (HTTPS).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Seus direitos</h2>
        <p className="text-sm">
          Em <strong>Configurações</strong> você pode baixar todos os seus dados a qualquer momento e excluir sua conta,
          o que apaga definitivamente tudo o que é seu.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Onde ficam</h2>
        <p className="text-sm">
          Banco de dados e login no Supabase; o site na Vercel. Nenhum dado é vendido, compartilhado ou usado para publicidade.
        </p>
      </section>
    </main>
  );
}
