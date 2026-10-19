import { notFound } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { requireStoreAccess } from "./auth";

export async function storeForPage(slug: string, roles?: Role[]) {
  const store = await prisma.store.findUnique({ where: { slug } });
  if (!store) notFound();
  const session = await requireStoreAccess(store.id, roles);
  return { store, session };
}
