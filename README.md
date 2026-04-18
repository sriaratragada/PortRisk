# Portfolio Management Platform

Portfolio Management Platofrm is a Next.js portfolio risk and research workspace for building, tracking, and stress-testing investment portfolios.

It combines deterministic risk analytics, benchmark-aware performance views, an auditable activity trail, and a research-to-position workflow in one application.

## Table of Contents

- [Highlights](#highlights)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Application Routes](#application-routes)
- [API Routes](#api-routes)
- [Data Model](#data-model)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup (Prisma)](#database-setup-prisma)
- [Available Scripts](#available-scripts)
- [Testing](#testing)
- [Notes](#notes)

## Highlights

- Authenticated workspace with portfolio-scoped data access
- Holdings CRUD with archived portfolio support
- Benchmark-aware portfolio analytics
- Deterministic risk scoring and risk reports
- Stress testing and allocation recommendations
- Research/watchlist pipeline with promotion into holdings
- Audit trail with verification endpoint
- Market and company data integrations via Yahoo Finance
- Optional AI-based risk and research insights

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling/UI:** Tailwind CSS, Radix UI, Framer Motion, Recharts
- **Auth & Data Access:** Supabase
- **Database & ORM:** PostgreSQL + Prisma
- **Market Data:** `yahoo-finance2`
- **Rate Limiting:** Upstash Redis (optional)
- **AI Integrations:** configurable provider/model via environment variables

## Project Structure

```text
.
├── app/                 # App Router pages and API route handlers
├── components/          # UI and workspace components
├── lib/                 # Business logic, adapters, analytics, auth/data helpers
├── prisma/              # Prisma schema and migrations
├── public/              # Static assets
├── tests/               # Node test suite (*.test.ts)
├── middleware.ts        # Route protection and auth redirects
└── package.json         # Scripts and dependencies
```

## Application Routes

- `/` — public landing page
- `/login` — sign in
- `/signup` — sign up
- `/app` — authenticated workspace

## API Routes

Key route groups under `app/api`:

- `/api/portfolio`
- `/api/portfolio/[portfolioId]`
- `/api/portfolio/[portfolioId]/positions`
- `/api/portfolio/[portfolioId]/watchlist`
- `/api/portfolio/[portfolioId]/research/*`
- `/api/portfolio/[portfolioId]/allocation/recommend`
- `/api/portfolio/[portfolioId]/benchmark`
- `/api/portfolio/[portfolioId]/history`
- `/api/risk/score`, `/api/risk/report`, `/api/risk/insights`
- `/api/stress`
- `/api/audit`, `/api/audit/verify`
- `/api/securities/search`, `/api/securities/[ticker]/preview`
- `/api/company/[ticker]`
- `/api/realtime/prices`

## Data Model

The Prisma schema defines core entities:

- `User`
- `Portfolio`
- `Position`
- `WatchlistItem`
- `RiskScore`
- `RiskInsight`
- `StressTest`
- `AuditLog`

Full schema location: `./prisma/schema.prisma`

## Getting Started

### 1) Install dependencies

```bash
# from the project root
npm install
```

### 2) Configure local environment

Copy `.env.example` to `.env.local` and set required values.

### 3) Generate Prisma client and run migrations

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 4) Start development server

```bash
npm run dev
```

App runs at `http://localhost:3000` by default.

## Environment Variables

Defined in `.env.example`:

### Required

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

### Optional

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CRON_SECRET`
- `AI_API_KEY`
- `AI_BASE_URL`
- `AI_MODEL`
### Legacy (optional, usually unset for new installs)

- `TWELVE_DATA_API_KEY`
- `FMP_API_KEY`

These are kept only for compatibility with older local setups. The current market-data implementation is Yahoo-based, so new installations can leave them unset.

## Database Setup (Prisma)

- Generate client: `npm run prisma:generate`
- Apply local dev migration: `npm run prisma:migrate`
- Apply deploy migrations: `npm run prisma:deploy`

## Available Scripts

From the project root:

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — run production server
- `npm run lint` — lint checks
- `npm run test` — test suite (`node --test --import tsx tests/**/*.test.ts`)
- `npm run prisma:generate` — generate Prisma client
- `npm run prisma:migrate` — create/apply local migration
- `npm run prisma:deploy` — apply migrations in deploy environments

## Testing

Run tests with:

```bash
npm run test
```

Test coverage includes benchmark analytics, market adapters, research flows, risk logic, allocation recommendations, workspace data shaping, and audit event behaviors.

## Notes

- The app protects non-public routes in `middleware.ts`.
- AI functionality is optional and gracefully degrades when AI env vars are not configured.
- Keep `.env.local` out of version control.
