import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { positionSchema } from "@/lib/validation";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  positions: z.array(positionSchema).optional()
});

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ portfolioId: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { portfolioId } = await context.params;

  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId: auth.user.id },
    include: {
      positions: true,
      riskScores: {
        orderBy: { scoredAt: "desc" },
        take: 10
      },
      stressTests: {
        orderBy: { runAt: "desc" },
        take: 10
      },
      auditLogs: {
        orderBy: { timestamp: "desc" },
        take: 20
      }
    }
  });

  if (!portfolio) {
    return badRequest("Portfolio not found", 404);
  }

  return json({ portfolio });
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { portfolioId } = await context.params;
  const payload = patchSchema.parse(await request.json());

  const existing = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId: auth.user.id },
    include: { positions: true }
  });
  if (!existing) {
    return badRequest("Portfolio not found", 404);
  }

  const nextPositions = (payload.positions ?? existing.positions).map((position) => ({
    ticker: position.ticker.toUpperCase(),
    shares: position.shares,
    avgCost: position.avgCost,
    assetClass: position.assetClass
  }));
  const beforePositions = new Map(existing.positions.map((position) => [position.ticker.toUpperCase(), position]));
  const afterPositions = new Map(nextPositions.map((position) => [position.ticker.toUpperCase(), position]));

  const portfolio = await prisma.$transaction(async (tx) => {
    if (payload.positions) {
      await tx.position.deleteMany({ where: { portfolioId } });
    }

    const updated = await tx.portfolio.update({
      where: { id: portfolioId },
      data: {
        name: payload.name ?? existing.name,
        positions: payload.positions
          ? {
              create: payload.positions.map((position) => ({
                ticker: position.ticker.toUpperCase(),
                shares: position.shares,
                avgCost: position.avgCost,
                assetClass: position.assetClass
              }))
            }
          : undefined
      },
      include: { positions: true }
    });

    const auditEvents = [];
    for (const [ticker, before] of beforePositions.entries()) {
      if (!afterPositions.has(ticker)) {
        auditEvents.push({
          actionType: "POSITION_REMOVED" as const,
          beforeState: before,
          afterState: {}
        });
        continue;
      }

      const after = afterPositions.get(ticker)!;
      if (before.shares !== after.shares || before.avgCost !== after.avgCost) {
        auditEvents.push({
          actionType: "POSITION_RESIZED" as const,
          beforeState: before,
          afterState: after
        });
      }
    }

    for (const [ticker, after] of afterPositions.entries()) {
      if (!beforePositions.has(ticker)) {
        auditEvents.push({
          actionType: "POSITION_ADDED" as const,
          beforeState: {},
          afterState: after
        });
      }
    }

    if (auditEvents.length === 0) {
      auditEvents.push({
        actionType: "ALLOCATION_COMMITTED" as const,
        beforeState: existing,
        afterState: updated
      });
    }

    for (const event of auditEvents) {
      await writeAuditLog(tx, {
        userId: auth.user.id,
        portfolioId,
        actionType: event.actionType,
        beforeState: event.beforeState,
        afterState: event.afterState,
        riskTierBefore: null,
        riskTierAfter: null
      });
    }

    return updated;
  });

  return json({ portfolio });
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { portfolioId } = await context.params;

  const existing = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId: auth.user.id },
    include: { positions: true }
  });
  if (!existing) {
    return badRequest("Portfolio not found", 404);
  }

  await prisma.portfolio.delete({ where: { id: portfolioId } });
  return json({ deleted: true });
}
