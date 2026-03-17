alter table "Portfolio"
add column if not exists "benchmark" text not null default 'SPY';

update "Portfolio"
set "benchmark" = case
  when lower("name") like '%growth%' then 'QQQ'
  when lower("name") like '%income%' then 'SCHD'
  when lower("name") like '%balanced%' then 'AOR'
  when lower("name") like '%defensive%' or lower("name") like '%conservative%' then 'AGG'
  when lower("name") like '%speculative%' then 'ARKK'
  else coalesce("benchmark", 'SPY')
end
where "benchmark" is null or btrim("benchmark") = '';
