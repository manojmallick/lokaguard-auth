# Contributing to LokaGuard Auth

---

## Development setup

### Prerequisites

- Node.js 20+
- npm 10+
- Ollama (optional — only needed for live LLM inference)

```bash
git clone https://github.com/manojmallick/lokaguard-auth
cd lokaguard-auth
npm install
cp .env.example .env        # DEMO_MODE=true — no real credentials needed
npm run dev
```

Open `http://localhost:3000/dashboard`.

---

## Project layout

```
src/agents/       Multi-agent pipeline — start here if adding functionality
src/auth/         Auth0 integration (Token Vault, CIBA, OpenFGA, Management)
src/regulatory/   DORA domain logic — EBA RTS classifier, report builder, DNB client
src/llm/          Ollama/Qwen client + prompt templates
src/api/          Express routes, JWT middleware, WebSocket
src/db/           SQLite schema and migrations
tests/            Vitest unit tests — all external services mocked
fga/model.fga     OpenFGA authorization model
```

---

## Running tests

```bash
npm test                # Run once
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report (target: >90%)
```

All tests run against mocked Auth0, OpenFGA, and DNB. No real credentials needed.

---

## TypeScript rules (enforced by compiler)

- `strict: true` — all strict checks on
- `noUncheckedIndexedAccess` — array/object access always typed as `T | undefined`
- `exactOptionalPropertyTypes` — optional props must be explicitly `undefined`
- `noImplicitReturns` — all code paths must return
- No `any` — ever. Fix the root type problem.
- No `!` non-null assertions — use type narrowing instead
- Named exports everywhere — no default exports (exception: Express Router)

```bash
npm run build    # TypeScript must compile with zero errors before committing
```

---

## Adding a new agent

1. Create `src/agents/your-agent.ts` extending `BaseAgent`
2. Set `readonly name = 'YourAgent'`
3. Implement `run(ctx: AgentContext): Promise<AgentResult>`
4. If calling an external API → use `getTokenVaultToken()` — never hardcode tokens
5. If doing something irreversible → `checkPermission()` first; CIBA if high-stakes
6. Emit `this.emit('status', { stage, agentName, reportId })` on key state changes
7. Register in `src/index.ts` LokaRouter with `dependsOn`
8. Add test: `tests/agents/your-agent.test.ts` — mock all auth calls

---

## Adding a new Token Vault connection

1. Add the connection in Auth0 Dashboard → Auth0 for AI Agents → Token Vault → Connected Apps
2. Add the name to `TokenVaultConnection` union in `src/auth/token-vault.ts`
3. Document it in the table in `ARCHITECTURE.md` (§3 Token Vault Flow)
4. Add a row to the connected apps table in `README.md`

---

## Commit style

```
type(scope): short description

# Types: feat, fix, test, docs, refactor, chore
# Scope: agent, auth, regulatory, api, db, llm, fga

feat(auth): add token vault connection for azure-devops
fix(submission): call initiateCIBA instead of raw setTimeout
test(classifier): add test for reputational impact criterion
docs(arch): add sequence diagram for CIBA flow
```

---

## Security rules (non-negotiable)

- **Never log token values** — only `{ connection, userId, timestamp }`
- **Never cache Token Vault tokens** — always fetch fresh per operation
- **Never call `getManagementToken()` from agent `run()` methods** — only `getTokenVaultToken()`
- **CIBA `bindingMessage` must include report ID** — "Approve DORA report LG-2024-001 for DNB"
- **OpenFGA check before CIBA** — never initiate push notification before confirming role

Violations of these rules will be caught in code review and reverted.

---

## Pull request checklist

- [ ] `npm run build` passes (zero TypeScript errors)
- [ ] `npm test` passes (all 5 suites green)
- [ ] No `any` types introduced
- [ ] No token values in logs
- [ ] New agents have matching test file
- [ ] `ARCHITECTURE.md` updated if adding new auth component or agent
- [ ] `.env.example` updated if adding new environment variable
