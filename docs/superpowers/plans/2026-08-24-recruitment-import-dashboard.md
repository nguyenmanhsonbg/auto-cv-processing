# Recruitment Import and Dashboard Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a four-sheet recruitment workbook transactionally and connect Pipeline dashboard charts to database aggregates.

**Architecture:** Add a focused `recruitment-import` Nest module that parses the existing ExcelJS dependency, validates all rows and upserts domain entities inside one transaction. Extend the existing dashboard service with real aggregates and return a stable API contract; frontend maps that contract into the chart-specific types.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, ExcelJS, React, TypeScript, Recharts.

**Spec:** `docs/superpowers/specs/2026-08-24-recruitment-import-dashboard-design.md`

## Global Constraints

- Use pnpm only.
- Never create or modify `*.spec.ts` / `*.test.ts` files.
- Never run `pnpm build`, `pnpm lint`, or launch dev servers.
- After every code change run `pnpm typecheck` and inspect relevant hot-reload logs.
- Use `BadRequestException` for import validation/reference failures.
- Do not invent target, quota, turnover, budget, or probation values.

---

### Task 1: Add import contract and workbook parser

**Files:**
- Create: `apps/backend/src/recruitment-import/recruitment-import.types.ts`
- Create: `apps/backend/src/recruitment-import/recruitment-import.parser.ts`
- Create: `apps/backend/src/recruitment-import/recruitment-import.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- `parseRecruitmentWorkbook(buffer: Buffer): ParsedRecruitmentWorkbook`
- Parsed sheets are typed row arrays with `sheet`, `rowNumber`, and normalized values.
- Parser validates required sheet names and required headers but leaves database reference validation to the service.

- [ ] Define exact row types matching the four sheet tables in the spec.
- [ ] Normalize header names by trimming, lowercasing, and replacing spaces/hyphens with underscores.
- [ ] Parse dates, numbers, JSON objects, and blank cells without silently coercing invalid values.
- [ ] Reject missing sheets/headers with `BadRequestException` containing sheet and column context.
- [ ] Register the module in `AppModule`.
- [ ] Run `pnpm typecheck`; inspect `apps/backend/dev.log`.

### Task 2: Implement transactional import service and endpoint

**Files:**
- Create: `apps/backend/src/recruitment-import/recruitment-import.service.ts`
- Create: `apps/backend/src/recruitment-import/recruitment-import.controller.ts`
- Create: `apps/backend/src/recruitment-import/dto/import-recruitment.dto.ts`
- Modify: `apps/backend/src/recruitment-import/recruitment-import.module.ts`

**Interfaces:**
- `POST /api/recruitment-import/workbook` multipart field `file`.
- Response: `{ success: true, data: { candidates, applications, interviewRounds, offers, created, updated }, meta }`.
- `RecruitmentImportService.importWorkbook(buffer: Buffer, actorId: string): Promise<ImportSummary>`.

- [ ] Restrict endpoint to authenticated ADMIN/HR users.
- [ ] Parse and validate duplicate workbook keys, UUIDs, dates, enum values, references, and `HIRED`/`hired_at` consistency before opening the write transaction.
- [ ] Upsert candidates by UUID when supplied by the row, otherwise email, otherwise phone; reject ambiguous matches.
- [ ] Resolve every `job_posting_id` and copy its `jobDescriptionVersionId` into new applications.
- [ ] Upsert applications by UUID or `external_application_id`; set source to `MANUAL_IMPORT` and default channel to `MANUAL`.
- [ ] Upsert interview rounds by external ID or application + round type.
- [ ] Upsert offers by external ID or application + version; set `hrCreatedById` to the authenticated actor.
- [ ] Synchronize application stage/offer status from imported offer status without fabricating a hired date.
- [ ] Return created/updated counts and reject the whole workbook on any error.
- [ ] Run `pnpm typecheck`; inspect `apps/backend/dev.log`.

### Task 3: Extend dashboard aggregates and filters

**Files:**
- Modify: `apps/backend/src/dashboard/dto/pipeline-dashboard.dto.ts`
- Modify: `apps/backend/src/dashboard/services/dashboard.service.ts`
- Modify: `apps/backend/src/dashboard/dashboard.controller.ts`
- Modify: `apps/backend/src/dashboard/dashboard.module.ts`

**Interfaces:**
- Preserve existing `funnel`, `stageDistribution`, `channelHiring`, `levelHiring`, `monthlyTrend`, `timeMetrics`, `totalApplications`, `totalHired`, `asOf`.
- Add real-data datasets for all Pipeline chart adapters with empty arrays for unsupported target/quota data.

- [ ] Apply all filters consistently to every aggregate query, including `recruiterId` and `jobPostingId`.
- [ ] Add interviewed monthly counts from completed/started interview rounds.
- [ ] Add positions actual hired/application counts grouped by job posting title.
- [ ] Add recruiter aggregates using recruiter name, hired count/rate, and average apply-to-hire days.
- [ ] Add department aggregates from latest offer department where available.
- [ ] Add sourcing pass/fail counts from interview results.
- [ ] Add final quality counts from final interview grades.
- [ ] Add level hired counts from candidates.
- [ ] Add SLA actuals from interview timestamps and offer `sentAt`; return standards only when modeled, otherwise no fake standard.
- [ ] Add offer status distribution and channel rate datasets.
- [ ] Calculate offer-to-hire from actual latest offer `sentAt`; return zero when missing rather than assuming seven days.
- [ ] Add guards to dashboard controller for authenticated HR/Admin access.
- [ ] Run `pnpm typecheck`; inspect `apps/backend/dev.log`.

### Task 4: Connect frontend Pipeline adapters

**Files:**
- Modify: `apps/frontend/src/lib/dashboard-api.ts`
- Modify: `apps/frontend/src/pages/dashboard/types.ts`
- Modify: `apps/frontend/src/pages/dashboard/index.tsx`
- Modify: `apps/frontend/src/pages/dashboard/components/tab-pipeline/index.tsx`
- Modify: `apps/frontend/src/pages/dashboard/components/tab-pipeline/RecruitmentAreaTrendChart.tsx`
- Modify: `apps/frontend/src/pages/dashboard/components/tab-pipeline/PositionProgressChart.tsx`
- Modify: `apps/frontend/src/pages/dashboard/components/tab-pipeline/DeptHiringRateChart.tsx`
- Modify: `apps/frontend/src/pages/dashboard/components/tab-pipeline/SlaControlChart.tsx`

**Interfaces:**
- `adaptPipelineDashboard(data: PipelineDashboard): PipelineChartData` maps API fields to existing Recharts component shapes.

- [ ] Add API response types for all real Pipeline datasets.
- [ ] Map backend `levelHiring.hired` to chart `count`, and `channelHiring.hiringRate` to chart `rate`.
- [ ] Use API monthly data instead of `FAKE_MONTHLY_TREND`.
- [ ] Use API datasets for every Pipeline chart and remove fallback to `PIPELINE_FILTER_DATASETS` for runtime data.
- [ ] Keep mock data only in the existing data file for visual development, but do not use it in the live dashboard.
- [ ] Render a clear “chưa có dữ liệu”/unsupported state when an aggregate is empty or target is not modeled.
- [ ] Do not show target bars/radar norm values when no target source exists.
- [ ] Run `pnpm typecheck`; inspect `apps/frontend/dev.log`.

### Task 5: Add import template and perform end-to-end verification

**Files:**
- Create: `docs/recruitment-import-schema.md`
- Optionally modify: `apps/frontend/src/pages/dashboard/components/common/ExportReportModal.tsx` only if an existing import entry point is appropriate.

- [ ] Document workbook sheet names, headers, enum values, and one minimal valid row per sheet.
- [ ] Create a temporary valid workbook outside the repository using the existing ExcelJS runtime.
- [ ] Call import endpoint with the workbook and authenticated token.
- [ ] Call `/api/dashboard/pipeline` and verify imported stage, channel, level, interview, offer, and time values appear in the response.
- [ ] Verify the frontend dashboard requests the endpoint and displays API values rather than mock values.
- [ ] Run final `pnpm typecheck` and inspect both runtime logs.
