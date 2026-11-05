import { redirect } from "next/navigation";
import { getProfile, getUser } from "@/lib/supabase/server";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getUser();
  if (!user) redirect("/entrar");
  const profile = await getProfile();

  return (
    <div className="min-h-dvh">
      <AppNav isAdmin={profile?.is_admin ?? false} name={profile?.full_name || user.email || ""} />
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 md:pb-10 md:pl-72 md:pr-8 md:pt-10">{children}</main>
    </div>
  );
}
