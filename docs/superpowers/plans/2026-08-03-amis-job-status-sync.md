# AMIS Job Status Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture AMIS recruitment status updates and keep the mapped internal job posting status synchronized through both the browser event path and `sync-and-publish`.

**Architecture:** Add a shared backend AMIS-status mapper and update service. Extend the existing page hook/bridge/background message flow to capture the successful `update-field` response. Include the captured status in the existing job sync DTO and apply it transactionally when creating/updating a posting.

**Tech Stack:** NestJS, TypeORM, Jest, TypeScript, Chrome extension APIs, fetch/XHR hooks.

## Global Constraints

- AMIS status `1` maps to `PUBLISHED`, `2` to `INTERNAL`, `5` to `NOT_ACCEPTING_APPLICATIONS`, and `3` to `CLOSED`.
- Unknown/unmapped AMIS recruitment IDs must not create internal postings.
- Existing payloads without status remain backward compatible; supplied invalid statuses are rejected.
- Preserve unrelated working-tree changes.

---

### Task 1: Add shared status mapping and backend status update contract

**Files:**
- Modify: `apps/backend/src/recruitment-common/enums/recruitment.enum.ts`
- Create: `apps/backend/src/extension-integration/amis-job-status.util.ts`
- Create: `apps/backend/src/extension-integration/amis-job-status.util.spec.ts`
- Modify: `apps/backend/src/extension-integration/dto/sync-amis-job-posting.dto.ts`
- Modify: `apps/extension/src/types.ts`

**Interfaces:**
- `mapAmisJobStatus(status: number): JobPostingStatus` accepts only `1 | 2 | 3 | 5` and throws a validation error for other values.
- `AmisJobStatus` is `1 | 2 | 3 | 5`.
- `SyncAmisJobPostingRequest.amisStatus?: AmisJobStatus` and backend DTO mirrors the optional field.

- [ ] **Step 1: Write failing mapping tests** for all four values and an unsupported value.
- [ ] **Step 2: Run `pnpm --filter @interview-assistant/backend test -- amis-job-status.util.spec.ts` and verify the new tests fail because the mapper is missing.**
- [ ] **Step 3: Add `INTERNAL` and `NOT_ACCEPTING_APPLICATIONS` to `JobPostingStatus`, define `AmisJobStatus`, and implement the mapper.**
- [ ] **Step 4: Add optional `amisStatus` validation to the sync DTO and extension request type.**
- [ ] **Step 5: Run the targeted backend test and verify it passes.**

### Task 2: Apply AMIS status in `sync-and-publish` and standalone backend update

**Files:**
- Modify: `apps/backend/src/extension-integration/extension-integration.controller.ts`
- Modify: `apps/backend/src/extension-integration/extension-integration.service.ts`
- Create: `apps/backend/src/extension-integration/amis-job-status.service.spec.ts`

**Interfaces:**
- Add `POST /extension/amis/job-postings/status-sync` accepting `{ amisRecruitmentId: string; amisStatus: 1 | 2 | 3 | 5; sourceUrl?: string }` and returning the mapped internal posting ID/status.
- `syncAndPublishFromAmis` applies `dto.amisStatus` to the created/updated posting inside its existing transaction.

- [ ] **Step 1: Write failing service tests** proving create/update sync applies `amisStatus`, and standalone sync rejects an unmapped ID.
- [ ] **Step 2: Run the targeted Jest tests and verify they fail for the missing status behavior.**
- [ ] **Step 3: Add the status-sync DTO/controller endpoint and a transaction-safe service method that resolves `RecruitmentExternalReferenceEntity` by AMIS ID.**
- [ ] **Step 4: Reuse the mapper in `createNewPosting`, `updateExistingPosting`, and the standalone status-sync method; leave status unchanged when the field is omitted.**
- [ ] **Step 5: Run targeted backend tests and verify they pass.**

### Task 3: Capture `update-field` responses in the AMIS page hook and bridge

**Files:**
- Modify: `apps/extension/src/amis-page-hook.ts`
- Modify: `apps/extension/src/amis-bridge.ts`
- Modify: `apps/extension/src/types.ts`
- Create: `apps/extension/src/amis-job-status.test.ts`

**Interfaces:**
- Add runtime message `AMIS_RECRUITMENT_STATUS_UPDATED` with `{ amisRecruitmentId: string; amisStatus: 1 | 2 | 3 | 5; sourceUrl: string }`.
- Add a pure extractor that recursively accepts common AMIS response envelopes and returns `null` unless both `recruitmentID` and supported `status` exist.

- [ ] **Step 1: Write failing extractor tests** for direct, nested, malformed, and unsupported response payloads.
- [ ] **Step 2: Run the extension test command for the new test and verify it fails because the extractor is missing.**
- [ ] **Step 3: Implement the pure extractor and add XHR/fetch hooks for `/RecruitmentAPI/api/recruitment/update-field`.**
- [ ] **Step 4: Forward the page event through the existing bridge message listener.**
- [ ] **Step 5: Run the targeted extension test and typecheck.**

### Task 4: Forward the event from background to backend and add diagnostics

**Files:**
- Modify: `apps/extension/src/api-client.ts`
- Modify: `apps/extension/src/background.ts`
- Modify: `apps/extension/src/amis-diagnostics-store.ts` or the existing diagnostic type definitions in `apps/extension/src/types.ts`

**Interfaces:**
- `syncAmisJobStatus(accessToken, payload)` calls `/extension/amis/job-postings/status-sync`.
- Background handler deduplicates by `amisRecruitmentId:amisStatus`, uses the existing auth/heartbeat flow, and records captured/skipped/success/failed diagnostics.

- [ ] **Step 1: Write the failing background/API test or extend the existing background relay test to assert the status-sync request payload.**
- [ ] **Step 2: Run the targeted test and verify it fails before the handler/API call exists.**
- [ ] **Step 3: Implement API client and background handler, including 401 token clearing and non-fatal diagnostic failures.**
- [ ] **Step 4: Run targeted extension tests and typecheck.**

### Task 5: Verify integration and preserve repository state

**Files:**
- No unrelated files.

- [ ] **Step 1: Run backend targeted tests and full backend typecheck.**
- [ ] **Step 2: Run extension typecheck/build and existing extension tests.**
- [ ] **Step 3: Inspect `git diff` and confirm only the spec/plan plus implementation files changed; do not alter existing user changes in `side-panel.tsx`, `styles.css`, or `docs.rar`.**
- [ ] **Step 4: Commit implementation with `feat: sync AMIS job posting status`.**
