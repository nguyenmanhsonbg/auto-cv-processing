# Open Security Issues Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Remediate the 17 currently open Security issues reported for project `auto-cv-processing` without changing any SonarQube issue status manually.

**Architecture:** Fix each issue at its source and preserve the current application behavior. Cryptographic randomness will be centralized per browser runtime and used for identifiers, jitter, and question shuffling; backend upload names will use Node `randomUUID`; child-process executables will use fixed absolute paths; and the sanitizer URL will be explicit configuration with HTTPS required in production. After each code batch, local verification will run first; the user will run SonarScanner, which alone may cause SonarQube to mark an issue as resolved/fixed.

**Tech Stack:** NestJS/TypeScript, React/Vite, Chrome extension TypeScript, Node.js, Docker Compose, Ghostscript, SonarQube Community Build.

## Global Constraints

- Do not call SonarQube issue-transition APIs or click a SonarQube status control. The assistant may only read issue state.
- Do not automatically set any issue to `Fixed`, `False Positive`, or `Won't Fix`.
- Preserve current functional behavior: upload filenames remain unique, questionnaire selection remains randomized, UI identifiers remain idempotent, Facebook timing remains jittered, and sanitizer Docker networking remains usable in local development.
- Use `pnpm` only for repository commands.
- Do not create or modify `*.spec.ts` or `*.test.ts` files because the repository explicitly forbids it.
- Do not run `pnpm build`, any other build command, `pnpm lint`, or any ESLint command.
- Run `pnpm typecheck` after every code batch and inspect `apps/backend/dev.log` and `apps/frontend/dev.log` as applicable.
- Do not use Git commands.
- A plan status of `Code fixed - awaiting Sonar scan` is an assistant tracking label only; it is not a SonarQube issue transition.

---

## Current inventory and tracking

Baseline read from the SonarQube Security issue list on 2026-08-10: 17 open issues, 13 Medium and 4 Low, with 0 High.

| # | Sonar issue ID | Rule/message | File and line | Impact | Tracking status |
|---:|---|---|---|---|---|
| 1 | `8b4202b1-96e8-45d0-b26d-54b17bfa4ddf` | `Math.random()` should be safe | `apps/backend/src/candidates/candidates.module.ts:23` | Medium | Code fixed - awaiting Sonar scan |
| 2 | `14ddff9a-48c5-46e7-8095-fee135871420` | HTTP protocol is insecure | `apps/backend/src/cv-sanitization/sanitizer/ghostscript-http-pdf-sanitizer.ts:12` | Low | Code fixed - awaiting Sonar scan |
| 3 | `ed44ae2d-c37f-4211-a4c6-2a6b261368b3` | `Math.random()` should be safe | `apps/backend/src/form-sessions/form-sessions.service.ts:437` | Medium | Code fixed - awaiting Sonar scan |
| 4 | `6e99113d-bb20-4280-b1e7-4d7e4b0a504c` | `PATH` must contain fixed, unwritable directories | `apps/cv-sanitizer/pool-manager.js:279` | Low | Code fixed - awaiting Sonar scan |
| 5 | `7193b486-d084-4e12-a6cc-965a0af0001f` | `PATH` must contain fixed, unwritable directories | `apps/cv-sanitizer/server.js:131` | Low | Code fixed - awaiting Sonar scan |
| 6 | `16ee9e95-1406-47a0-8476-6c99b85ffc5f` | `PATH` must contain fixed, unwritable directories | `apps/cv-sanitizer/worker.js:62` | Low | Code fixed - awaiting Sonar scan |
| 7 | `a31a4bc6-6a4b-4cc5-9f80-1bc26f391d3b` | `Math.random()` should be safe | `apps/extension/src/extension-instance-store.ts:88` | Medium | Code fixed - awaiting Sonar scan |
| 8 | `98a2d110-341e-4e5b-b1b8-9787097d75a8` | `Math.random()` should be safe | `apps/extension/src/facebook-publish-orchestrator.ts:2903` | Medium | Code fixed - awaiting Sonar scan |
| 9 | `a853f2bb-aa71-4e44-a02c-5513cd4fa704` | `Math.random()` should be safe | `apps/extension/src/facebook-publish-orchestrator.ts:3754` | Medium | Code fixed - awaiting Sonar scan |
| 10 | `48098d48-5c79-4ea8-978e-43031536fd32` | `Math.random()` should be safe | `apps/extension/src/facebook-publish-orchestrator.ts:4119` | Medium | Code fixed - awaiting Sonar scan |
| 11 | `8c6e07f0-fccf-4135-a9f2-534700e156b9` | `Math.random()` should be safe | `apps/frontend/src/components/interview/ArchitectureEditor.tsx:93` | Medium | Code fixed - awaiting Sonar scan |
| 12 | `3f8c33d6-d46a-412f-a018-f52709fe520b` | `Math.random()` should be safe | `apps/frontend/src/components/interview/ArchitectureEditor.tsx:94` | Medium | Code fixed - awaiting Sonar scan |
| 13 | `8db753fb-10bd-4f3d-9f3c-2ec920eb281f` | `Math.random()` should be safe | `apps/frontend/src/lib/facebook-extension-bridge.ts:187` | Medium | Code fixed - awaiting Sonar scan |
| 14 | `36e89c4c-481c-4321-af54-47c14caa198e` | `Math.random()` should be safe | `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionDetailPage.tsx:69` | Medium | Code fixed - awaiting Sonar scan |
| 15 | `56957ed4-82cc-407c-94c6-58622eed1a58` | `Math.random()` should be safe | `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionListPage.tsx:122` | Medium | Code fixed - awaiting Sonar scan |
| 16 | `b7c3b6ca-9c09-4525-9022-bbaafa833838` | `Math.random()` should be safe | `apps/frontend/src/pages/recruitment/job-postings/JobPostingDetailPage.tsx:117` | Medium | Code fixed - awaiting Sonar scan |
| 17 | `0ca4648c-9d21-4f62-9f88-412a3280e656` | `Math.random()` should be safe | `apps/frontend/src/pages/recruitment/job-postings/JobPostingListPage.tsx:129` | Medium | Code fixed - awaiting Sonar scan |

## Implementation tasks

### Task 1: Replace backend upload filename randomness

**Files:**
- Modify: `apps/backend/src/candidates/candidates.module.ts:1-27`

**Issue covered:** #1 (`8b4202b1-96e8-45d0-b26d-54b17bfa4ddf`).

**Implementation:** Import `randomUUID` from Node `crypto` and replace `Date.now() + '-' + Math.round(Math.random() * 1e9)` with a UUID-based filename component. Preserve the original extension and the existing Multer destination, MIME allow-list, and 20 MB limit.

**Verification:**

```powershell
pnpm --filter @interview-assistant/backend typecheck
Get-Content apps/backend/dev.log -Tail 20
Invoke-WebRequest http://127.0.0.1:3002/api/docs -UseBasicParsing | Select-Object StatusCode
```

Manual smoke: upload one allowed PDF/DOCX/XLSX file through the existing candidate upload flow and verify the stored filename contains a UUID and the file remains downloadable.

**Local verification result (2026-08-10):** Backend typecheck passed. Root `pnpm typecheck` remains blocked only by the pre-existing unused-symbol diagnostics in `apps/extension/src/side-panel.tsx:542`, `:543`, and `:1616`. Backend and frontend runtime logs show successful startup; `http://127.0.0.1:3002/api/docs` and `http://localhost:4000` both returned HTTP 200. Manual upload smoke remains pending a valid upload fixture. SonarQube status was not changed.

Tracking after implementation: change only this plan row to `Code fixed - awaiting Sonar scan`; wait for the user's scanner result before calling it Sonar-resolved.

### Task 2: Use cryptographically secure questionnaire shuffling

**Files:**
- Modify: `apps/backend/src/form-sessions/form-sessions.service.ts:1-10,430-441`

**Issue covered:** #3 (`ed44ae2d-c37f-4211-a4c6-2a6b261368b3`).

**Implementation:** Import `randomInt` from Node `crypto`. Replace the comparator sort with an in-place Fisher-Yates shuffle over the fetched question array, selecting each swap index with `randomInt(0, index + 1)`, then take the first five items. The output remains randomized without relying on a non-cryptographic generator or comparator side effects.

**Verification:**

```powershell
pnpm --filter @interview-assistant/backend typecheck
Get-Content apps/backend/dev.log -Tail 20
```

Manual smoke: create or generate a questionnaire for a posting without an explicit selection and verify five active questions are persisted with unique sequential `orderIndex` values.

Tracking after implementation: mark issue #3 in this plan `Code fixed - awaiting Sonar scan` only; do not touch SonarQube status.

**Local verification result (2026-08-10):** Backend typecheck passed; runtime log still reports successful startup. The secure Fisher–Yates implementation is present and no `Math.random()` remains in the backend source. Questionnaire persistence smoke was not run because it would create test data in the active local database.

### Task 3: Make sanitizer transport configuration explicit and production-safe

**Files:**
- Modify: `apps/backend/src/cv-sanitization/sanitizer/ghostscript-http-pdf-sanitizer.ts:8-15,100-114`
- Modify: `apps/backend/.env.example:25-26` if the example still documents an implicit HTTP fallback

**Issue covered:** #2 (`14ddff9a-48c5-46e7-8095-fee135871420`).

**Implementation:** Remove the hardcoded `http://cv-sanitizer:8080` fallback. Read `CV_SANITIZER_SERVICE_URL` as required configuration, return the existing `SANITIZER_SERVICE_NOT_CONFIGURED` result when it is absent, and validate the URL before use. Permit explicit HTTP only for local/development operation; reject an HTTP URL when `NODE_ENV=production`, requiring HTTPS there. Keep the existing `docker-compose.yml` development service URL explicit so local CV sanitization continues to work.

**Verification:**

```powershell
pnpm --filter @interview-assistant/backend typecheck
Get-Content apps/backend/dev.log -Tail 20
Select-String -Path apps/backend/.env.example -Pattern 'CV_SANITIZER_SERVICE_URL|CV_PDF_SANITIZER_MODE'
```

Manual smoke: in the existing local Docker configuration, upload/sanitize one PDF and confirm the sanitizer response remains successful; separately confirm production-mode configuration rejects `http://` before making a request.

Tracking after implementation: mark issue #2 `Code fixed - awaiting Sonar scan`; Sonar will decide its post-analysis state.

**Local verification result (2026-08-10):** Backend typecheck passed, `CV_SANITIZER_SERVICE_URL` remains explicitly configured for local development, and the backend API returned HTTP 200. The sanitizer now rejects missing, malformed, unsupported-protocol, and production HTTP URLs before making a request. PDF sanitization smoke was not run because it requires a valid CV fixture and mutating workflow data.

### Task 4: Remove PATH lookup for sanitizer executables

**Files:**
- Modify: `apps/cv-sanitizer/pool-manager.js:1-10,70-80,279-282`
- Modify: `apps/cv-sanitizer/server.js:1-10,130-134`
- Modify: `apps/cv-sanitizer/worker.js:1-10,62`

**Issues covered:** #4 (`6e99113d-bb20-4280-b1e7-4d7e4b0a504c`), #5 (`7193b486-d084-4e12-a6cc-965a0af0001f`), and #6 (`16ee9e95-1406-47a0-8476-6c99b85ffc5f`).

**Implementation:** Define fixed executable paths matching the Docker images (`/usr/bin/docker` for the pool manager and `/usr/bin/gs` for Ghostscript). Use those constants for `spawn` calls instead of resolving `docker`/`gs` through the mutable `PATH`. Do not add writable directories to `PATH` and do not change worker container restrictions.

**Verification:**

```powershell
pnpm typecheck
Get-Content apps/backend/dev.log -Tail 20
rg -n "spawn\('(docker|gs)'|spawn\(.*(docker|gs)" apps/cv-sanitizer
```

Expected source check: no sanitizer `spawn` call uses the bare executable name. Manual smoke: call the sanitizer health endpoint and sanitize one PDF through the existing Docker Compose stack.

Tracking after implementation: update rows #4-#6 to `Code fixed - awaiting Sonar scan` only.

**Local verification result (2026-08-10):** `node --check` passed for `pool-manager.js`, `server.js`, and `worker.js`; no bare `docker`/`gs` spawn pattern remains. The existing service ports remained available; a full PDF sanitizer smoke was not run because it requires rebuilding/restarting Docker images, which the repository instructions do not authorize as part of this check.

### Task 5: Add extension secure-random helpers and replace all extension fallbacks

**Files:**
- Create: `apps/extension/src/secure-random.ts`
- Modify: `apps/extension/src/extension-instance-store.ts:1-90`
- Modify: `apps/extension/src/facebook-publish-orchestrator.ts:1-20,2900-2905,3750-3757,4115-4122`

**Issues covered:** #7 (`a31a4bc6-6a4b-4cc5-9f80-1bc26f391d3b`), #8 (`98a2d110-341e-4e5b-b1b8-9787097d75a8`), #9 (`a853f2bb-aa71-4e44-a02c-5513cd4fa704`), and #10 (`48098d48-5c79-4ea8-978e-43031536fd32`).

**Implementation:** Add `secureRandomUUID()` and `secureRandomFraction()` using the browser `crypto` API. Fail closed with a clear error if the secure API is unavailable; do not fall back to `Math.random`. Use the UUID helper for the extension install ID and the fraction helper for Facebook delay jitter and random delay ranges, preserving the existing min/max bounds and timing behavior.

**Verification:**

```powershell
pnpm --filter @interview-assistant/extension typecheck
rg -n "Math\.random|secureRandomUUID|secureRandomFraction" apps/extension/src/extension-instance-store.ts apps/extension/src/facebook-publish-orchestrator.ts apps/extension/src/secure-random.ts
```

Manual smoke: reload the extension, verify the same install ID persists in extension storage, and run the existing Facebook verification/publish flow far enough to observe normal delay and cancellation behavior.

Tracking after implementation: update rows #7-#10 to `Code fixed - awaiting Sonar scan` only.

**Local verification result (2026-08-10):** The extension typecheck reports only the pre-existing `side-panel.tsx` unused-symbol diagnostics at lines 542, 543, and 1616. The extension security-random helper and all four call sites contain no `Math.random()` fallback. Extension reload/Facebook publish smoke remains pending an active extension test session.

### Task 6: Add frontend secure-random helpers and replace frontend fallbacks

**Files:**
- Create: `apps/frontend/src/lib/secure-random.ts`
- Modify: `apps/frontend/src/components/interview/ArchitectureEditor.tsx:1-15,90-96`
- Modify: `apps/frontend/src/lib/facebook-extension-bridge.ts:1-20,180-190`
- Modify: `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionDetailPage.tsx:1-10,64-72`
- Modify: `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionListPage.tsx:1-15,117-125`
- Modify: `apps/frontend/src/pages/recruitment/job-postings/JobPostingDetailPage.tsx:1-10,112-120`
- Modify: `apps/frontend/src/pages/recruitment/job-postings/JobPostingListPage.tsx:1-15,124-132`

**Issues covered:** #11 (`8c6e07f0-fccf-4135-a9f2-534700e156b9`), #12 (`3f8c33d6-d46a-412f-a018-f52709fe520b`), #13 (`8db753fb-10bd-4f3d-9f3c-2ec920eb281f`), #14 (`36e89c4c-481c-4321-af54-47c14caa198e`), #15 (`56957ed4-82cc-407c-94c6-58622eed1a58`), #16 (`b7c3b6ca-9c09-4525-9022-bbaafa833838`), and #17 (`0ca4648c-9d21-4f62-9f88-412a3280e656`).

**Implementation:** Add the same browser-safe helper contract as Task 5. Use `secureRandomFraction()` for Architecture Editor node coordinates and `secureRandomUUID()` for bridge request IDs and recruitment idempotency keys. Remove every `Math.random` fallback while preserving prefixes and return formats (`facebook-bridge-`, `jd-`, and `posting-`).

**Verification:**

```powershell
pnpm --filter @interview-assistant/frontend typecheck
Get-Content apps/frontend/dev.log -Tail 20
rg -n "Math\.random|secureRandomUUID|secureRandomFraction" apps/frontend/src/components/interview/ArchitectureEditor.tsx apps/frontend/src/lib/facebook-extension-bridge.ts apps/frontend/src/pages/recruitment
```

Browser smoke through `http://localhost:4000`: open the interview architecture editor and add a node; open Job Descriptions and Job Postings create/update flows; confirm requests complete and no console error is introduced.

**Local verification result (2026-08-10):** Frontend typecheck passed. Vite HMR logged updates for the changed pages, `http://localhost:4000` returned HTTP 200, and the controlled browser reached the authenticated Dashboard with zero console errors. The targeted frontend files and the public apply page contain no `Math.random()` fallback. Full create/update and architecture-editor interaction smoke remains pending because it would mutate repository data.

Tracking after implementation: update rows #11-#17 to `Code fixed - awaiting Sonar scan` only.

### Task 7: Final static and runtime verification before the user's Sonar scan

**Files:**
- Read: all files listed above
- Read: `sonar-project.properties`
- Read: `apps/backend/dev.log`
- Read: `apps/frontend/dev.log`

**Implementation:** No code change. Confirm the targeted insecure patterns are absent and that no SonarQube status mutation has been performed.

**Verification:**

```powershell
pnpm typecheck
Get-Content apps/backend/dev.log -Tail 20
Get-Content apps/frontend/dev.log -Tail 20
rg -n "Math\.random|spawn\('(docker|gs)'|http://cv-sanitizer" apps/backend/src apps/cv-sanitizer apps/extension/src apps/frontend/src
Invoke-WebRequest http://127.0.0.1:3002/api/docs -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest http://127.0.0.1:9002/api/system/status -UseBasicParsing | Select-Object StatusCode
```

**Final local verification result (2026-08-10):** Targeted static scan found no `Math.random()`, bare `docker`/`gs` spawn, or `http://cv-sanitizer` fallback in the scanned source. JavaScript syntax checks passed. Backend API, frontend UI, and SonarQube system status each returned HTTP 200. The controlled browser reached the authenticated frontend Dashboard with zero console errors. Root `pnpm typecheck` still fails only on the three pre-existing unused-symbol diagnostics in `apps/extension/src/side-panel.tsx`; backend and frontend package typechecks pass. No SonarQube issue status was mutated.

The user then runs:

```powershell
Set-Location C:\SourceCode\auto-cv-processing
$env:SONAR_TOKEN = "<TOKEN_HIỆN_TẠI>"
docker compose -f docker-compose.sonar.yml `
  --profile scan `
  run --rm `
  --pull never `
  sonar-scanner
```

Afterward, refresh the Security issue list. SonarQube may automatically resolve issues that no longer exist in the analysis; the assistant will only read and report the result. It must not manually change any issue status.

## Tracking convention after each implementation batch

For every issue that has been changed, update the corresponding row in this file from `Planned` to `Code fixed - awaiting Sonar scan`, record the local verification command and result below the task, and leave the SonarQube status untouched. Only the user's subsequent scan determines whether SonarQube reports the issue as resolved.
