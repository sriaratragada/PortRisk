import { prisma } from "@/lib/db";

export async function getPortfolioWithPositions(portfolioId: string, userId: string) {
  return prisma.portfolio.findFirst({
    where: {
      id: portfolioId,
      userId
    },
    include: {
      positions: true,
      riskScores: {
        orderBy: { scoredAt: "desc" },
        take: 1
      }
    }
  });
}
