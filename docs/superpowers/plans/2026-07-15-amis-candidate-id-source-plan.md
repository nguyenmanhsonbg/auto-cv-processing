# AMIS Candidate ID Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Store the AMIS `CandidateID` as a dedicated, source-specific field and expose it in the AMIS applications API.

**Architecture:** Add nullable `amis_candidate_id` to `application_sources`, because the identifier belongs to the AMIS source record. During AMIS application sync, preserve the existing filename/application-id match, pass the AMIS ID into the source creation path, and return it in the AMIS application list response.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Jest, React/TypeScript extension.

## Global Constraints

- Keep `raw_payload` unchanged for backwards compatibility.
- Do not change duplicate matching behavior.
- Only assign the dedicated ID from the AMIS application row being synced.

### Task 1: Add the failing persistence/response test

**Files:**
- Modify: `apps/backend/src/applications/applications.service.spec.ts`

- [ ] Add a test expectation that an AMIS source input carries `amisCandidateId` into the created source.
- [ ] Run the focused test and confirm it fails because the field is not yet supported.

### Task 2: Add the source column and sync wiring

**Files:**
- Create: `apps/backend/src/migrations/1783150000000-AddAmisCandidateIdToApplicationSources.ts`
- Modify: `apps/backend/src/applications/entities/application-source.entity.ts`
- Modify: `apps/backend/src/applications/applications.service.ts`
- Modify: `apps/backend/src/extension-integration/extension-integration.service.ts`

- [ ] Add nullable `amis_candidate_id` to `application_sources`.
- [ ] Add `amisCandidateId` to the source entity and application creation input.
- [ ] Pass `item.candidateId` from AMIS sync into the source creation input.
- [ ] Keep filename-based matching as the association mechanism.

### Task 3: Expose the dedicated ID to the extension

**Files:**
- Modify: `apps/backend/src/extension-integration/dto/sync-amis-applications.dto.ts`
- Modify: `apps/backend/src/extension-integration/extension-integration.service.ts`
- Modify: `apps/extension/src/types.ts`

- [ ] Add `amisCandidateId` to the AMIS application list DTO and response mapping.
- [ ] Add the matching extension type field.

### Task 4: Verify

- [ ] Run focused backend tests.
- [ ] Run backend typecheck.
- [ ] Run extension typecheck.
- [ ] Inspect the diff and migration SQL shape.
