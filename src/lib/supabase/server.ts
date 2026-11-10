import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { cookies } from "next/headers";
import { cache } from "react";
import { fetchWithTimeout, withTimeout } from "./timeout";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** Cliente do Supabase para Server Components, Server Actions e Route Handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithTimeout(8000) },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: CookieToSet[]) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components não podem gravar cookies; o middleware renova a sessão.
          }
        },
      },
    },
  );
}

export type SessionUser = { id: string; email: string };

/**
 * Usuário logado. O token é verificado pela assinatura (chaves públicas do Supabase,
 * guardadas em cache), sem ir ao servidor de login a cada tela.
 * `cache` faz layout e página da mesma requisição dividirem uma única verificação.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  type Claims = Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  const result = await withTimeout<Claims | null>(supabase.auth.getClaims(), 5000, null);
  // sem resposta do Supabase: mostra a tela de erro em vez de travar ou deslogar a pessoa
  if (result === null) throw new Error("SUPABASE_UNAVAILABLE");
  const claims = result.data?.claims;
  const user: SessionUser | null = claims?.sub ? { id: claims.sub, email: String(claims.email ?? "") } : null;
  return { supabase, user };
});

/** Perfil do usuário logado, buscado uma vez por requisição. */
export const getProfile = cache(async () => {
  const { supabase, user } = await getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("full_name, is_admin").eq("id", user.id).single();
  return (data as { full_name: string; is_admin: boolean } | null) ?? null;
});
