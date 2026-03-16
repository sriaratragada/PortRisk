create table if not exists "MarketQuoteCache" (
  "symbol" text primary key,
  "price" double precision not null,
  "previousClose" double precision not null,
  "changePercent" double precision not null,
  "currency" text not null,
  "shortName" text,
  "longName" text,
  "exchange" text,
  "marketCap" double precision,
  "trailingPE" double precision,
  "fiftyTwoWeekLow" double precision,
  "fiftyTwoWeekHigh" double precision,
  "provider" text not null,
  "asOf" timestamp(3) not null,
  "fetchedAt" timestamp(3) not null,
  "rawPayload" jsonb not null
);

create table if not exists "MarketHistoryCache" (
  "id" text primary key,
  "symbol" text not null,
  "range" text not null,
  "series" jsonb not null,
  "provider" text not null,
  "asOf" timestamp(3) not null,
  "fetchedAt" timestamp(3) not null,
  "seriesStart" timestamp(3),
  "seriesEnd" timestamp(3),
  "rawPayload" jsonb not null
);

create unique index if not exists "MarketHistoryCache_symbol_range_key"
on "MarketHistoryCache" ("symbol", "range");

create table if not exists "SecurityIdentityCache" (
  "symbol" text primary key,
  "provider" text not null,
  "asOf" timestamp(3) not null,
  "fetchedAt" timestamp(3) not null,
  "data" jsonb not null,
  "rawPayload" jsonb not null
);
