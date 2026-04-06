# Deployment Guide — LokaGuard Auth

Three deployment options in order of complexity.

---

## Option 1 — Local (Demo mode, no credentials)

Fastest path for judges and evaluators.

```bash
git clone https://github.com/manojmallick/lokaguard-auth
cd lokaguard-auth
npm install
cp .env.example .env        # DEMO_MODE=true is already set
npm run dev
```

Open `http://localhost:3000/dashboard` and click **"Run Full Demo (Auto)"**.

**What demo mode does:**
- Token Vault → returns `demo-token-{connection}-{timestamp}` (realistic, unique per call)
- CIBA → auto-approves after 3 seconds (simulates CISO tapping Approve)
- OpenFGA → returns `allowed: true` for any CISO user
- DNB API → mock server returns `DNB-{year}-{uuid}` reference ID
- JWT auth → `Authorization: Bearer demo-token` bypasses JWKS validation

---

## Option 2 — Full Docker Stack

Runs the complete stack including Ollama, mock DNB API, and OpenFGA.

### Prerequisites

- Docker Desktop 4.x+
- 8 GB RAM available (Ollama needs ~4 GB for qwen2.5:7b)

### Start

```bash
cp .env.example .env
docker-compose up
```

Services started:

| Service | Host port | Purpose |
|---|---|---|
| app | 3000 | Express + WebSocket server |
| ollama | 11434 | Qwen 2.5 LLM inference |
| dnb-mock | 8080 | Mock DNB Reporting API |
| openfga | 8081 (HTTP), 8082 (gRPC) | Local authorization server |

First run downloads `qwen2.5:7b` (~4 GB). Subsequent starts use cached image.

### Load OpenFGA model

```bash
# Wait for openfga to be healthy, then:
OPENFGA_STORE_ID=$(curl -s http://localhost:8081/stores \
  -H "Content-Type: application/json" \
  -d '{"name":"lokaguard-dev"}' | jq -r '.id')

curl -s http://localhost:8081/stores/$OPENFGA_STORE_ID/authorization-models \
  -H "Content-Type: application/json" \
  -d @fga/model.fga
```

Or using the CLI:

```bash
npx @openfga/cli store create --name lokaguard-dev --api-url http://localhost:8081
npx @openfga/cli model write --store-id $OPENFGA_STORE_ID --file fga/model.fga --api-url http://localhost:8081
```

---

## Option 3 — Production with Real Auth0

Full production deployment with real Auth0 credentials, real CIBA, and real OpenFGA.

### Prerequisites

- Node.js 20+
- Auth0 tenant with Token Vault enabled (Auth0 for AI Agents plan)
- OpenFGA cloud account (`api.us1.fga.dev`) or self-hosted
- Ollama installed (`brew install ollama`)

### Auth0 Setup

#### 1. Create a regular web application (for Management API)

```
Auth0 Dashboard → Applications → Create Application → Machine to Machine
Name: LokaGuard Auth Backend
Authorized API: Auth0 Management API
Scopes: read:users, update:users
```

Note the **Client ID** and **Client Secret** → `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`

#### 2. Create a CIBA application

```
Auth0 Dashboard → Applications → Create Application → Native
Name: LokaGuard CIBA
Enable: Allow Offline Access
Advanced → Grant Types → check "CIBA - Client-Initiated Backchannel Authentication"
```

Note the **Client ID** and **Client Secret** → `AUTH0_CIBA_CLIENT_ID`, `AUTH0_CIBA_CLIENT_SECRET`

#### 3. Configure Token Vault connected apps

```
Auth0 Dashboard → Auth0 for AI Agents → Token Vault → Connected Apps
```

Add connections for each service your agents need:

| Name | Service | Scopes |
|---|---|---|
| jira | Atlassian Jira | read:jira-work |
| github | GitHub | repo, contents:write |
| slack | Slack | channels:history |
| dnb-api | DNB API (custom OAuth) | submit:incident-report |

#### 4. Create a service account user

```bash
# The pipeline runs as a service account, not a real user
curl -X POST https://$AUTH0_DOMAIN/api/v2/users \
  -H "Authorization: Bearer $MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"connection":"Username-Password-Authentication","email":"lokaguard-agent@yourdomain.com","password":"...","email_verified":true}'
```

Note the `user_id` → `AUTH0_SERVICE_ACCOUNT_USER_ID`

#### 5. Set up OpenFGA

```bash
# Create store
npx @openfga/cli store create --name lokaguard-prod

# Write authorization model
npx @openfga/cli model write --store-id $OPENFGA_STORE_ID --file fga/model.fga

# Grant CISO role to your CISO's Auth0 user sub
npx @openfga/cli tuple write \
  --store-id $OPENFGA_STORE_ID \
  --user user:auth0|YOUR_CISO_SUB \
  --relation ciso \
  --object organization:org-1
```

### Environment configuration

```bash
cp .env.example .env
```

Fill in all values:

```env
AUTH0_DOMAIN=manoj-mallick.auth0.com
AUTH0_CLIENT_ID=<backend app client id>
AUTH0_CLIENT_SECRET=<backend app client secret>
AUTH0_AUDIENCE=https://manoj-mallick.auth0.com/api/v2/
AUTH0_TOKEN_VAULT_BASE_URL=https://manoj-mallick.auth0.com
AUTH0_SERVICE_ACCOUNT_USER_ID=auth0|<service account user id>

AUTH0_CIBA_CLIENT_ID=<ciba app client id>
AUTH0_CIBA_CLIENT_SECRET=<ciba app client secret>
CIBA_BINDING_MESSAGE_PREFIX="LokaGuard: Approve DORA submission"

OPENFGA_API_URL=https://api.us1.fga.dev
OPENFGA_STORE_ID=<your store id>
OPENFGA_AUTHORIZATION_MODEL_ID=<your model id>
OPENFGA_API_TOKEN=<your fga api token>

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b

DATABASE_PATH=./data/lokaguard.db
DNB_API_BASE_URL=http://localhost:8080/v1    # or real DNB endpoint
DNB_ORG_LEI=724500AB12CD34EF5678            # your LEI

GITHUB_AUDIT_REPO=lokaguard-audit-trail
GITHUB_AUDIT_OWNER=your-github-username
# GITHUB_PAT=ghp_...   # optional hackathon shortcut

PORT=3000
NODE_ENV=production
LOG_LEVEL=info
DEMO_MODE=false
```

### Start Ollama

```bash
ollama serve
ollama pull qwen2.5:7b        # ~4 GB download, one-time
# For demo: ollama pull qwen2.5:14b
```

### Build and run

```bash
npm run build
npm start
```

### Trigger a real incident

```bash
# Get a JWT from Auth0 first
TOKEN=$(curl -s -X POST https://manoj-mallick.auth0.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"client_id":"...","client_secret":"...","audience":"...","grant_type":"client_credentials"}' \
  | jq -r '.access_token')

curl -X POST http://localhost:3000/api/incidents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jiraIssueKey":"INC-1234","userId":"auth0|your-ciso-sub"}'
```

---

## Verifying deployment

```bash
# Health check (always works, no auth required)
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "ok",
#   "components": { "database": "ok", "ollama": "ok" },
#   "demo_mode": true,
#   "timestamp": "2024-..."
# }
```

---

## Environment variables reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH0_DOMAIN` | Yes* | — | Auth0 tenant domain |
| `AUTH0_CLIENT_ID` | Yes* | — | Machine-to-machine app client ID |
| `AUTH0_CLIENT_SECRET` | Yes* | — | Machine-to-machine app client secret |
| `AUTH0_AUDIENCE` | Yes* | — | Management API audience |
| `AUTH0_TOKEN_VAULT_BASE_URL` | Yes* | — | Token Vault base URL (= tenant URL) |
| `AUTH0_SERVICE_ACCOUNT_USER_ID` | Yes* | — | Service account `auth0|...` sub |
| `AUTH0_CIBA_CLIENT_ID` | Yes* | — | CIBA-enabled application client ID |
| `AUTH0_CIBA_CLIENT_SECRET` | Yes* | — | CIBA-enabled application client secret |
| `OPENFGA_API_URL` | Yes* | — | OpenFGA API URL |
| `OPENFGA_STORE_ID` | Yes* | — | OpenFGA store ID |
| `OPENFGA_AUTHORIZATION_MODEL_ID` | Yes* | — | OpenFGA model ID |
| `OPENFGA_API_TOKEN` | Yes* | — | OpenFGA API token |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | No | `qwen2.5:7b` | Model to use for inference |
| `DATABASE_PATH` | No | `./data/lokaguard.db` | SQLite file path |
| `DNB_API_BASE_URL` | No | `http://localhost:8080/v1` | DNB reporting API base URL |
| `DNB_ORG_LEI` | No | — | Legal Entity Identifier (20 chars) |
| `GITHUB_AUDIT_REPO` | No | — | GitHub repo for audit trail |
| `GITHUB_AUDIT_OWNER` | No | — | GitHub owner for audit trail |
| `GITHUB_PAT` | No | — | GitHub PAT (optional Token Vault shortcut) |
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | Environment name |
| `LOG_LEVEL` | No | `info` | Winston log level |
| `DEMO_MODE` | No | `false` | Skip all external Auth0/OpenFGA/DNB calls |

> *Required when `DEMO_MODE=false`
