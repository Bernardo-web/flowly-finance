import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/supabase/middleware";

/**
 * Destino dos links enviados por e-mail (confirmação de cadastro e nova senha).
 * Os modelos de e-mail do Supabase devem apontar para:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/nova-senha
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const url = new URL("/entrar", request.url);
  url.searchParams.set("erro", "link-invalido");
  return NextResponse.redirect(url);
}
