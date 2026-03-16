-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "avgCost" DOUBLE PRECISION NOT NULL,
    "assetClass" TEXT NOT NULL DEFAULT 'equities',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskScore" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sharpe" DOUBLE PRECISION NOT NULL,
    "maxDrawdown" DOUBLE PRECISION NOT NULL,
    "var95" DOUBLE PRECISION NOT NULL,
    "var95Amount" DOUBLE PRECISION NOT NULL,
    "drawdownProb3m" DOUBLE PRECISION NOT NULL,
    "drawdownProb6m" DOUBLE PRECISION NOT NULL,
    "drawdownProb12m" DOUBLE PRECISION NOT NULL,
    "riskTier" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,

    CONSTRAINT "RiskScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskInsight" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceRiskScoreId" TEXT,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "drivers" JSONB NOT NULL,
    "resilienceFactors" JSONB NOT NULL,
    "alerts" JSONB NOT NULL,
    "recommendedActions" JSONB NOT NULL,
    "regimeCommentary" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "dataConfidence" TEXT NOT NULL,
    "rawPromptInput" JSONB NOT NULL,

    CONSTRAINT "RiskInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StressTest" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "scenarioName" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectedValue" DOUBLE PRECISION NOT NULL,
    "newRiskTier" TEXT NOT NULL,
    "recoveryDays" INTEGER NOT NULL,
    "inputs" JSONB NOT NULL,
    "results" JSONB NOT NULL,

    CONSTRAINT "StressTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionType" TEXT NOT NULL,
    "beforeState" JSONB NOT NULL,
    "afterState" JSONB NOT NULL,
    "riskTierBefore" TEXT,
    "riskTierAfter" TEXT,
    "metadata" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketQuoteCache" (
    "symbol" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "previousClose" DOUBLE PRECISION NOT NULL,
    "changePercent" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "shortName" TEXT,
    "longName" TEXT,
    "exchange" TEXT,
    "marketCap" DOUBLE PRECISION,
    "trailingPE" DOUBLE PRECISION,
    "fiftyTwoWeekLow" DOUBLE PRECISION,
    "fiftyTwoWeekHigh" DOUBLE PRECISION,
    "provider" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB NOT NULL,

    CONSTRAINT "MarketQuoteCache_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "MarketHistoryCache" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "range" TEXT NOT NULL,
    "series" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "seriesStart" TIMESTAMP(3),
    "seriesEnd" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,

    CONSTRAINT "MarketHistoryCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityIdentityCache" (
    "symbol" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "rawPayload" JSONB NOT NULL,

    CONSTRAINT "SecurityIdentityCache_pkey" PRIMARY KEY ("symbol")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Position_portfolioId_idx" ON "Position"("portfolioId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_portfolioId_ticker_key" ON "Position"("portfolioId", "ticker");

-- CreateIndex
CREATE INDEX "RiskScore_portfolioId_scoredAt_idx" ON "RiskScore"("portfolioId", "scoredAt" DESC);

-- CreateIndex
CREATE INDEX "RiskInsight_portfolioId_generatedAt_idx" ON "RiskInsight"("portfolioId", "generatedAt" DESC);

-- CreateIndex
CREATE INDEX "StressTest_portfolioId_runAt_idx" ON "StressTest"("portfolioId", "runAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_portfolioId_timestamp_idx" ON "AuditLog"("portfolioId", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MarketHistoryCache_symbol_range_key" ON "MarketHistoryCache"("symbol", "range");

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskScore" ADD CONSTRAINT "RiskScore_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskInsight" ADD CONSTRAINT "RiskInsight_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StressTest" ADD CONSTRAINT "StressTest_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
