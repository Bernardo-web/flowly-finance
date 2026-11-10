import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * O plano gratuito do Supabase pausa o projeto quando há pouca atividade nos últimos 7 dias
 * ("algumas requisições ao banco por dia" bastam, segundo a documentação).
 * Esta rota é chamada pela Vercel (todo dia) e pelo GitHub Actions (a cada 6 horas)
 * e faz algumas consultas leves, para o banco nunca ser pausado.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  // consultas leves que não leem dado de ninguém (a única função liberada sem login)
  const checks = [];
  for (let i = 0; i < 4; i++) checks.push(await supabase.rpc("check_invite", { p_code: `keepalive-${i}` }));
  const failed = checks.filter((c) => c.error).length;
  return NextResponse.json(
    { ok: failed === 0, requests: checks.length, failed, at: new Date().toISOString() },
    { status: failed === checks.length ? 500 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
