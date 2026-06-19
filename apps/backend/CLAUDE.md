# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run from monorepo root (apps/backend/ is the working directory for these)
pnpm --filter @interview-assistant/backend start:dev   # watch mode on :3000
pnpm --filter @interview-assistant/backend build
pnpm --filter @interview-assistant/backend test              # all unit tests
pnpm --filter @interview-assistant/backend test -- --testPathPattern="sessions"  # single file/pattern
pnpm --filter @interview-assistant/backend test:cov

# From monorepo root
pnpm lint
pnpm typecheck

# Database migrations
pnpm --filter @interview-assistant/backend migration:generate -- -d src/config/typeorm.config.js -n <MigrationName>
pnpm --filter @interview-assistant/backend migration:run
pnpm --filter @interview-assistant/backend migration:revert
```

Swagger UI is available at `http://localhost:3000/api/docs` during dev.

## Architecture

### Module layout (`src/`)

Each feature module owns its own entity, service, controller, and DTOs. The modules are:

| Module | Key responsibility |
|--------|-------------------|
| `auth` | JWT + Google OAuth. Three strategies: `local`, `jwt`, `google`. Guards: `JwtAuthGuard`, `RolesGuard`. `@Roles()` decorator sets required roles. |
| `candidates` | CRUD + resume upload. Upload triggers `FileParserModule` → regex extraction → `AiService.enrichParsedProfile` → stores as `parsedProfile` JSONB on entity. |
| `file-parser` | Parses PDF (pdf-parse), DOCX (mammoth), XLSX (exceljs) into raw text; does basic regex extraction. Falls back to `AiService.analyzeFileDirectly` for image-only PDFs. |
| `sessions` | Interview session lifecycle. Creates 24-char `accessToken` via nanoid. Manages `SessionQuestionEntity` (activate/deactivate questions, per-question ratings/notes). Calls `wsGateway` to push real-time events after every question state change. |
| `evaluations` | Post-interview BM04 form. One evaluation per session. Initialises `technicalRatings[]` from `TECHNICAL_MUST_SUBCATEGORIES + TECHNICAL_SHOULD_SUBCATEGORIES` (shared package). AI summary and AI evaluation are separate explicit actions. |
| `export` | Generates BM04 Excel. Tries to load `public/templates/BM04_template.xlsx`; falls back to building the workbook programmatically with ExcelJS. Rating columns: 1→E, 2→F, 3→G, 4→H. |
| `ai` | Wraps Anthropic SDK. Falls back to `claude --print` CLI when `ANTHROPIC_API_KEY` is absent. System prompts are stored in DB (`ai_prompts` table) and cached in-process; call `clearPromptCache()` or restart to pick up edits. Uses HAIKU for cheap tasks, SONNET for full evaluation. |
| `websocket` | Socket.io gateway at root namespace `/`. Clients join room `session:{sessionId}`. Roles (`candidate`/`interviewer`) passed as query params on connect. All event names come from `WebSocketEvents` enum in shared package. |
| `questions` | Question bank CRUD with filtering by `targetLevel`, `isActive`, category/subcategory. |
| `positions`, `categories`, `levels` | Reference data tables. |

### Key entity relationships

```
User ─────── creates ──────► Session ──── links ──► SessionQuestion ──► Question
                                │                         │
                                └─── has one ──► Evaluation
Candidate ──────────────────────┘
```

- `SessionEntity` (table: `interview_sessions`) holds `accessToken` (unique, 24 chars), `categoryRatings` (JSONB, key = `"CATEGORY::Subcategory"`), `status` enum.
- `SessionQuestionEntity` holds per-question `isActive`, `rating`, `interviewerNote`, `candidateAnswer`, `activatedAt`.
- `EvaluationEntity` holds `technicalRatings[]` and `personalityRatings[]` as JSONB arrays.

### Auth model

- **Interviewers/HR/Admin**: JWT Bearer. Validated via `JwtAuthGuard` + `RolesGuard`.
- **Candidates during session**: no JWT — public endpoints accept `accessToken` as query param. `findByToken()` auto-transitions session from `DRAFT → IN_PROGRESS` on first access.
- Admin emails listed in `ADMIN_EMAILS` env var are auto-promoted on first Google OAuth login.

### AI service dual-mode

`AiService` checks `ANTHROPIC_API_KEY` on startup:
- **SDK mode**: uses `@anthropic-ai/sdk` directly.
- **CLI mode**: shells out to `claude --print --model ... --system-prompt ... --output-format=json`. Resolves binary from `~/.local/bin/claude` or PATH.

System prompts keys: `enrich_profile`, `suggest_questions`, `evaluate_session`, `evaluation_summary`. All are seeded to DB on startup and can be edited via `PATCH /api/ai/prompts/:id`. Changes only take effect after `clearPromptCache()` or restart.

## Critical conventions

- Use `BadRequestException` (never `NotFoundException`) for all missing-entity errors.
- `synchronize: true` is active in non-production — schema changes apply automatically in dev.
- Always use `WebSocketEvents` enum (from `@interview-assistant/shared`) for socket event names — never hardcode strings.
- WebSocket events are emitted **after** DB saves so clients that refetch get consistent data.
- BM04 rating scale: 1=Không đạt, 2=Hiểu/Biết khái niệm, 3=Đã triển khai thực tế, 4=Có khả năng giải quyết.
