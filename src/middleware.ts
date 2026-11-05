import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // tudo, menos arquivos estáticos
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|apple-touch-icon.png|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
