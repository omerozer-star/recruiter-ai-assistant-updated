# Recruiter AI Assistant

A privacy-safe reference implementation of an AI-assisted recruitment workflow, built with Next.js, Prisma and SQLite. A recruiter creates or imports a job opening, the app analyzes it (with the Anthropic API, or a deterministic demo mode when no key is configured), matches the role with relevant communities, drafts a post per channel, and then tracks where the job was published and how many candidates each community produced. The learning loop feeds those results back into future recommendations.

The user interface is in Hebrew (right-to-left). All code, comments and documentation are in English.

This repository is a sanitized template. It contains no database, API keys, personal contact details, communities, invitation links, authenticated browser sessions, branded assets or private recruiting data. A fresh install starts empty.

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Screens](#screens)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Available Commands](#available-commands)
- [Architecture](#architecture)
  - [Project Structure](#project-structure)
  - [Data Model](#data-model)
  - [Matching Algorithm](#matching-algorithm)
  - [AI Integration and Demo Mode](#ai-integration-and-demo-mode)
  - [Publishing Flow](#publishing-flow)
  - [WhatsApp Source Discovery](#whatsapp-source-discovery)
- [API Reference](#api-reference)
- [Security Model](#security-model)
- [Privacy and Data Handling](#privacy-and-data-handling)
- [What Was Intentionally Left Out](#what-was-intentionally-left-out)
- [Known Limitations](#known-limitations)
- [Customizing the Template](#customizing-the-template)
- [Contributing and Security Policy](#contributing-and-security-policy)
- [License](#license)

## How It Works

```text
 1. Create a job            2. Analyze                 3. Match communities
 ─────────────────          ─────────────────          ─────────────────────
 Form, or paste a URL  ──▶  Domain, technologies,  ──▶ Score every community
 and let the app            seniority, keywords,       0–100 against the
 extract the fields         target audiences           analysis (see weights)

 4. Draft posts             5. Approve & publish        6. Record results
 ─────────────────          ─────────────────           ─────────────────────
 One post each for     ──▶  Approve groups, copy   ──▶  Candidates received,
 LinkedIn, Facebook         the post, open the          relevant, hired →
 and WhatsApp               group, confirm              community success score
                                                              │
                                                              └──▶ back into step 3
```

Every step works offline except the optional AI calls. Without an `ANTHROPIC_API_KEY`, analysis, post drafting and URL extraction fall back to deterministic, keyword-based logic so the whole workflow can be evaluated locally.

## Features

- **Job management**: create, import from a URL, view, change status (`draft → approved → published → receiving`), delete.
- **AI-assisted analysis**: structured job profile (domain, technologies, seniority, keywords, target audiences, summary) via the Anthropic API with schema-validated output.
- **Deterministic demo mode**: the same workflow with no external calls when no API key is set.
- **Community matching**: transparent 0–100 scoring with human-readable reasons for every recommendation; pinned and excluded communities; announcement-only groups are skipped.
- **Per-channel post drafting**: LinkedIn, Facebook and WhatsApp versions, editable before publishing; the application link is appended automatically.
- **Discreet jobs**: for confidential roles, the company name and location are stripped before the text ever reaches the model, and only communities tagged for the discreet profile are recommended.
- **Assisted publishing**: copy the post to the clipboard and open the target group; a publication is recorded only after the recruiter confirms.
- **Outcome tracking and learning**: record candidates received, relevant candidates and hires per publication; each community's success score updates and influences future matches.
- **Dashboard**: totals, per-channel breakdown, top communities, recent jobs, and publish status per platform.
- **Local-first**: SQLite database on disk, no accounts, no telemetry.

## Screens

| Route | What you can do there |
| --- | --- |
| `/` | Dashboard: totals, conversion, channel breakdown, top communities, recent jobs. Open any job in the **publish center** (posts → matched groups → approve/publish) without leaving the page. |
| `/jobs` | List of all jobs with status and counts of recommendations, posts and publications. |
| `/jobs/new` | Create a job manually, or paste a link to an existing posting and let the app fetch and extract the fields. Mark a job as **discreet**. |
| `/jobs/[id]` | Job detail: analysis, generated posts, recommended communities with scores and reasons, publication history, status changes. |
| `/communities` | Manage communities (Facebook groups, WhatsApp groups, LinkedIn networks): name, platform, domain, tags, seniority, activity level, member count, notes. |

## Getting Started

Tested with Node.js 22 (any current LTS release should work), npm 10, Next.js 16, Prisma 6 and React 19.

1. Install dependencies exactly as pinned in the lockfile:

   ```bash
   npm ci
   ```

   (`npm install` works too, but `npm ci` guarantees the versions this repository was tested with.)

2. Create a local environment file from the template:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell: `Copy-Item .env.example .env`

3. Create the SQLite database:

   ```bash
   npm run db:push
   ```

   A fresh install is completely empty: no jobs and no communities. Add the communities you are allowed to post in through the `/communities` page before matching jobs.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open <http://localhost:3000>.

To try the AI features, put your own key in `.env` as `ANTHROPIC_API_KEY`. Leave it empty to stay in demo mode; the dashboard shows which mode is active.

## Configuration

All configuration is read from `.env` (never committed; see `.env.example`).

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Prisma connection string. Default: `file:./dev.db` (SQLite in `prisma/`). |
| `ANTHROPIC_API_KEY` | No | Enables AI analysis, post drafting and URL extraction. When empty, the deterministic demo mode is used. |
| `ALLOWED_HOSTS` | No | Extra comma-separated `host:port` values the API will accept in addition to `localhost` / `127.0.0.1`. Leave empty for normal local use. |

The AI model name is a constant (`MODEL`) at the top of `src/lib/claude.ts`.

## Available Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Development server on `127.0.0.1:3000` with hot reload. |
| `npm run build` | Production build, including TypeScript type checking. |
| `npm run start` | Production server on `127.0.0.1:3000` (run `npm run build` first). |
| `npm run db:push` | Apply `prisma/schema.prisma` to the database and regenerate the Prisma client. |

## Architecture

### Project Structure

```text
.env.example                 Safe placeholder environment file
prisma/
  schema.prisma              Database schema (SQLite)
src/
  proxy.ts                   Request guard for /api/*: local-host allow-list + CSRF protection
  app/
    layout.tsx               Root layout (RTL), navigation
    globals.css              Tailwind entry point
    page.tsx                 Dashboard + publish center
    jobs/page.tsx            Job list
    jobs/new/page.tsx        Create / import a job
    jobs/[id]/page.tsx       Job detail
    communities/page.tsx     Community management
    api/                     Route handlers (see API Reference)
  components/
    PublishCenter.tsx        Three-step publish flow used by the dashboard
  lib/
    claude.ts                Anthropic API calls + deterministic demo fallbacks
    matching.ts              Community scoring and recommendation
    publisher.ts             Shared publish core (always returns the manual-publish fallback)
    whatsapp-sources.ts      Optional discovery of WhatsApp groups from approved public sources
    safe-fetch.ts            SSRF-safe fetch for user-supplied URLs
    validation.ts            Input guards and a per-process rate limiter
    db.ts                    Prisma client singleton
    types.ts                 Shared TypeScript types and labels
```

### Data Model

Defined in `prisma/schema.prisma`. All tables live in one SQLite file.

| Model | Purpose | Notable fields |
| --- | --- | --- |
| `Job` | A job opening | `title`, `company`, `sourceUrl` (application link appended to posts), `description`, `requirements`, `advantages`, `location`, `seniority`, `discreet`, `status`, `analysis` (JSON) |
| `Community` | A group or network where jobs can be posted | `platform` (`facebook` / `whatsapp` / `linkedin`), `url`, `domain`, `tags` (JSON array), `seniority`, `activityLevel` (1–5), `memberCount`, `successScore` (0–1), `membership`, `fbProfile` (`main` / `discreet`), `excluded`, `pinned`, `canPost` |
| `Recommendation` | A scored job ↔ community match | `score` (0–100), `reasons` (JSON array), `status` (`pending` / `approved` / `published`), unique per job+community |
| `Post` | A drafted post for one channel | `channel`, `content`, optional `imagePath` (must point inside `public/`) |
| `Publication` | A confirmed publication and its outcome | `channel`, `publishedAt`, `candidatesTotal`, `candidatesRelevant`, `hired`, `notes` |
| `CommunitySource` | A public source of WhatsApp groups (empty by default) | `kind` (`google_sheet` / `html`), `approved`, `userProvided` |

Deleting a job cascades to its recommendations, posts and publications. Deleting a community cascades to its recommendations and detaches its publications.

### Matching Algorithm

`src/lib/matching.ts` computes a deterministic score for every eligible community and explains it. Eligible means not `excluded` and `canPost = true` (announcement-only groups are never recommended). Discreet jobs are matched only against Facebook communities with `fbProfile = "discreet"`; regular jobs only against `fbProfile = "main"`.

| Signal | Points | Notes |
| --- | --- | --- |
| Tag overlap with the job's technologies, keywords and domain | up to 45 | Ratio of matched tags to `min(tags, 6)` |
| Job keyword appears in the community name | up to 12 | 6 points per hit |
| Same domain | 20 | A `General` community gets 8 |
| Data/BI community for a Data job | 25 | Name-based affinity rule |
| Generic hi-tech community | 18 | Name-based affinity rule |
| Past success (`successScore`) | up to 15 | The learning signal |
| Activity level | up to 10 | `activityLevel × 2` |
| Already a member | 5 | Can publish immediately |
| Seniority fit | 7 or 10 | 7 for `all`/`any`, 10 for an exact match |

The total is capped at 100. Communities scoring below 30 are dropped, the top 60 are kept, and pinned communities are always included regardless of score or limit. `POST /api/jobs/[id]/rematch` recomputes recommendations (for example after importing new communities) while keeping already-published rows.

### AI Integration and Demo Mode

`src/lib/claude.ts` wraps three operations. Each one calls the Anthropic Messages API with a Zod schema as the output format, so the response is validated before it is stored; on any error, or when no key is configured, the deterministic fallback runs instead.

| Operation | With API key | Demo fallback |
| --- | --- | --- |
| `analyzeJob` | Structured profile: domain, technologies, seniority, target audiences, keywords, Hebrew summary | Keyword table (Talend, SQL, React, Kubernetes, …) votes for a domain and audiences |
| `generatePosts` | Three channel-specific Hebrew posts with channel-appropriate length and tone | Template-based posts from the title, technologies and company |
| `extractJobFromPage` | Extracts title, company, description, requirements, advantages, location, type, seniority from page text | First line as title, rest as description |

The `source` field (`claude` or `demo`) is stored with every analysis and returned with every post so the UI can show which mode produced it.

**Discreet jobs**: `jobToText()` never includes the company or the location for a discreet job, and the system prompt for post drafting forbids naming or hinting at the employer. The protection is therefore structural (the data is absent), not only instructional.

### Publishing Flow

Publishing is **assisted and manual** in this version:

1. The recruiter approves recommended communities (individually, all at once, or by marking them in the batch panel).
2. Clicking publish calls `/api/publish-auto` (or `/api/publish-batch` for many). `src/lib/publisher.ts` checks the request (community exists, profile rule for discreet jobs, a post exists for that channel, the recommendation is approved, not already published) and then returns a **manual-publish fallback**.
3. The UI copies the post to the clipboard and opens the community URL (or WhatsApp Web).
4. The recruiter posts manually and confirms in the UI, which calls `POST /api/publications`. Only then is a `Publication` recorded and the job moved to `published`.
5. Later, results are entered through `PATCH /api/publications/[id]`, which recomputes the community's `successScore` as `0.8 × (relevant / total) + 0.2 × min(hired, 3) / 3`.

### WhatsApp Source Discovery

`src/lib/whatsapp-sources.ts` can read **public, approved** sources that list WhatsApp groups (a published Google Sheet CSV or an HTML page), score the groups against a job and show a preview of candidates. The list of sources, `WHATSAPP_SOURCES`, is intentionally empty in this template; add only sources you own or are allowed to use. Joining groups automatically is not included (see below), so the preview is informational only.

## API Reference

All routes live under `src/app/api/`. Responses are JSON; error messages are in Hebrew because they are shown directly in the UI.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/dashboard` | Totals, conversion rate, per-channel stats, top communities, recent jobs, active AI mode |
| `GET` | `/api/publish-status` | Published / waiting counts and recent publications per platform |
| `GET` / `POST` | `/api/jobs` | List jobs / create a job (runs analysis and matching; rate-limited) |
| `POST` | `/api/jobs/import` | Fetch a job posting URL safely and extract its fields (rate-limited) |
| `GET` / `PATCH` / `DELETE` | `/api/jobs/[id]` | Job detail with recommendations, posts and publications / change status / delete |
| `POST` | `/api/jobs/[id]/posts` | Generate the three channel posts (rate-limited) |
| `POST` | `/api/jobs/[id]/rematch` | Recompute recommendations |
| `POST` | `/api/jobs/[id]/approve-all` | Approve every pending recommendation |
| `POST` | `/api/jobs/[id]/whatsapp-discover` | `action: "preview"` returns scored WhatsApp group candidates from approved sources; `action: "join"` returns `501` |
| `POST` | `/api/jobs/[id]/discover` | Returns `501` (Facebook group discovery not included) |
| `GET` / `POST` | `/api/communities` | List / create a community (validated: platform, seniority, http(s) URL, field lengths) |
| `GET` / `POST` | `/api/whatsapp-sources` | List sources / approve or disable a source |
| `PATCH` | `/api/recommendations/[id]` | Set status `pending` / `approved` / `published` |
| `PATCH` | `/api/posts/[id]` | Edit a post's text or image path |
| `POST` | `/api/publications` | Record a confirmed manual publication |
| `PATCH` | `/api/publications/[id]` | Record outcomes; updates the community success score |
| `POST` | `/api/publish-auto` | Validate and return the manual-publish fallback (HTTP 502 with `fallback: true`) |
| `POST` / `GET` | `/api/publish-batch` | Same for many communities; `GET ?id=` polls batch progress |
| `POST` | `/api/check-joins` | Returns `501` (not included) |
| `POST` / `GET` | `/api/whatsapp-session` | Returns `501` / "not connected" (not included) |

## Security Model

This is a **single-user tool meant to run on the owner's machine**. It has no accounts or login, so the defenses focus on keeping the local server local and on handling untrusted input safely.

| Risk | Mitigation | Where |
| --- | --- | --- |
| Exposure on the local network | `dev` and `start` bind to `127.0.0.1` only | `package.json` |
| CSRF from a malicious website calling the local API | Write requests must come from the same origin (`Origin` and `Sec-Fetch-Site` checks) | `src/proxy.ts` |
| DNS rebinding (a public hostname pointing at `127.0.0.1`) | API requests whose `Host` is not local (or in `ALLOWED_HOSTS`) are rejected with `403` | `src/proxy.ts` |
| SSRF through "import job from URL" | Only `http(s)`, no credentials in the URL; private, loopback, link-local, multicast and reserved ranges are refused; the check runs inside the DNS lookup so the address validated is the address connected to; redirects are followed manually (max 5) and re-checked; response capped at 2 MB; 15 s timeout | `src/lib/safe-fetch.ts` |
| Dangerous links stored and later opened by the UI (`javascript:` URLs) | Community URLs and job application links must be absolute `http(s)` URLs | `src/lib/validation.ts` |
| Running up API costs through the AI endpoints | Fixed-window rate limit (20 requests/minute per endpoint, per server process) and input length limits | `src/lib/validation.ts` |
| Path traversal via post images | `imagePath` must match `public/<safe path>.<png|jpg|jpeg|webp|gif>` | `src/app/api/posts/[id]/route.ts` |
| SQL injection | Prisma query builder; the few raw queries use bound parameters only | `src/lib/whatsapp-sources.ts` |
| XSS / tab-nabbing | React escaping; no `dangerouslySetInnerHTML`; only `http(s)` values are rendered as links; external links use `rel="noreferrer"` and `window.open` passes `noopener,noreferrer` | UI components |

**Not provided**: authentication, authorization, multi-user isolation, HTTPS. Do not expose the app to a network or deploy it publicly without adding those first. If you must reach it from another host, set `ALLOWED_HOSTS` deliberately and put it behind an authenticating reverse proxy.

Dependency status at the time of publication: `npm audit` reports 3 advisories, all in `deepmerge-ts`, a transitive dependency of the Prisma CLI (a development tool that does not run in the application). The fix requires upgrading to Prisma 7, which changes the API. Re-run `npm audit` after cloning to see the current state.

## Privacy and Data Handling

- **Everything is stored locally** in the SQLite file `prisma/dev.db`, which is git-ignored. It may contain job content, notes and contact names, so treat it as sensitive and never commit or share it.
- **What leaves the machine**: only the job text sent to the Anthropic API when an API key is configured (title, description, requirements, advantages, type, seniority; company and location are omitted for discreet jobs), the page text of a URL you import, and the public sources you explicitly approve for WhatsApp discovery. No telemetry, analytics or other outbound calls exist.
- **Git-ignored on purpose**: `.env*` (except `.env.example`), `*.db`, `.browser/`, `.wwebjs_*`, `public/assets/jobs/*`, build output and caches. The ignore rules for browser sessions are kept even though automation is not included, so a fork that adds it back cannot commit a session by accident.
- Do not hard-code passwords, API keys, personal details or invitation links anywhere in the source.
- Review `git status` and the [publication checklist](PUBLICATION-CHECKLIST.md) before every push.
- Posting to communities may be governed by platform terms, privacy law and anti-spam requirements. Use the tool only where you are authorized to post.

## What Was Intentionally Left Out

The original internal version drove a real browser to post to Facebook groups, send WhatsApp messages, discover and join groups, and check pending join requests. Those utilities depended on authenticated browser sessions and account identities and are **not part of this repository**. The server keeps the corresponding endpoints so the client code stays consistent, but they return `501 Not Implemented` with a clear message, and publishing always falls back to the assisted manual flow described above. Automation dependencies (`whatsapp-web.js`, `playwright`, `qrcode`) were removed from `package.json`.

In the UI, the panels that only make sense with automation (group discovery, join checks, the WhatsApp Chrome connection and batch publishing) are hidden behind the `SHOW_AUTOMATION_CONTROLS` flag in `src/components/PublishCenter.tsx`, so a fresh install shows only features that work.

If you add automation back, keep it behind explicit user confirmation, respect each platform's terms, and keep sessions out of version control.

## Known Limitations

- The rate limiter, batch progress and WhatsApp preview cache are in-memory and per server process; they reset on restart and are not shared between instances.
- SQLite is intended for a single local user; switch the Prisma datasource for anything larger.
- The UI is Hebrew-only; strings are inline in the components.
- The `publish-status` endpoint still returns a legacy `whatsappConnection` object (always "not connected" without automation); the UI no longer displays it.
- No automated tests are included; `npm run build` performs type checking.

## Customizing the Template

1. Add the communities you manage or are authorized to use through the `/communities` page (name, platform, domain, tags, seniority, activity level).
2. Add only authorized sources to `WHATSAPP_SOURCES` in `src/lib/whatsapp-sources.ts`.
3. Set `ANTHROPIC_API_KEY` in `.env`, or leave it empty to use demo mode. Change `MODEL` in `src/lib/claude.ts` if you prefer another model.
4. Adjust the weights in `src/lib/matching.ts` to fit how your communities are tagged.
5. Keep application links, branded images and operational job data in the local database or `public/`, not in the source template.

## Contributing and Security Policy

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and pull-request guidelines, and [SECURITY.md](SECURITY.md) for how to report a vulnerability. Run through [PUBLICATION-CHECKLIST.md](PUBLICATION-CHECKLIST.md) before publishing a fork.

## License

This project is released under the [MIT License](LICENSE). You may use, copy, modify and distribute it, including commercially, as long as the copyright notice and the license text are kept with the code. The software is provided "as is", without warranty of any kind.
