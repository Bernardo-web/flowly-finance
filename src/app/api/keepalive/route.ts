import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * O plano gratuito do Supabase pausa o projeto após 7 dias sem uso.
 * A Vercel chama esta rota todo dia (vercel.json) com uma consulta mínima,
 * para o app nunca amanhecer fora do ar.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await supabase.rpc("check_invite", { p_code: "keepalive" });
  return NextResponse.json({ ok: !error, at: new Date().toISOString() }, { status: error ? 500 : 200 });
}
