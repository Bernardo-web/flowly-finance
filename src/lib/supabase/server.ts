import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente do Supabase para Server Components, Server Actions e Route Handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
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

/** Usuário logado (validado no servidor do Supabase, não só pelo cookie). */
export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}
