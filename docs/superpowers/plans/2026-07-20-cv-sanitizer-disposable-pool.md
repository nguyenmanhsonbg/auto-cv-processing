# CV Sanitizer Disposable Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long-lived HTTP CV sanitizer runtime with a DB-coordinated pool manager and disposable one-job Ghostscript worker containers.

**Architecture:** Add `DISPOSABLE_POOL` as a third `CleanCvSanitizer` mode while retaining the existing `HTTP_SERVICE` and `GHOSTSCRIPT_DOCKER` fallback modes. The public backend creates and waits for sanitization jobs through the existing `CvSanitizationService` boundary; a separate pool-manager Nest process owns Docker runtime access, pre-warms workers, assigns one job per worker, validates output, and records job/worker state in Postgres.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Docker CLI, Ghostscript, React, TypeScript, pnpm.

## Global Constraints

- Use pnpm only.
- Do not run git commands.
- Do not create or modify `*.spec.ts` or `*.test.ts` files.
- Do not build or lint.
- Do not launch applications; backend and frontend hot reload are assumed running.
- After code changes, run `pnpm typecheck` and inspect `apps/backend/dev.log`; inspect `apps/frontend/dev.log` when frontend changes.
- After code changes, run an API test against `:3002` and a browser test against `:4000`.
- Keep public apply synchronous; do not return `202 Accepted`.
- Keep `HTTP_SERVICE` and `GHOSTSCRIPT_DOCKER` fallback modes.
- Add `CV_SANITIZE_QUEUED` and `CV_SANITIZE_TIMEOUT` statuses.
- Add internal pool health service only; do not expose a new admin endpoint in this implementation.
- Default pool config: `minReady=1`, `maxWorkers=2`, `jobTimeoutMs=60000`, `readyTimeoutMs=30000`, `maxAttempts=2`, `jobWaitTimeoutMs=90000`, `reconcileIntervalMs=1000`.

---

## File Structure

- `apps/backend/src/cv-sanitization/config/cv-sanitizer-pool.config.ts`: parse and validate pool environment variables.
- `apps/backend/src/cv-sanitization/jobs/*`: job status enum, entity, queue service, retry/fail/wait logic.
- `apps/backend/src/cv-sanitization/workers/*`: worker status enum, entity, state helpers.
- `apps/backend/src/cv-sanitization/worker-runtime/*`: runtime interface and Docker CLI implementation.
- `apps/backend/src/cv-sanitization/output/clean-pdf-output-validator.ts`: trusted output validation and hashing.
- `apps/backend/src/cv-sanitization/pool/*`: pool manager reconcile/assignment loop and internal health summary.
- `apps/backend/src/cv-sanitization/sanitizer/disposable-ghostscript-sanitizer.ts`: backend adapter implementing `CleanCvSanitizer`.
- `apps/backend/src/cv-sanitization/pool-manager.main.ts`: separate Nest entry point for pool-manager mode.
- `apps/cv-sanitizer/worker.js`: one-job worker entrypoint used by the disposable container image.
- `apps/backend/src/migrations/<timestamp>-CreateCvSanitizationPool.ts`: hand-written schema migration.
- `Dockerfile`, `docker-compose.yml`, `apps/backend/package.json`, `.env.example`: runtime wiring.
- Backend and frontend recruitment enums/status labels: add queued/timeout statuses.
- `docs/cv-sanitizer-disposable-pool.md`: operational documentation and rollback notes.

---

### Task 1: Add statuses, config, entities, and migration

**Files:**
- Create: `apps/backend/src/cv-sanitization/config/cv-sanitizer-pool.config.ts`
- Create: `apps/backend/src/cv-sanitization/jobs/cv-sanitization-job-status.ts`
- Create: `apps/backend/src/cv-sanitization/jobs/cv-sanitization-job.entity.ts`
- Create: `apps/backend/src/cv-sanitization/workers/cv-sanitizer-worker-status.ts`
- Create: `apps/backend/src/cv-sanitization/workers/cv-sanitizer-worker.entity.ts`
- Create: `apps/backend/src/cv-sanitization/workers/cv-sanitizer-worker-state.ts`
- Create: `apps/backend/src/migrations/1784700000000-CreateCvSanitizationPool.ts`
- Modify: `apps/backend/src/recruitment-common/enums/recruitment.enum.ts`
- Modify: `apps/frontend/src/types/recruitment.ts`
- Modify: `apps/frontend/src/components/recruitment/status.ts`

**Interfaces:**
- Produces: `getCvSanitizerPoolConfig(): CvSanitizerPoolConfig`.
- Produces: `CvSanitizationJobEntity` table name `cv_sanitization_jobs`.
- Produces: `CvSanitizerWorkerEntity` table name `cv_sanitizer_workers`.
- Produces: `CvSanitizationJobStatus` and `CvSanitizerWorkerStatus` enums.

- [ ] Add backend `ApplicationStatus.CV_SANITIZE_QUEUED` and `ApplicationStatus.CV_SANITIZE_TIMEOUT`.
- [ ] Add matching frontend enum values and labels/variants.
- [ ] Implement config parsing with exact defaults and fail-fast validation.
- [ ] Implement TypeORM entities with UUID ids, timestamp columns, nullable fields, enum columns, and index decorators for common lookup paths.
- [ ] Implement hand-written migration with `CREATE TYPE ... IF NOT EXISTS`-safe `DO $$` guards, tables, indexes, and defensive down migration.

### Task 2: Add trusted clean output validation

**Files:**
- Create: `apps/backend/src/cv-sanitization/output/clean-pdf-output-validator.ts`
- Modify: `apps/backend/src/cv-sanitization/cv-sanitization.service.ts`

**Interfaces:**
- Produces: `CleanPdfOutputValidator.validate(filePath: string, expectedParentDir?: string): Promise<CleanPdfOutputArtifact>`.
- Consumes: output file paths from all sanitizer modes.

- [ ] Move clean PDF artifact validation out of `CvSanitizationService` into `CleanPdfOutputValidator`.
- [ ] Validate regular file, non-empty size, non-symlink, path containment when an expected parent dir is provided, PDF magic bytes, and SHA-256 hash.
- [ ] Keep `CvSanitizationService` as the business boundary that creates the CLEAN `CvDocument` only after validation succeeds.
- [ ] Preserve current fallback adapter behavior while replacing the private validation method call.

### Task 3: Implement job queue service

**Files:**
- Create: `apps/backend/src/cv-sanitization/jobs/cv-sanitization-job.service.ts`
- Modify: `apps/backend/src/cv-sanitization/cv-sanitization.module.ts`

**Interfaces:**
- Produces: `createOrReuseJob(input: CreateCvSanitizationJobInput): Promise<CvSanitizationJobEntity>`.
- Produces: `reserveNextJobForWorker(queryRunner, workerId, leaseExpiresAt): Promise<CvSanitizationJobEntity | null>`.
- Produces: `markProcessing(jobId)`, `markSucceeded(jobId, result)`, `markFailed(jobId, error)`, `markRetryPending(jobId, error)`, `recoverExpiredLeases(now)`.
- Produces: `waitForTerminalJob(jobId, timeoutMs): Promise<CvSanitizationJobEntity>`.

- [ ] Add idempotent job creation keyed by application id, original CV document id, and input hash for active states.
- [ ] Implement assignment query using PostgreSQL `FOR UPDATE SKIP LOCKED`.
- [ ] Implement terminal wait by polling at a short bounded interval until success/fail/timeout/cancelled or wait timeout.
- [ ] Implement retry policy: retryable reason codes get a new worker and increment attempt until `maxAttempts`.
- [ ] Ensure public-safe errors do not include runtime container ids.

### Task 4: Implement Docker worker runtime

**Files:**
- Create: `apps/backend/src/cv-sanitization/worker-runtime/sanitizer-container-runtime.interface.ts`
- Create: `apps/backend/src/cv-sanitization/worker-runtime/docker-cli-sanitizer-container-runtime.ts`
- Create: `apps/cv-sanitizer/worker.js`

**Interfaces:**
- Produces: `SanitizerContainerRuntime.createWorker(input): Promise<CreatedSanitizerWorker>`.
- Produces: `writeJobDescriptor(input): Promise<void>`, `waitForWorkerReady(...)`, `waitForResult(...)`, `terminateWorker(...)`, `removeOrphanWorkers(...)`, `isRuntimeReachable()`.

- [ ] Create a Docker CLI runtime wrapper using `spawn` with array args only.
- [ ] Create one control/input/output temp directory per worker/job under `CV_SANITIZER_CONTROL_DIR`.
- [ ] Start workers with `--network none`, non-root user, read-only filesystem, dropped capabilities, no-new-privileges, pids/memory/cpu limits, tmpfs `/tmp`, and labels.
- [ ] Ensure disposable workers receive only job-specific mounts.
- [ ] Implement `apps/cv-sanitizer/worker.js` so it waits for `/control/job.json`, validates relative file names, runs Ghostscript once, writes `/control/result.json`, and exits.

### Task 5: Implement pool manager services

**Files:**
- Create: `apps/backend/src/cv-sanitization/pool/sanitizer-pool-manager.service.ts`
- Create: `apps/backend/src/cv-sanitization/pool/sanitizer-pool-health.service.ts`
- Create: `apps/backend/src/cv-sanitization/pool-manager.main.ts`
- Modify: `apps/backend/src/cv-sanitization/cv-sanitization.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/package.json`

**Interfaces:**
- Produces: `SanitizerPoolManagerService` with `onModuleInit`, `onModuleDestroy`, `reconcileOnce`, and assignment loop.
- Produces: `SanitizerPoolHealthService.getSummary(): Promise<SanitizerPoolHealthSummary>`.
- Produces: `pnpm --filter @interview-assistant/backend start:pool-manager` script.

- [ ] Add startup reconciliation for non-terminal worker rows, orphan containers, and expired job leases.
- [ ] Maintain `ready + starting >= minReadyWorkers` without exceeding `maxWorkers`.
- [ ] Reserve exactly one READY worker per job and never return a PROCESSING worker to READY.
- [ ] Process outside the assignment transaction.
- [ ] On shutdown, stop loops and best-effort terminate owned non-terminal workers without marking jobs successful.
- [ ] Provide internal health summary with `UP`, `DEGRADED`, `DOWN` and counts only.

### Task 6: Add disposable pool sanitizer adapter

**Files:**
- Create: `apps/backend/src/cv-sanitization/sanitizer/disposable-ghostscript-sanitizer.ts`
- Modify: `apps/backend/src/cv-sanitization/sanitizer/clean-cv-sanitizer.interface.ts`
- Modify: `apps/backend/src/cv-sanitization/cv-sanitization.module.ts`
- Modify: `apps/backend/src/cv-sanitization/cv-sanitization.service.ts`

**Interfaces:**
- Produces: `DisposableGhostscriptSanitizer implements CleanCvSanitizer`.
- Consumes: `CvSanitizationJobService`.

- [ ] Add `DISPOSABLE_POOL` mode to provider selection.
- [ ] Queue or reuse a job, wait synchronously for terminal state, and return `CleanCvSanitizeResult`.
- [ ] Distinguish pool wait timeout from sanitizer failure using `CV_SANITIZE_TIMEOUT` workflow/audit metadata.
- [ ] Keep public apply response synchronous and public-safe.

### Task 7: Update workflow/audit metadata and public apply copy

**Files:**
- Modify: `apps/backend/src/cv-sanitization/cv-sanitization.service.ts`
- Modify: `apps/backend/src/job-postings/public-job-postings.controller.ts`

**Interfaces:**
- Consumes: job result metadata from `DisposableGhostscriptSanitizer`.
- Produces: public success message `CV accepted. PDF sanitization and parsing completed successfully.`

- [ ] Record `CV_SANITIZE_QUEUED`, `CV_SANITIZE_TIMEOUT`, retry, assignment, started, succeeded, and failed metadata where available.
- [ ] Include `applicationId`, `cvDocumentId`, `sanitizationJobId`, `workerId`, `attempt`, and `requestId` where available in audit metadata.
- [ ] Do not expose runtime container id through public API.
- [ ] Keep malware scan skipped metadata explicit and avoid treating `threatDetected=false` as proof of scanning.
- [ ] Update Swagger example and actual public apply success copy.

### Task 8: Wire Docker, env, and docs

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `apps/backend/.env.example`
- Create: `docs/cv-sanitizer-disposable-pool.md`

**Interfaces:**
- Produces: Docker target `cv-sanitizer-worker`.
- Produces: Compose service `sanitizer-pool-manager`.
- Consumes: Docker socket only in pool-manager service.

- [ ] Replace Compose long-lived `cv-sanitizer` HTTP service with `sanitizer-pool-manager`.
- [ ] Set backend `CV_PDF_SANITIZER_MODE=DISPOSABLE_POOL`.
- [ ] Add worker image target with Ghostscript, non-root user, no HTTP port, and `node worker.js`.
- [ ] Share storage/control volumes only where required.
- [ ] Document env vars, local rollout, rollback, and cleanup command for orphan worker containers.

### Task 9: Required verification

**Files:**
- No new test files.

- [ ] Run `pnpm typecheck`.
- [ ] Inspect `apps/backend/dev.log`.
- [ ] Inspect `apps/frontend/dev.log` if frontend files changed.
- [ ] Run an API test against `http://127.0.0.1:3002`; because this feature depends on Docker/pool-manager availability, record whether the endpoint reaches sanitizer success or returns a configured public-safe pool error.
- [ ] Run a browser test against `http://127.0.0.1:4000` to verify frontend loads and status labels do not break rendering.
- [ ] Do not run build, lint, migrations, dev servers, Docker Compose build, or git commands.

