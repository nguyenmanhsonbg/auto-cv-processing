# Public apply DISPOSABLE_POOL CV processing specification

Ngay cap nhat: 2026-07-22

Tai lieu nay dac ta rieng tinh nang xu ly CV sach bang
`CV_PDF_SANITIZER_MODE=DISPOSABLE_POOL` trong he thong hien tai. Muc tieu la
mo ta du ro de co the ap dung pattern nay cho mot he thong khac: API public
apply tao job trong DB, pool manager khoi tao disposable worker image co
Ghostscript, moi worker xu ly dung mot CV, tao clean PDF vao safe storage, roi
terminate.

Tai lieu lien quan:

- `docs/function-flow-specification/public-apply-current-flow.md`
- `docs/cv-sanitizer-disposable-pool.md`
- `apps/backend/src/cv-sanitization/*`
- `apps/cv-sanitizer/worker.js`
- `Dockerfile`
- `docker-compose.yml`

## 1. Pham vi

Pham vi cua spec:

- Duong di public apply PDF CV khi sanitizer mode la `DISPOSABLE_POOL`.
- Cach original CV di tu quarantine storage sang clean CV trong safe storage.
- Cach backend API, DB job queue, pool manager, Docker worker image va
  Ghostscript phoi hop.
- Trang thai chinh cua application, CV document, sanitizer job va worker.
- Retry, timeout, idempotency, output validation va rollback van hanh.

Ngoai pham vi:

- AI screening, CV-JD mapping, HR review.
- Malware scanner that. He thong hien tai dang mark scan la skipped-as-passed.
- Build/deploy pipeline day du. Spec chi neu cac requirement can thiet de ap
  dung tinh nang.

## 2. Ket qua mong muon

Voi public apply thanh cong:

1. Original PDF duoc luu vao quarantine storage.
2. Original CV duoc danh dau scan `PASSED` voi metadata scanner skipped.
3. Backend tao hoac reuse `cv_sanitization_jobs`.
4. Pool manager gan job cho mot disposable worker READY.
5. Worker image chay `apps/cv-sanitizer/worker.js`, goi Ghostscript de rewrite
   PDF.
6. Pool manager validate output tam, copy sang safe storage, validate lai safe
   output.
7. Backend tao `CvDocument` loai `CLEAN`, `storageZone=SAFE`,
   `sanitizeStatus=SANITIZED`.
8. Backend parse clean CV tu safe storage va tao `ParsedProfile`.
9. API public apply tra success chi sau khi sanitize va parse thanh cong.

## 3. Dieu kien cau hinh

Backend API va pool-manager cung phai co:

```env
CV_PDF_SANITIZER_MODE=DISPOSABLE_POOL
CV_SANITIZER_POOL_ENABLED=true
CV_SANITIZER_POOL_MIN_READY=1
CV_SANITIZER_POOL_MAX_WORKERS=2
CV_SANITIZER_JOB_TIMEOUT_MS=60000
CV_SANITIZER_MAX_ATTEMPTS=2
CV_SANITIZER_READY_TIMEOUT_MS=30000
CV_SANITIZER_RECONCILE_INTERVAL_MS=1000
CV_SANITIZER_JOB_WAIT_TIMEOUT_MS=90000
CV_SANITIZER_WORKER_IMAGE=auto-cv-processing-cv-sanitizer-worker:latest
CV_SANITIZER_CONTROL_DIR=./storage/cv-sanitizer-control
```

Chi process pool-manager co:

```env
CV_SANITIZER_POOL_MANAGER=true
```

Backend API public thong thuong de:

```env
CV_SANITIZER_POOL_MANAGER=false
```

Rang buoc:

- `CV_SANITIZER_POOL_MIN_READY <= CV_SANITIZER_POOL_MAX_WORKERS`.
- Pool manager can truy cap Docker CLI/daemon.
- Backend API va pool manager can dung chung PostgreSQL.
- Pool manager can doc quarantine storage va ghi safe storage.
- Worker container khong duoc mount toan bo quarantine/safe storage.
- Worker image phai co Ghostscript va one-job worker entrypoint.

Ghi chu he thong hien tai:

- `docker-compose.yml` da cau hinh backend API va `sanitizer-pool-manager`
  theo `DISPOSABLE_POOL`.
- Local `apps/backend/.env` hien tai co the van de
  `CV_PDF_SANITIZER_MODE=HTTP_SERVICE`; neu chay dev local thi can doi sang
  `DISPOSABLE_POOL` va chay pool manager rieng neu muon test dung mode nay.

## 4. Thanh phan

| Thanh phan | Vai tro |
| --- | --- |
| Public apply frontend | Gui multipart `cvFile` PDF toi endpoint apply va cho response dong bo. |
| `PublicJobPostingsController` | Entry point apply, validate payload/file, tao application, upload original CV, await sanitize va parse. |
| `CvDocumentsService` | Luu original CV vao quarantine, tinh hash, quan ly version, mark scan skipped-as-passed, goi sanitize. |
| `CvSanitizationService` | Kiem tra precondition, tao safe output path, goi sanitizer adapter, tao clean CV khi thanh cong. |
| `DisposableGhostscriptSanitizer` | Adapter trong backend API: tao/reuse DB job, wait job terminal, tra ket qua cho service. |
| `CvSanitizationJobService` | DB queue, idempotency theo input hash, reserve assignment, retry, timeout, recover lease. |
| `SanitizerPoolManagerService` | Process rieng duy tri pool, tao worker container, assign job, validate/copy output, terminate worker. |
| `DockerCliSanitizerContainerRuntime` | Wrapper Docker CLI de create/prepare/wait/terminate disposable worker. |
| `cv-sanitizer-worker` image | Docker image nho, co Ghostscript, chay one-job worker script va exit. |
| `CleanPdfOutputValidator` | Validate clean PDF: path, symlink, size, magic bytes `%PDF-`, sha256. |
| `CvParsingService` | Chi parse clean CV trong safe storage sau khi sanitize thanh cong. |

## 5. Public apply sequence

Endpoint:

```http
POST /api/public/job-postings/:jobPostingId/apply
Content-Type: multipart/form-data
```

Fields:

- `fullName`
- `email`
- `phone`
- `note`
- `cvFile`
- optional header `Idempotency-Key`

Happy path:

```text
Frontend
-> POST public apply
-> multer saves uploaded PDF to quarantine root
-> validate extension, size, server-generated filename, PDF signature
-> quick parse original PDF to check CV signals
-> rate limit and record PUBLIC_APPLY_RECEIVED
-> create/reuse Application and Candidate
-> create ORIGINAL CvDocument in QUARANTINE
-> mark scan PASSED with scanner skipped metadata
-> prepare sanitize
-> create/reuse cv_sanitization_jobs row
-> wait for pool manager result
-> create CLEAN CvDocument in SAFE
-> parse clean CV
-> return CV_ACCEPTED response
```

Important current-system note:

- Public apply currently parses the uploaded original PDF before sanitization in
  `assertUploadedFileLooksLikeResume()` to reject non-CV files early.
- Business parsing is done from clean CV only, but this early resume-signal
  check still touches quarantine/original content.
- If a target system requires "no parser touches original CV", replace this
  early check with one of:
  - sanitize first, then validate resume signals on clean CV;
  - run the early check inside the same disposable worker isolation boundary;
  - remove early resume validation and rely on post-sanitize parse validation.

## 6. CV document lifecycle

Original CV:

```text
documentType=ORIGINAL
storageZone=QUARANTINE
scanStatus=PENDING -> PASSED
sanitizeStatus=PENDING -> SANITIZING -> SANITIZED
parseStatus=PENDING
isCurrent=true -> false after clean CV becomes current
```

Clean CV:

```text
documentType=CLEAN
storageZone=SAFE
scanStatus=PASSED
sanitizeStatus=SANITIZED
parseStatus=PENDING -> PARSING -> PARSED
isCurrent=true
```

Original CV fields:

- `originalFileName`: normalized original upload filename.
- `mimeType`: `application/pdf`.
- `fileSize`: uploaded file size.
- `originalFileHash`: sha256 of quarantine file.
- `storagePath`: quarantine storage key, not raw public path.

Clean CV fields:

- `originalFileHash`: hash inherited from original version.
- `cleanFileHash`: sha256 of safe clean PDF.
- `storagePath`: safe storage key.
- `versionNo`: same version as original CV.

## 7. Application state flow

Happy path:

```text
APPLICATION_CREATED
-> CV_UPLOADED
-> CV_STORED_QUARANTINE
-> CV_SCAN_PASSED
-> CV_SANITIZE_QUEUED
-> CV_SANITIZED
-> CV_PARSED
-> PROFILE_DUPLICATE_CHECKED or PROFILE_DUPLICATE_NEEDS_REVIEW
```

Failure paths:

```text
CV_SCAN_PASSED
-> CV_SANITIZE_QUEUED
-> CV_SANITIZE_FAILED
```

```text
CV_SCAN_PASSED
-> CV_SANITIZE_QUEUED
-> CV_SANITIZE_TIMEOUT
```

```text
CV_SANITIZED
-> CV_PARSE_FAILED
```

In current public apply, sanitize and parse are awaited in the same HTTP
request. Therefore response success means clean CV and parsed profile already
exist. Form session generation happens later in background.

## 8. Sanitization job model

Table: `cv_sanitization_jobs`

Required fields:

- `id`
- `application_id`
- `original_cv_document_id`
- `clean_cv_document_id`
- `worker_id`
- `status`
- `attempt`
- `max_attempts`
- `input_hash`
- `source_file_path`
- `source_storage_path`
- `source_mime_type`
- `output_file_path`
- `output_storage_path`
- `output_hash`
- `error_code`
- `error_message_safe`
- `container_exit_code`
- `queued_at`
- `assigned_at`
- `started_at`
- `finished_at`
- `lease_expires_at`

Core indexes:

- queue lookup: `(status, queued_at)`
- application/CV lookup: `(application_id, original_cv_document_id)`
- stale lease lookup: `(status, lease_expires_at)` where lease exists
- worker lookup: `worker_id` where not null
- active input uniqueness:
  `(application_id, original_cv_document_id, input_hash)` where status is
  `QUEUED`, `ASSIGNED`, `PROCESSING`, or `RETRY_PENDING`

Job statuses:

```text
QUEUED
ASSIGNED
PROCESSING
SUCCEEDED
FAILED
TIMEOUT
RETRY_PENDING
CANCELLED
```

Happy path:

```text
QUEUED -> ASSIGNED -> PROCESSING -> SUCCEEDED
```

Retry path:

```text
QUEUED -> ASSIGNED -> PROCESSING -> RETRY_PENDING
RETRY_PENDING -> ASSIGNED -> PROCESSING -> SUCCEEDED
```

Timeout/failure path:

```text
QUEUED/ASSIGNED/PROCESSING/RETRY_PENDING -> FAILED or TIMEOUT
```

Retryable reason codes:

- `WORKER_START_FAILED`
- `WORKER_CRASHED`
- `GHOSTSCRIPT_TRANSIENT_FAILURE`
- `CONTAINER_RUNTIME_ERROR`
- `SANITIZER_TIMEOUT`

## 9. Worker pool model

Table: `cv_sanitizer_workers`

Required fields:

- `id`
- `runtime_type`
- `runtime_container_id`
- `runtime_container_name`
- `status`
- `current_job_id`
- `created_at`
- `ready_at`
- `reserved_at`
- `started_at`
- `terminated_at`
- `last_heartbeat_at`
- `lease_expires_at`
- `failure_reason`

Worker statuses:

```text
STARTING
READY
RESERVED
PROCESSING
TERMINATING
TERMINATED
FAILED
```

Happy path:

```text
STARTING -> READY -> RESERVED -> PROCESSING -> TERMINATED
```

Capacity-counting statuses:

- `STARTING`
- `READY`
- `RESERVED`
- `PROCESSING`

Pool capacity behavior:

- `MIN_READY` la so worker ready/starting toi thieu khi con capacity.
- `MAX_WORKERS` la tong capacity toi da, tinh ca worker dang starting, ready,
  reserved, processing.
- Neu `MIN_READY=2` va `MAX_WORKERS=2`, idle pool co 2 worker READY.
- Khi 1 worker dang PROCESSING, capacity van la 2, nen pool khong tao worker
  thu 3. Luc do chi con 1 worker READY.
- Neu muon vua co 1 worker processing vua giu 2 worker ready, can
  `MAX_WORKERS >= 3`.

## 10. Pool manager algorithm

Startup:

1. Chi chay neu `CV_SANITIZER_POOL_ENABLED=true` va
   `CV_SANITIZER_POOL_MANAGER=true`.
2. Remove orphan containers co label `vcs.component=cv-sanitizer-worker`.
3. Invalidate worker rows cu dang active thanh `FAILED`.
4. Recover active worker jobs thanh `RETRY_PENDING` hoac `FAILED`.
5. Recover expired job leases.
6. Bat dau reconcile loop theo `CV_SANITIZER_RECONCILE_INTERVAL_MS`.

Moi lan reconcile:

1. Recover expired job leases.
2. Recover expired worker leases.
3. Maintain ready capacity.
4. Assign queued jobs.

Maintain ready capacity:

```text
while readyOrStarting < MIN_READY and capacity < MAX_WORKERS:
  create worker row STARTING
  docker run disposable worker container
  wait ready.json
  mark worker READY
```

Assign queued jobs:

1. Transaction.
2. Select oldest job status `QUEUED` or `RETRY_PENDING` using
   `FOR UPDATE SKIP LOCKED`.
3. Select oldest worker status `READY` using `FOR UPDATE SKIP LOCKED`.
4. Mark worker `RESERVED`, set `currentJobId`, set lease.
5. Mark job `ASSIGNED`, increment `attempt`, set `workerId`, set lease.
6. Commit.
7. Process assignment async.

Process assignment:

1. Mark worker `PROCESSING`.
2. Mark job `PROCESSING`.
3. Prepare per-worker workspace.
4. Copy source PDF to worker input dir as `input.pdf`.
5. Write `job.json` in control dir.
6. Wait for container exit.
7. Read `result.json`.
8. If sanitized, validate temporary output, copy to safe path, validate safe
   output, mark job `SUCCEEDED`, mark worker `TERMINATED`.
9. If failed, call `failOrRetry()`, mark worker `FAILED`.
10. Always terminate/remove container and cleanup workspace.

## 11. Disposable worker image

The disposable worker image is built from the `cv-sanitizer-worker` Dockerfile
target:

```dockerfile
FROM node:${NODE_VERSION}-alpine AS cv-sanitizer-worker
WORKDIR /app
RUN apk add --no-cache ghostscript
COPY apps/cv-sanitizer/worker.js ./worker.js
CMD ["node", "worker.js"]
```

Image requirement:

- Base runtime can execute Node.js worker script.
- Ghostscript binary `gs` must be installed.
- Image does not expose a port.
- Image does not need backend source, application secrets, DB credentials, or
  Docker socket.
- Entrypoint must wait for one job descriptor, process one PDF, write one result
  descriptor, then exit.

Compose build target:

```yaml
cv-sanitizer-worker:
  image: auto-cv-processing-cv-sanitizer-worker:latest
  build:
    context: .
    dockerfile: Dockerfile
    target: cv-sanitizer-worker
  command: ["true"]
```

The `command: ["true"]` service exists so Compose builds the worker image. The
pool manager later creates real disposable containers from that image with
`docker run`.

Build/start lifecycle:

```text
source tree
-> Dockerfile target cv-sanitizer-worker
-> install ghostscript into worker image
-> copy worker.js into image
-> tag image as CV_SANITIZER_WORKER_IMAGE
-> pool manager docker run <CV_SANITIZER_WORKER_IMAGE>
-> worker writes ready.json
-> pool manager marks worker READY
```

For another system, keep the worker image intentionally small. It only needs:

- OS packages required by Ghostscript;
- a runtime for the one-job entrypoint;
- the worker entrypoint script;
- no API server, no app modules, no database client, no credentials.

## 12. Worker container runtime

Pool manager creates workers with Docker CLI. Current guard rails:

```text
docker run -d
  --name vcs-cv-sanitizer-<workerId>
  --network none
  --user 65534:65534
  --read-only
  --cap-drop ALL
  --security-opt no-new-privileges
  --pids-limit 128
  --memory 512m
  --cpus 1
  --tmpfs /tmp:rw,noexec,nosuid,size=64m
  --label vcs.component=cv-sanitizer-worker
  --label vcs.workerId=<workerId>
  --label vcs.version=<version>
  -v <controlDir>/<workerId>/control:/control:rw
  -v <controlDir>/<workerId>/input:/input:ro
  -v <controlDir>/<workerId>/output:/output:rw
  <CV_SANITIZER_WORKER_IMAGE>
```

Workspace layout per worker:

```text
CV_SANITIZER_CONTROL_DIR/
  <workerId>/
    control/
      ready.json
      job.json
      result.json
    input/
      input.pdf
    output/
      output.pdf
```

Mount policy:

- `/input` is read-only.
- `/output` is writable.
- `/control` is writable for ready/job/result descriptors.
- Worker sees only its per-job copied input file.
- Worker does not see whole quarantine storage.
- Worker does not see whole safe storage.
- Worker does not receive app env secrets.
- Worker has no network.

## 13. Worker job protocol

Ready descriptor:

```json
{
  "readyAt": "2026-07-22T00:00:00.000Z"
}
```

Job descriptor written by pool manager:

```json
{
  "jobId": "<uuid>",
  "inputFileName": "input.pdf",
  "outputFileName": "output.pdf",
  "sourceMimeType": "application/pdf",
  "requestedAt": "2026-07-22T00:00:00.000Z"
}
```

Successful result descriptor:

```json
{
  "status": "SANITIZED",
  "outputFileName": "output.pdf",
  "exitCode": 0,
  "reasonCode": null,
  "errorMessageSafe": null,
  "durationMs": 1234
}
```

Failed result descriptor:

```json
{
  "status": "FAILED",
  "outputFileName": null,
  "exitCode": 1,
  "reasonCode": "GHOSTSCRIPT_SANITIZE_FAILED",
  "errorMessageSafe": "Ghostscript failed to sanitize the PDF.",
  "durationMs": 1234
}
```

Worker input validation:

- `inputFileName` and `outputFileName` must be plain relative file names.
- Values cannot contain `/` or `\`, cannot be `.` or `..`, and cannot be
  absolute paths.
- This prevents path traversal through job descriptors.

## 14. Ghostscript sanitization command

The worker calls Ghostscript:

```text
gs
  -dSAFER
  -dBATCH
  -dNOPAUSE
  -sDEVICE=pdfwrite
  -dCompatibilityLevel=1.7
  -dPDFSETTINGS=/printer
  -dDetectDuplicateImages=true
  -dCompressFonts=true
  -sOutputFile=/output/output.pdf
  /input/input.pdf
```

Purpose:

- Rewrites the PDF through Ghostscript `pdfwrite`.
- Drops active or unsupported structures that do not survive the rewrite.
- Produces a normalized clean PDF artifact for downstream parsing and review.

Limits:

- This is PDF sanitization, not malware scanning.
- It does not prove the original file was safe.
- It should be combined with a real malware scanner if the threat model requires
  malware detection before any parser touches uploaded content.

## 15. Output validation

Pool manager validates twice:

1. Temporary output in worker output dir.
2. Final copied output in safe storage.

Validator checks:

- resolved path is inside expected output directory when expected parent is
  provided;
- output is not a symbolic link;
- output exists and is a regular file;
- output size is greater than 0;
- output size is not greater than `CV_SANITIZER_MAX_OUTPUT_BYTES` or default
  20 MB;
- first bytes match `%PDF-`;
- sha256 hash is calculated.

Only after safe storage validation succeeds does the system mark job
`SUCCEEDED` and later create a clean CV document.

## 16. Backend adapter behavior

`DisposableGhostscriptSanitizer.sanitize()`:

1. Rejects non-`application/pdf` input with `UNSUPPORTED_SANITIZER_INPUT`.
2. Reads pool config from env.
3. If pool disabled, returns failed result `SANITIZER_POOL_NOT_ENABLED`.
4. Calls `createOrReuseJob()`.
5. Waits for terminal job until `CV_SANITIZER_JOB_WAIT_TIMEOUT_MS`.
6. If job succeeded, returns `SANITIZED` with output path, job id, worker id,
   attempt.
7. If job failed/timed out/cancelled, returns failed result with safe reason
   code.

Backend wait timeout:

- If API wait timeout expires before pool manager completes the job, job is
  marked `TIMEOUT` with `SANITIZER_POOL_WAIT_TIMEOUT`.
- Public apply returns `CV_SANITIZE_TIMEOUT` with HTTP 503.

## 17. Error mapping

Important public error mapping:

| Internal condition | Public code | HTTP |
| --- | --- | --- |
| Worker/job wait timeout | `CV_SANITIZE_TIMEOUT` | 503 |
| Pool disabled or runtime unavailable | `CV_SANITIZE_FAILED` | 503 |
| Ghostscript failure | `CV_SANITIZE_FAILED` | 503 |
| Invalid sanitizer input | `CV_SANITIZE_FAILED` or `UNSUPPORTED_FILE_TYPE` depending source | 422/400 |
| Clean output invalid | `CV_SANITIZE_FAILED` | 503 |
| Parse clean CV failed | `CV_PARSE_FAILED` | 422/503 |
| File not likely CV | `CV_NOT_RESUME` | 422 |
| Duplicate application | `DUPLICATE_APPLICATION` | 409 |
| Duplicate CV file | `DUPLICATE_CV_FILE` | 409 |
| Idempotency key conflict | `IDEMPOTENCY_CONFLICT` | 409 |

Sanitize failure persistence:

- Original CV `sanitizeStatus=FAILED`.
- If application pointed to the original CV, `currentCvDocumentId` is cleared.
- Application moves to `CV_SANITIZE_FAILED` or `CV_SANITIZE_TIMEOUT`.
- Audit metadata records reason code, job id, worker id, attempt, retryAllowed.

## 18. Idempotency and duplicate behavior

Upload idempotency:

- `Idempotency-Key` is hashed and stored in audit/workflow metadata.
- Same key + different file hash returns `IDEMPOTENCY_CONFLICT`.
- Same key + same file records idempotent retry and discards duplicate upload.
- Same application + same original file hash without idempotent replay returns
  `DUPLICATE_CV_FILE`.

Sanitization idempotency:

- Before creating a new job, service checks whether a clean CV already exists
  for same application, version, sanitize status, and original file hash.
- Job service hashes:
  - `applicationId`
  - `originalCvDocumentId`
  - `originalFileHash` or `sourceStoragePath`
  - `sourceMimeType`
- Active unique index prevents duplicate active jobs for same input.

## 19. Security requirements for another system

Minimum controls to reuse this pattern:

1. Store original uploads in quarantine storage.
2. Never expose quarantine files to normal business users.
3. Create clean PDF only through isolated disposable workers.
4. Give worker only a per-job copied input file.
5. Do not mount application source into worker.
6. Do not pass application secrets, DB credentials, cloud credentials, or Docker
   socket into worker.
7. Run worker with no network.
8. Run worker as non-root user.
9. Drop Linux capabilities.
10. Use read-only root filesystem.
11. Limit CPU, memory and process count.
12. Validate output path and reject symlinks.
13. Validate clean output after copying to safe storage.
14. Store output hash and metadata.
15. Parse only clean CV from safe storage for business workflows.
16. Add a real malware scanner before sanitize if the system requires malware
   detection rather than only PDF rewriting.

## 20. Operational requirements

To deploy this feature in another system:

1. Add DB tables equivalent to `cv_sanitization_jobs` and
   `cv_sanitizer_workers`.
2. Add a sanitizer abstraction so backend API can select `DISPOSABLE_POOL`.
3. Add a pool-manager process that shares DB and storage with backend API.
4. Build a Ghostscript worker image with one-job entrypoint.
5. Give pool manager Docker runtime access.
6. Mount shared storage into backend API and pool manager, not into workers.
7. Configure env values for pool capacity, timeout, attempts, image name and
   control dir.
8. Add startup recovery for orphan containers, active jobs and expired leases.
9. Add output validation before creating clean CV records.
10. Add public-safe error mapping.
11. Add audit/workflow logs for upload, scan, job queued, sanitize success/fail,
    parse success/fail.

Health checks should monitor:

- pool manager process is running;
- Docker runtime is reachable by pool manager;
- worker image exists and can start;
- ready worker count;
- queued job count;
- stale worker lease count;
- old non-terminal jobs;
- repeated `WORKER_START_FAILED` or `CONTAINER_RUNTIME_ERROR`.

## 21. Rollback

Safe rollback steps:

1. Stop accepting new apply requests if needed.
2. Set backend `CV_SANITIZER_POOL_ENABLED=false`.
3. Switch `CV_PDF_SANITIZER_MODE` to a known available fallback only if the
   fallback is intentionally deployed, for example `HTTP_SERVICE` or
   `GHOSTSCRIPT_DOCKER`.
4. Stop pool-manager process.
5. Remove orphan worker containers by label:

```bash
docker rm -f $(docker ps -aq --filter label=vcs.component=cv-sanitizer-worker)
```

6. Remove stale per-worker control directories under
   `CV_SANITIZER_CONTROL_DIR`.
7. Keep DB job/worker rows for audit unless a data retention policy says
   otherwise.

## 22. Current implementation file map

Core code:

- `apps/backend/src/job-postings/public-job-postings.controller.ts`
- `apps/backend/src/cv-documents/cv-documents.service.ts`
- `apps/backend/src/cv-sanitization/cv-sanitization.service.ts`
- `apps/backend/src/cv-sanitization/cv-sanitization.module.ts`
- `apps/backend/src/cv-sanitization/sanitizer/disposable-ghostscript-sanitizer.ts`
- `apps/backend/src/cv-sanitization/jobs/cv-sanitization-job.service.ts`
- `apps/backend/src/cv-sanitization/jobs/cv-sanitization-job.entity.ts`
- `apps/backend/src/cv-sanitization/pool/sanitizer-pool-manager.service.ts`
- `apps/backend/src/cv-sanitization/pool/sanitizer-pool-health.service.ts`
- `apps/backend/src/cv-sanitization/worker-runtime/docker-cli-sanitizer-container-runtime.ts`
- `apps/backend/src/cv-sanitization/output/clean-pdf-output-validator.ts`
- `apps/backend/src/cv-sanitization/workers/cv-sanitizer-worker.entity.ts`
- `apps/backend/src/cv-parsing/cv-parsing.service.ts`
- `apps/cv-sanitizer/worker.js`

Build/runtime files:

- `Dockerfile`
- `docker-compose.yml`
- `apps/backend/package.json`
- `apps/backend/src/cv-sanitization/pool-manager.main.ts`

## 23. Acceptance criteria

Functional:

- Public apply with valid PDF returns success only after clean CV and parsed
  profile are created.
- A clean CV record is stored in safe storage and points to a valid PDF.
- Original CV remains in quarantine and is not exposed by clean-file endpoint.
- Worker processes one job and is terminated after completion.
- Multiple concurrent apply requests are serialized by DB job/worker locks and
  pool capacity.

Failure:

- If pool manager is not running, API times out with `CV_SANITIZE_TIMEOUT`.
- If Ghostscript fails, job becomes retry pending or failed based on attempt
  policy.
- If output is invalid or a symlink, clean CV is not created.
- If parse clean CV fails, application moves to `CV_PARSE_FAILED`.

Security:

- Worker container has no network.
- Worker container runs non-root, read-only root filesystem, no Linux
  capabilities, no new privileges.
- Worker sees only per-job `input.pdf`, `job.json`, and writable output/control
  directories.
- Worker image contains Ghostscript but not application secrets or DB access.

Operational:

- Pool manager removes orphan worker containers on startup.
- Expired job and worker leases are recovered.
- Active input uniqueness prevents duplicate active jobs.
- Logs/audit include enough metadata to trace application id, CV document id,
  sanitizer job id, worker id, attempt and reason code.
