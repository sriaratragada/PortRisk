# Portfolio Management Platform

An accuracy-first portfolio operating workspace built with Next.js + TypeScript.

This project started as a portfolio dashboard and evolved into a full workflow system for:
- portfolio and holdings management
- benchmark-aware performance and attribution
- deterministic risk and stress diagnostics
- audit/compliance traceability
- research-to-position pipeline with watchlist promotion

## Table of Contents

- [Why I Built This](#why-i-built-this)
- [What This Product Does](#what-this-product-does)
- [Architecture](#architecture)
- [Engineering Methodologies Behind the Scenes](#engineering-methodologies-behind-the-scenes)
- [Accuracy & Degradation Rules](#accuracy--degradation-rules)
- [Risk Engine Principles](#risk-engine-principles)
- [What I Learned (Builder Perspective)](#what-i-learned-builder-perspective)
- [What I Achieved](#what-i-achieved)
- [Routes](#routes)
- [Local Setup](#local-setup)
- [Scripts](#scripts)
- [Testing](#testing)
- [Security Notes Before Making Repo Public](#security-notes-before-making-repo-public)
- [Project Status](#project-status)

---

## Why I Built This

I wanted a portfolio tool that behaves like an internal analyst workstation, not a generic tracker.

My goal was to build a system where:
- saved portfolio data is always the source of truth
- risk numbers are deterministic and auditable
- market data is real provider data (or explicitly unavailable)
- AI assists interpretation but does not override deterministic scoring

---

## What This Product Does

### Core workspace tabs
- `Overview`: portfolio value, benchmark-relative performance, top drivers, health matrix
- `Holdings`: table-first positions blotter + inspector + add/edit/remove flow
- `Research`: `Summary / Proposals / Intel Feed` with watchlist approval pipeline and promotion into holdings
- `Risk`: deterministic scorecards, diagnostics, and risk narratives
- `Stress`: scenario impacts and recovery estimates
- `Allocation`: target-weight experimentation
- `Audit`: append-only activity and compliance trail
- `Settings`: benchmark management and portfolio configuration

### Functional highlights
- Persistent portfolios with archive semantics (no destructive delete by default)
- Position CRUD (`create`, `update`, `delete`) without replacing the whole portfolio
- Portfolio-level benchmark support (preset + custom ticker validation)
- Deterministic sector classification to a fixed taxonomy
- Research pipeline with statuses: `NEW -> RESEARCHING -> READY -> PASSED -> PROMOTED`
- Promotion flow that pre-fills holdings add flow, then confirms shares/cost before save

---

## Architecture

### Frontend
- Next.js App Router
- TypeScript
- Tailwind CSS
- Recharts for market/risk visuals
- Framer Motion for transitions

### Backend/API (same Next.js codebase)
- Route handlers under `app/api/*`
- Supabase Auth + Postgres persistence
- Prisma schema + typed data access model
- Yahoo Finance adapter (`yahoo-finance2`) for market/search/detail data
- Optional AI layer for risk/research interpretation

### Data model (high level)
- `User`
- `Portfolio` (with `benchmark`, `archivedAt`)
- `Position`
- `WatchlistItem`
- `RiskScore`
- `RiskInsight`
- `StressTest`
- `AuditLog`

See [`prisma/schema.prisma`](./prisma/schema.prisma).

---

## Engineering Methodologies Behind the Scenes

To keep this platform reliable under real-world data/API conditions, I used a few deliberate engineering methodologies:

- **Deterministic core, assistive AI edge**: risk and attribution computations are deterministic so outputs stay auditable and repeatable; AI is only used to explain results, not to define them.
- **Progressive enrichment (two-phase data model)**: saved holdings render first for correctness and continuity, then live market/fundamental enrichment is layered in so the workspace stays usable even during partial outages.
- **Graceful degradation over hard failure**: each major tab is designed to fail locally; if one subsystem has missing data, the rest of the workspace remains intact.
- **Explicit nullability over fabricated defaults**: unavailable provider fields stay unavailable instead of being guessed, preserving analytical integrity.
- **Traceability-first workflow design**: append-only audit logging and explicit research state transitions make portfolio decisions inspectable after the fact.

These choices prioritize correctness, explainability, and operational resilience over cosmetic completeness.

---

## Accuracy & Degradation Rules

- Holdings render from saved positions first.
- Market enrichment happens after load.
- Missing market/fundamental fields stay `null`/unavailable.
- No fabricated prices, no synthetic history.
- Advanced tabs degrade locally without clearing holdings state.

This is the core reliability contract for the app.

---

## Risk Engine Principles

Deterministic risk remains the source of truth:
- annualized volatility
- Sharpe
- max drawdown
- VaR (95%)
- drawdown probabilities
- concentration and quality diagnostics

AI is an interpretation layer that can summarize and explain deterministic outputs, but it is not the authority for compliance-grade scoring.

---

## What I Learned (Builder Perspective)

- How to keep UI responsive with two-phase hydration while preserving data correctness.
- How to structure graceful degradation so failures in one subsystem do not collapse the workspace.
- How to design deterministic financial analytics with explicit nullability instead of fake defaults.
- How to build a portfolio-scoped research workflow that connects ideation to execution.
- How to combine a dense workstation UI with maintainable React/TypeScript architecture.

---

## What I Achieved

- Delivered an end-to-end portfolio workspace from landing/auth to analytics and audit.
- Implemented benchmark-relative attribution (portfolio, holding, and sector-level contributions).
- Shipped a deterministic research/watchlist pipeline with promotion into holdings.
- Built a no-mock, provider-backed market data layer with explicit unavailable states.
- Added test coverage for benchmark analytics, market normalization, sector mapping, research sorting, and risk math.

---

## Routes

### App routes
- `/` public landing
- `/app` authenticated workspace
- `/login`, `/signup` auth

### Notable API routes
- `/api/portfolio/*`
- `/api/securities/search`
- `/api/securities/[ticker]/preview`
- `/api/company/[ticker]`
- `/api/risk/*`
- `/api/stress`
- `/api/audit`
- `/api/portfolio/[portfolioId]/research/*`
- `/api/portfolio/[portfolioId]/watchlist/*`

---

## Local Setup

### 1. Install
```bash
npm install
```

### 2. Configure environment
Copy `.env.example` to `.env.local` and fill values.

Required for core app:
- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

Optional/integration:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CRON_SECRET` (for scheduled realtime price refresh route)
- `AI_API_KEY`
- `AI_BASE_URL`
- `AI_MODEL`

Note: `.env.example` still contains legacy provider placeholders (`TWELVE_DATA_API_KEY`, `FMP_API_KEY`) from earlier iterations. The active market adapter is Yahoo-based.

### 3. Prisma
```bash
npm run prisma:generate
npm run prisma:migrate
```

### 4. Run
```bash
npm run dev
```

---

## Scripts

- `npm run dev` - local development server
- `npm run build` - production build
- `npm run start` - run production build
- `npm run test` - node test suite
- `npm run lint` - lint checks
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:migrate` - local migration
- `npm run prisma:deploy` - deploy migrations

---

## Testing

The test suite currently validates:
- benchmark mapping + attribution math
- Yahoo quote/history normalization
- deterministic sector resolution
- research watchlist mapping/sorting + fallback insight shape
- risk math and fallback holdings behavior

Run:
```bash
npm run test
```

---

## Security Notes Before Making Repo Public

- Ensure `.env.local` is never committed.
- Rotate any key that was ever pasted into commits/issues/chats.
- Verify Supabase service role key has least privilege and proper RLS policies are applied.
- Re-check auth redirect and protected route behavior in production.

---

## Project Status

Active build focused on:
- reliable analytics workflows
- clean workstation UX
- correctness-first data behavior

Next expansions could include:
- stronger per-field fundamentals coverage
- broader risk model diagnostics
- richer portfolio-relative research ranking heuristics
