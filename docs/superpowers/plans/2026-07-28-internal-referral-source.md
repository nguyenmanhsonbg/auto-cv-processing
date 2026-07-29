# Internal Referral Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an HR/Admin-managed Internal referral source with optional `@viettel.com.vn` email input on public apply, while preserving Freelancer behavior and excluding Internal login.

**Architecture:** Add an `InternalEntity` and a dedicated Internals module for HR/Admin management. Reuse `application_referrals` as one generic referral row per application, adding `sourceType`, nullable `internalId`, and a database invariant that exactly one source owner is present. Public apply resolves Freelancer codes or finds/creates active Internals by normalized email in the same transaction.

**Tech Stack:** NestJS, TypeORM, PostgreSQL migrations, class-validator, React, React Router, TypeScript, existing `apiClient` and shadcn-style UI components, Jest.

## Global Constraints

- Internal emails must use the exact `@viettel.com.vn` domain, case-insensitively.
- Internal email is optional on public apply; no source is valid when both source fields are empty.
- Freelancer code and Internal email are mutually exclusive; the backend must reject both even if the UI prevents it.
- A valid but unknown Internal email is auto-created as active during public apply.
- Internal email is immutable after creation and is not linked to a login account.
- Internal deactivation blocks new referrals but preserves historical application rows.
- Existing Freelancer APIs, identifiers, credentials, and self-service workspace remain unchanged.
- Use `pnpm`; do not add production behavior without a failing test first.

---

### Task 1: Add failing backend tests for Internal email and source rules

**Files:**
- Create: `apps/backend/src/internals/internal-email.util.spec.ts`
- Modify: `apps/backend/src/internals/internals.service.spec.ts`
- Create: `apps/backend/src/applications/referral-source.util.spec.ts`

**Interfaces:**
- Tests will consume `normalizeInternalEmail`, `isInternalEmail`, and the Internal service's resolve-or-create behavior.
- Later tasks will implement these exact helpers and service methods.

- [ ] **Step 1: Write the failing email normalization tests**

```ts
it('normalizes a valid viettel.com.vn address to lowercase', () => {
  expect(normalizeInternalEmail('  User.Name@VIETTEL.COM.VN ')).toBe('user.name@viettel.com.vn');
});

it('rejects an address outside the exact viettel.com.vn domain', () => {
  expect(() => normalizeInternalEmail('user@viettel.vn')).toThrow('INVALID_INTERNAL_EMAIL');
  expect(() => normalizeInternalEmail('user@sub.viettel.com.vn')).toThrow('INVALID_INTERNAL_EMAIL');
});

it('treats an empty optional value as no Internal source', () => {
  expect(normalizeInternalEmail('   ', { optional: true })).toBeNull();
});
```

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure**

Run: `pnpm --filter @interview-assistant/backend exec jest src/internals/internal-email.util.spec.ts --runInBand`

Expected: FAIL because the Internal email helper does not exist yet.

- [ ] **Step 3: Add the failing Internal service behavior tests**

Use a repository fake with `findOne`, `create`, and `save` methods and assert these concrete outcomes:

```ts
it('reuses an existing active Internal for a normalized email', async () => {
  const existing = { id: 'internal-1', email: 'user@viettel.com.vn', isActive: true };
  internalRepo.findOne.mockResolvedValue(existing);

  await expect(service.resolveOrCreateActiveByEmail(' USER@VIETTEL.COM.VN ', manager))
    .resolves.toBe(existing);
  expect(internalRepo.save).not.toHaveBeenCalled();
});

it('creates an active Internal when the normalized email is unknown', async () => {
  internalRepo.findOne.mockResolvedValue(null);
  internalRepo.create.mockImplementation((value) => value);
  internalRepo.save.mockImplementation(async (value) => ({
    id: 'internal-1',
    ...value,
  }));

  await expect(service.resolveOrCreateActiveByEmail('new.user@viettel.com.vn', manager))
    .resolves.toMatchObject({ email: 'new.user@viettel.com.vn', isActive: true });
  expect(internalRepo.save).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'new.user@viettel.com.vn', isActive: true }),
  );
});

it('rejects an inactive Internal instead of creating a duplicate', async () => {
  internalRepo.findOne.mockResolvedValue({
    id: 'internal-1',
    email: 'user@viettel.com.vn',
    isActive: false,
  });

  await expect(service.resolveOrCreateActiveByEmail('user@viettel.com.vn', manager))
    .rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_INTERNAL_EMAIL' }) });
  expect(internalRepo.save).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run the focused service test and verify it fails for the missing service method**

Run: `pnpm --filter @interview-assistant/backend exec jest src/internals/internals.service.spec.ts --runInBand`

Expected: FAIL because `InternalsService` and its resolve-or-create method do not exist yet.

---

### Task 2: Create the Internal entity, generic referral fields, and migration

**Files:**
- Create: `apps/backend/src/internals/entities/internal.entity.ts`
- Create: `apps/backend/src/internals/internals.types.ts`
- Modify: `apps/backend/src/freelancers/entities/application-referral.entity.ts`
- Modify: `apps/backend/src/applications/entities/application.entity.ts`
- Create: `apps/backend/src/migrations/1784851200000-AddInternalsAndGenericApplicationReferrals.ts`

**Interfaces:**
- `InternalEntity` produces `id`, immutable normalized `email`, `isActive`, nullable `createdById`, optional `createdBy`, `referrals`, and timestamps.
- `ApplicationReferralSourceType` produces `'FREELANCER' | 'INTERNAL'`.
- `ApplicationReferralEntity` consumes the new Internal relation and produces `sourceType`, nullable `freelancerId`, nullable `internalId`, and existing `evaluation`.

- [ ] **Step 1: Add the source enum and entity fields**

Define `ApplicationReferralSourceType` in `internals.types.ts`. Keep the existing `ApplicationEntity.freelancerReferral` relation name for compatibility and add the `internal` relation on the referral entity; do not add a second TypeORM relation for the same application row.

- [ ] **Step 2: Write the migration**

The `up` migration must:

1. Create `internals` with a unique email index, active flag, nullable creator foreign key, and timestamps.
2. Add `source_type` with default `FREELANCER` to `application_referrals`.
3. Add nullable `internal_id` and make `freelancer_id` nullable.
4. Backfill every existing referral row as `FREELANCER`.
5. Add the Internal foreign key and indexes for both owner columns.
6. Add a check constraint enforcing either an active Freelancer owner or an Internal owner, never both.
7. Preserve `UQ_application_referrals_application_id`.

The `down` migration removes new constraints, foreign keys, columns, and the `internals` table without deleting applications or users.

- [ ] **Step 3: Run the entity/migration typecheck**

Run: `pnpm --filter @interview-assistant/backend typecheck`

Expected: PASS for the entity and migration layer before services are wired.

---

### Task 3: Implement Internal management APIs and service behavior

**Files:**
- Create: `apps/backend/src/internals/internal-email.util.ts`
- Create: `apps/backend/src/internals/dto/create-internal.dto.ts`
- Create: `apps/backend/src/internals/dto/list-internals-query.dto.ts`
- Create: `apps/backend/src/internals/dto/list-internal-applications-query.dto.ts`
- Create: `apps/backend/src/internals/dto/update-internal-status.dto.ts`
- Create: `apps/backend/src/internals/internals.service.ts`
- Create: `apps/backend/src/internals/internals.controller.ts`
- Create: `apps/backend/src/internals/internals.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/applications/applications.module.ts`

**Interfaces:**
- `normalizeInternalEmail(value: string | null | undefined, options?: { optional?: boolean }): string | null` normalizes or throws `INVALID_INTERNAL_EMAIL`.
- `InternalsService.create({ email, createdById }): Promise<InternalSummary>` rejects duplicate Internal emails and never creates a user.
- `InternalsService.findPaginated`, `findOne`, `findApplications`, `updateStatus` mirror the Freelancer service response shape.
- `InternalsService.resolveOrCreateActiveByEmail(email, manager, createdById?): Promise<InternalEntity>` is transaction-safe and reuses existing active records.
- Routes are `POST /internals`, `GET /internals`, `GET /internals/:id`, `GET /internals/:id/applications`, and `PATCH /internals/:id/status`, all `ADMIN`/`HR` only.

- [ ] **Step 1: Implement the email helper to make Task 1 tests pass**

Use a case-insensitive exact-domain expression such as `/^[^\s@]+@viettel\.com\.vn$/i`; trim and lowercase before returning. Throw a `BadRequestException` with code `INVALID_INTERNAL_EMAIL` for non-optional invalid input.

- [ ] **Step 2: Implement create/list/detail/status methods**

Use the Freelancer pagination and search patterns, but search only `internal.email`, filter `internal.isActive`, and load application count from `internal.referrals`. Reject status changes that attempt to edit email because no email update endpoint exists.

- [ ] **Step 3: Implement application history queries**

Join `application_referrals` by `internal_id`, then candidate and job posting. Return `referralId`, application, candidate name, JD title, process status, HR reception status, evaluation, and timestamps in the same shape as Freelancer detail.

- [ ] **Step 4: Implement transaction-safe resolve-or-create**

Normalize the email, lock the normalized email key where supported by the existing transaction pattern, find the Internal regardless of creator, reject inactive records, and create an active record with `createdById` when available or `null` for public apply. Catch the unique-email violation by re-reading the row so concurrent public applies reuse one Internal.

- [ ] **Step 5: Run the focused tests and backend typecheck**

Run: `pnpm --filter @interview-assistant/backend exec jest src/internals/internal-email.util.spec.ts src/internals/internals.service.spec.ts --runInBand`

Expected: PASS.

Run: `pnpm --filter @interview-assistant/backend typecheck`

Expected: PASS.

---

### Task 4: Integrate Internal/Freelancer source routing into public applications

**Files:**
- Create: `apps/backend/src/applications/referral-source.util.ts`
- Create: `apps/backend/src/applications/referral-source.util.spec.ts`
- Modify: `apps/backend/src/job-postings/dto/public-apply.dto.ts`
- Modify: `apps/backend/src/job-postings/public-job-postings.controller.ts`
- Modify: `apps/backend/src/applications/applications.service.ts`
- Modify: `apps/backend/src/applications/application-sources.service.ts`
- Modify: `apps/backend/src/applications/entities/application.entity.ts`
- Modify: `apps/backend/src/applications/applications.controller.ts`

**Interfaces:**
- Public apply accepts optional `freelancerCode` and optional `internalEmail`.
- `ApplicationsService.assertPublicReferralSource(freelancerCode, internalEmail)` validates mutual exclusion and both source values without creating an application.
- `ApplicationsService.createOrGetApplication` creates at most one referral row with either `FREELANCER` or `INTERNAL` source.
- `assertReferralSourceExclusive({ freelancerCode, internalEmail })` throws `REFERRAL_SOURCE_CONFLICT` when both normalized values are present.

- [ ] **Step 1: Extend DTO and Swagger input**

Add `internalEmail?: string` with `@IsOptional`, `@IsEmail`, `@MaxLength(255)`, and exact-domain `@Matches`. Add it to the multipart Swagger schema.

- [ ] **Step 2: Add source fields to application input and raw payload**

Pass `internalEmail` through `PublicApplyDto`, `createFromApply`, and `CreateApplicationBaseInput`. Include a normalized source marker and hash in raw payload so idempotency retries compare the same referral source without exposing the email.

- [ ] **Step 3: Inject InternalsService and implement source resolution**

Replace the Freelancer-only resolution with a `resolvePublicReferralSource` result containing either `{ type: 'FREELANCER', freelancer }`, `{ type: 'INTERNAL', internal }`, or `null`. Reject both inputs with `REFERRAL_SOURCE_CONFLICT`. Resolve Freelancer codes exactly as before and resolve/create active Internal records through the transaction manager.

- [ ] **Step 4: Preserve idempotency semantics**

Compare the existing referral source type and owner ID/email against the incoming source. Same source is an idempotent replay; changing Freelancer/Internal/none produces `IDEMPOTENCY_CONFLICT`. Do not create a second referral for duplicate applications.

- [ ] **Step 5: Update application relations and response mapping**

Load `freelancerReferral.internal`, `freelancerReferral.freelancer`, and `freelancerReferral.freelancer.user`. Expose `referralSource`, the existing Freelancer summary, an Internal summary `{ referralId, internalId, email }`, and shared `referralEvaluation` while keeping existing Freelancer response fields intact.

- [ ] **Step 6: Run backend application tests and typecheck**

Run: `pnpm --filter @interview-assistant/backend exec jest src/applications/applications.service.spec.ts src/job-postings/public-job-postings.controller.spec.ts --runInBand`

Expected: PASS.

Run: `pnpm --filter @interview-assistant/backend typecheck`

Expected: PASS.

---

### Task 5: Add the public apply source selector and validation

**Files:**
- Modify: `apps/frontend/src/pages/public/PublicJobApplyPage.tsx`
- Modify: `apps/frontend/src/lib/recruitment-public-api.ts`
- Modify: `apps/frontend/src/lib/api-errors.ts`

**Interfaces:**
- `PublicApplicationPayload` consumes `freelancerCode?: string` and `internalEmail?: string`.
- The form state produces `referralSource: 'none' | 'freelancer' | 'internal'`, optional `freelancerCode`, and optional `internalEmail`.

- [ ] **Step 1: Replace the always-visible Freelancer field with a mutually exclusive selector**

Use the existing `RadioGroup`/`RadioGroupItem` components with `none`, `freelancer`, and `internal` values. Clear the inactive field when the selection changes. Keep both text fields optional when their source is selected.

- [ ] **Step 2: Add exact Internal email validation and error mapping**

Validate only a non-empty Internal email. Add `INVALID_INTERNAL_EMAIL` and `REFERRAL_SOURCE_CONFLICT` to frontend API error codes and safe messages. Map backend validation errors back to the visible selected source field.

- [ ] **Step 3: Send only the selected non-empty source value**

Build the submit payload with `freelancerCode` or `internalEmail`, never both. When neither is present, omit both properties. Preserve all existing CV, consent, idempotency, and duplicate handling.

- [ ] **Step 4: Run frontend typecheck**

Run: `pnpm --filter @interview-assistant/frontend typecheck`

Expected: PASS.

---

### Task 6: Add the separate Internal management screen

**Files:**
- Create: `apps/frontend/src/lib/internal-api.ts`
- Create: `apps/frontend/src/pages/interviewer/candidates/InternalListPage.tsx`
- Create: `apps/frontend/src/pages/interviewer/candidates/InternalDetailPage.tsx`
- Modify: `apps/frontend/src/app/routes.tsx`
- Modify: `apps/frontend/src/app/layouts/InterviewerLayout.tsx`
- Modify: `apps/frontend/src/lib/recruitment-api.ts`

**Interfaces:**
- `internal-api.ts` produces `InternalRecord`, `InternalApplicationRecord`, `createInternal`, `listInternals`, `getInternal`, `listInternalApplications`, and `updateInternalStatus`.
- The pages consume the existing pagination, table, dialog, toast, status badge, and application status helpers used by Freelancer pages.

- [ ] **Step 1: Implement the API mapper**

Map `{ internalId, email, isActive, applicationCount, createdAt, updatedAt }` to the frontend record. Map application rows to candidate name, JD title, process status, HR reception status, evaluation, and timestamps.

- [ ] **Step 2: Build the Internal list page**

Mirror Freelancer list behavior: debounced email search, all/active/inactive filter, pagination, create-email dialog, duplicate/invalid email error, row navigation, and activate/deactivate confirmation. The create dialog has one email input and no name, code, account, or password fields.

- [ ] **Step 3: Build the Internal detail page**

Mirror Freelancer detail behavior: email/status/application count, status toggle, search, pagination boundary handling, and read-only application history. Do not add login or self-service evaluation editing.

- [ ] **Step 4: Add HR/Admin routes and navigation**

Mount `/candidates/internals` under `HrRouteGuard`, with `/:internalId` detail. Add an `Internals` sidebar link for HR/Admin next to `Freelancers`; hide it from Freelancer users along with all other HR/Admin navigation.

- [ ] **Step 5: Run frontend typecheck**

Run: `pnpm --filter @interview-assistant/frontend typecheck`

Expected: PASS.

---

### Task 7: Run final verification and inspect the diff

**Files:**
- No new files; verification only.

- [ ] **Step 1: Run all backend tests and typecheck**

Run: `pnpm --filter @interview-assistant/backend test -- --runInBand`

Expected: PASS with zero failed tests.

Run: `pnpm --filter @interview-assistant/backend typecheck`

Expected: PASS.

- [ ] **Step 2: Run frontend typecheck and build**

Run: `pnpm --filter @interview-assistant/frontend typecheck`

Expected: PASS.

Run: `pnpm --filter @interview-assistant/frontend build`

Expected: PASS.

- [ ] **Step 3: Check formatting/conflict markers and Git state**

Run: `git diff --check 56731ae..HEAD`; `rg -n "<<<<<<<|=======|>>>>>>>" apps/backend/src apps/frontend/src`.

Expected: no merge markers and no new whitespace errors in the implementation diff.

- [ ] **Step 4: Review behavior against the confirmed contract**

Verify the final diff includes: three public selector states, optional fields, exact domain validation, auto-create/reuse of Internal records, inactive blocking, separate HR/Admin screen, no Internal login, and unchanged Freelancer routes/API behavior.
