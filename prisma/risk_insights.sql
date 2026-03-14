create table if not exists "RiskInsight" (
  "id" text primary key,
  "portfolioId" text not null references "Portfolio"("id") on delete cascade,
  "generatedAt" timestamp(3) not null default current_timestamp,
  "sourceRiskScoreId" text,
  "model" text not null,
  "provider" text not null,
  "source" text not null,
  "summary" text not null,
  "drivers" jsonb not null,
  "resilienceFactors" jsonb not null,
  "alerts" jsonb not null,
  "recommendedActions" jsonb not null,
  "regimeCommentary" text not null,
  "changeSummary" text not null,
  "dataConfidence" text not null,
  "rawPromptInput" jsonb not null
);

create index if not exists "RiskInsight_portfolioId_generatedAt_idx"
on "RiskInsight" ("portfolioId", "generatedAt" desc);
