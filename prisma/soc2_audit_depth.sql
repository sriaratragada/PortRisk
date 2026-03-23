alter table "AuditLog"
  add column if not exists "eventVersion" integer not null default 2,
  add column if not exists "category" text not null default 'SYSTEM',
  add column if not exists "severity" text not null default 'INFO',
  add column if not exists "outcome" text not null default 'SUCCESS',
  add column if not exists "actorType" text not null default 'USER',
  add column if not exists "requestId" text,
  add column if not exists "route" text,
  add column if not exists "method" text,
  add column if not exists "sessionId" text,
  add column if not exists "ipHash" text,
  add column if not exists "userAgentHash" text,
  add column if not exists "reasonCode" text,
  add column if not exists "controlRefs" jsonb,
  add column if not exists "policyEvaluations" jsonb,
  add column if not exists "prevEventHash" text,
  add column if not exists "eventHash" text;

create index if not exists "AuditLog_userId_portfolioId_timestamp_idx"
on "AuditLog" ("userId", "portfolioId", "timestamp" desc);

create index if not exists "AuditLog_category_severity_outcome_timestamp_idx"
on "AuditLog" ("category", "severity", "outcome", "timestamp" desc);

create index if not exists "AuditLog_requestId_idx"
on "AuditLog" ("requestId");
