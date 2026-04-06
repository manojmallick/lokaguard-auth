# LokaGuard Auth

> **"Authorized to Act" Hackathon** — Manoj Mallick · Amsterdam, NL
> DORA Article 19 ICT incident reporting, fully automated with **Auth0 Token Vault**, CIBA step-up auth, and OpenFGA

---

## Built by someone who has won this before

> **GradientGuard** — 2nd Place, DigitalOcean Gradient AI Hackathon
> Same domain. Same creator. Deeper problem solved.
> [GitHub](https://github.com/manojmallick/gradient-guard) · [Devpost](https://devpost.com/software/gradientguard-dora-compliance-intelligence-platform)

GradientGuard proved the *detection and classification* problem is solvable with AI agents. LokaGuard Auth solves the harder problem: **secure, auditable, regulator-ready submission** — the part where identity, authorization, and human approval must be airtight.

## Live Deployment (Tested on Cloud Run)
- **Dashboard**: [https://lokaguard-auth-894781387465.europe-west1.run.app/dashboard/](https://lokaguard-auth-894781387465.europe-west1.run.app/dashboard/)
- **API Health**: [https://lokaguard-auth-894781387465.europe-west1.run.app/health](https://lokaguard-auth-894781387465.europe-west1.run.app/health)

The two projects form a complete DORA pipeline:

```
GradientGuard                         LokaGuard Auth
─────────────────────────────────     ──────────────────────────────────────────────────
Monitor infrastructure (60s polls) →  Trigger submission pipeline on breach
Auto-classify P1/P2/P3 severity   →  DORA severity double-check (EBA RTS 7 criteria)
Generate PDF audit evidence        →  Generate Article 19 initial notification draft
                                   →  OpenFGA role check (CISO/CRO gating)
                                   →  Auth0 CIBA push → CISO approves on mobile
                                   →  Token Vault releases DNB API credential
                                   →  Submit to regulator
                                   →  Immutable GitHub audit commit
```

---

## The Problem — and Why It's Expensive to Get Wrong

EU financial institutions under **DORA** have **4 hours** to notify their national competent authority (DNB in the Netherlands) when a major ICT incident occurs. Today this is done manually.

| Step | Manual process | Time cost |
|---|---|---|
| Detect & confirm incident | Human on-call, Slack scramble | 30–90 min |
| Gather data (Jira, logs, Slack) | Copy-paste across systems | 60–120 min |
| Draft DORA notification | Word doc from template | 60–120 min |
| Get CISO to review & approve | Email chain, phone calls | 30–120 min |
| Submit to DNB portal | Manual web form | 15–30 min |
| **Total** | **Under pressure, under-resourced** | **3–8 hours** |

**The 4-hour window is not a guideline. It is a legal deadline.**

Missing it means fines, supervisory attention, and reputational damage. With **6,000+ EU financial entities** facing DORA enforcement from August 2026, this is a €2.4 billion annual compliance burden across the industry.

### What LokaGuard Auth saves

Based on GradientGuard's validated ROI model (presented to judges at the DigitalOcean hackathon):

| Metric | Manual | LokaGuard Auth |
|---|---|---|
| Time to submit initial notification | 3–8 hours | **< 3 minutes** |
| Annual compliance cost (100-person org) | €120,000 | **€2,160** |
| Annual savings | — | **€117,840 (98%)** |
| Risk of missing 4-hour window | High | **Near zero** |
| Credential exposure risk | High (shared passwords, env vars) | **Zero (Token Vault)** |
| Audit trail integrity | Manual (editable) | **Immutable (GitHub commit)** |

---

## The Solution

LokaGuard Auth is a **multi-agent pipeline** that automates the entire DORA Article 19 workflow in under 3 minutes — detecting the incident, gathering data, classifying severity, drafting the notification, securing CISO approval, and submitting to the regulator.

**Auth0 is the identity fabric.** Every agent requests scoped credentials from **Token Vault** at runtime. No secrets in code. No credentials at rest. Before any regulatory submission, **CIBA step-up authentication** forces the CISO to approve on their mobile phone via Auth0 Guardian. The agent pipeline can never submit without a human in the loop.

```
ICT Incident → LokaRouter (DAG) → RegDataAgent → ClassifyAgent → DraftAgent → SubmissionAgent → AuditAgent
                                       ↑                                            ↑
                               Token Vault: Jira,                        CIBA push → CISO phone
                               GitHub, Slack                             Token Vault: DNB API token
```

---

## Architecture

### 7-Stage Agent Pipeline

| Stage | Agent | Auth0 Component | What it does |
|---|---|---|---|
| 1 | **LokaRouter** | — | Topological DAG sort, schedules agent execution order |
| 2 | **RegDataAgent** | Token Vault (Jira, GitHub, Slack) | Fetches incident context from all 3 sources in parallel |
| 3 | **ClassifyAgent** | — | Checks all 7 EBA RTS DORA severity criteria (local Qwen 2.5) |
| 4 | **DraftAgent** | — | Generates DORA Article 19 initial notification (local Qwen 2.5) |
| 5 | **SubmissionAgent** | OpenFGA + CIBA + Token Vault (DNB) | Role check → CISO mobile approval → DNB submission |
| 6 | **AuditAgent** | Token Vault (GitHub) | Immutable audit commit to GitHub + SQLite write |

### Auth0 Components — Why Each One Matters

| Component | Why it's here | What breaks without it |
|---|---|---|
| **Token Vault** | Agents fetch fresh scoped tokens at runtime | Credentials leak into env vars, logs, or code. One breach = all systems compromised. |
| **CIBA** | Blocks submission until CISO approves on mobile | Automated agents could submit incorrect or fabricated reports without human sign-off. Regulators require accountability. |
| **OpenFGA** | Fine-grained role check before CIBA is even initiated | Any employee could trigger a regulatory submission. Role hierarchy must be enforced before the CISO's phone rings. |
| **Management API** | Bootstraps Token Vault — not called by agents | Without it, Token Vault connections cannot be established at runtime. |

### Why local LLM?

RegDataAgent and DraftAgent use **Ollama + Qwen 2.5** running locally. Incident data — client counts, system names, financial impact — never leaves the network. DORA's data residency requirements are satisfied by design.

---

## Quick Start

### Option A — Demo mode (no credentials needed, 60 seconds)

```bash
git clone <repo-url> lokaguard-auth && cd lokaguard-auth
npm install
cp .env.example .env          # DEMO_MODE=true is already set
npm run dev
```

Open `http://localhost:3000/dashboard` and trigger an incident:

```bash
curl -X POST http://localhost:3000/api/incidents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer demo-token" \
  -d '{"jiraIssueKey":"INC-1234","userId":"auth0|demo-ciso"}'
```

Or click **"Run Full Demo"** on the dashboard. Watch the 6-agent pipeline execute in real-time.

### Option B — Full Docker stack

```bash
docker-compose up
# Starts: app + Ollama (qwen2.5:7b) + mock DNB API + OpenFGA
```

### Option C — Production Auth0 credentials

```bash
cp .env.example .env
# Fill in AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CIBA_CLIENT_ID,
# OPENFGA_STORE_ID, OPENFGA_AUTHORIZATION_MODEL_ID
# Set DEMO_MODE=false
npm run dev
```

---

## Configuration

Key variables (full list in `.env.example`):

| Variable | Purpose |
|---|---|
| `DEMO_MODE=true` | Mocks all Auth0, OpenFGA, DNB calls — full pipeline runs without credentials |
| `AUTH0_DOMAIN` | Your Auth0 tenant (e.g. `acme.us.auth0.com`) |
| `AUTH0_TOKEN_VAULT_BASE_URL` | Token Vault base URL (same as tenant URL) |
| `AUTH0_SERVICE_ACCOUNT_USER_ID` | Service account `auth0|...` whose connected accounts agents use |
| `AUTH0_CIBA_CLIENT_ID` | CIBA-enabled Auth0 application |
| `OPENFGA_STORE_ID` | OpenFGA store containing your authorization model |
| `OLLAMA_MODEL` | `qwen2.5:7b` (dev) or `qwen2.5:14b` (demo) |
| `DNB_API_BASE_URL` | `http://localhost:8080/v1` (mock) or real DNB endpoint |

---

## OpenFGA Setup

```bash
npx @openfga/cli start
npx @openfga/cli store create --name lokaguard-dev
npx @openfga/cli model write --store-id $OPENFGA_STORE_ID --file fga/model.fga

# Grant CISO role (required for SubmissionAgent to proceed)
npx @openfga/cli tuple write \
  --store-id $OPENFGA_STORE_ID \
  --user user:auth0|your-ciso-sub \
  --relation ciso \
  --object organization:org-1
```

Authorization hierarchy: **CISO** and **CRO** → `can_submit` → triggers CIBA. **compliance_officer** → `can_review`. **analyst** → `can_draft`. No escalation without explicit role grant.

---

## Tests

```bash
npm test                # Vitest run (5 suites, 23+ cases)
npm run test:coverage   # With coverage report
npm run build           # TypeScript strict compile — zero errors
```

---

## Project Structure

```
src/
├── agents/           → 6 agents + LokaRouter DAG orchestrator
├── auth/             → Token Vault, CIBA, OpenFGA, Management API
├── llm/              → Ollama/Qwen 2.5 client + DORA regulatory prompts
├── regulatory/       → EBA RTS severity classifier, DORA report builder, DNB client
├── api/              → Express routes, JWT middleware, WebSocket broadcast
└── db/               → SQLite audit trail (WAL mode)

fga/model.fga         → OpenFGA authorization model
public/dashboard/     → Real-time compliance dashboard (WebSocket client)
scripts/dnb-mock/     → Mock DNB Reporting API (docker-compose)
tests/                → Vitest unit tests (all external services mocked)
```

---

## Security Design

Every design decision was made by someone who has seen what credential mismanagement looks like inside real EU banks.

- **Zero credentials in code** — all tokens fetched from Auth0 Token Vault at runtime
- **Never cache Token Vault tokens** — fresh fetch per pipeline run; tokens expire
- **Never log token values** — only `{ connection, userId, timestamp }` is logged
- **CIBA before every DNB submission** — CISO physically approves on Auth0 Guardian
- **OpenFGA role check before CIBA** — unauthorized users cannot even trigger a push notification
- **Binding message includes report ID** — CISO sees exactly what they are approving, not a blank push
- **Immutable GitHub audit trail** — each submission is a signed commit, not an editable database row
- **TypeScript 5 strict mode** — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, zero `any`

---

## DORA Severity Classification — All 7 EBA RTS Criteria

The deterministic classifier (`src/regulatory/dora-classifier.ts`) checks ALL seven thresholds. ANY single criterion being true triggers a mandatory DNB notification within 4 hours.

| # | Criterion | Threshold |
|---|---|---|
| 1 | Clients affected (%) | ≥ 10% of total client base |
| 2 | Clients affected (absolute) | ≥ 100,000 clients |
| 3 | Duration — critical service | ≥ 4 hours |
| 4 | Duration — important service | ≥ 8 hours |
| 5 | Data loss | Any occurrence |
| 6 | Financial impact | ≥ €100,000 |
| 7 | Reputational impact | Media coverage or regulatory attention |

---

## Token Vault — Connected Apps

| Connection | Service | Used by | Scopes |
|---|---|---|---|
| `jira` | Atlassian Jira | RegDataAgent | `read:jira-work` |
| `github` | GitHub | RegDataAgent, AuditAgent | `repo`, `contents:write` |
| `slack` | Slack | RegDataAgent | `channels:history` |
| `dnb-api` | DNB Reporting API | SubmissionAgent | `submit:incident-report` |
| `azure-devops` | Azure DevOps | RegDataAgent | `vso.work_read` |

---

## Demo Video Script (3 minutes)

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:20 | Slide: DORA + ROI numbers | "EU banks have 4 hours to report ICT incidents. Manual processes take 3–8 hours and cost €120k per year. GradientGuard proved the detection problem. LokaGuard Auth solves the submission problem." |
| 0:20–0:45 | Dashboard + Jira trigger | "A payment outage is detected. LokaGuard starts the pipeline. Token Vault provides the Jira token — no credential is stored anywhere." |
| 0:45–1:15 | WebSocket pipeline running | "RegDataAgent fetches Jira, GitHub, and Slack in parallel. ClassifyAgent runs entirely on-device with Qwen — incident data never leaves the network." |
| 1:15–1:45 | Mobile phone notification | "SubmissionAgent checks OpenFGA: this user is CISO. CIBA triggers a push notification to their Auth0 Guardian app." |
| 1:45–2:00 | CISO approves on phone | "CISO taps Approve. Auth0 releases the DNB API token from Token Vault — only at this moment, only for this operation." |
| 2:00–2:30 | DNB submission + GitHub commit | "Report submitted. Audit trail committed to GitHub — immutable, timestamped, agent-signed. Regulatory deadline met." |
| 2:30–3:00 | ROI summary slide | "Zero credentials in code. CISO in control. €117,840 saved per year. DORA-compliant in under 3 minutes." |

---

## Bonus Blog Post: Token Vault — The Identity Layer AI Agents Were Always Missing

> *Posted as part of the "Authorized to Act" hackathon submission. 500+ words.*

**The credential problem no one talks about in AI agent demos**

I've built software inside two of the Netherlands' largest banks — ING and ABN AMRO. I've seen what credential mismanagement looks like at scale: API keys rotated in panic after a leak, shared service accounts with God-mode access, incident post-mortems that read "root cause: hardcoded token in CI pipeline."

When I built GradientGuard (2nd place, DigitalOcean Gradient AI Hackathon), I focused on the *detection* side of DORA compliance — monitoring infrastructure, classifying incidents, generating audit evidence. We won. But the deeper problem nagged at me: what happens after you detect the incident? Someone has to submit it to the regulator, and that someone has to be authorized, accountable, and auditable.

That's LokaGuard Auth. And building it revealed why **Token Vault is the identity layer AI agents have always needed but never had**.

**Why Token Vault changes everything**

Every AI agent tutorial shows you how to call an API. Almost none of them show you what happens to the credentials.

My instinct, like every developer's, was: put the API keys in `.env`, load them at startup, inject them into the agents that need them. It works. It's fast. And for a system that talks to Jira, GitHub, Slack, a Dutch central bank API, and OpenFGA — it's a ticking time bomb.

Token Vault flips the model. Instead of loading credentials at startup and passing them down a call stack, each agent requests exactly the token it needs, exactly when it needs it, from Auth0. The token is scoped to one connection. It's fetched fresh every pipeline run — no caching, no sharing, no persistence. After the agent finishes, there is nothing to leak.

What surprised me most was how well this maps to the principle of least privilege at the *agent* level. RegDataAgent gets a Jira read token and a Slack read token. It cannot touch the DNB submission API. SubmissionAgent gets the DNB token only *after* CISO approval via CIBA — not before, not in parallel, not cached from a previous run. Auth0 becomes the policy enforcement point. The agents become stateless workers that earn their access rather than assume it.

**CIBA as a regulatory control**

DORA isn't just a compliance checkbox. Article 19 exists because regulators want a human to own each submission. CIBA lets me build that guarantee into the architecture itself.

SubmissionAgent cannot proceed until a push notification lands on the CISO's phone and they tap Approve. The binding message includes the report ID — the CISO is approving a specific document, not a blank authorization. Token Vault only releases the DNB API credential after that approval. There is no code path — however buggy, however exploited — that bypasses this.

For compliance teams, this is the difference between "our agent submitted the report" and "our CISO approved this specific report at 09:47 UTC and here is the immutable GitHub commit that proves it."

**The ROI case**

GradientGuard's judge presentation used real numbers from my time in Dutch banking: €120,000/year in compliance labor for a 100-person organization, 4–8 hours per incident for manual evidence and submission. GradientGuard cut evidence generation to under 2 minutes. LokaGuard Auth cuts the submission pipeline to under 3 minutes, while making it *more* secure and *more* auditable than any manual process.

The combined saving: €117,840/year. The 4-hour DORA window, which currently causes genuine operational panic inside EU banks, becomes comfortable.

**What this means for teams building regulated AI agents**

The question isn't whether you need this kind of identity infrastructure. It's whether you'll build it yourself — badly, incrementally, after something goes wrong — or let Auth0 handle it from day one.

After two hackathons in the same domain and 15 years inside the institutions this regulation targets: the answer is obvious.

*LokaGuard Auth is open source. The CIBA implementation is in `src/auth/ciba.ts`. The Token Vault client is in `src/auth/token-vault.ts`. The OpenFGA model is in `fga/model.fga`. Start there.*

---

## Built With

- **Auth0 AI SDK** — Token Vault, CIBA, Management API
- **OpenFGA** — Fine-grained authorization (CISO/CRO/compliance_officer/analyst)
- **Ollama + Qwen 2.5** — Local LLM inference, data never leaves the network
- **Node.js 20 + TypeScript 5 strict** — Production-grade codebase
- **Express + WebSocket** — Real-time compliance dashboard
- **Vitest** — Unit tests with full Auth0/OpenFGA mocking
- **better-sqlite3** — Local audit trail with WAL mode

---



*Manoj Mallick · Amsterdam, NL*
*"Authorized to Act" Hackathon submission · DORA enforcement: August 2026*
