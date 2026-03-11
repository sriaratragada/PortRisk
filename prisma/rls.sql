alter table "User" enable row level security;
alter table "Portfolio" enable row level security;
alter table "Position" enable row level security;
alter table "RiskScore" enable row level security;
alter table "StressTest" enable row level security;
alter table "AuditLog" enable row level security;

create policy "users_select_self"
on "User"
for select
to authenticated
using (id = auth.uid()::text);

create policy "portfolio_owner_all"
on "Portfolio"
for all
to authenticated
using ("userId" = auth.uid()::text)
with check ("userId" = auth.uid()::text);

create policy "position_owner_all"
on "Position"
for all
to authenticated
using (
  exists (
    select 1
    from "Portfolio"
    where "Portfolio".id = "Position"."portfolioId"
      and "Portfolio"."userId" = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from "Portfolio"
    where "Portfolio".id = "Position"."portfolioId"
      and "Portfolio"."userId" = auth.uid()::text
  )
);

create policy "risk_score_owner_all"
on "RiskScore"
for all
to authenticated
using (
  exists (
    select 1
    from "Portfolio"
    where "Portfolio".id = "RiskScore"."portfolioId"
      and "Portfolio"."userId" = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from "Portfolio"
    where "Portfolio".id = "RiskScore"."portfolioId"
      and "Portfolio"."userId" = auth.uid()::text
  )
);

create policy "stress_test_owner_all"
on "StressTest"
for all
to authenticated
using (
  exists (
    select 1
    from "Portfolio"
    where "Portfolio".id = "StressTest"."portfolioId"
      and "Portfolio"."userId" = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from "Portfolio"
    where "Portfolio".id = "StressTest"."portfolioId"
      and "Portfolio"."userId" = auth.uid()::text
  )
);

create policy "audit_log_owner_select"
on "AuditLog"
for select
to authenticated
using ("userId" = auth.uid()::text);

create policy "audit_log_append_only"
on "AuditLog"
for insert
to authenticated
with check ("userId" = auth.uid()::text);

revoke update on table "AuditLog" from anon, authenticated, service_role;
revoke delete on table "AuditLog" from anon, authenticated, service_role;

create index if not exists "AuditLog_userId_timestamp_idx"
on "AuditLog" ("userId", "timestamp" desc);

create index if not exists "RiskScore_portfolioId_scoredAt_idx"
on "RiskScore" ("portfolioId", "scoredAt" desc);
