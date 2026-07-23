# AMIS Candidate AI Screening Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-candidate AI screening action to the AMIS Extension, expose persistent mapping/AI statuses, and disable the action after a successful evaluation.

**Architecture:** The backend will extend the AMIS application-list contract with mapping and AI screening state, persist requested/done/failed lifecycle states around the existing synchronous screening service, and reuse the existing `POST /applications/:id/ai-screening/run` endpoint. The Extension will add a separate API client call and card action; the existing PDF upload action remains separate and is enabled only for completed screening results.

**Tech Stack:** NestJS, TypeORM, TypeScript, React, Chrome Extension messaging, pnpm typecheck, manual API/browser verification.

## Global Constraints

- Use pnpm only.
- Do not create or modify unit-test files; repository instructions prohibit `*.spec.ts` and `*.test.ts` changes.
- Do not run build, lint, or launch commands.
- After code changes, run `pnpm typecheck` and inspect the relevant runtime logs.
- Preserve the existing dirty worktree changes and the existing `Tải đánh giá AI` PDF/upload flow.
- Do not use git commands in this repository.

---

### Task 1: Extend the AMIS application-list contract with evaluation status

**Files:**
- Modify: `apps/backend/src/extension-integration/dto/sync-amis-applications.dto.ts`
- Modify: `apps/backend/src/extension-integration/extension-integration.service.ts:1401-1470`
- Modify: `apps/extension/src/types.ts:657-690`

**Interfaces:**
- Produces `mappingStatus` and `aiScreeningStatus` on every `AmisApplicationListItemDto` and `AmisApplicationListItem`.
- Existing fields and existing AMIS sync semantics remain unchanged.

- [ ] Add nullable enum fields to `AmisApplicationListItemDto`:

```ts
@ApiPropertyOptional({ nullable: true })
mappingStatus: string | null;

@ApiPropertyOptional({ nullable: true })
aiScreeningStatus: string | null;
```

- [ ] Load `mappingResults` and `aiScreeningResults` in `listAmisApplicationsForRecruitment` and derive the latest fallback result with `latestByCreatedAt`.
- [ ] Return the persisted application status fields first, falling back to the latest result status for older rows:

```ts
mappingStatus: application.mappingStatus ?? latestMapping?.status ?? null,
aiScreeningStatus: application.aiScreeningStatus ?? latestAiScreening?.status ?? null,
```

- [ ] Add the same nullable string fields to `AmisApplicationListItem` in the Extension types.
- [ ] Run `pnpm typecheck` and expect no type errors.

### Task 2: Persist requested, completed, failed, and duplicate-run states

**Files:**
- Modify: `apps/backend/src/applications/applications.service.ts:422-471`

**Interfaces:**
- Consumes `RunApplicationAiScreeningInput` and existing `MappingStatus`, `AiScreeningStatus`, and `ApplicationStatus` enums.
- Produces persistent state transitions visible through both application detail and the Extension application list.

- [ ] Before starting the expensive AI work, load the application and apply these guards:

```ts
if (current.aiScreeningStatus === AiScreeningStatus.DONE) {
  return this.findDetail(applicationId);
}
if (current.aiScreeningStatus === AiScreeningStatus.REQUESTED) {
  throw new ConflictException('AI screening is already running');
}
```

- [ ] Persist the requested state before `buildAiScreeningContext`:

```ts
current.mappingStatus = MappingStatus.REQUESTED;
current.aiScreeningStatus = AiScreeningStatus.REQUESTED;
current.status = ApplicationStatus.AI_SCREENING_REQUESTED;
```

- [ ] Record an `AI_SCREENING_REQUESTED` workflow event with the previous and next application status.
- [ ] Keep the existing AI work and success persistence unchanged so successful completion still sets `mappingStatus`, `aiScreeningStatus`, and `status` to their `DONE` values.
- [ ] Wrap the screening work in `try/catch`. On failure, persist:

```ts
application.mappingStatus = MappingStatus.FAILED;
application.aiScreeningStatus = AiScreeningStatus.FAILED;
application.status = ApplicationStatus.AI_SCREENING_FAILED;
```

- [ ] Record an `AI_SCREENING_FAILED` workflow event and rethrow the original error so the Extension receives the real validation/AI failure.
- [ ] Run `pnpm typecheck` and expect no type errors.

### Task 3: Add the Extension API client action

**Files:**
- Modify: `apps/extension/src/types.ts`
- Modify: `apps/extension/src/api-client.ts` after `getAmisApplicationsForRecruitment`

**Interfaces:**
- Produces `runApplicationAiScreening(accessToken: string, applicationId: string)`.
- The function returns the unwrapped application-detail response from `POST /applications/:applicationId/ai-screening/run`.

- [ ] Add a narrow response type containing `applicationId`, `status`, `mapping`, and `aiScreening` status fields.
- [ ] Add the API wrapper:

```ts
export async function runApplicationAiScreening(accessToken: string, applicationId: string) {
  return request<RunApplicationAiScreeningResponse>(
    `/applications/${encodeURIComponent(applicationId)}/ai-screening/run`,
    { method: 'POST', accessToken },
  );
}
```

- [ ] Run `pnpm typecheck` and expect no type errors.

### Task 4: Add per-candidate status display and the disabled run button

**Files:**
- Modify: `apps/extension/src/side-panel.tsx:10-40,320-335,1335-1380,4537-4605`
- Modify: `apps/extension/src/styles.css` only if the new status/action layout needs a focused style rule

**Interfaces:**
- Consumes the fields from Task 1 and the API wrapper from Task 3.
- Produces a card action that calls the screening API once per candidate and refreshes the list after success.

- [ ] Import `runApplicationAiScreening` and add a distinct `aiScreeningApplicationId` state; do not reuse `aiEvaluationApplicationId`, which belongs to PDF upload.
- [ ] Add `runAiScreeningForApplication(application)` with this behavior:
  - return if there is no token;
  - return without calling the API when `application.aiScreeningStatus === 'DONE'`;
  - set the candidate ID as running;
  - call `runApplicationAiScreening(token, application.applicationId)`;
  - reload `loadAmisApplications(token, amisRecruitmentId, { silent: true })` after success;
  - show the existing auth-required state on 401;
  - show the API error in `applicationsMessage` and leave the returned failure status visible after refresh;
  - clear the running ID in `finally`.
- [ ] Add helper presentation logic mapping statuses to Vietnamese labels and tones:

```ts
REQUESTED -> { label: 'Đang đánh giá', tone: 'is-warning' }
DONE -> { label: 'Đã đánh giá', tone: 'is-success' }
FAILED -> { label: 'Lỗi đánh giá', tone: 'is-danger' }
default -> { label: 'Chưa đánh giá', tone: 'is-muted' }
```

- [ ] Render mapping and AI status in each candidate card.
- [ ] Render the new `Đánh giá AI` button before the existing PDF button.
- [ ] Disable the new button when any of these are true:

```ts
application.aiScreeningStatus === 'DONE'
  || application.aiScreeningStatus === 'REQUESTED'
  || Boolean(aiScreeningApplicationId)
```

- [ ] Use labels `Đánh giá AI`, `Đang đánh giá...`, and `Đã đánh giá` according to state.
- [ ] Disable `Tải đánh giá AI` unless `application.aiScreeningStatus === 'DONE'`; keep its handler and AMIS upload behavior unchanged.
- [ ] Run `pnpm typecheck` and expect no type errors.

### Task 5: Verify the feature without modifying test files

**Files:**
- No test files created or modified.
- Inspect: `apps/backend/dev.log`
- Inspect: `apps/frontend/dev.log`

- [ ] Run `pnpm typecheck` from `D:\loogiX\auto-cv-processing`; expect all packages to typecheck successfully.
- [ ] Use the running API to verify an application list response contains `mappingStatus` and `aiScreeningStatus`.
- [ ] Use the running API/browser flow with a candidate that has a clean CV, parsed profile, and submitted form:
  - first load shows the run button enabled;
  - clicking it sends exactly one POST for the candidate;
  - successful completion reloads the list and shows `DONE`;
  - the run button is disabled after completion and remains disabled after panel refresh;
  - the PDF button becomes enabled only after `DONE`.
- [ ] Verify a candidate missing prerequisites receives an error and does not show a false completed status.
- [ ] Verify the backend and frontend runtime logs contain no reload errors.

