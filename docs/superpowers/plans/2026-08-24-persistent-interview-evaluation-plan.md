# Persistent Interview Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make interview evaluation one persistent candidate document whose stage history follows AMIS interview transitions while preserving editable HRBP/HĐCM data.

**Architecture:** Retain one evaluation case per application and use round records as internal snapshots/history. Add AMIS round metadata and a backend synchronization operation that creates/activates a carried-forward snapshot on interview transitions. Keep the Extension card visible after case creation and update its label from the latest AMIS interview context.

**Tech Stack:** NestJS, TypeORM/PostgreSQL, React, Chrome Extension messaging, TypeScript, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-24-persistent-interview-evaluation-design.md`

## Global Constraints

- Use `pnpm`; do not use npm or yarn.
- Do not create or edit `*.spec.ts` or `*.test.ts`; use inline assertions and existing smoke tooling.
- Preserve unrelated recruitment flows, API authorization, and existing legacy evaluation records.
- Use `apply_patch` for source edits.
- Run `pnpm typecheck` after source changes; do not build, lint, launch, or restart services.
- Follow `docs/sonarqube-code-checklist.md` and run the configured Sonar scan.

---

### Task 1: Add AMIS metadata and carried-forward snapshot service

**Files:**
- Modify: `apps/backend/src/candidate-evaluations/entities/interview-evaluation-round.entity.ts`
- Modify: `apps/backend/src/migrations/1785600000000-CreateInterviewEvaluationWorkflow.ts`
- Create: `apps/backend/src/migrations/1785900000000-AddAmisInterviewEvaluationContext.ts`
- Create: `apps/backend/src/candidate-evaluations/dto/sync-interview-evaluation-context.dto.ts`
- Modify: `apps/backend/src/candidate-evaluations/interview-evaluations.service.ts`
- Modify: `apps/backend/src/candidate-evaluations/interview-evaluations.controller.ts`

**Steps:**

- [ ] Write an inline RED assertion for missing AMIS snapshot identity and carried-forward data.
- [ ] Add nullable `amisRoundId`, `amisRoundType`, and `amisSortOrder` columns; keep legacy round fields readable.
- [ ] Add a migration that adds columns/indexes without dropping existing data.
- [ ] Add `syncAmisInterviewContext(applicationId, dto, actor)` that only accepts interview round type 3, finds an existing case, reuses an existing AMIS snapshot, or copies the latest snapshot including form/reviewer data.
- [ ] Allow review/aggregate saves on completed snapshots while retaining version and audit checks; a changed submitted review returns to draft.
- [ ] Add a protected controller endpoint for the extension to synchronize the context.
- [ ] Run the inline RED/GREEN assertion and typecheck.

### Task 2: Carry AMIS transition into evaluation context

**Files:**
- Modify: `apps/extension/src/lib/api-client.ts`
- Modify: `apps/extension/src/app/side-panel.tsx`
- Modify: `apps/extension/src/types/types.ts`

**Steps:**

- [ ] Add the typed client method for the context endpoint.
- [ ] Resolve the target AMIS round metadata from the live/persisted catalog.
- [ ] On a transition into round type 3, optimistically update the application, then synchronize the matching local evaluation case without blocking stage persistence.
- [ ] Keep the case active/visible when the candidate moves through non-interview stages.
- [ ] Handle missing catalog, stale event, 401, timeout, and absent local application without breaking existing stage sync.
- [ ] Run typecheck and a read-only event-mapping assertion.

### Task 3: Make CandidateCard persistent and dynamic

**Files:**
- Modify: `apps/extension/src/components/candidates/CandidateCard.tsx`
- Modify: related extension styles only if required by the existing card layout.

**Steps:**

- [ ] Change summary loading to continue after a case exists even when the current AMIS stage is non-interview.
- [ ] Show the card when the case exists or the current captured AMIS stage is interview; do not show it for unrelated candidates with no case.
- [ ] Use the active/latest interview snapshot name for the label, with the current AMIS interview name taking precedence after transition.
- [ ] Keep the create-case action only for a first interview with no case; later transitions must open the existing document.
- [ ] Preserve the existing committee selection, loading, keyboard focus, and error behavior.
- [ ] Run inline UI-state assertions and typecheck.

### Task 4: Present one document with editable history

**Files:**
- Modify: `apps/frontend/src/lib/recruitment-api.ts`
- Modify: `apps/frontend/src/pages/recruitment/applications/InterviewEvaluationPage.tsx`
- Modify: shared evaluation types only if response metadata requires it.

**Steps:**

- [ ] Extend response types with AMIS snapshot metadata and history data.
- [ ] Add a stable history selector that changes the selected snapshot without creating a new case.
- [ ] Load/edit the selected snapshot while showing prior HRBP/HĐCM content and the current stage label.
- [ ] Keep HĐCM read access to HRBP content and reviewer/membership edit restrictions.
- [ ] Show clear status for current, historical, draft, submitted, and edited-after-completion snapshots.
- [ ] Run frontend typecheck and browser smoke test.

### Task 5: Verification and handoff

**Files:**
- Inspect: `apps/backend/dev.log`
- Inspect: `apps/frontend/dev.log`
- Inspect: SonarQube results

**Steps:**

- [ ] Run fresh `pnpm typecheck` and record all package results.
- [ ] Run API smoke tests for HR and HĐCM, including persistent case/history and permission boundaries.
- [ ] Run Chrome/extension smoke: transition candidate into `Phỏng vấn vòng 2`, confirm card appears/renames immediately, and confirm prior form data remains.
- [ ] Inspect runtime logs for new errors.
- [ ] Run Sonar scanner and record Quality Gate/New Code/Overall Code or the exact authentication blocker.
- [ ] Re-read this plan and report any unverified item instead of claiming completion.
