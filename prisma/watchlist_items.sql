create table if not exists "WatchlistItem" (
  "id" text primary key,
  "portfolioId" text not null references "Portfolio"("id") on delete cascade,
  "ticker" text not null,
  "companyName" text not null,
  "exchange" text not null,
  "quoteType" text not null,
  "sector" text not null,
  "industry" text,
  "status" text not null default 'NEW',
  "conviction" integer not null default 3,
  "targetPrice" double precision,
  "thesis" text not null default '',
  "catalysts" text not null default '',
  "risks" text not null default '',
  "valuationNotes" text not null default '',
  "notes" text not null default '',
  "sourceType" text not null default 'manual',
  "sourceLabel" text not null default 'Manual search',
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp
);

create index if not exists "WatchlistItem_portfolioId_updatedAt_idx"
on "WatchlistItem" ("portfolioId", "updatedAt" desc);

create index if not exists "WatchlistItem_portfolioId_status_updatedAt_idx"
on "WatchlistItem" ("portfolioId", "status", "updatedAt" desc);

create unique index if not exists "WatchlistItem_portfolioId_ticker_active_key"
on "WatchlistItem" ("portfolioId", "ticker")
where "status" not in ('PASSED', 'PROMOTED');
