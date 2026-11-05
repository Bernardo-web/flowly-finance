import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  back?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-start gap-3">
      {back && (
        <Link href={back} aria-label="Voltar" className="btn-ghost -ml-1 mt-0.5 px-2 py-2">
          <ChevronLeft className="size-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="muted text-sm">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export const COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#16a34a", "#dc2626", "#0891b2", "#64748b"];

export function ColorPicker({ name = "color", value }: { name?: string; value?: string }) {
  const current = value && COLORS.includes(value) ? value : COLORS[0];
  return (
    <fieldset>
      <legend className="label">Cor</legend>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <label key={c} className="cursor-pointer">
            <input type="radio" name={name} value={c} defaultChecked={c === (value ?? current)} className="peer sr-only" />
            <span
              className="block size-8 rounded-full ring-offset-2 ring-offset-[var(--surface)] peer-checked:ring-2 peer-focus-visible:ring-2"
              style={{ background: c, ["--tw-ring-color" as string]: c }}
              aria-label={c}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
