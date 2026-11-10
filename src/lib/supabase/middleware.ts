import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { NextResponse, type NextRequest } from "next/server";
import { fetchWithTimeout, withTimeout } from "./timeout";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const PUBLIC_PATHS = ["/entrar", "/cadastro", "/recuperar", "/auth/", "/api/keepalive", "/privacidade"];

/** Renova a sessão a cada requisição e protege as páginas internas. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithTimeout(4000) },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet: CookieToSet[]) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // verifica o token pela assinatura (sem ida ao servidor) e renova a sessão se estiver vencendo
  // Se o Supabase não responder a tempo, segue sem bloquear: a página decide o que mostrar.
  type Claims = Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  const result = await withTimeout<Claims | null>(supabase.auth.getClaims(), 3000, null);
  if (result === null) return response;
  const loggedIn = Boolean(result.data?.claims?.sub);
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!loggedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  if (loggedIn && (path === "/entrar" || path === "/cadastro")) {
    const url = request.nextUrl.clone();
    url.pathname = "/painel";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

/** Só aceita redirecionar para caminhos internos (evita open redirect). */
export function safeNext(next: string | null | undefined, fallback = "/painel"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
