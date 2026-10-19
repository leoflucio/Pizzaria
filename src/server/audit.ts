import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

export async function audit(userId: string | null, action: string, entity: string, entityId?: string | null, data?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { userId, action, entity, entityId: entityId ?? null, data } });
}
