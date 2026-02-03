# Olera Database Strategy Report
## Neon vs Supabase: Technical Analysis & Recommendation

**Date:** February 3, 2026
**Prepared by:** TJ (with Claude Code)
**Status:** Draft for Team Discussion

---

## Executive Summary

This report evaluates database platform options for the Olera web application, with consideration for our existing iOS app infrastructure. After thorough analysis, we recommend **building the web app with a web-optimized stack (Neon + Clerk + Drizzle)** and migrating iOS to a shared API layer over time.

**Key Finding:** Our current iOS-first architecture (direct Supabase SDK access) is technical debt, not an asset to protect. A proper API layer will serve us better as we scale to web, Android, and beyond.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Platform Comparison](#2-platform-comparison)
3. [Architecture Options](#3-architecture-options)
4. [Decision Matrix](#4-decision-matrix)
5. [Recommendation](#5-recommendation)
6. [Implementation Roadmap](#6-implementation-roadmap)
7. [Open Questions & Risks](#7-open-questions--risks)
8. [Appendix: Research Sources](#8-appendix-research-sources)

---

## 1. Current State Assessment

### 1.1 iOS App (Existing)

| Component | Current State |
|-----------|---------------|
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Architecture | Direct SDK access (client → database) |

**Data Model:**
- Providers (large table, tens of thousands)
- Careseekers
- Accounts/Auth
- Saved providers
- Matches
- Requests/Leads
- Messaging/Inbox
- Photos/Media
- Reviews
- Admin workflows

### 1.2 Web App (New)

| Component | Current State |
|-----------|---------------|
| Framework | Next.js 16 + React 19 |
| Database | Supabase packages installed, **not configured** |
| Auth | Not implemented |
| Storage | Not implemented |
| Data | Hardcoded dummy data only |

**Key Finding:** The web app is a UI shell with no backend integration. This is the optimal time to make architectural decisions before any integration work begins.

### 1.3 Team Context

- Small team (3 people: TJ, Logan, Esther)
- AI-assisted development workflow
- Web is the near-term priority
- Both platforms should share the same backend long-term
- Open to iOS changes if justified

---

## 2. Platform Comparison

### 2.1 Supabase Overview

**What it is:** Backend-as-a-Service (BaaS) built on Postgres

**Included Features:**
- PostgreSQL database
- Authentication (email, OAuth, magic links)
- File storage
- Real-time subscriptions
- Edge functions
- Auto-generated REST API

**Pricing (2026):**
| Plan | Cost | Includes |
|------|------|----------|
| Free | $0/mo | 500MB DB, 50K MAUs, 1GB storage |
| Pro | $25/mo | 8GB DB, 100K MAUs, 100GB storage |
| Team | $599/mo | Pro + SOC2, daily backups |
| Enterprise | Custom | HIPAA, dedicated support |

**Strengths:**
- All-in-one solution
- iOS SDK already integrated
- Good documentation
- Active community

**Weaknesses:**
- No database branching
- Always-on compute (can't scale to zero)
- Client-side SDK exposes database structure
- Medium vendor lock-in

### 2.2 Neon Overview

**What it is:** Serverless Postgres (database only)

**Key Features:**
- PostgreSQL database
- Instant database branching (like Git)
- Scale to zero
- Vercel native integration

**Pricing (2026):**
| Plan | Cost | Includes |
|------|------|----------|
| Free | $0/mo | 0.5GB storage, 100 CU-hours |
| Launch | $5/mo minimum | Usage-based, $0.14/CU-hour |
| Scale | Usage-based | $0.26/CU-hour, SOC2, HIPAA |

**Strengths:**
- Database branching (each PR gets isolated DB)
- Scale to zero (cost efficient)
- Vercel integration (seamless with Next.js)
- Low vendor lock-in (standard Postgres)
- Optimized for AI-assisted development

**Weaknesses:**
- Database only (need separate auth, storage)
- No iOS SDK (requires API layer)
- Smaller community

### 2.3 Feature Comparison Matrix

| Feature | Supabase | Neon |
|---------|----------|------|
| PostgreSQL | ✅ | ✅ |
| Database Branching | ❌ Basic | ✅ Instant (Git-like) |
| Scale to Zero | ❌ | ✅ |
| Auth Included | ✅ | ❌ (use Clerk) |
| Storage Included | ✅ | ❌ (use R2/S3) |
| Real-time | ✅ | ❌ (use Pusher/Socket.io) |
| iOS SDK | ✅ | ❌ |
| Vercel Integration | Good | Excellent |
| Vendor Lock-in | Medium | Low |

### 2.4 Other Options Considered

| Platform | Type | Verdict |
|----------|------|---------|
| **Xata** | Postgres + Search | Interesting for search-heavy apps, smaller community |
| **Turso** | SQLite at edge | Not Postgres, breaks iOS compatibility |
| **Convex** | Real-time BaaS | Too different, bigger paradigm shift |
| **Railway/Render** | Managed Postgres | Fine but no DX benefits |
| **Vercel Postgres** | Neon white-label | Just use Neon directly |

---

## 3. Architecture Options

### 3.1 Option A: Supabase for Both (Status Quo)

```
iOS App ────► Supabase SDK ────┐
                               ├──► Supabase
Web App ────► Supabase SDK ────┘
```

**Pros:**
- Simplest path
- iOS already works
- Single system to manage

**Cons:**
- Not optimized for web
- Client-side queries expose DB structure
- No database branching
- Locks both platforms to Supabase

### 3.2 Option B: Neon for Web + API Layer (Recommended)

```
iOS App ────┐
            ├──► Next.js API ──► Neon (Postgres)
Web App ────┘         │
                      ├──► Clerk (Auth)
                      └──► R2 (Storage)
```

**Pros:**
- Optimal web stack
- Database branching for CI/CD
- Scale to zero
- Platform-agnostic architecture
- Easy to add Android later

**Cons:**
- Requires iOS migration
- Multiple services to manage
- More initial setup

### 3.3 Option C: Supabase as Server-Side Postgres

```
iOS App ──► Supabase SDK ──┐
                           ├──► Same Supabase Postgres
Web App ──► Drizzle/Prisma─┘    (different access patterns)
```

**Pros:**
- Single database
- Web uses server-side queries
- iOS unchanged

**Cons:**
- No database branching
- Web still constrained by Supabase
- Auth/storage still Supabase

### 3.4 How Industry Leaders Handle This

**Airbnb, Yelp, Thumbtack Architecture:**

```
┌─────────┐ ┌─────────┐ ┌─────────┐
│   iOS   │ │ Android │ │   Web   │
└────┬────┘ └────┬────┘ └────┬────┘
     └───────────┼───────────┘
                 │
                 ▼
        ┌────────────────┐
        │   API Layer    │
        └────────┬───────┘
                 │
    ┌────────────┼────────────┐
    ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌─────────┐
│ Search │  │ Primary│  │ Cache   │
│(Elastic)│ │  DB    │  │ (Redis) │
└────────┘  └────────┘  └─────────┘
```

**Key Insight:** Major marketplaces use a single API layer. Clients never talk directly to databases. This provides flexibility to change backends without affecting clients.

---

## 4. Decision Matrix

### 4.1 Weighted Scoring

| Factor | Weight | Option A (Supabase Both) | Option B (Neon + API) | Option C (Supabase Server) |
|--------|--------|--------------------------|----------------------|---------------------------|
| Web Developer Experience | 25% | 6 | 10 | 8 |
| iOS Migration Effort | 15% | 10 | 5 | 9 |
| SEO/Performance | 20% | 7 | 9 | 8 |
| Cost Efficiency | 15% | 6 | 9 | 7 |
| Database Branching | 10% | 3 | 10 | 3 |
| Long-term Flexibility | 15% | 5 | 9 | 6 |
| **Weighted Score** | 100% | **6.3** | **8.6** | **7.2** |

### 4.2 Scoring Rationale

**Web Developer Experience (25%):**
- Supabase client SDK is designed for client-side, not ideal for Next.js server components
- Neon + Drizzle provides type-safe, server-side queries
- Database branching dramatically improves development workflow

**iOS Migration Effort (15%):**
- Option A requires no iOS changes
- Option B requires replacing Supabase SDK calls with API calls (moderate effort)
- Option C requires minimal iOS changes

**SEO/Performance (20%):**
- Server-side rendering is critical for marketplace SEO
- Neon's Vercel integration optimizes for edge rendering
- Supabase client-side approach is less optimal for SEO

**Cost Efficiency (15%):**
- Neon scales to zero; Supabase doesn't
- Development environments essentially free with Neon
- Supabase Pro is $25/mo minimum regardless of usage

**Database Branching (10%):**
- Neon's instant branching is a game-changer for CI/CD
- Each PR can have its own database
- Supabase branching is basic/limited

**Long-term Flexibility (15%):**
- API layer allows swapping any component
- Direct SDK access creates tight coupling
- Neon is standard Postgres (easy to migrate away)

---

## 5. Recommendation

### 5.1 Primary Recommendation

**Build web with Neon + Clerk + Drizzle. Build an API layer. Migrate iOS to the API over time.**

### 5.2 Recommended Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | Next.js 16 (App Router) | Already using, best for SEO |
| Database | Neon | Branching, scale-to-zero, Vercel integration |
| ORM | Drizzle | Type-safe, lightweight, great DX |
| Auth | Clerk | Best-in-class Next.js integration |
| Storage | Cloudflare R2 | Cheap, S3-compatible |
| Search | Algolia (later) | Fast provider search |
| Hosting | Vercel | Native Next.js support |

### 5.3 Why Not Stay with Supabase?

1. **Web is the priority** — Optimize for web, not iOS compatibility
2. **Client-side SDK is wrong pattern** — Exposes database structure
3. **No branching** — Hurts development velocity
4. **Sunk cost fallacy** — iOS integration is debt, not asset
5. **API layer is correct architecture** — Industry standard for multi-platform

### 5.4 Cost Comparison

| Component | Supabase Stack | Recommended Stack |
|-----------|---------------|-------------------|
| Database | $25/mo (Pro) | $5-15/mo (Neon) |
| Auth | Included | Free-$25/mo (Clerk) |
| Storage | Included | ~$5/mo (R2) |
| **Total** | **$25-50/mo** | **$10-45/mo** |

Note: Recommended stack is cheaper at low usage, comparable at high usage, with better DX.

---

## 6. Implementation Roadmap

### Phase 1: Web Foundation (Weeks 1-2)

- [ ] Set up Neon project and database
- [ ] Configure Drizzle ORM with schema
- [ ] Set up Clerk authentication
- [ ] Create basic API routes
- [ ] Connect homepage to real data

**iOS Impact:** None (continues using Supabase)

### Phase 2: Web MVP (Weeks 3-4)

- [ ] Provider search and listing pages
- [ ] Provider detail pages
- [ ] User authentication flow
- [ ] Basic care seeker dashboard

**iOS Impact:** None

### Phase 3: API Layer (Weeks 5-6)

- [ ] Design API contract for iOS
- [ ] Build API routes for iOS needs
- [ ] Document API endpoints
- [ ] Set up API authentication

**iOS Impact:** API ready for iOS to consume

### Phase 4: iOS Migration (Weeks 7-8)

- [ ] Update iOS networking layer
- [ ] Replace Supabase SDK calls with API calls
- [ ] Test iOS against new API
- [ ] Deprecate direct Supabase access

**iOS Impact:** Full migration complete

### Phase 5: Data Migration (Week 9)

- [ ] Export data from Supabase Postgres
- [ ] Import to Neon
- [ ] Validate data integrity
- [ ] Switch production traffic

### Phase 6: Cleanup (Week 10)

- [ ] Archive Supabase project
- [ ] Update documentation
- [ ] Team training on new stack

---

## 7. Open Questions & Risks

### 7.1 Open Questions (Need Team Input)

| Question | Options | Impact |
|----------|---------|--------|
| **How much iOS disruption is acceptable?** | Minimal / Moderate / Significant | Affects migration approach |
| **Timeline pressure for web launch?** | Aggressive / Normal / Flexible | May affect whether we do API layer first |
| **Real-time messaging priority?** | High / Medium / Low | Affects whether we need Supabase real-time |
| **Budget constraints?** | Tight / Normal / Flexible | Both options are similar cost |

### 7.2 Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| iOS migration takes longer than expected | Medium | Medium | Keep Supabase running during transition |
| Clerk doesn't meet auth needs | Low | High | Clerk is mature; can fall back to Auth.js |
| Neon has reliability issues | Low | High | Neon backed by Databricks; has SLA on Scale plan |
| Team learning curve on new stack | Medium | Low | Good documentation; AI-assisted development helps |
| Data migration causes issues | Low | High | Run parallel systems during migration |

### 7.3 Ambiguous Judgment Calls

These decisions could go either way and warrant team discussion:

1. **Drizzle vs Prisma for ORM**
   - Drizzle: Lighter, SQL-like, faster
   - Prisma: More mature, better docs, larger community
   - *Leaning: Drizzle for performance, but either works*

2. **Clerk vs Auth.js for authentication**
   - Clerk: Better DX, managed service, costs at scale
   - Auth.js: Free, self-hosted, more setup
   - *Leaning: Clerk for velocity, evaluate Auth.js if cost becomes issue*

3. **Immediate API layer vs gradual migration**
   - Immediate: Build API first, both platforms use it
   - Gradual: Web uses Neon directly, iOS stays on Supabase, migrate later
   - *Leaning: Gradual (ship web faster, migrate iOS after)*

4. **Keep Supabase for real-time messaging?**
   - Could use Supabase just for real-time features
   - Or use Pusher/Ably/Socket.io separately
   - *Leaning: Evaluate when we build messaging*

### 7.4 Future Decision Points

| Milestone | Decision Needed |
|-----------|-----------------|
| Web MVP launch | Confirm Neon performance meets needs |
| 10K MAUs | Evaluate Clerk costs vs Auth.js migration |
| Android development | Confirm API layer supports Android needs |
| Messaging feature | Choose real-time solution |
| 100K providers | Evaluate dedicated search (Algolia/Typesense) |

---

## 8. Appendix: Research Sources

### 8.1 Platform Documentation
- [Neon Documentation](https://neon.tech/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Clerk Documentation](https://clerk.com/docs)

### 8.2 Comparison Articles
- [Neon vs Supabase - DevTools Academy](https://www.devtoolsacademy.com/blog/neon-vs-supabase/)
- [Neon vs Supabase - Bytebase](https://www.bytebase.com/blog/neon-vs-supabase/)
- [Supabase vs Neon - Leanware](https://www.leanware.co/insights/supabase-vs-neon)

### 8.3 Pricing References
- [Neon Pricing](https://neon.com/pricing)
- [Supabase Pricing](https://supabase.com/pricing)
- [Neon Pricing 2026 Analysis](https://vela.simplyblock.io/articles/neon-serverless-postgres-pricing-2026/)
- [Supabase Pricing Breakdown](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance)

### 8.4 Architecture References
- Airbnb Engineering Blog
- Yelp Engineering Blog

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-02-03 | TJ + Claude | Initial draft |

---

**Next Steps:**
1. Team review and discussion
2. Address open questions
3. Final decision
4. Begin implementation

---

*This document was prepared with assistance from Claude Code. All technical analysis and recommendations should be validated by the team before implementation.*
