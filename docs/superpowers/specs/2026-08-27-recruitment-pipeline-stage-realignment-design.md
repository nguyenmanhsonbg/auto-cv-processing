# Recruitment Pipeline Stage Realignment Design

**Date:** 2026-08-27

**Status:** Proposed for review

## Goal

Align the recruitment pipeline with the approved eight-stage business flow while preserving existing application, offer, interview, import, AMIS sync, and dashboard API keys wherever possible.

## Approved business flow

1. **Ứng tuyển**: candidate applies, CV is processed, CV–JD mapping is completed, and the candidate answers the pre-screening questions.
2. **Screen CV**: AI analyzes the application; HR/TA reviews the CV and mapping result.
3. **Test trước vòng 1**.
4. **Phỏng vấn vòng 1**.
5. **Test trước vòng 2**.
6. **Phỏng vấn vòng 2 / Final Interview**.
7. **Đề xuất / Offer**: offer is prepared, sent, and negotiated.
8. **Đi làm / Onboard**: HR confirms the candidate for onboarding, the candidate waits for onboarding, and only a successful onboard becomes Hired.

The report period for each metric is based on the date of the corresponding event, not the application date:

- Final Interview metrics use the Final Interview completion date.
- Offer metrics use the relevant offer status event date.
- Hired metrics use the successful onboard date (`hiredAt`).
- Sourcing and initial application metrics use the application creation date.

## Stage key strategy

Keep the existing keys and change their business meaning/transition rules:

| Business stage | Existing key | Notes |
|---|---|---|
| Ứng tuyển | `APPLIED` | Remains here through CV processing, mapping, and the candidate's pre-screening answers. |
| Screen CV | `SCREEN_CV` | Covers AI screening and HR/TA review. |
| Test trước vòng 1 | `PRE_TEST_1` | Must no longer represent the pre-screening form. |
| Phỏng vấn vòng 1 | `INTERVIEW_1` | Existing interview round type remains valid. |
| Test trước vòng 2 | `PRE_TEST_2` | Existing test round type remains valid. |
| Phỏng vấn vòng 2 / Final Interview | `INTERVIEW_2` | Final Interview is explicitly confirmed to be `INTERVIEW_2`. |
| Đề xuất / Offer | `OFFER_PENDING`, `OFFER_SENT`, `OFFER_REVISED` | These remain technical offer substages and are grouped as one business stage in the UI/report. |
| Chờ onboard | `ONBOARDING` | New key; entered only after candidate accepts the offer and HR confirms onboarding. |
| Onboard thành công | `HIRED` | Entered only after successful onboarding. |
| Terminal branches | `REJECTED`, `TALENT_POOL` | Continue to be available as cross-cutting terminal outcomes. |

`OfferStatus.ACCEPTED` is an offer outcome, not proof of onboarding and not proof of `HIRED`.

## Offer and onboarding state model

### Offer

Existing offer statuses remain:

- `PENDING`: offer proposal is being prepared or awaiting send.
- `SENT`: offer is sent and awaiting candidate response.
- `REVISED`: a new offer version is being negotiated.
- `ACCEPTED`: candidate accepted the offer.
- `REJECTED_BY_CANDIDATE`, `CANCELLED`, `EXPIRED`: unsuccessful offer outcomes.

After `ACCEPTED`, the application stays in the Offer business stage until HR confirms onboarding. The current stage can remain the existing offer substage for compatibility, while `offerStatus = ACCEPTED` records the candidate's decision.

### Onboarding

Add an onboarding status with these values:

- `PENDING`: HR has confirmed the candidate for onboarding; actual start has not yet been confirmed.
- `COMPLETED`: candidate onboarded successfully.
- `REJECTED`: candidate cancelled or did not complete onboarding.

Add application-level onboarding fields:

- `onboardingStatus` — nullable for legacy applications; required for the new onboarding flow.
- `onboardingConfirmedAt` — timestamp and actor-backed audit point for HR confirmation.
- `onboardingConfirmedById` — HR/Admin user who confirmed onboarding.
- `plannedOnboardAt` — optional planned date; never blocks confirmation.
- `onboardingRejectedAt` — timestamp for the rejected outcome.
- `onboardingRejectedReason` — optional explanation.

Reuse the existing `hiredAt` as the actual successful onboard timestamp. It must be required whenever `currentStage = HIRED` and must not be set when the candidate only accepts an offer.

Transitions:

```text
OFFER_* + offerStatus=ACCEPTED
  -- HR confirms onboarding --> ONBOARDING + onboardingStatus=PENDING
ONBOARDING + PENDING
  -- HR records success --> HIRED + onboardingStatus=COMPLETED + hiredAt=actual onboard time
ONBOARDING + PENDING
  -- HR records cancellation/non-start --> ONBOARDING + onboardingStatus=REJECTED
```

`Onboard Rejected` is a terminal onboarding outcome for reporting, but is not a new top-level funnel stage. This keeps the approved eight-stage display stable while preserving the distinction from general `REJECTED`.

## Interview result and Final Interview classification

The existing `InterviewRoundEntity` remains the source for interview outcomes. `INTERVIEW_2` is the Final Interview.

Final Interview classification:

- `FAIL` or `NO_SHOW` → `Fail ITV`.
- `PASS + AVERAGE` → `Passed Đạt`.
- `PASS + GOOD` → `Passed Tốt`.
- `PASS + EXCELLENT` → `Passed Xuất sắc`.
- `PENDING` or missing result → `None` / chưa có kết quả.
- `POOR` does not qualify as a Passed grade and is reported as `Fail ITV`.

`Passed Không Offer` is not a fourth grade. It is a derived branch for an application that passed Final Interview but has no offer. It may overlap with Passed Đạt, Passed Tốt, or Passed Xuất sắc.

## Dashboard and report metrics

The dashboard backend should expose computed post-Final metrics without adding duplicate database columns for each KPI.

Required metrics:

- Final Interview: total, failed, passed total, Passed Đạt, Passed Tốt, Passed Xuất sắc, Passed Không Offer.
- Offer: total Offer, Offering, Offer Accepted, Offer Rejected.
- Hire: Hired, Onboard Rejected.
- Ratios: Final→Fail, Final→Offer, Offer→Hired, Final→Hired.
- Time to Hire: application→successful onboard and Final Interview→successful onboard.

Offer counts must use unique applications/candidates in the report period, not every offer version. Offer revisions are versions of the same candidate's offer and must not inflate the Offer funnel.

Level quality must aggregate successful Hired applications using the latest successful offer's `OfferEntity.level`, not the candidate's CV-derived `CandidateLevel`. The offer level is the level actually proposed/hired and is the authoritative source for this report.

- Quản lý: normalized offer values containing `MANAGER`, `DIRECTOR`, `LEAD`, or `PM`.
- ≥ Senior: normalized offer values containing `SENIOR`, `SPECIALIST`, `EXPERT`, or equivalent senior titles.
- Experienced: normalized offer values containing `EXPERIENCED` or `MIDDLE`.
- ≤ Junior: normalized offer values containing `JUNIOR`, `ENTRY`, `FRESHER`, or `INTERN`.
- Unrecognized or empty offer levels are not silently assigned to a bucket; they are returned as an unmapped quality value for data cleanup.

Working-day TTH and SLA calculation must be implemented consistently with the workbook definition. The current calendar-day helper is not sufficient for the approved report semantics.

## Affected modules and compatibility requirements

### Backend

- `recruitment-common`: add `ApplicationStage.ONBOARDING` and an onboarding status enum; update stage comments.
- `applications`: add onboarding fields, response mapping, validation, and controlled HR/Admin onboarding transitions.
- `offers`: stop setting `HIRED` on offer acceptance; keep `OfferStatus.ACCEPTED`; route HR confirmation into onboarding.
- `test-rounds`: keep `PRE_TEST_1` for the actual test and remove any assumption that it is the pre-screening form.
- `interview-rounds`: keep existing round types; ensure Final Interview metrics use `INTERVIEW_2` completion events.
- `form-sessions`, mapping, AI screening, and HR review: preserve their workflow statuses but ensure the application stage remains `APPLIED` until form submission, then moves to `SCREEN_CV` for AI/HR review.
- `amis-sync`: update round-to-stage mappings and support the new onboarding/offer semantics without allowing an external sync to mark an accepted offer as `HIRED`.
- `recruitment-import`: accept the new stage/status/fields, require `hired_at` only for successful Hired records, and preserve legacy import compatibility.
- `dashboard`: calculate event-date metrics, group Offer substages, classify Final Interview grades, use latest offer levels for Hired quality, exclude offer versions from counts, and expose onboarding outcomes.
- migrations: add nullable onboarding columns and a safe legacy backfill policy; do not infer historical successful onboard from offer acceptance without an explicit source field.

### Frontend

- Update stage labels and ordering to show the eight business stages.
- Group `OFFER_PENDING`, `OFFER_SENT`, and `OFFER_REVISED` as `Đề xuất` while still showing their detailed status where useful.
- Add HR/Admin controls for confirm onboarding, mark onboard success, and mark onboard rejected.
- Make planned onboard date optional in forms.
- Update dashboard DTO types, KPI cards, tables, charts, and fallback/demo data to match the backend metrics.
- Keep the existing interview evaluation workflow (`ECC → ACC → OFFER`) separate from the application funnel; it is an evaluation workflow, not a replacement for `INTERVIEW_1`/`INTERVIEW_2`.

## Legacy data policy

Existing applications with `HIRED` and `hiredAt` are retained when there is explicit evidence of a completed onboard. Records that were previously auto-marked `HIRED` solely because `offer_status = ACCEPTED` are backfilled to `ONBOARDING/PENDING` and have the acceptance-derived `hiredAt` cleared; this avoids reporting offer acceptance as successful onboarding. New writes enforce the corrected semantics.

Existing applications in `PRE_TEST_1` because of the old pre-screening form backfill need a controlled migration/review path. They should be classified using form status and test-round evidence before changing their stage; a blind mass rewrite risks moving candidates incorrectly.

## Verification requirements

Before implementation is considered complete:

- Typecheck the monorepo with `pnpm typecheck`.
- Inspect backend and frontend hot-reload logs after changes.
- Smoke test stage transitions through the running API.
- Smoke test the dashboard and onboarding controls in the browser.
- Run the SonarQube scanner and inspect both New Code and Overall Code.
- Do not create or modify unit-test files because the repository explicitly forbids changes to `*.spec.ts` and `*.test.ts`.
