# Portfolio Risk & Compliance Engine

Next.js 14 application for retail and institutional portfolio risk analysis, stress testing, realtime exposure monitoring, and an append-only compliance audit trail. The design keeps everything in one TypeScript codebase so the UI, APIs, financial math, and data contracts stay aligned and deploy together on Vercel.

## Why One Next.js Codebase

A single Next.js deployment is deliberate here:

- It keeps the risk engine, UI, auth, and persistence model in one repo and one language.
- Edge-deployed API routes handle latency-sensitive scoring and stress calculations close to the user.
- Shared TypeScript types avoid schema drift between frontend and backend.
- The operational footprint is smaller than a microservices split, which matters for audit-heavy systems where correctness and traceability matter more than service count.

Microservices would add inter-service auth, versioning, queueing, and observability overhead without improving the core math or user experience for this product.

## Stack

- Next.js 14 App Router
- TypeScript end to end
- Tailwind CSS
- Recharts
- Prisma schema and client
- Supabase PostgreSQL + Auth + Realtime
- Upstash Redis rate limiting
- Yahoo Finance market data via `yahoo-finance2`
- Vercel Edge Runtime for risk and stress routes

## Architecture

```text
app/
  api/
    portfolio/        Node runtime CRUD + transactional audit writes
    risk/score/       Edge runtime portfolio scoring
    stress/           Edge runtime scenario analysis
    audit/            Audit retrieval
    realtime/prices/  Server-triggered realtime broadcasts
  page.tsx            Operator dashboard
components/
  dashboard.tsx       Full dashboard UI
lib/
  risk.ts             Pure TypeScript portfolio math
  market.ts           Yahoo Finance fetch + in-memory cache
  portfolio.ts        Portfolio hydration and scenario orchestration
  audit.ts            Immutable audit helpers
  ratelimit.ts        Upstash sliding-window enforcement
prisma/
  schema.prisma       Database schema
  rls.sql             Supabase RLS policies
tests/
  risk.test.ts        Unit tests for core risk metrics
```

## Risk Metrics

### Sharpe Ratio

Measures excess return per unit of volatility.

- Uses 252 trailing trading days of daily closes.
- Computes daily returns, annualizes mean return and standard deviation.
- Formula: `(annualized_return - 0.045) / annualized_std`.

Limitations:

- Assumes volatility is a sufficient proxy for risk.
- Penalizes upside and downside volatility equally.
- Can look stable right before regime shifts.

### Maximum Drawdown

Measures the largest peak-to-trough decline across the trailing 12-month value path.

- Tracks the running peak of the portfolio value series.
- Finds the worst percentage decline from any peak.

Limitations:

- Entirely backward-looking.
- Sensitive to the chosen observation window.
- Says nothing about recovery speed by itself.

### Value at Risk (VaR 95%)

Estimates one-day downside under a parametric normal assumption.

- Uses historical mean and standard deviation of daily returns over 252 trading days.
- Formula: `portfolio_value * abs(mean - 1.645 * std)`.
- Returns both percentage VaR and dollar VaR.

Limitations:

- Understates tail risk when returns are skewed or fat-tailed.
- Assumes normality and stable volatility.
- CVaR is a better extension when you need expected loss beyond the VaR cutoff.

### Drawdown Probability (Monte Carlo)

Estimates the probability of breaching a user-defined drawdown threshold over:

- 3 months: 63 trading days
- 6 months: 126 trading days
- 12 months: 252 trading days

Method:

- Historical drift and volatility feed a geometric Brownian motion simulation.
- 1,000 simulated forward paths are run per request.
- The reported probability is the share of paths that breach the threshold.

Limitations:

- Path distribution inherits the assumptions of historical drift and volatility.
- GBM does not capture jumps, regime changes, or liquidity shocks well.

## Audit and Compliance Model

All risk-affecting actions are written to `AuditLog` with:

- `userId`, `portfolioId`, UTC timestamp
- `actionType`
- `beforeState` and `afterState` JSON snapshots
- `riskTierBefore` and `riskTierAfter`

Supabase RLS is enabled on every table. The audit log is append-only:

- authenticated users can `INSERT` their own audit rows
- authenticated users can `SELECT` only their own audit rows
- `UPDATE` and `DELETE` are revoked for `anon`, `authenticated`, and `service_role`

Apply the policies from [prisma/rls.sql](/Users/sriatragada/Downloads/PortfolioRiskEngine/prisma/rls.sql).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables from [.env.example](/Users/sriatragada/Downloads/PortfolioRiskEngine/.env.example).

3. Generate Prisma client and apply migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

4. Apply Supabase RLS SQL in the SQL editor:

```sql
-- copy the contents of prisma/rls.sql
```

5. Start the app:

```bash
npm run dev
```

## Authentication Setup

This app now uses Supabase Auth with email/password login and cookie-backed session persistence for App Router pages, route handlers, and middleware.

In Supabase:

- Enable `Email` under `Authentication -> Providers`
- Decide whether email confirmation is required
- Set your site URL to your local or deployed app URL

Protected routes:

- `/` requires an authenticated session
- `/login` and `/signup` redirect authenticated users back into the app

User persistence:

- On first authenticated app load, the app upserts a matching row in the `User` table using the Supabase auth user id and email
- All portfolios, audit logs, risk scores, and stress tests remain scoped to that user id

## Performance Verification

Run these after provisioning the database:

```sql
EXPLAIN ANALYZE
SELECT *
FROM "AuditLog"
WHERE "userId" = '<user-id>'
ORDER BY "timestamp" DESC
LIMIT 20;
```

```sql
EXPLAIN ANALYZE
SELECT *
FROM "RiskScore"
WHERE "portfolioId" = '<portfolio-id>'
ORDER BY "scoredAt" DESC
LIMIT 1;
```

Target expectations:

- Edge risk routes under 50ms excluding external market-data latency
- Monte Carlo 1,000-path run under 200ms
- Upstash limiter overhead under 5ms

## Deployment

Deploy to Vercel with:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CRON_SECRET`

Then confirm:

- `/api/risk/score` and `/api/stress` are running with `runtime = "edge"`
- Supabase Realtime channels broadcast updates correctly
- Vercel cron hits `/api/realtime/prices`

## Live Deployment URL

Add the deployed Vercel URL here after deployment. It is not populated in this workspace yet.
