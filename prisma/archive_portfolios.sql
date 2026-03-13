alter table "Portfolio"
add column if not exists "archivedAt" timestamp(3);

create index if not exists "Portfolio_userId_archivedAt_updatedAt_idx"
on "Portfolio" ("userId", "archivedAt", "updatedAt" desc);
