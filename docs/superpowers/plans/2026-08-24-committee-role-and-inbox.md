# HĐCM Committee Role and Assigned Evaluation Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Add a dedicated `COMMITTEE` role for Hội đồng chuyên môn, allow it to sign in without the Extension permission error, and provide a restricted assigned-evaluation inbox.

**Architecture:** Preserve existing `INTERVIEWER` behavior and add `COMMITTEE` as a separate shared role. HR/Admin continue to create and aggregate evaluation cases; committee members can only discover cases through reviewer assignments, open their current round, and edit their own private committee review. The Extension login whitelist will accept the new role and the existing interviewer role without changing unrelated recruitment tabs or APIs.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, React, React Router, TypeScript, existing shared role/auth contracts, existing interview-evaluation workflow, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-24-candidate-interview-evaluation-design.md`

## Global Constraints

- Preserve existing `INTERVIEWER`, HR, Admin, freelancer, internal, recruitment, and candidate-card behavior.
- Use `BadRequestException` for missing, invalid, or unauthorized evaluation records.
- Do not create or modify `*.spec.ts` / `*.test.ts` files.
- Do not run build, lint, or application startup commands.
- Run `pnpm typecheck`, inspect runtime logs, run API smoke and browser/Extension smoke after source changes.
- Do not modify SonarQube configuration or suppress findings.
- Do not use raw access tokens in URLs or client-side handoff mechanisms.

## Tasks

### Task 1: Add the shared HĐCM role contract

**Files:**
- Modify: `packages/shared/src/types/user.ts`
- Modify: `apps/extension/src/types/types.ts`

- [ ] Add `UserRole.COMMITTEE = 'COMMITTEE'` while retaining every existing enum value.
- [ ] Add `COMMITTEE` to the Extension-local `UserRole` union so the login response is type-safe.
- [ ] Run `pnpm typecheck` and inspect backend/frontend logs before continuing.

### Task 2: Enable account creation and assignment for HĐCM

**Files:**
- Modify: `apps/backend/src/auth/auth.service.ts`
- Modify: `apps/frontend/src/pages/interviewer/settings/ManagementPage.tsx`
- Modify: `apps/frontend/src/pages/interviewer/settings/InvitePage.tsx`
- Modify: `apps/backend/src/candidate-evaluations/interview-evaluations.service.ts`

- [ ] Keep `COMMITTEE` eligible for generic Admin user management and invite creation.
- [ ] Expose the role in Admin create/edit/filter controls with the label `HĐCM – Hội đồng chuyên môn`.
- [ ] Make evaluation assignment validation require selected users to have role `COMMITTEE`; do not silently assign arbitrary HR/Admin/Interviewer accounts as HĐCM.
- [ ] Keep assignment output role-safe and preserve existing user assignment endpoints.
- [ ] Run `pnpm typecheck` and inspect backend/frontend logs.

### Task 3: Fix authentication and role guards

**Files:**
- Modify: `apps/extension/src/features/auth/LoginForm.tsx`
- Modify: `apps/frontend/src/components/recruitment/InterviewEvaluationRouteGuard.tsx`
- Modify: `apps/backend/src/candidate-evaluations/interview-evaluations.controller.ts`

- [ ] Accept both `COMMITTEE` and existing `INTERVIEWER` in the Extension login whitelist; this directly fixes the screenshot's `Bạn không có quyền truy cập extension` error for evaluator accounts.
- [ ] Allow `COMMITTEE` to reach evaluation routes while keeping create, aggregate, complete, and next-round endpoints restricted to HR/Admin.
- [ ] Keep backend authorization authoritative even when a user reaches a route manually.
- [ ] Run `pnpm typecheck` and inspect runtime logs.

### Task 4: Add the assigned-evaluation inbox API

**Files:**
- Modify: `apps/backend/src/candidate-evaluations/interview-evaluations.controller.ts`
- Modify: `apps/backend/src/candidate-evaluations/interview-evaluations.service.ts`
- Modify: `apps/frontend/src/lib/recruitment-api.ts`

- [ ] Add an authenticated `GET /interview-evaluations/assigned` endpoint that returns only current rounds containing a reviewer row for the authenticated committee user.
- [ ] Return minimal candidate/JD/round/status/progress data; never return HRBP form data, another committee member's form data, or aggregate data to a committee user.
- [ ] Keep HR/Admin access useful for their own management view without exposing unrelated applications to committee accounts.
- [ ] Add the typed frontend API client call.
- [ ] Run `pnpm typecheck` and inspect logs.

### Task 5: Add the HĐCM UI after login

**Files:**
- Create: `apps/frontend/src/pages/recruitment/applications/InterviewEvaluationInboxPage.tsx`
- Create: `apps/frontend/src/components/recruitment/CommitteeRouteGuard.tsx`
- Modify: `apps/frontend/src/app/routes.tsx`
- Modify: `apps/frontend/src/app/layouts/InterviewerLayout.tsx`

- [ ] Route committee users to `/interview-evaluations` after login/default navigation.
- [ ] Show a clear HĐCM header, assigned evaluation cards, round/status badges, candidate/JD information, and `Mở phiếu đánh giá` actions.
- [ ] Show an empty state when no evaluation is assigned; do not show the recruitment application list.
- [ ] Keep the existing full evaluation page for the assigned committee user and prevent access to HR/Admin-only actions.
- [ ] Run `pnpm typecheck`, inspect frontend logs, and smoke the route in the browser.

### Task 6: Verify the Extension error and end-to-end permission boundaries

**Files:**
- Read: `apps/backend/dev.log`
- Read: `apps/frontend/dev.log`
- Read: `docs/sonarqube-code-checklist.md`

- [ ] Call Swagger/API smoke endpoints and verify unauthenticated requests remain `401`.
- [ ] Exercise the login whitelist path with a role response for `INTERVIEWER` and `COMMITTEE`, ensuring the old forbidden message is not produced for either role.
- [ ] Browser-smoke the frontend login and committee inbox route; Extension-smoke the login screen if the active browser session is available.
- [ ] Run the Sonar scanner with the available token; if credentials are unavailable, report the exact authentication limitation.

## Committee Group Extension

### Task 7: Persist reusable committee groups

**Files:**
- Create: `apps/backend/src/candidate-evaluations/entities/interview-committee.entity.ts`
- Create: `apps/backend/src/candidate-evaluations/entities/interview-committee-member.entity.ts`
- Create: `apps/backend/src/migrations/1785800000000-CreateInterviewCommittees.ts`
- Modify: `apps/backend/src/candidate-evaluations/entities/interview-evaluation-round.entity.ts`
- Modify: `apps/backend/src/candidate-evaluations/interview-evaluations.module.ts`

- [ ] Store an active/inactive committee with a unique name and a many-to-many membership table restricted by service validation to `COMMITTEE` users.
- [ ] Add nullable `committeeId` to each evaluation round so old cases remain readable and each new round keeps its selected committee.
- [ ] Keep reviewer rows as the immutable assignment snapshot; when a next round is created, copy the current round's reviewer membership and the committee reference.
- [ ] Create the production migration with tables, indexes, foreign keys, and an idempotent nullable round column.

### Task 8: Expose committee management and group-based evaluation creation

**Files:**
- Create: `apps/backend/src/candidate-evaluations/dto/create-interview-committee.dto.ts`
- Create: `apps/backend/src/candidate-evaluations/dto/update-interview-committee-members.dto.ts`
- Create: `apps/backend/src/candidate-evaluations/interview-committees.controller.ts`
- Create: `apps/backend/src/candidate-evaluations/interview-committees.service.ts`
- Modify: `apps/backend/src/candidate-evaluations/interview-evaluations.controller.ts`
- Modify: `apps/backend/src/candidate-evaluations/interview-evaluations.service.ts`
- Modify: `apps/backend/src/candidate-evaluations/dto/create-interview-evaluation.dto.ts`

- [ ] Add authenticated Admin CRUD for committee name/description/status and member replacement; reject duplicate names, missing committees, and non-`COMMITTEE` members with `BadRequestException`.
- [ ] Add a read endpoint for HR/Admin to load active committees with their member account summaries.
- [ ] Replace the new-case payload with `committeeId`; validate the selected committee is active and create reviewer snapshots from its members.
- [ ] Include committee id/name in round summaries and audit metadata without returning private review data to committee members.

### Task 9: Replace individual account checkboxes with committee picker

**Files:**
- Modify: `apps/extension/src/lib/api-client.ts`
- Modify: `apps/extension/src/types/types.ts`
- Modify: `apps/extension/src/components/candidates/CandidateCard.tsx`
- Modify: `apps/frontend/src/lib/recruitment-api.ts`

- [ ] Load committees instead of all assignable users.
- [ ] Render each committee as a selectable group with member names/emails visible; submit only `committeeId` and disable continuation until one committee is selected.
- [ ] Preserve the existing card, evaluation modal, and old evaluation cases.

### Task 10: Add Admin committee management UI

**Files:**
- Create: `apps/frontend/src/pages/interviewer/settings/CommitteesPage.tsx`
- Modify: `apps/frontend/src/app/routes.tsx`
- Modify: `apps/frontend/src/app/layouts/InterviewerLayout.tsx`

- [ ] Add a Settings navigation item and page for creating/editing committees, toggling active state, and selecting only HĐCM accounts as members.
- [ ] Show member count and member account list in the committee table; keep access restricted to Admin by the route/layout already used for settings.

### Task 11: Verify committee-group boundaries

**Files:**
- Read: `apps/backend/dev.log`
- Read: `apps/frontend/dev.log`
- Read: `docs/sonarqube-code-checklist.md`

- [ ] Run `pnpm typecheck` after each source patch, inspect hot-reload logs, smoke unauthenticated and role-protected endpoints, and browser-smoke the picker/settings route.
- [ ] Run the Sonar scanner with the available token and report authentication limitations exactly if the token is unavailable.
