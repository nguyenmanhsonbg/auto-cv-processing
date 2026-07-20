# CV Similarity Result Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the similarity decision, score, and redacted normalized text used for comparison after every reapply, whether the CV passes or is blocked; omit similarity only for the first application.

**Architecture:** Return one bounded similarity diagnostic object from the backend for both successful reapply responses and `DUPLICATE_CV_CONTENT` errors. Parse the success response through the public API type and the error payload through the existing `ApiError` path, then render one dedicated similarity panel inside `PublicJobApplyPage`; no new endpoint or Gemini call is introduced.

**Tech Stack:** NestJS, TypeScript, React, Vite, existing `ApiError`, Tailwind utility classes, Jest for backend tests, TypeScript/Vite build for frontend verification.

## Global Constraints

- Keep the similarity decision unchanged: `score >= 0.95` rejects.
- Only return normalized text after existing identity/PII removal; never return raw CV PII in the public error.
- Limit each displayed text preview to 2,000 characters.
- Do not add a database migration, AI call, vector database, or new dependency.
- Do not create a commit, push, or merge; leave changes for the user to commit.

---

### Task 1: Return bounded similarity diagnostics from backend success and error responses

**Files:**
- Modify: `apps/backend/src/job-postings/public-job-postings.controller.ts`
- Modify: `apps/backend/src/job-postings/public-job-postings.controller.spec.ts`

**Interfaces:**
- `PublicApplyError` gains `details?: unknown[]`.
- Successful reapply responses gain optional `similarity` details; first applications omit it.
- `CvSimilarityResult` remains the source of score, threshold, method version, and hashes.

- [x] **Step 1: Write a failing test** asserting `DUPLICATE_CV_CONTENT` exposes score, decision, method, and two bounded normalized text previews.
- [x] **Step 2: Run the focused controller test and verify it fails because the error currently has no similarity details.**
- [x] **Step 3: Add and return a bounded diagnostic object for every similarity comparison.** Use `score`, `threshold`, `methodVersion`, `oldNormalizedTextHash`, `newNormalizedTextHash`, `oldTextPreview`, and `newTextPreview`; set `decision` to `PASSED` or `DUPLICATE_FOUND`, truncate previews to 2,000 characters, return it in successful reapply data, and reuse it in the blocking error.
- [x] **Step 4: Update the exception filter to preserve `details` instead of always returning `details: []`.** Preserve similarity details on `DUPLICATE_CV_FILE` when that error occurs after a completed reapply comparison; keep other error mappings unchanged.
- [x] **Step 5: Run the focused backend test and verify it passes.**

### Task 2: Parse and render the diagnostic in the public apply page

**Files:**
- Modify: `apps/frontend/src/lib/api-errors.ts`
- Modify: `apps/frontend/src/pages/public/PublicJobApplyPage.tsx`

**Interfaces:**
- Add `DUPLICATE_CV_CONTENT` to frontend error codes and safe messages.
- Add a local `CvSimilarityErrorDetails` type for the bounded payload.

- [x] **Step 1: Write a failing frontend type/behavior test if the repository test harness exists; otherwise use `pnpm --filter @interview-assistant/frontend typecheck` as the red verification after adding the typed renderer contract.**
- [x] **Step 2: Add `getPublicCvSimilarityDetails()` to safely read `ApiError.details` without trusting arbitrary payload shapes.**
- [x] **Step 3: Store similarity details in `ApplyResultState` for both successful reapply responses and `DUPLICATE_CV_CONTENT` errors.**
- [x] **Step 4: Render a score summary and two collapsible text panels in the existing result card.** Use `whitespace-pre-wrap`, bounded max height, scroll overflow, and labels `CV da nop truoc do` / `CV vua tai len`; style `PASSED` as accepted for update and `DUPLICATE_FOUND` as blocked.
- [x] **Step 5: Run frontend typecheck and build.**

### Task 3: Final verification

**Files:**
- No additional production files.

- [x] **Step 1: Run focused backend tests for similarity, controller, and error details.**
- [x] **Step 2: Run backend typecheck.**
- [x] **Step 3: Run frontend typecheck and build.**
- [x] **Step 4: Run `git diff --check` and verify no commit/push/merge was performed.**
