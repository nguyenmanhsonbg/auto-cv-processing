# CV Sanitizer Disposable Pool Design

Date: 2026-07-16

## Goal

Replace the current long-lived HTTP PDF sanitizer runtime with a pre-warmed pool of disposable Ghostscript worker containers. Each worker processes at most one CV, exits or is removed after the job, and is replaced by the pool manager to maintain configured ready capacity.

## Current Source Findings

- Public apply entry point: `apps/backend/src/job-postings/public-job-postings.controller.ts`.
- Current sanitizer interface: `apps/backend/src/cv-sanitization/sanitizer/clean-cv-sanitizer.interface.ts`.
- Injection token: `CLEAN_CV_SANITIZER`.
- Business service: `CvSanitizationService` prepares sanitize, writes workflow/audit, validates clean artifact, creates CLEAN `CvDocument`, and schedules parsing.
- Current adapters:
  - `HTTP_SERVICE`: `GhostscriptHttpPdfSanitizer`, calls a long-lived HTTP service at `CV_SANITIZER_SERVICE_URL`.
  - `GHOSTSCRIPT_DOCKER`: `GhostscriptDockerPdfSanitizer`, runs one `docker run --rm` per sanitize request but does not pre-warm.
- Quarantine storage: `apps/backend/src/cv-documents/storage/cv-quarantine-storage.ts`.
- Safe storage: `apps/backend/src/cv-sanitization/storage/cv-safe-storage.ts`.
- Parser only accepts clean safe CVs in `CvParsingService.assertCleanCvCanBeParsed()`.
- Workflow transitions are recorded through `WorkflowStateService`.
- Audit convention uses `AuditLogEntity` with string `action`, `objectType`, `objectId`, `applicationId`, and JSONB metadata.
- Migration convention uses hand-written TypeORM migrations under `apps/backend/src/migrations`, with `up()` and `down()`, `CREATE ... IF NOT EXISTS`, and defensive `DROP ... IF EXISTS`.
- Docker Compose currently runs a `cv-sanitizer` HTTP service from Dockerfile target `cv-sanitizer`.
- `apps/cv-sanitizer/server.js` is a long-lived HTTP service and must not remain the sanitizer runtime.

## Constraints From Active Repo Instructions

- Use `pnpm` only.
- Do not run git commands.
- Do not write or modify `*.spec.ts` or `*.test.ts` files.
- Do not run builds or linting.
- Do not launch apps; existing dev servers are assumed running.
- After code changes, run `pnpm typecheck` and inspect `apps/backend/dev.log`; inspect frontend log if frontend changes.
- After code changes, run an API test and a browser test.

These constraints conflict with parts of the attached DoD that request unit/e2e/security test files, build, lint, Docker Compose build, migration run/revert, and git commit. The implementation plan must treat those as unperformed verification unless the repo instructions are changed by the user.

## Approaches Considered

### A. Separate Pool Manager Service

Run a new Nest process from the backend codebase in pool-manager mode. Backend writes/awaits DB jobs. The pool-manager service owns Docker runtime access, pre-warms disposable worker containers, assigns jobs with PostgreSQL locks, validates result descriptors, updates job/worker rows, and the backend observes job completion.

Recommended because Docker ownership is isolated from the public backend and coordination can stay database-backed.

### B. Pool Manager Embedded In Backend

Add `OnModuleInit` pool lifecycle directly inside the main backend. This is simpler operationally but requires giving the public backend Docker runtime access. It increases blast radius and violates the prompt preference when a separate service is feasible.

### C. Keep Existing Docker Adapter With Better Cleanup

Extend `GhostscriptDockerPdfSanitizer` to use labels, stricter cleanup, and output validation. This avoids a new process, but it is not pre-warmed and does not meet the disposable ready-pool requirement.

## Selected Architecture

Use Approach A.

```text
Public apply backend
-> upload original CV to quarantine
-> mark malware scan skipped with explicit SKIPPED metadata
-> CvSanitizationService creates/awaits a sanitization job
-> DB-backed queue coordinates with pool-manager service
-> pool-manager reserves exactly one READY worker for one job
-> disposable worker processes exactly one descriptor and exits
-> pool-manager reads result, validates/copies output into safe storage path requested by backend
-> CvSanitizationService creates clean CvDocument
-> CvParsingService parses only clean safe CV
```

## Module Boundaries

Add focused files under `apps/backend/src/cv-sanitization`:

- `config/`: parse and validate pool env vars.
- `jobs/`: job entity, statuses, service methods for create/reserve/complete/retry/fail/wait.
- `workers/`: worker entity and state transition helpers.
- `pool/`: pool manager startup reconciliation, periodic reconcile, assignment loop, health summary.
- `worker-runtime/`: Docker runtime interface and CLI implementation.
- `sanitizer/`: `DisposableGhostscriptSanitizer` implementing `CleanCvSanitizer`.
- `output/`: stricter clean PDF validation.

The public controller must not manage Docker. `CvSanitizationService` remains the business boundary and calls only `CleanCvSanitizer`.

## Persistence

Create two new tables.

### `cv_sanitization_jobs`

Fields:

- `id`
- `application_id`
- `original_cv_document_id`
- `clean_cv_document_id` nullable
- `worker_id` nullable
- `status`
- `attempt`
- `max_attempts`
- `input_hash`
- `output_hash` nullable
- `error_code` nullable
- `error_message_safe` nullable
- `container_exit_code` nullable
- `queued_at`
- `assigned_at` nullable
- `started_at` nullable
- `finished_at` nullable
- `lease_expires_at` nullable
- `created_at`
- `updated_at`

Statuses:

- `QUEUED`
- `ASSIGNED`
- `PROCESSING`
- `SUCCEEDED`
- `FAILED`
- `TIMEOUT`
- `RETRY_PENDING`
- `CANCELLED`

Indexes:

- queued/retry lookup: `(status, queued_at)`
- application/CV lookup: `(application_id, original_cv_document_id)`
- stale lease lookup: `(status, lease_expires_at)` where lease is not null
- idempotency unique partial index on `(application_id, original_cv_document_id, input_hash)` for active states
- worker lookup: `(worker_id)` where not null

### `cv_sanitizer_workers`

Fields:

- `id`
- `runtime_type`
- `runtime_container_id` nullable
- `runtime_container_name` nullable
- `status`
- `current_job_id` nullable
- `created_at`
- `ready_at` nullable
- `reserved_at` nullable
- `started_at` nullable
- `terminated_at` nullable
- `last_heartbeat_at` nullable
- `lease_expires_at` nullable
- `failure_reason` nullable
- `updated_at`

Statuses:

- `STARTING`
- `READY`
- `RESERVED`
- `PROCESSING`
- `TERMINATING`
- `TERMINATED`
- `FAILED`

Indexes:

- ready worker lookup: `(status, ready_at)`
- stale lease lookup: `(status, lease_expires_at)` where lease is not null
- runtime container lookup: `(runtime_container_id)` where not null
- current job unique partial index on `current_job_id` where not null
- non-terminal capacity lookup: `(status, created_at)`

## Queue And Locking

Use PostgreSQL row locks through TypeORM query runners.

Assignment transaction:

1. Select one job in `QUEUED` or `RETRY_PENDING` ordered by `queued_at` with `FOR UPDATE SKIP LOCKED`.
2. Select one worker in `READY` ordered by `ready_at` with `FOR UPDATE SKIP LOCKED`.
3. If no worker exists, keep the job queued.
4. Update worker to `RESERVED`, set `current_job_id`.
5. Update job to `ASSIGNED`, set `worker_id`, `attempt`, `assigned_at`, and `lease_expires_at`.
6. Commit.
7. Process outside the transaction.

No transition from `PROCESSING` back to `READY` is allowed.

## Pool Manager Lifecycle

The pool manager runs as a separate process with `CV_SANITIZER_POOL_MANAGER=true` and `CV_SANITIZER_POOL_ENABLED=true`.

Startup:

- Mark non-terminal worker rows without live containers as failed/terminated.
- Remove orphan containers with labels `vcs.component=cv-sanitizer-worker`.
- Requeue or fail expired jobs based on retry policy.
- Create workers until `ready + starting >= minReadyWorkers` without exceeding `maxWorkers`.

Periodic reconcile:

- Maintain ready capacity.
- Assign queued jobs to ready workers.
- Recover expired leases.
- Terminate stale/orphan workers.

Shutdown:

- Stop loops.
- Best-effort terminate owned non-terminal workers, but do not mark jobs successful.

## Worker Runtime

Use a pre-started container that waits for a single descriptor file in a job-specific control mount.

Mounts per worker:

- `/control`: job-specific control directory, read-write.
- `/input`: job-specific input directory, read-only, containing only one original PDF.
- `/output`: job-specific temporary output directory, read-write.
- `/tmp`: tmpfs.

The worker process:

1. Starts and writes `ready.json` or waits for descriptor readiness.
2. Waits for `/control/job.json` within ready timeout.
3. Validates descriptor paths are relative names only.
4. Runs Ghostscript with argument array.
5. Writes `/control/result.json`.
6. Exits.

It must never expose a port or run a multi-request HTTP server.

## Docker Security Controls

`SanitizerContainerRuntime` must create workers with:

- `--network none`
- `--user 65534:65534` or dedicated non-root user
- `--read-only`
- `--cap-drop ALL`
- `--security-opt no-new-privileges`
- `--pids-limit 128`
- `--memory 512m`
- `--cpus 1`
- `--tmpfs /tmp:rw,noexec,nosuid,size=64m`
- job-specific bind mounts only
- labels `vcs.component=cv-sanitizer-worker`, `vcs.workerId=<uuid>`, `vcs.version=<version>`

The disposable worker must not mount:

- Docker socket
- backend source
- DB credentials
- JWT/SMTP/AI secrets
- whole quarantine storage
- whole safe storage

Only the pool-manager service should have Docker runtime access.

## Output Validation

Validation remains in backend-side trusted code and is strengthened to check:

- output exists
- non-empty regular file
- not a symbolic link
- size within limit
- path is inside the job temp output directory
- PDF magic bytes
- MIME is PDF by existing detection or conservative extension/magic fallback
- optional metadata/page parse if existing library can do it cheaply
- SHA-256 hash

Only after validation does the pool manager copy the output to the requested safe storage path, and only after that does `CvSanitizationService` create the CLEAN `CvDocument`.

## Retry, Timeout, Lease

Config:

- `CV_SANITIZER_POOL_ENABLED`
- `CV_SANITIZER_POOL_MIN_READY`
- `CV_SANITIZER_POOL_MAX_WORKERS`
- `CV_SANITIZER_JOB_TIMEOUT_MS`
- `CV_SANITIZER_MAX_ATTEMPTS`
- `CV_SANITIZER_READY_TIMEOUT_MS`
- `CV_SANITIZER_RECONCILE_INTERVAL_MS`
- `CV_SANITIZER_WORKER_IMAGE`
- `CV_SANITIZER_CONTROL_DIR`
- `CV_SANITIZER_JOB_WAIT_TIMEOUT_MS`

Validation:

- `minReady >= 0`
- `maxWorkers >= 1`
- `minReady <= maxWorkers`
- timeouts > 0
- `maxAttempts >= 1`

Retryable errors:

- `WORKER_START_FAILED`
- `WORKER_CRASHED`
- `GHOSTSCRIPT_TRANSIENT_FAILURE`
- `CONTAINER_RUNTIME_ERROR`
- `SANITIZER_TIMEOUT`

Non-retryable errors:

- `INVALID_PDF`
- `UNSUPPORTED_FILE`
- input-caused `OUTPUT_VALIDATION_FAILED`
- `APPLICATION_TERMINAL`
- `JOB_CANCELLED`

Every retry gets a new worker and increments attempt history through workflow/audit metadata.

## Workflow And Audit

Add application statuses if needed:

- `CV_SANITIZE_QUEUED`
- `CV_SANITIZE_TIMEOUT`

Frontend labels should be updated for these statuses if added.

Audit actions:

- `CV_SANITIZATION_JOB_CREATED`
- `CV_SANITIZATION_ASSIGNED`
- `CV_SANITIZATION_STARTED`
- `CV_SANITIZATION_SUCCEEDED`
- `CV_SANITIZATION_FAILED`
- `CV_SANITIZATION_TIMEOUT`
- `CV_SANITIZATION_RETRIED`

Operational audit/log actions:

- `SANITIZER_WORKER_CREATED`
- `SANITIZER_WORKER_READY`
- `SANITIZER_WORKER_RESERVED`
- `SANITIZER_WORKER_TERMINATED`
- `SANITIZER_WORKER_FAILED`
- `SANITIZER_WORKER_ORPHAN_REMOVED`
- `SANITIZER_POOL_RECONCILED`

Metadata must include correlation fields where available:

- `applicationId`
- `cvDocumentId`
- `sanitizationJobId`
- `workerId`
- `attempt`
- `requestId`

Runtime container ID must not be exposed through public API.

## Public Apply Contract

Keep the current synchronous public apply behavior:

```text
upload original
-> create/await sanitization job
-> clean CV available
-> parse clean CV
-> response success
```

If no worker becomes available before wait timeout, return a public-safe sanitizer failure or timeout response. Do not switch to `202 Accepted` without a separate product decision.

Update success copy to:

```text
CV accepted. PDF sanitization and parsing completed successfully.
```

Keep malware scan disabled metadata explicit:

- `scannerSkipped = true`
- `scannerResult = SKIPPED`
- `reasonCode = MALWARE_SCAN_DISABLED`

Remove or avoid `threatDetected = false` if doing so does not break existing contracts; otherwise document it as compatibility metadata, not scanner proof.

## Docker Changes

Replace the long-lived `cv-sanitizer` HTTP service with:

- a `sanitizer-pool-manager` service using backend code in pool-manager mode and Docker runtime access
- a disposable `cv-sanitizer-worker` image target with a one-job worker entrypoint

Backend Compose env changes:

- `CV_PDF_SANITIZER_MODE=DISPOSABLE_POOL`
- no dependency on HTTP `cv-sanitizer`
- shared storage/control volumes as needed for DB job coordination and file handoff

Worker image:

- Ghostscript installed with pinned package version where the base image allows it
- non-root user
- no HTTP server
- one-job Node worker script
- compatibility label/version

## Health

Add a pool health summary service usable by backend/admin health without exposing internals:

- pool manager running
- container runtime reachable
- worker image available
- ready worker count
- queued job count
- stale worker count

Statuses:

- `UP`: ready workers meet minReady and runtime is reachable
- `DEGRADED`: below minReady but runtime can create workers
- `DOWN`: runtime unavailable or worker creation impossible

Admin operational endpoint is optional. If added, require `ADMIN` and return only summary counts.

## Files To Modify

- `apps/backend/src/cv-sanitization/cv-sanitization.module.ts`
- `apps/backend/src/cv-sanitization/cv-sanitization.service.ts`
- `apps/backend/src/cv-sanitization/sanitizer/clean-cv-sanitizer.interface.ts`
- `apps/backend/src/cv-documents/cv-documents.service.ts`
- `apps/backend/src/job-postings/public-job-postings.controller.ts`
- `apps/backend/src/recruitment-common/enums/recruitment.enum.ts`
- `apps/backend/src/app.module.ts`
- `apps/backend/src/config/typeorm.config.ts`
- `apps/backend/.env.example`
- `apps/backend/package.json`
- `apps/frontend/src/types/recruitment.ts`
- `apps/frontend/src/components/recruitment/status.ts`
- `docker-compose.yml`
- `Dockerfile`

## Files To Create

- `apps/backend/src/cv-sanitization/config/cv-sanitizer-pool.config.ts`
- `apps/backend/src/cv-sanitization/jobs/cv-sanitization-job.entity.ts`
- `apps/backend/src/cv-sanitization/jobs/cv-sanitization-job.service.ts`
- `apps/backend/src/cv-sanitization/jobs/cv-sanitization-job-status.ts`
- `apps/backend/src/cv-sanitization/workers/cv-sanitizer-worker.entity.ts`
- `apps/backend/src/cv-sanitization/workers/cv-sanitizer-worker-status.ts`
- `apps/backend/src/cv-sanitization/workers/cv-sanitizer-worker-state.ts`
- `apps/backend/src/cv-sanitization/pool/sanitizer-pool-manager.service.ts`
- `apps/backend/src/cv-sanitization/pool/sanitizer-pool-health.service.ts`
- `apps/backend/src/cv-sanitization/worker-runtime/sanitizer-container-runtime.interface.ts`
- `apps/backend/src/cv-sanitization/worker-runtime/docker-cli-sanitizer-container-runtime.ts`
- `apps/backend/src/cv-sanitization/sanitizer/disposable-ghostscript-sanitizer.ts`
- `apps/backend/src/cv-sanitization/output/clean-pdf-output-validator.ts`
- `apps/backend/src/cv-sanitization/pool-manager.main.ts`
- `apps/backend/src/migrations/<timestamp>-CreateCvSanitizationPool.ts`
- `apps/cv-sanitizer/worker.js`
- `docs/cv-sanitizer-disposable-pool.md`

## Assumptions

- Docker CLI is available in the pool-manager runtime.
- Pool-manager and backend can share the same Postgres database.
- Pool-manager can access quarantine, safe, and control volumes, but disposable workers get only job-specific mounts.
- Public apply remains synchronous.
- PDF-only public apply remains unchanged.
- Existing dev apps are already running as stated in repo instructions.
- No unit test files will be added unless the repo instruction prohibiting them is changed.

## Rollback

- Set `CV_SANITIZER_POOL_ENABLED=false`.
- Set `CV_PDF_SANITIZER_MODE=GHOSTSCRIPT_DOCKER` or `HTTP_SERVICE` only if the fallback adapter/service is intentionally kept during rollout.
- Stop the pool-manager service.
- Remove orphan worker containers by label `vcs.component=cv-sanitizer-worker`.
- Revert the migration with TypeORM migration revert when allowed.
- Remove job-specific temp/control directories.

