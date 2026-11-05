import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/entrar", "/cadastro", "/recuperar", "/auth/", "/api/keepalive"];

/** Renova a sessão a cada requisição e protege as páginas internas. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!data.user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  if (data.user && (path === "/entrar" || path === "/cadastro")) {
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
