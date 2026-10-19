import Link from "next/link";
import { formatBRL } from "@/domain/money";

export function Flash({ ok, erro }: { ok?: string; erro?: string }) {
  if (!ok && !erro) return null;
  return <p role={erro ? "alert" : "status"} className={`mb-4 rounded-xl p-3 font-medium ${erro ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>{erro ?? ok}</p>;
}

export function AdminPage({ title, back, children, actions }: { title: string; back?: { href: string; label: string }; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl p-4">
      {back && <Link href={back.href} className="text-sm font-semibold text-brand">← {back.label}</Link>}
      <div className="mb-4 mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <div className="ml-auto flex gap-2">{actions}</div>
      </div>
      {children}
    </main>
  );
}

export function Section({ id, title, desc, children }: { id?: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card mb-6 scroll-mt-20 p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {desc && <p className="mb-3 text-sm text-stone-500">{desc}</p>}
      <div className={desc ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export function Field({ label, name, defaultValue, type = "text", required, placeholder, hint, className, step, readOnly }: {
  label: string; name: string; defaultValue?: string | number | null; type?: string; required?: boolean; placeholder?: string; hint?: string; className?: string; step?: string; readOnly?: boolean;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label">{label}</span>
      <input className="input py-2" name={name} type={type} defaultValue={defaultValue ?? ""} required={required} placeholder={placeholder} step={step} readOnly={readOnly} />
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function Check({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-5 w-5 accent-[var(--color-brand)]" />
      {label}
    </label>
  );
}

export function Save({ label = "Salvar" }: { label?: string }) {
  return <button className="btn-primary py-2">{label}</button>;
}

/** Money input in reais ("55,50"). Empty stays empty. */
export const reais = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));
export { formatBRL };
