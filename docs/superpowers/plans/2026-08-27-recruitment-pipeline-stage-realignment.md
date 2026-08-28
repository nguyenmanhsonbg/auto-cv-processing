# Recruitment Pipeline Stage Realignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align application stages, Offer/Onboarding transitions, and recruitment dashboard metrics with the approved eight-stage workflow.

**Architecture:** Preserve existing stage and offer keys for compatibility, add `ONBOARDING` and application-level onboarding metadata, and calculate reporting KPIs from event timestamps. Keep Final Interview as `INTERVIEW_2` and keep the separate `ECC → ACC → OFFER` evaluation workflow unchanged.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, React, Vite, TypeScript, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-27-recruitment-pipeline-stage-realignment-design.md`

## Global Constraints

- Use pnpm only.
- Never create or modify `*.spec.ts` or `*.test.ts` files.
- Never run build, lint, or dev-server commands.
- Run `pnpm typecheck` after every source-code change and inspect hot-reload logs.
- Preserve API contracts unless the new onboarding endpoints/fields are required by this feature.
- `HIRED` means successful onboarding only; offer acceptance alone must not set `HIRED` or `hiredAt`.
- Planned onboard date is optional; actual onboard success must provide the existing `hiredAt` timestamp.

---

### Task 1: Add onboarding domain fields and controlled transitions

**Files:**
- Create: `apps/backend/src/recruitment-common/enums/onboarding-status.enum.ts`
- Modify: `apps/backend/src/recruitment-common/enums/application-stage.enum.ts`
- Modify: `apps/backend/src/recruitment-common/enums/index.ts`
- Modify: `apps/backend/src/applications/entities/application.entity.ts`
- Create: `apps/backend/src/applications/dto/confirm-onboarding.dto.ts`
- Create: `apps/backend/src/applications/dto/complete-onboarding.dto.ts`
- Create: `apps/backend/src/applications/dto/reject-onboarding.dto.ts`
- Modify: `apps/backend/src/applications/applications.service.ts`
- Modify: `apps/backend/src/applications/applications.controller.ts`
- Modify: `apps/backend/src/applications/applications.module.ts`
- Create: `apps/backend/src/migrations/1786200000000-AddApplicationOnboardingFields.ts`

**Interfaces:**
- `OnboardingStatus = PENDING | COMPLETED | REJECTED`.
- `ApplicationsService.confirmOnboarding(applicationId, actorId, dto)` sets `currentStage=ONBOARDING`, `onboardingStatus=PENDING`, confirmation actor/time, and optional planned date.
- `ApplicationsService.completeOnboarding(applicationId, actorId, dto)` requires `ONBOARDING/PENDING`, sets `onboardingStatus=COMPLETED`, `currentStage=HIRED`, and `hiredAt` to the supplied or current actual onboard time.
- `ApplicationsService.rejectOnboarding(applicationId, actorId, dto)` requires `ONBOARDING/PENDING`, sets `onboardingStatus=REJECTED` and rejection metadata without setting `hiredAt`.

- [ ] Add the enum and export it from the recruitment-common barrel.
- [ ] Add nullable onboarding columns to `applications`; keep `hiredAt` as the successful onboard timestamp.
- [ ] Add guarded HR/Admin endpoints under `/applications/:id/onboarding/*` with DTO validation and audit/workflow records.
- [ ] Add a TypeORM migration with nullable legacy-safe columns and indexes only where needed.
- [ ] Run `pnpm typecheck`; inspect `apps/backend/dev.log`.

### Task 2: Correct existing pipeline transition rules

**Files:**
- Modify: `apps/backend/src/form-sessions/form-sessions.service.ts`
- Modify: `apps/backend/src/applications/applications.service.ts`
- Modify: `apps/backend/src/test-rounds/services/test-rounds.service.ts`
- Modify: `apps/backend/src/interview-rounds/services/interview-rounds.service.ts`
- Modify: `apps/backend/src/offers/services/offers.service.ts`
- Modify: `apps/backend/src/offers/offers.controller.ts`
- Modify: `apps/backend/src/amis-sync/services/amis-sync.service.ts`
- Modify: `apps/backend/src/recruitment-import/recruitment-import.service.ts`
- Modify: `apps/backend/src/migrations/1785999999999-FixRecruitmentPipelineSetup.ts` only if a new forward-safe correction is required; do not rewrite historical data blindly.

**Interfaces:**
- Pre-screening form creation/submission remains in application `APPLIED` until submission; submitted form/AI/HR review maps to `SCREEN_CV`.
- `PRE_TEST_1` is entered only when the first actual test is assigned/started.
- Interview result transitions remain `INTERVIEW_1 → PRE_TEST_2 → INTERVIEW_2 → OFFER_PENDING`.
- Offer acceptance records `OfferStatus.ACCEPTED` and response time but leaves the application out of `HIRED` until HR confirms onboarding.
- AMIS sync cannot overwrite a locally successful onboard with an accepted-offer-only state.

- [ ] Remove the old pre-screening-form assumption from stage comments, backfill logic, and service transitions.
- [ ] Make HR approval create/enable the first test stage rather than treating the pre-screening form as `PRE_TEST_1`.
- [ ] Change offer acceptance and import handling so `ACCEPTED` does not assign `HIRED` or `hiredAt`.
- [ ] Ensure AMIS mappings preserve the existing interview/offer keys and handle `ONBOARDING`/`HIRED` safely.
- [ ] Run `pnpm typecheck`; inspect backend logs after each logical batch.

### Task 3: Implement event-date dashboard metrics

**Files:**
- Modify: `apps/backend/src/dashboard/dto/pipeline-dashboard.dto.ts`
- Modify: `apps/backend/src/dashboard/services/dashboard.service.ts`
- Modify: `apps/frontend/src/lib/dashboard-api.ts`

**Interfaces:**
- Add a typed post-final metrics object to the pipeline dashboard response for Final Interview, Offer, Hire, ratios, and TTH.
- Use `INTERVIEW_2.completedAt` for Final Interview event dates.
- Use offer version `createdAt`, `sentAt`, and `respondedAt` according to the status for Offer event dates; deduplicate by application for funnel counts.
- Use `hiredAt` for successful Hired event dates and `onboardingStatus=REJECTED` for Onboard Rejected.
- Use working-day calculations for Apply→Onboard and Final→Onboard/TTH and the documented SLA intervals.

- [ ] Add pure, small dashboard helpers for Final classification, offer aggregation, working-day difference, level normalization, and unique application selection.
- [ ] Calculate Passed Đạt/Tốt/Xuất sắc from Final `PASS` plus `AVERAGE/GOOD/EXCELLENT`; classify `POOR`, `FAIL`, and `NO_SHOW` as Fail ITV; keep pending as None.
- [ ] Calculate Passed Không Offer as passed Final applications without any offer, independently of grade.
- [ ] Calculate Offering, Offer Accepted, Offer Rejected, Hired, and Onboard Rejected using application-level deduplication.
- [ ] Normalize latest successful `OfferEntity.level` into Quản lý, ≥ Senior, Experienced, ≤ Junior; return unrecognized values as unmapped.
- [ ] Add event-date filtering so each metric is grouped by its own event date while sourcing remains application-date based.
- [ ] Run `pnpm typecheck`; inspect backend logs.

### Task 4: Update dashboard and application UI

**Files:**
- Modify: `apps/frontend/src/pages/dashboard/types.ts`
- Modify: `apps/frontend/src/pages/dashboard/components/tab-pipeline/RecruitmentFunnelCard.tsx`
- Modify: `apps/frontend/src/pages/dashboard/components/tab-pipeline/index.tsx`
- Modify: `apps/frontend/src/pages/dashboard/components/tab-pipeline/OfferStatusDistributionChart.tsx`
- Modify: `apps/frontend/src/pages/dashboard/components/tab-pipeline/LevelHiredStructureChart.tsx`
- Modify: `apps/frontend/src/pages/dashboard/components/tab-pipeline/TimeMetricsCard.tsx`
- Modify: `apps/frontend/src/pages/recruitment/applications/ApplicationDetailPage.tsx`
- Modify: `apps/frontend/src/pages/dashboard/data/dashboard-data.ts`

**Interfaces:**
- The main funnel renders eight business stages; Offer technical substages are grouped under `Đề xuất`.
- Application detail exposes optional planned onboard date and HR controls for confirm, complete, and reject onboarding.
- Dashboard post-final report renders the approved Final/Offer/Hire counts, ratios, level groups, and event-date TTH values.

- [ ] Replace old stage labels/order with the approved eight-stage labels while retaining terminal filters.
- [ ] Add onboarding status and action states with accessible labels, loading, disabled, and error handling.
- [ ] Replace static/demo metric assumptions that conflict with the backend response; keep fallback data schema-compatible.
- [ ] Update offer and level chart labels to the approved Vietnamese groups and include unmapped data safely.
- [ ] Run `pnpm typecheck`; inspect `apps/frontend/dev.log`.

### Task 5: Verify integration and regression boundaries

**Files:**
- Modify: `docs/superpowers/specs/2026-08-27-recruitment-pipeline-stage-realignment-design.md` only if implementation evidence requires a correction.

- [ ] Run `pnpm typecheck` and capture a clean result.
- [ ] Inspect backend and frontend runtime logs for reload errors.
- [ ] API smoke test: accept offer, confirm onboarding without planned date, complete onboarding with actual date, reject onboarding, and verify invalid transitions return controlled errors.
- [ ] API smoke test: verify form submission/AI/HR stage mapping and test/interview/offer transitions.
- [ ] Browser smoke test the recruitment application detail page and dashboard at the running frontend.
- [ ] Run the repository SonarQube scanner and inspect New Code and Overall Code; do not alter configuration or manually mark issues fixed.
