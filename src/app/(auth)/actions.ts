"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/supabase/middleware";

export type FormState = { error?: string; ok?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (m.includes("already registered")) return "Já existe uma conta com este e-mail.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (m.includes("password")) return "Senha fraca: use pelo menos 8 caracteres, com letras e números.";
  if (m.includes("database error")) return "Não foi possível criar a conta. Confira o convite.";
  return "Algo deu errado. Tente de novo.";
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!EMAIL_RE.test(email) || !password) return { error: "Preencha e-mail e senha." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translate(error.message) };

  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const fullName = String(form.get("full_name") ?? "").trim().slice(0, 120);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const inviteCode = String(form.get("invite_code") ?? "").trim().toUpperCase();

  if (!fullName) return { error: "Informe seu nome." };
  if (!EMAIL_RE.test(email)) return { error: "E-mail inválido." };
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return { error: "A senha precisa de pelo menos 8 caracteres, com letras e números." };
  }

  const supabase = await createClient();

  // Checagem amigável; a regra de verdade é aplicada dentro do banco no cadastro.
  // O primeiro usuário do sistema não precisa de convite (vira administrador).
  if (inviteCode) {
    const { data: valid } = await supabase.rpc("check_invite", { p_code: inviteCode });
    if (!valid) return { error: "Convite inválido ou expirado. Peça um novo link." };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, invite_code: inviteCode || null },
      emailRedirectTo: `${await siteUrl()}/auth/confirm`,
    },
  });
  if (error) return { error: inviteCode ? translate(error.message) : "Cadastro somente por convite." };

  return { ok: "Conta criada! Enviamos um link de confirmação para o seu e-mail." };
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "E-mail inválido." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/nova-senha`,
  });
  // mesma resposta sempre, para não revelar quais e-mails têm conta
  return { ok: "Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha." };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return { error: "A senha precisa de pelo menos 8 caracteres, com letras e números." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: translate(error.message) };
  redirect("/painel");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
