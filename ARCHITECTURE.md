# LokaGuard Auth — Architecture

> DORA Article 19 automated ICT incident reporting pipeline.
> Identity layer: Auth0 Token Vault · CIBA · OpenFGA

---

## 1. System Overview

```mermaid
flowchart TB
    subgraph TRIGGER["Incident Sources"]
        JIRA[Jira Webhook]
        GH[GitHub Alert]
        PD[PagerDuty]
    end

    subgraph API["Express API :3000"]
        EP["POST /api/incidents"]
        WS["WebSocket\nReal-time status"]
        HEALTH["GET /health"]
    end

    subgraph PIPELINE["LokaRouter — Topological DAG"]
        direction TB
        RDA["📥 RegDataAgent\nJira + GitHub + Slack"]
        CA["🔍 ClassifyAgent\nEBA RTS 7 criteria"]
        DA["📝 DraftAgent\nDORA Art. 19 draft"]
        SA["🔐 SubmissionAgent\nOpenFGA → CIBA → DNB"]
        AA["📋 AuditAgent\nGitHub commit + SQLite"]

        RDA --> CA --> DA --> SA --> AA
    end

    subgraph AUTH0["Auth0 — Identity Fabric"]
        TV["Token Vault\n5 connected apps"]
        CIBA_SVC["CIBA\nMobile step-up"]
        FGA["OpenFGA\nRole-based gates"]
        MGMT["Management API\nBootstrap"]
    end

    subgraph EXTERNAL["External Services"]
        JIRA_API["Atlassian Jira"]
        GH_API["GitHub"]
        SLACK_API["Slack"]
        DNB_API["DNB Reporting API\n(regulator)"]
        CISO_PHONE["📱 CISO Phone\nAuth0 Guardian"]
    end

    subgraph STORAGE["Local Storage"]
        SQLITE[("SQLite\nAudit trail")]
        OLLAMA["Ollama\nQwen 2.5 (local LLM)"]
    end

    TRIGGER --> EP
    EP --> PIPELINE
    PIPELINE <-->|status events| WS

    RDA -->|"getTokenVaultToken(jira)"| TV
    RDA -->|"getTokenVaultToken(github)"| TV
    RDA -->|"getTokenVaultToken(slack)"| TV
    TV --> JIRA_API & GH_API & SLACK_API

    CA --> OLLAMA
    DA --> OLLAMA

    SA -->|"checkPermission()"| FGA
    SA -->|"initiateCIBA()"| CIBA_SVC
    CIBA_SVC -->|"Push notification"| CISO_PHONE
    CISO_PHONE -->|"Approve"| CIBA_SVC
    SA -->|"getTokenVaultToken(dnb-api)"| TV
    TV --> DNB_API

    AA -->|"getTokenVaultToken(github)"| TV
    TV --> GH_API
    AA --> SQLITE

    style AUTH0 fill:#1a0a2e,stroke:#7c3aed,color:#e2e8f0
    style PIPELINE fill:#0a1628,stroke:#4f8ef7,color:#e2e8f0
    style EXTERNAL fill:#0a1a0a,stroke:#10b981,color:#e2e8f0
    style TRIGGER fill:#1a0a0a,stroke:#ef4444,color:#e2e8f0
    style STORAGE fill:#1a1a0a,stroke:#f59e0b,color:#e2e8f0
```

---

## 2. Agent DAG — Dependency Graph

```mermaid
flowchart LR
    subgraph DAG["LokaRouter — Kahn's Topological Sort"]
        direction LR

        START(["⚡ Incident\nTriggered"]) --> RDA

        RDA["📥 RegDataAgent
        ─────────────
        Token Vault: Jira
        Token Vault: GitHub
        Token Vault: Slack
        ─────────────
        Parallel fetch
        Promise.allSettled"]

        CA["🔍 ClassifyAgent
        ─────────────
        Ollama / Qwen 2.5
        7 EBA RTS criteria
        deterministic check
        ─────────────
        Needs: incident data"]

        DA["📝 DraftAgent
        ─────────────
        Ollama / Qwen 2.5
        DORA Art. 19 format
        max 500 char description
        ─────────────
        Needs: severity = major"]

        SA["🔐 SubmissionAgent
        ─────────────
        1. OpenFGA role check
        2. CIBA → CISO phone
        3. Token Vault: DNB
        4. POST to DNB API
        ─────────────
        Needs: CISO approval"]

        AA["📋 AuditAgent
        ─────────────
        Token Vault: GitHub
        Immutable commit
        SQLite write
        ─────────────
        Non-fatal on failure"]

        END(["✅ Pipeline\nComplete"])

        RDA -->|"success: incident data"| CA
        CA -->|"severity = major"| DA
        DA -->|"report draft ready"| SA
        SA -->|"dnbReferenceId"| AA
        AA --> END

        RDA -. "failed" .-> SKIP1(["⏭ skip remaining"])
        CA -. "severity = minor" .-> SKIP2(["⏭ no submission needed"])
    end

    style DAG fill:#0a1628,stroke:#4f8ef7,color:#e2e8f0
    style RDA fill:#0d1f3c,stroke:#38bdf8,color:#e2e8f0
    style CA fill:#1a0d3c,stroke:#a78bfa,color:#e2e8f0
    style DA fill:#1f0d0a,stroke:#fb923c,color:#e2e8f0
    style SA fill:#1f0a1a,stroke:#f472b6,color:#e2e8f0
    style AA fill:#0a1f0a,stroke:#34d399,color:#e2e8f0
```

---

## 3. Auth0 Token Vault Flow

Every external API call follows this pattern. **No token is ever stored, cached, or logged.**

```mermaid
sequenceDiagram
    participant Agent
    participant TokenVault as Auth0 Token Vault
    participant MgmtAPI as Auth0 Management API
    participant ExternalAPI as External API<br/>(Jira / GitHub / Slack / DNB)

    Note over Agent,ExternalAPI: Fresh token fetched per pipeline run, per connection

    Agent->>MgmtAPI: Client credentials grant<br/>(AUTH0_CLIENT_ID + SECRET)
    MgmtAPI-->>Agent: Management API token (cached internally)

    Agent->>TokenVault: GET /api/v1/users/{userId}/connected-accounts/{connection}/token<br/>Authorization: Bearer {mgmt_token}
    TokenVault-->>Agent: { access_token: "..." }

    Note over Agent: Token used immediately — never stored

    Agent->>ExternalAPI: API request<br/>Authorization: Bearer {access_token}
    ExternalAPI-->>Agent: Response data

    Note over Agent: Token reference discarded after use
    Note over Agent: Log: { connection, userId, timestamp } — never the token value
```

**Connected apps configured in Auth0 Dashboard → Token Vault:**

| Connection | Service | Used by Agent | Scopes |
|---|---|---|---|
| `jira` | Atlassian Jira | RegDataAgent | `read:jira-work` |
| `github` | GitHub | RegDataAgent, AuditAgent | `repo`, `contents:write` |
| `slack` | Slack | RegDataAgent | `channels:history` |
| `dnb-api` | DNB Reporting API | SubmissionAgent | `submit:incident-report` |
| `azure-devops` | Azure DevOps | RegDataAgent | `vso.work_read` |

---

## 4. CIBA Step-Up Authentication Flow

CIBA is triggered **only in SubmissionAgent**, and **only after** OpenFGA confirms the user is CISO or CRO.

```mermaid
sequenceDiagram
    participant SA as SubmissionAgent
    participant FGA as OpenFGA
    participant Auth0 as Auth0 CIBA Endpoint
    participant Guardian as Auth0 Guardian<br/>(CISO mobile app)
    participant TV as Token Vault
    participant DNB as DNB Reporting API

    SA->>FGA: check(user:ciso-sub, can_submit, regulatory_report:LG-2024-001)
    FGA-->>SA: { allowed: true }

    SA->>SA: emit status: "awaiting_ciso_approval"
    Note over SA: Dashboard shows CISO modal

    SA->>Auth0: POST /bc-authorize<br/>login_hint: { sub: ciso-sub }<br/>binding_message: "Approve DORA report LG-2024-001 for DNB"
    Auth0-->>SA: { auth_req_id: "..." }

    Auth0->>Guardian: Push notification<br/>"LokaGuard: Approve DORA report LG-2024-001"

    loop Poll every 5 seconds (max 5 min)
        SA->>Auth0: POST /oauth/token<br/>grant_type: urn:openid:params:grant-type:ciba<br/>auth_req_id: "..."
        Auth0-->>SA: { error: "authorization_pending" }
    end

    Guardian->>Auth0: CISO taps Approve
    SA->>Auth0: POST /oauth/token (next poll)
    Auth0-->>SA: { access_token: "..." }

    SA->>SA: emit status: "ciso_approved"

    SA->>TV: GET connected-accounts/dnb-api/token
    TV-->>SA: { access_token: "dnb-token" }

    SA->>DNB: POST /v1/incident-reports<br/>Authorization: Bearer dnb-token
    DNB-->>SA: { referenceId: "DNB-2024-XXXX", status: "received" }

    Note over SA: Token Vault releases DNB credential<br/>ONLY after CISO approval — never before
```

---

## 5. OpenFGA Authorization Model

```mermaid
flowchart TB
    subgraph TYPES["Authorization Model — fga/model.fga"]
        direction TB

        subgraph ORG["type: organization"]
            CISO_REL["ciso: [user]"]
            CRO_REL["cro: [user]"]
            CO_REL["compliance_officer: [user, team#member]\n  OR cro"]
            ANA_REL["analyst: [user, team#member]\n  OR compliance_officer"]
        end

        subgraph REP["type: regulatory_report"]
            OWNER["owner: [organization]"]
            CAN_DRAFT["can_draft → analyst from owner"]
            CAN_REVIEW["can_review → compliance_officer from owner"]
            CAN_APPROVE["can_approve → ciso OR cro from owner"]
            CAN_SUBMIT["can_submit → can_approve"]
        end

        subgraph AUDIT["type: audit_log"]
            A_OWNER["owner: [organization]"]
            CAN_READ["can_read → analyst from owner"]
            CAN_WRITE["can_write → [user]"]
        end
    end

    subgraph FLOW["SubmissionAgent check sequence"]
        CHECK["checkPermission(userId, 'can_submit', 'regulatory_report:LG-2024-001')"]
        ALLOW{allowed?}
        CIBA_START["initiateCIBA()"]
        DENY["FGAPermissionError\n→ pipeline aborts"]

        CHECK --> ALLOW
        ALLOW -->|Yes — CISO or CRO| CIBA_START
        ALLOW -->|No| DENY
    end

    CAN_SUBMIT --> CHECK

    style TYPES fill:#0a1628,stroke:#4f8ef7,color:#e2e8f0
    style FLOW fill:#1a0a2e,stroke:#7c3aed,color:#e2e8f0
    style CIBA_START fill:#0a1f0a,stroke:#10b981,color:#e2e8f0
    style DENY fill:#1f0a0a,stroke:#ef4444,color:#e2e8f0
```

**Role hierarchy (highest to lowest):**

```
CISO ──────────────────────────────────────── can_submit, can_approve, can_review, can_draft
CRO ────────────────────────────────────────  can_submit, can_approve, can_review, can_draft
compliance_officer ─────────────────────────  can_review, can_draft
analyst ────────────────────────────────────  can_draft
```

---

## 6. WebSocket Real-Time Status

```mermaid
sequenceDiagram
    participant Browser as Dashboard Browser
    participant WS as WebSocket Server<br/>agent-status.ws.ts
    participant Router as LokaRouter
    participant Agent as Agent (any)

    Browser->>WS: WebSocket connect
    WS-->>Browser: Connected

    Note over Router,Agent: Pipeline starts

    Router->>WS: emit("agent:start", { nodeId })
    WS->>Browser: { type: "agent:start", nodeId }

    Agent->>WS: emit("status", { stage, agentName, meta })
    WS->>Browser: { type: "agent:status", stage, agentName }

    Agent->>WS: emit("log", { message, agent })
    WS->>Browser: { type: "agent:log", message, agent }

    Router->>WS: emit("agent:complete", { nodeId, success })
    WS->>Browser: { type: "agent:complete", nodeId, success }

    Router->>WS: emit("pipeline:complete", { success, results })
    WS->>Browser: { type: "pipeline:complete", success, results }

    Note over Browser: Dashboard updates stage cards,<br/>shows CISO approval modal,<br/>renders final DORA report JSON
```

---

## 7. Database Schema

```mermaid
erDiagram
    INCIDENTS {
        text id PK
        text jira_issue_key
        text user_id
        text organization_id
        text status
        text created_at
        text completed_at
    }

    REPORTS {
        text id PK
        text incident_id FK
        text status
        text severity
        text dnb_reference_id
        text submitted_at
        text payload
        text created_at
    }

    AUDIT_RECORDS {
        text report_id PK
        text incident_id
        text user_id
        text organization_id
        text payload
        text created_at
    }

    INCIDENTS ||--o{ REPORTS : "produces"
    REPORTS ||--o| AUDIT_RECORDS : "audited by"
```

---

## 8. Security Model

```mermaid
flowchart TB
    subgraph PRINCIPLES["Zero-Trust Agent Security Principles"]
        P1["1. No credentials in code\nAll tokens from Token Vault at runtime"]
        P2["2. No token caching\nFresh fetch per pipeline run"]
        P3["3. No token logging\nOnly { connection, userId, timestamp }"]
        P4["4. Least privilege per agent\nRegDataAgent ≠ SubmissionAgent scopes"]
        P5["5. Human-in-the-loop\nCISO approves every DNB submission via CIBA"]
        P6["6. Role check before auth\nOpenFGA gates CIBA initiation"]
        P7["7. Immutable audit trail\nGitHub commit — not an editable DB row"]
        P8["8. TypeScript strict mode\nno any, exactOptionalPropertyTypes,\nnoUncheckedIndexedAccess"]
    end

    P1 & P2 & P3 & P4 --> TV_SAFE["Token Vault\nSecurity Posture"]
    P5 & P6 --> CIBA_SAFE["CIBA + OpenFGA\nApproval Posture"]
    P7 --> AUDIT_SAFE["Audit\nIntegrity"]
    P8 --> CODE_SAFE["Code\nQuality"]

    TV_SAFE & CIBA_SAFE & AUDIT_SAFE & CODE_SAFE --> DORA_COMPLIANCE["DORA Article 19\nCompliance-Ready"]

    style PRINCIPLES fill:#0a1628,stroke:#4f8ef7,color:#e2e8f0
    style TV_SAFE fill:#1a0a2e,stroke:#7c3aed,color:#e2e8f0
    style CIBA_SAFE fill:#0a1f0a,stroke:#10b981,color:#e2e8f0
    style AUDIT_SAFE fill:#1a0a0a,stroke:#ef4444,color:#e2e8f0
    style CODE_SAFE fill:#1a1a0a,stroke:#f59e0b,color:#e2e8f0
    style DORA_COMPLIANCE fill:#0d2010,stroke:#10b981,color:#10b981
```

---

## 9. Project File Structure

```
lokaguard-auth/
│
├── src/
│   ├── index.ts                      Express + WebSocket server entry
│   ├── config.ts                     Zod env validation (crash-fast)
│   │
│   ├── agents/
│   │   ├── base.agent.ts             Abstract BaseAgent (EventEmitter)
│   │   ├── loka-router.ts            DAG orchestrator (Kahn's topo sort)
│   │   ├── reg-data.agent.ts         Jira + GitHub + Slack via Token Vault
│   │   ├── classify.agent.ts         DORA severity (Qwen 2.5 + EBA RTS)
│   │   ├── draft.agent.ts            DORA Art. 19 draft (Qwen 2.5)
│   │   ├── submission.agent.ts       OpenFGA → CIBA → Token Vault → DNB
│   │   └── audit.agent.ts            GitHub commit + SQLite via Token Vault
│   │
│   ├── auth/
│   │   ├── token-vault.ts            Token Vault client (5 connections)
│   │   ├── management.ts             Auth0 Management API (bootstrap only)
│   │   ├── ciba.ts                   CIBA initiate + poll loop (5 min timeout)
│   │   └── openfga.ts                check() + batchCheck()
│   │
│   ├── llm/
│   │   ├── qwen.client.ts            Ollama HTTP client
│   │   └── prompts/
│   │       ├── classify.prompt.ts    EBA RTS extraction prompt
│   │       └── draft-report.prompt.ts DORA notification generation
│   │
│   ├── regulatory/
│   │   ├── dora-classifier.ts        7-criterion deterministic classifier
│   │   ├── report-builder.ts         DORAInitialNotification assembler
│   │   └── dnb-client.ts             DNB API client (submit + status)
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── incidents.ts          POST /api/incidents
│   │   │   ├── reports.ts            GET /api/reports/:id
│   │   │   └── health.ts             GET /health
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts    JWT via Auth0 JWKS
│   │   │   └── logger.middleware.ts  Winston structured JSON
│   │   └── ws/
│   │       └── agent-status.ws.ts   WebSocket → dashboard broadcast
│   │
│   ├── db/
│   │   └── sqlite.ts                 better-sqlite3 (WAL mode, 3 tables)
│   │
│   └── types/
│       ├── incident.types.ts
│       ├── report.types.ts           DORAInitialNotification interface
│       └── agent.types.ts            AgentContext, AgentResult, AgentTrace
│
├── tests/
│   ├── agents/
│   │   ├── loka-router.test.ts       DAG sort, circular dep detection
│   │   └── submission.agent.test.ts  CIBA flow, status events, FGA errors
│   ├── auth/
│   │   ├── token-vault.test.ts       Demo tokens, 401 handling
│   │   └── ciba.test.ts              Approve, denied, timeout flows
│   └── regulatory/
│       └── dora-classifier.test.ts   All 7 EBA RTS criteria
│
├── fga/
│   └── model.fga                     OpenFGA authorization model
│
├── public/
│   └── dashboard/
│       └── index.html                Real-time WebSocket dashboard
│
├── scripts/
│   └── dnb-mock/
│       └── server.js                 Mock DNB Reporting API (docker)
│
├── .github/
│   └── workflows/
│       └── ci.yml                    GitHub Actions: typecheck + test + build
│
├── docker-compose.yml                Full stack (app + Ollama + DNB mock + OpenFGA)
├── Dockerfile                        Multi-stage Node 20 build
├── .env.example                      All required vars documented
├── ARCHITECTURE.md                   This file — system diagrams
├── DEPLOY.md                         Deployment guide
├── CONTRIBUTING.md                   Development setup
├── LICENSE                           Apache 2.0
└── README.md                         Judges start here
```

---

## 10. Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Agent orchestration | Custom DAG (Kahn's algorithm) | Explicit dependency declaration, no hidden ordering, circular dep detection at startup |
| LLM runtime | Ollama + Qwen 2.5 (local) | Incident data stays on-network; DORA data residency requirements satisfied by design |
| Authorization | OpenFGA | Fine-grained role model with composable relations; batchCheck avoids N+1 calls |
| Step-up auth | CIBA (backchannel) | Server-side agent pipeline cannot use redirect flows; CIBA is the correct OAuth 2.0 pattern |
| Credential management | Auth0 Token Vault | Fresh scoped tokens per agent per run; zero credential persistence |
| Audit trail | GitHub commit | Immutable by design; timestamped; reviewable by regulators without special tooling |
| Type system | TypeScript 5 strict | `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` catch latent bugs before runtime |
| Testing | Vitest with module mocks | Fast; ESM-native; `vi.mock` at module boundary keeps agents testable without real Auth0 |
