import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { badRequest, json, parseJson } from "@/lib/http";
import { ensureAppUserRecord } from "@/lib/user";
import { portfolioCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const portfolios = await prisma.portfolio.findMany({
    where: { userId: auth.user.id },
    include: {
      positions: true,
      riskScores: {
        orderBy: { scoredAt: "desc" },
        take: 1
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  return json({ portfolios });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  await ensureAppUserRecord(auth.user);
  const payload = await parseJson(request, portfolioCreateSchema);
  const positions = payload.positions ?? [];
  const portfolio = await prisma.$transaction(async (tx) => {
    const created = await tx.portfolio.create({
      data: {
        userId: auth.user.id,
        name: payload.name,
        positions: {
          create: positions.map((position) => ({
            ticker: position.ticker.toUpperCase(),
            shares: position.shares,
            avgCost: position.avgCost,
            assetClass: position.assetClass
          }))
        }
      },
      include: {
        positions: true
      }
    });

    await writeAuditLog(tx, {
      userId: auth.user.id,
      portfolioId: created.id,
      actionType: "ALLOCATION_COMMITTED",
      beforeState: {},
      afterState: created,
      riskTierBefore: null,
      riskTierAfter: null
    });

    return created;
  });

  return json({ portfolio }, { status: 201 });
}

export async function PATCH() {
  return badRequest("Use /api/portfolio/[portfolioId] for updates", 405);
}
