# Implementation Plan: Extension Freelancer and Internal Management Tabs

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan task-by-task.

**Goal:** Add global Freelancer and Internal management tabs to the browser extension, showing every person and all related CV applications, with Freelancer creation/detail/soft-deactivation and Internal creation/detail/activation-deactivation.

**Architecture:** Add one HR/Admin-only backend aggregation endpoint that returns a paginated list of referral-source people and their application rows for either `FREELANCER` or `INTERNAL`. Reuse the existing Freelancer/Internal CRUD and status APIs for mutations. Keep the extension UI in a focused referral-management component rendered by the existing side panel tab shell, so Posting and CV behavior remain unchanged.

**Tech stack:** NestJS, TypeORM, PostgreSQL migrations, React, TypeScript, Vite, existing extension API client and CSS.

## Task 1: Add failing backend coverage for the new response rules

**Files:**
- Create `apps/backend/src/extension-integration/referral-source-summary.util.ts`
- Create `apps/backend/src/extension-integration/referral-source-summary.util.spec.ts`
- Create or extend a focused Freelancer phone validation/service test under `apps/backend/src/freelancers/`

1. Write tests for trimming an optional Freelancer phone, preserving `null` when omitted, and rejecting values beyond the supported length.
2. Write tests for mapping a referral-source person into summary metrics: total applications, processing applications, passed applications, and pass rate.
3. Write tests for application rows containing applied time, evaluation, and candidate assignees.
4. Run the focused Jest tests and record the expected RED failure before implementing production code.

## Task 2: Extend backend Freelancer data and expose the global referral-source endpoint

**Files:**
- Modify `apps/backend/src/freelancers/entities/freelancer.entity.ts`
- Modify `apps/backend/src/freelancers/dto/create-freelancer.dto.ts`
- Modify `apps/backend/src/freelancers/freelancers.service.ts`
- Modify `apps/backend/src/freelancers/freelancers.controller.ts`
- Modify `apps/backend/src/internals/internals.service.ts` and related response types as needed
- Modify `apps/backend/src/extension-integration/extension-integration.module.ts`
- Modify `apps/backend/src/extension-integration/extension-integration.service.ts`
- Modify `apps/backend/src/extension-integration/extension-integration.controller.ts`
- Create `apps/backend/src/extension-integration/dto/list-extension-referral-sources-query.dto.ts`
- Create `apps/backend/src/migrations/1784937600000-AddFreelancerPhone.ts`

1. Add nullable `phone` storage to `freelancers`, keeping create/update compatibility for existing callers.
2. Add the migration for the nullable phone column.
3. Return phone in Freelancer summaries and accept an optional trimmed phone during creation.
4. Include `appliedAt` and candidate assignees in Freelancer and Internal application summaries.
5. Inject the existing Freelancer and Internal services into the extension integration module.
6. Add `GET /extension/amis/referral-sources?source=FREELANCER|INTERNAL&page=&limit=&search=&status=` for HR/Admin users, returning people, metrics, application rows, and pagination metadata.
7. Reuse the existing `PATCH /freelancers/:id/status` and `PATCH /internals/:id/status` routes for deactivation/reactivation; do not add hard-delete behavior.
8. Rerun Task 1 tests and confirm GREEN.

## Task 3: Add extension referral-management types and API methods

**Files:**
- Modify `apps/extension/src/types.ts`
- Modify `apps/extension/src/api-client.ts`

1. Add source-type, person-summary, metric, application-row, pagination, and mutation payload types.
2. Add API methods for listing global referral sources, creating a Freelancer with phone, creating an Internal by email, and changing active status.
3. Keep the API methods compatible with the existing response-envelope unwrapping behavior.
4. Run extension TypeScript checking to catch contract and import errors.

## Task 4: Build the focused Freelancer/Internal management UI

**Files:**
- Create `apps/extension/src/referral-management.tsx`
- Modify `apps/extension/src/side-panel.tsx`

1. Add Freelancer and Internal workspace tabs while preserving the existing Posting and CV tabs.
2. Render global search, processing-status filter, JD filter when data supports it, add-person action, cards, metrics, detail toggle, and application table.
3. Render all returned people and all returned applications with pagination; do not scope requests to the current AMIS recruitment.
4. Add Freelancer modal fields for name, email, and phone, and display the generated identifier/password after successful creation.
5. Add Internal modal with the email field and exact `@viettel.com.vn` validation when a value is entered.
6. Add Freelancer soft-deactivation confirmation that explains history is preserved and uses the status endpoint; allow reactivation from the same UI.
7. Allow Internal activation/deactivation from the detail card but omit any delete action.
8. Preserve existing Posting/CV state and rendering paths.

## Task 5: Match the supplied extension visual treatment

**Files:**
- Modify `apps/extension/src/styles.css`

1. Add isolated `referral-*` styles for tabs, cards, metric tiles, status pills, modal, confirmation dialog, and horizontally scrollable application tables.
2. Match the supplied layout: green primary actions, light blue table headers, compact stat cards, rounded cards, and responsive narrow-panel behavior.
3. Add loading, empty, validation, and error states without changing existing CV/Posting styles.

## Task 6: Verify the implementation and report remaining baseline issues

**Files:**
- No source changes expected unless verification finds a scoped defect.

1. Run focused backend referral/Internal tests.
2. Run shared build, backend typecheck/build, extension typecheck/build, and frontend typecheck.
3. Run `git diff --check` and inspect the final diff/status to ensure earlier Internal changes remain intact.
4. Report exactly which checks pass and clearly separate any pre-existing unrelated failures.

