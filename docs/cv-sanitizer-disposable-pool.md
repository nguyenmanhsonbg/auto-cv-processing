# CV Sanitizer Disposable Pool

The CV sanitizer supports `CV_PDF_SANITIZER_MODE=DISPOSABLE_POOL`.

In this mode, the public backend writes a DB job and waits synchronously for the result. A separate pool-manager process owns Docker runtime access, keeps a small pool of ready one-job Ghostscript workers, assigns one job to one worker, validates the generated PDF, copies it to safe storage, and terminates the worker.

## Services

- Backend: creates and waits for sanitization jobs through `CvSanitizationService`.
- Pool manager: run `pnpm --filter @interview-assistant/backend start:pool-manager` from a built backend image or dist tree.
- Disposable worker: Docker target `cv-sanitizer-worker`; runs `apps/cv-sanitizer/worker.js` and exits after one descriptor.

The disposable worker exposes no port and must not receive application secrets, DB credentials, backend source, the Docker socket, whole quarantine storage, or whole safe storage.

## Environment

Required for backend and pool-manager:

```bash
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

Set `CV_SANITIZER_POOL_MANAGER=true` only on the pool-manager process. Keep it false or unset on the public backend.

The pool-manager process needs Docker CLI access. In Docker Compose this is wired by mounting `/var/run/docker.sock` into `sanitizer-pool-manager`. The control directory used by the runtime must be visible both to the pool-manager process and to the Docker daemon that creates worker containers.

## Workflow

Public apply remains synchronous:

```text
upload original CV
-> scanner is explicitly marked SKIPPED
-> create or reuse sanitization job
-> wait for pool-manager to complete the job
-> validate clean PDF in trusted backend code
-> create CLEAN CvDocument
-> parse clean CV
-> return success
```

Success copy:

```text
CV accepted. PDF sanitization and parsing completed successfully.
```

If no worker finishes before `CV_SANITIZER_JOB_WAIT_TIMEOUT_MS`, the request returns a public-safe `CV_SANITIZE_TIMEOUT` error and the application is moved to `CV_SANITIZE_TIMEOUT`.

## Statuses

Application statuses added:

- `CV_SANITIZE_QUEUED`
- `CV_SANITIZE_TIMEOUT`

Job statuses:

- `QUEUED`
- `ASSIGNED`
- `PROCESSING`
- `SUCCEEDED`
- `FAILED`
- `TIMEOUT`
- `RETRY_PENDING`
- `CANCELLED`

Worker statuses:

- `STARTING`
- `READY`
- `RESERVED`
- `PROCESSING`
- `TERMINATING`
- `TERMINATED`
- `FAILED`

## Rollback

1. Set `CV_SANITIZER_POOL_ENABLED=false`.
2. Set `CV_PDF_SANITIZER_MODE=GHOSTSCRIPT_DOCKER` or `HTTP_SERVICE` only if the fallback runtime is intentionally available.
3. Stop the pool-manager process.
4. Remove orphan worker containers:

```bash
docker rm -f $(docker ps -aq --filter label=vcs.component=cv-sanitizer-worker)
```

5. Remove stale control directories under `CV_SANITIZER_CONTROL_DIR`.

Migration run/revert is intentionally not documented as an executed step here because the repository instructions for this implementation pass prohibit running migration commands.

## Scan Metadata

Malware scanning remains disabled in the current public apply flow. Metadata records:

- `scannerSkipped=true`
- `scannerResult=SKIPPED`
- `reasonCode=MALWARE_SCAN_DISABLED`

The existing `threatDetected=false` field is kept as compatibility metadata only. It is not proof that a malware scanner ran.

