import { notFound } from "next/navigation";
import { requireStoreAccess } from "@/server/auth";
import { prisma } from "@/server/db";
import { AdminPage, Check, Field, Flash, Save, Section, formatBRL, reais } from "@/components/admin/ui";
import { ZoneMap } from "@/components/admin/ZoneMap";
import { deleteZone, saveZone } from "../../../actions";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { NEIGHBORHOOD: "Por bairros", RADIUS: "Raio (km) a partir da loja", POLYGON: "Desenho no mapa" };

type ZoneRow = Awaited<ReturnType<typeof prisma.deliveryZone.findMany>>[number];

function ZoneForm({ storeId, z, targetId }: { storeId: string; z?: ZoneRow; targetId?: string }) {
  return (
    <form action={saveZone} className="grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="storeId" value={storeId} />
      {z && <input type="hidden" name="id" value={z.id} />}
      <Field label="Nome da área" name="name" defaultValue={z?.name} required />
      <label className="block">
        <span className="label">Tipo</span>
        <select name="kind" id={targetId ? `${targetId}-kind` : undefined} defaultValue={z?.kind ?? "NEIGHBORHOOD"} className="input py-2">
          {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <Field label="Taxa de entrega (R$)" name="fee" defaultValue={reais(z?.feeCents ?? 500)} required />
      <Field label="Pedido mínimo (R$)" name="minOrder" defaultValue={reais(z?.minOrderCents ?? 0)} />
      <label className="block sm:col-span-4">
        <span className="label">Bairros (um por linha ou separados por vírgula) · para o tipo "Por bairros"</span>
        <textarea name="neighborhoods" rows={2} className="input py-2" defaultValue={z?.neighborhoods.join(", ")} />
      </label>
      <Field label="Raio em km · tipo Raio" name="radiusKm" defaultValue={z?.radiusMeters ? String(z.radiusMeters / 1000).replace(".", ",") : ""} />
      <label className="block sm:col-span-3">
        <span className="label">Polígono · tipo Desenho (preenchido pelo mapa ou GeoJSON do geojson.io)</span>
        <textarea name="polygon" id={targetId} rows={2} className="input py-2 font-mono text-xs" defaultValue={z?.polygon ? JSON.stringify(z.polygon) : ""} />
      </label>
      <Field label="Minutos extras" name="extraMinutes" type="number" defaultValue={z?.extraMinutes ?? 0} hint="Somados ao tempo estimado." />
      <Field label="Prioridade" name="priority" type="number" defaultValue={z?.priority ?? 0} hint="Maior vence quando duas áreas da loja cobrem o endereço." />
      <div className="flex items-end"><Check label="Ativa" name="active" defaultChecked={z?.active ?? true} /></div>
      <div className="flex items-end"><Save label={z ? "Salvar área" : "Criar área"} /></div>
    </form>
  );
}

export default async function AreasPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { id } = await params;
  await requireStoreAccess(id, ["STORE_MANAGER"]);
  const store = await prisma.store.findUnique({ where: { id }, include: { zones: { orderBy: [{ active: "desc" }, { feeCents: "asc" }] } } });
  if (!store) notFound();
  const others = await prisma.deliveryZone.findMany({ where: { storeId: { not: id }, active: true, kind: "NEIGHBORHOOD" }, include: { store: { select: { label: true } } } });
  const mine = new Set(store.zones.flatMap((z) => z.neighborhoods.map((n) => n.toLowerCase())));
  const shared = others.flatMap((z) => z.neighborhoods.filter((n) => mine.has(n.toLowerCase())).map((n) => `${n} (${z.store.label})`));
  return (
    <AdminPage title={`Áreas de entrega · ${store.label}`} back={{ href: `/painel/admin/lojas/${id}`, label: store.name }}>
      <Flash {...await searchParams} />
      <Section title="Mapa">
        <ZoneMap store={{ lat: store.lat, lng: store.lng, name: store.name }} zones={store.zones.map((z) => ({ id: z.id, name: z.name, kind: z.kind, radiusMeters: z.radiusMeters, polygon: z.polygon as [number, number][] | null, active: z.active }))} targetId="new-zone-polygon" />
        {shared.length > 0 && <p className="mt-3 text-sm text-stone-600">Bairros atendidos também por outra loja (o sistema escolhe a de menor tempo): {shared.join(", ")}.</p>}
      </Section>
      <Section title="Nova área">
        <ZoneForm storeId={id} targetId="new-zone-polygon" />
      </Section>
      {store.zones.map((z) => (
        <details key={z.id} className="card mb-3 p-4">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2">
            <b>{z.name}</b>
            <span className="text-sm text-stone-500">{KIND[z.kind]} · {formatBRL(z.feeCents)}{z.kind === "NEIGHBORHOOD" ? ` · ${z.neighborhoods.join(", ")}` : z.kind === "RADIUS" ? ` · ${(z.radiusMeters ?? 0) / 1000} km` : ""}</span>
            {!z.active && <span className="chip bg-stone-200">inativa</span>}
          </summary>
          <div className="mt-4">
            <ZoneForm storeId={id} z={z} />
            <form action={deleteZone} className="mt-3">
              <input type="hidden" name="storeId" value={id} />
              <input type="hidden" name="id" value={z.id} />
              <button className="text-sm font-semibold text-red-700">Excluir área</button>
            </form>
          </div>
        </details>
      ))}
    </AdminPage>
  );
}
