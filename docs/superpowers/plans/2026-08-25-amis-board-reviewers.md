# AMIS Recruitment Board Reviewers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize AMIS recruitment-board members and automatically assign the correct HR/HĐCM reviewers to the single interview evaluation form.

**Architecture:** The extension reads `Data.RecruitmentBoards` from AMIS `detail-board-info/{recruitmentId}` and persists an idempotent snapshot in a dedicated backend table. Evaluation creation resolves mapped VCS users and creates reviewer rows by local role; the existing internal committee picker is removed only from the AMIS candidate-card flow.

**Tech Stack:** TypeScript, React extension, NestJS, TypeORM, PostgreSQL, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-25-amis-board-reviewers.md`

## Global Constraints

- Use pnpm only.
- Do not create or modify `*.spec.ts` or `*.test.ts` files.
- Do not build or lint the applications.
- Run `pnpm typecheck` and inspect hot-reload logs after each source change.
- Run API and browser/extension smoke checks before completion.
- Use `BadRequestException` for missing entities.
- Do not expose AMIS cookies, tokens, or authorization headers to VCS.
- Preserve the existing single-form and AMIS round synchronization behavior.

### Task 1: Persist AMIS board members and user identity mapping

**Files:**
- Create: `apps/backend/src/extension-integration/entities/amis-recruitment-board-member.entity.ts`
- Create: `apps/backend/src/extension-integration/dto/sync-amis-recruitment-board-members.dto.ts`
- Create: `apps/backend/src/extension-integration/amis-recruitment-board-members.service.ts`
- Create: `apps/backend/src/migrations/1786000000000-CreateAmisRecruitmentBoardMembers.ts`
- Modify: `apps/backend/src/auth/entities/user.entity.ts`
- Modify: `apps/backend/src/extension-integration/entities/index.ts`
- Modify: `apps/backend/src/extension-integration/dto/index.ts`
- Modify: `apps/backend/src/extension-integration/extension-integration.module.ts`

**Interfaces:**
- Consumes: `amisRecruitmentId`, AMIS board member snapshots, and local `users.amisUserId` mappings.
- Produces: active board-member records and matched local user/role information for evaluation creation.

- [ ] Add nullable unique `users.amis_user_id` and the external board-member entity with active/revoked timestamps.
- [ ] Add validated nested DTOs for `amisBoardId`, `amisUserId`, name, optional email, and AMIS flags.
- [ ] Implement transactional sync that upserts incoming members, marks missing previous members inactive, deduplicates by AMIS user ID, and returns mapping status without changing VCS roles.
- [ ] Add a production-safe TypeORM migration for the user column and board-member table/indexes.

### Task 2: Expose board-member synchronization through the backend

**Files:**
- Modify: `apps/backend/src/extension-integration/extension-integration.controller.ts`
- Modify: `apps/backend/src/extension-integration/extension-integration.module.ts`

**Interfaces:**
- Consumes: `POST /extension/amis/recruitments/:amisRecruitmentId/board-members/sync`.
- Produces: sync counts and member mapping statuses.

- [ ] Register the board-member service in the module.
- [ ] Add the authenticated HR/Admin endpoint and preserve extension request metadata conventions.
- [ ] Validate that empty or invalid recruitment IDs/members return a `BadRequestException`.

### Task 3: Read and persist `RecruitmentBoards` in the extension

**Files:**
- Modify: `apps/extension/src/types/types.ts`
- Modify: `apps/extension/src/integrations/amis/amis-helpers.ts`
- Modify: `apps/extension/src/integrations/amis/amis-bridge.ts`
- Modify: `apps/extension/src/lib/api-client.ts`
- Modify: `apps/extension/src/app/side-panel.tsx`

**Interfaces:**
- Consumes: AMIS `detail-board-info/{recruitmentId}` response.
- Produces: normalized `AmisRecruitmentBoardMember[]` and backend synchronization calls.

- [ ] Add a bridge message and `window.fetch` call with `credentials: 'include'`; never forward AMIS credentials.
- [ ] Map `Data.RecruitmentBoards`, including numeric/boolean variants, and return a safe empty response on malformed data.
- [ ] Add the API client sync method.
- [ ] Hydrate and persist board members while refreshing the active AMIS recruitment context and before the candidate transition flow relies on them.

### Task 4: Derive evaluation reviewers from AMIS membership and local roles

**Files:**
- Modify: `apps/backend/src/candidate-evaluations/interview-evaluations.module.ts`
- Modify: `apps/backend/src/candidate-evaluations/interview-evaluations.service.ts`
- Modify: `apps/backend/src/candidate-evaluations/dto/create-interview-evaluation.dto.ts`
- Modify: `apps/extension/src/lib/api-client.ts`

**Interfaces:**
- Consumes: application job posting, AMIS external reference, active board-member snapshot, and local user roles.
- Produces: one evaluation case with HRBP reviewers for mapped HR accounts and HĐCM reviewers for mapped COMMITTEE accounts.

- [ ] Resolve the AMIS recruitment ID from the job-posting external reference.
- [ ] Resolve mapped local users by `amisUserId`; add the manager actor as the HRBP fallback without using the AMIS `IsAdmin` flag.
- [ ] Stop using `committeeId`/`committeeUserIds` for AMIS evaluation creation while retaining legacy committee settings APIs.
- [ ] Authorize committee access from the assigned reviewer row and local `COMMITTEE` role, not from the legacy internal committee table.
- [ ] Preserve HR read access to HĐCM data and HĐCM read access to submitted HRBP data while keeping section edit permissions separate.

### Task 5: Remove the candidate-card committee picker and auto-create the case

**Files:**
- Modify: `apps/extension/src/components/candidates/CandidateCard.tsx`
- Modify: `apps/extension/src/app/side-panel.tsx`
- Modify: `apps/extension/src/components/candidates/styles.css` only if unused picker styles need safe removal.

**Interfaces:**
- Consumes: AMIS stage transition result and interview-round metadata.
- Produces: automatic evaluation-case creation when the candidate enters an interview round, followed by the existing evaluation-page action.

- [ ] Remove committee picker state, loading, selection handlers, and dialog markup.
- [ ] Call case creation automatically after an interview transition when no case exists, with round/template metadata only.
- [ ] Keep the card action and one-form behavior for existing cases and later rounds.
- [ ] Show a non-blocking mapping warning when AMIS members are not linked to VCS accounts; never reopen a committee-selection popup.

### Task 6: Verify without changing unrelated flows

**Files:**
- No test files are created or modified.

- [ ] Run `pnpm typecheck` after each source change.
- [ ] Inspect `apps/backend/dev.log` and `apps/frontend/dev.log` after hot reload.
- [ ] Call the backend health/authenticated API endpoints with a safe local smoke request.
- [ ] Run a browser/extension smoke check covering AMIS board hydration, candidate interview transition, and role-based evaluation access.
- [ ] Re-read this plan and the SonarQube checklist; report exact verification results and any environment blockers.
