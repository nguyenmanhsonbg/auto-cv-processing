# Candidate Delete Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make candidate deletion reliable across related records and update the candidate list immediately without a browser refresh.

**Architecture:** Keep deletion transactional in the backend, but make cleanup idempotent and cover both interview and recruitment relations. On the frontend, track the deleting candidate, remove it from local paginated state after a successful response, then reconcile with the server list.

**Tech Stack:** NestJS, TypeORM, React, TypeScript, pnpm.

## Global Constraints

- Use pnpm only.
- Do not create or modify test files because the repository explicitly forbids it.
- Do not build or lint; run the required typechecks and live API/UI checks.
- Do not launch applications; the backend and frontend are already running with hot reload.

---

### Task 1: Harden backend candidate cleanup

**Files:**
- Modify: `apps/backend/src/candidates/candidates.service.ts` in `remove`.

**Interfaces:**
- Consumes: candidate id and authorization scope.
- Produces: successful deletion or the original HTTP error; repeated cleanup operations remain safe when no child rows exist.

- [ ] **Step 1:** Trace every candidate foreign-key path represented by current entities and the existing cleanup queries.
- [ ] **Step 2:** Replace fragile entity removal with a transaction-scoped delete by candidate id after all dependent rows and join rows are removed.
- [ ] **Step 3:** Ensure cleanup queries tolerate empty relation sets and preserve transaction rollback on genuine database failures.
- [ ] **Step 4:** Run backend typecheck and inspect the hot-reload log for errors.

### Task 2: Make frontend deletion state consistent

**Files:**
- Modify: `apps/frontend/src/pages/interviewer/candidates/CandidateListPage.tsx`.

**Interfaces:**
- Consumes: existing `apiClient.delete('/candidates/:id')` response.
- Produces: one success toast only after deletion succeeds, immediate removal from the displayed result, and a server reconciliation that handles page boundaries.

- [ ] **Step 1:** Add a deleting-id state and prevent duplicate clicks while that id is being deleted.
- [ ] **Step 2:** After a successful delete, remove the candidate from local data immediately and adjust the page if the current page becomes empty.
- [ ] **Step 3:** Reconcile with the current server query so total counts and pagination stay correct.
- [ ] **Step 4:** Keep the destructive toast only for rejected requests and surface the backend message when available.
- [ ] **Step 5:** Run frontend typecheck and inspect the frontend hot-reload log.

### Task 3: End-to-end verification

**Files:**
- No new test files.

- [ ] **Step 1:** Use the running authenticated browser/API session to delete a candidate with no relations and confirm the row disappears without refresh.
- [ ] **Step 2:** Verify the API response and then query the candidate list to confirm the deleted id is absent.
- [ ] **Step 3:** Verify an associated candidate path if available and confirm no false “Delete failed” toast appears.
- [ ] **Step 4:** Run the repository-required backend and frontend typechecks and record any pre-existing runtime warnings separately.

