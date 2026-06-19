# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

VCS Interview Assistant — automates the interview evaluation workflow from candidate profile parsing to Excel report generation (BM04 template).

## Monorepo Structure

- `apps/backend` — NestJS REST API (port 3002)
- `apps/frontend` — React + Vite SPA (port 4000 dev)
- `packages/shared` — Shared TypeScript types (no runtime code)

Each app has its own `AGENTS.md` with app-specific details.

## Commands

````bash
# Install
pnpm install

# Typecheck (run after every code change), then verify runtime reloaded without errors
pnpm typecheck      # tsc --noEmit across all packages
tail -20 apps/backend/dev.log
tail -20 apps/frontend/dev.log

# Database migrations (backend)
pnpm --filter @interview-assistant/backend migration:generate -- -d src/config/typeorm.config.js -n <MigrationName>
pnpm --filter @interview-assistant/backend migration:run
pnpm --filter @interview-assistant/backend migration:revert

## Log Files

When running `pnpm dev` (or per-app dev scripts), logs are written to:
- `apps/backend/dev.log` — NestJS backend (stdout + stderr)
- `apps/frontend/dev.log` — Vite frontend (stdout + stderr)

Use these for debugging when terminal output has scrolled away:
```bash
tail -f apps/backend/dev.log
tail -f apps/frontend/dev.log
````

Each restart overwrites the log file (fresh log per session). Both files are covered by the `*.log` entry in `.gitignore`.

## Critical Rules

> **IMPORTANT: These rules are ABSOLUTE and MUST be followed without exception. Violating any rule is not acceptable under any circumstance.**

1. **Use pnpm only** — not npm or yarn

2. **Use `BadRequestException`** (not `NotFoundException`) for missing entities

3. **Database**: `synchronize: true` in dev (auto-sync). Use migrations for production.

4. ❌ **NEVER write unit tests** — NEVER create or modify `*.spec.ts` / `*.test.ts` files under any circumstance.

5. ❌ **NEVER build the apps** — NEVER run `pnpm build` or any build command. Use `pnpm typecheck` for type validation only.

6. ✅ **ALWAYS run `pnpm typecheck` and check runtime logs after every code change** — MUST (1) verify no type errors, and (2) check `apps/backend/dev.log` (and `apps/frontend/dev.log` if frontend changed) to confirm the runtime reloaded without errors — before proceeding to testing.

7. ❌ **NEVER launch the apps** — both apps are ALREADY running with hot-reload (frontend :4000, backend :3002). NEVER start dev servers. NEVER assume hot-reload is broken.

8. ❌ **NEVER run linting** — NEVER run `pnpm lint` or any ESLint command.

9. ✅ **ALWAYS test after writing code** — MUST run both an API test (e.g. `curl` against `:3002`) and a browser test (against `:4000`) to verify changes work end-to-end.

10. ❌ **NEVER run git commands** — NEVER run `git` commands of any kind (status, add, commit, push, log, diff, etc.).

## Environment Variables

Copy `apps/backend/.env.example` to `apps/backend/.env`:

```

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/interview_assistant
JWT_SECRET=your-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PORT=3002 # Use 3002 locally — Vite dev proxy and Google OAuth callback target :3002
NODE_ENV=development
UPLOAD_DIR=./uploads
OPEN_REGISTRATION=true # Set false to require invite tokens
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3002/api/auth/google/callback
FRONTEND_URL=http://localhost:4000
ANTHROPIC_API_KEY= # Optional: AI suggestions; falls back to Codex CLI
ADMIN_EMAILS= # Optional: comma-separated emails auto-promoted to ADMIN on first Google OAuth

```

## Architecture

### Backend Modules (`apps/backend/src/`)

NestJS feature modules, each owns its own entity/service/controller:

| Module                              | Responsibility                                                   |
| ----------------------------------- | ---------------------------------------------------------------- |
| `auth`                              | JWT + Google OAuth, guards, role decorators                      |
| `candidates`                        | CRUD, resume upload → `file-parser` → profile extraction         |
| `questions`                         | Question bank CRUD                                               |
| `sessions`                          | Interview session lifecycle, AI question suggestions             |
| `evaluations`                       | Post-interview ratings, AI evaluation suggestions                |
| `submissions`                       | Code submission & execution                                      |
| `export`                            | BM04 Excel report generation via `exceljs`                       |
| `websocket`                         | Socket.io gateway, real-time candidate/interviewer events        |
| `ai`                                | Anthropic API client, `ai-prompts` DB-overridable system prompts |
| `positions`, `categories`, `levels` | Reference data                                                   |

TypeORM entities use `synchronize: true` in dev. Entity files follow `*.entity.ts` naming.

### Data Flow

1. **Resume upload** → `FileParserModule` (pdf-parse/mammoth) → structured `CandidateProfile`
2. **Session creation** → attach candidate + question set → generate 24-char `accessToken` (nanoid)
3. **Live interview** → Socket.io room `session:{id}` → candidate answers, code submissions, interviewer ratings in real time
4. **Post-interview** → `EvaluationsModule` stores technical/HR/personality ratings → AI suggestions via Anthropic
5. **Export** → `ExportModule` maps evaluation data to BM04 Excel template rows

### Domain Model (from `packages/shared`)

- **Session status lifecycle**: `DRAFT` → `IN_PROGRESS` → `COMPLETED` → `EVALUATED`
- **Rating scale (1–4)**: maps to BM04 cells (1=Không đạt, 2=Hiểu/Biết khái niệm, 3=Đã triển khai thực tế, 4=Có khả năng giải quyết)
- **Category ratings stored as JSONB**: key format `"CATEGORY::Subcategory"` → rating
- **Question subcategories** (`SUBCATEGORIES` constant in shared) drive both the question creation UI and BM04 evaluation form rows

### Auth

- **Interviewers/HR/Admin**: JWT Bearer token (stored in `localStorage` on frontend, validated via `GET /api/auth/me` on mount)
- **Candidates during session**: public access via `accessToken` query param — no JWT required
- `RolesGuard` + `@Roles()` decorator enforces role-based access

### WebSocket

Gateway at `/` (root namespace). Rooms: `session:{sessionId}`. Event names come from `WebSocketEvents` enum in `@interview-assistant/shared` — never hardcode event strings.

### Dev Proxy

Vite (port 4000) proxies `/api/*` and `/socket.io/*` → `http://127.0.0.1:3002`. Backend must run on port 3002 locally (set `PORT=3002` in `.env`). Docker uses port 3000.

## Infrastructure

### Docker

- `Dockerfile` — multi-stage build: `base` → `deps` → `backend-builder` / `frontend-builder` → `backend` / `frontend`
  - Backend final image installs Codex CLI globally (`npm install -g @anthropic-ai/Codex`)
  - Backend entrypoint: `apps/backend/migrate-and-start.sh` (runs migrations then starts app)
  - Frontend final image: `nginx:alpine` serving static dist
- `docker-compose.yml` — local full-stack: `postgres:5432`, `backend:3000`, `frontend:3001`
  - Backend port in Docker is **3000** (not 3002 — that's local dev only)

### Kubernetes (Kustomize)

`infrastructure/manifests/` — Kustomize-based deployment:

```
manifests/
  base/                   # Shared resources (envsubst variables: ${NAMESPACE}, ${DOMAIN}, etc.)
    00-namespace.yaml
    10-postgres.yaml      # CloudNativePG (CNPG) Cluster — single-instance PostgreSQL 16
    20-backend.yaml       # Deployment + Service
    21-frontend.yaml      # Deployment + Service
    30-ingress.yaml       # Traefik ingress (HTTPS via Let's Encrypt), routes /api + /socket.io → backend, / → frontend
    kustomization.yaml
  overlays/
    production/
      kustomization.yaml  # Pins backend/frontend image tags (auto-updated by CI/CD GitOps writeback)
```

Container registry: `registry.gitlab.com/tung.engineering/vcs/interview-assistant/{backend,frontend}`

### GitOps (Argo CD)

- `infrastructure/gitops/projects/interview-assistant.yaml` — Argo CD `AppProject` scoped to this repo
- `infrastructure/gitops/scripts/update-production-image-tags.sh` — updates `newTag` in `overlays/production/kustomization.yaml`; called by CI with `BACKEND_IMAGE_TAG` / `FRONTEND_IMAGE_TAG` env vars

### Bootstrap / Install

`infrastructure/install.sh` — idempotent cluster bootstrap script:
- Creates namespace, registry pull secret, runtime secrets (JWT, Google OAuth, DB credentials)
- Installs CNPG operator via Helm
- Configures Argo CD envsubst CMP sidecar and registers the Argo CD `AppProject` + `Application`

Configuration: copy `infrastructure/config.env.example` → `infrastructure/config.env`, then run:

```bash
bash infrastructure/install.sh --env-file infrastructure/config.env
```

Key config vars: `NAMESPACE`, `DOMAIN`, `STORAGE_CLASS`, `POSTGRES_STORAGE_SIZE`, `GITLAB_REGISTRY_USERNAME`, `GITLAB_REGISTRY_TOKEN`

## Key Conventions

- Controllers: `@ApiTags`, `@ApiOperation`, `@ApiBearerAuth` decorators (Swagger at `/api/docs`)
- DTOs: `class-validator` decorators
- Frontend: `@/` path alias for `./src/`
- Comments explain "why", not "what"
- shadcn/ui components in `src/components/ui/` — add new ones via shadcn CLI, don't edit manually

```

```
