import { Prisma, PrismaClient } from "@prisma/client";
import { utcNowIso } from "@/lib/utils";

export type AuditActionType =
  | "POSITION_ADDED"
  | "POSITION_REMOVED"
  | "POSITION_RESIZED"
  | "RISK_SCORED"
  | "STRESS_TEST_RUN"
  | "ALLOCATION_COMMITTED";

type AuditPayload = {
  userId: string;
  portfolioId: string;
  actionType: AuditActionType;
  beforeState: Prisma.InputJsonValue;
  afterState: Prisma.InputJsonValue;
  riskTierBefore?: string | null;
  riskTierAfter?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAuditLog(prisma: PrismaClient | Prisma.TransactionClient, payload: AuditPayload) {
  return prisma.auditLog.create({
    data: {
      userId: payload.userId,
      portfolioId: payload.portfolioId,
      actionType: payload.actionType,
      beforeState: payload.beforeState,
      afterState: payload.afterState,
      riskTierBefore: payload.riskTierBefore,
      riskTierAfter: payload.riskTierAfter,
      metadata: payload.metadata,
      timestamp: utcNowIso()
    }
  });
}
