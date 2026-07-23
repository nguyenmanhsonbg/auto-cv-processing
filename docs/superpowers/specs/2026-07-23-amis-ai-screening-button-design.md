# AMIS Candidate AI Screening Button Design

## Goal

Allow HR to see whether each AMIS candidate has completed CV–JD mapping and AI screening, and provide a per-candidate action to run the AI screening API. The existing `Tải đánh giá AI` action remains responsible only for generating the PDF and uploading it to AMIS.

## Current Context

The Extension side panel loads candidates from:

```text
GET /extension/amis/recruitments/:amisRecruitmentId/applications
```

Each card currently exposes `Tải đánh giá AI` and `Đồng bộ AMIS`. The existing `Tải đánh giá AI` action requests a PDF preview through the frontend page and uploads that PDF to the AMIS document form; it does not call the AI screening endpoint.

The recruitment backend already exposes the synchronous action:

```text
POST /applications/:applicationId/ai-screening/run
```

That action validates the clean CV, parsed profile, JD and submitted form, then runs CV–JD mapping and AI screening together. On success it persists both results and sets the application to `AI_SCREENING_DONE`.

## Selected Approach

Keep the two actions separate:

1. `Đánh giá AI` runs the backend screening endpoint and refreshes the candidate status.
2. `Tải đánh giá AI` is enabled only after screening succeeds, then creates and uploads the PDF to AMIS.
3. `Đồng bộ AMIS` keeps its existing clean-CV upload behavior.

The Extension list response will expose separate mapping and AI screening statuses. This is more reliable than inferring both states from one application status and makes the card state explicit after a reload.

## Status Model

The list response should expose at least:

```text
mappingStatus: REQUESTED | DONE | FAILED | REJECTED | null
aiScreeningStatus: REQUESTED | DONE | FAILED | null
```

It may also expose the latest mapping score, AI score and recommendation so the card can show the result without another request.

The expected transitions are:

```text
null/previous state
  -> REQUESTED when the run begins
  -> DONE when mapping and AI screening are persisted successfully
  -> FAILED when the run fails
```

When `aiScreeningStatus = DONE`, the `Đánh giá AI` button is disabled. This prevents repeated clicks and repeated expensive AI calls. The button must remain disabled after the list is refreshed because the state is persisted in the backend. A future explicit “Đánh giá lại” feature is out of scope for this change.

## UI Behavior

Each candidate card will show a compact status area:

```text
Mapping AI: Chưa đánh giá | Đang đánh giá | Đã đánh giá | Lỗi
AI Screening: Chưa đánh giá | Đang đánh giá | Đã đánh giá | Lỗi
```

The new button is placed next to the existing actions:

```text
[Đánh giá AI] [Tải đánh giá AI] [Đồng bộ AMIS]
```

Behavior by state:

- No completed result: `Đánh giá AI` enabled; `Tải đánh giá AI` disabled.
- `REQUESTED`: `Đang đánh giá...`; the current candidate action is disabled.
- `DONE`: `Đã đánh giá`; the action is disabled; `Tải đánh giá AI` enabled.
- `FAILED`: `Thử lại`; the action is enabled and the error is shown to HR.

While one candidate is running, the loading state is tracked by application ID so the UI cannot accidentally send duplicate requests for that candidate. After a successful response, the Extension reloads the AMIS recruitment application list.

## Backend Changes

The Extension application-list contract will be extended in the integration DTO/type and service. The service will load the current application status fields and the latest mapping/AI result summaries needed by the card.

The run flow will persist `REQUESTED` before starting the expensive AI work, then persist `DONE` or `FAILED` in the success/error path. If the application is already `DONE`, the backend should reject a duplicate run or return a stable already-completed response; the Extension also prevents the normal duplicate click by disabling the button.

## Extension Changes

The Extension API client will add a typed wrapper for `POST /applications/:applicationId/ai-screening/run`.

The side panel will add a separate loading state and handler for running AI screening. It will not reuse the existing PDF-upload handler. Authentication errors will follow the current token-refresh/logout behavior. Validation errors such as missing clean CV, parsed profile or submitted questionnaire will be shown in the existing application message area.

The existing PDF action will be guarded by `aiScreeningStatus = DONE`, so a PDF cannot be requested before the actual evaluation is available.

## End-to-End Flow

```text
AMIS candidate list
  -> Extension sync/list API
  -> card shows mappingStatus + aiScreeningStatus
  -> HR clicks Đánh giá AI
  -> POST /applications/:id/ai-screening/run
  -> backend validates required inputs
  -> backend runs mapping and AI screening
  -> backend persists results and DONE status
  -> Extension reloads list
  -> HR clicks Tải đánh giá AI
  -> frontend generates PDF from persisted result
  -> Extension uploads PDF to AMIS
```

## Validation and Failure Handling

- Missing clean CV, parsed profile or submitted form must not produce a false `DONE` state.
- A failed request must leave the application visible with `FAILED` status and an actionable retry button.
- The frontend must not enable PDF upload based only on a CV score; it must require a completed AI screening result.
- Repeated clicks while the same request is running must be blocked in the UI and guarded by the backend.
- Existing candidate synchronization and clean-CV upload behavior must remain unchanged.

## Acceptance Criteria

1. Every candidate card shows whether mapping and AI screening are not started, running, completed or failed.
2. Clicking `Đánh giá AI` calls `POST /applications/:id/ai-screening/run` for that candidate.
3. A successful run updates the card to completed without requiring a full page reload.
4. Once `aiScreeningStatus = DONE`, `Đánh giá AI` is disabled, including after reopening or refreshing the panel.
5. `Tải đánh giá AI` remains a separate PDF/upload action and is disabled until screening is complete.
6. Missing prerequisites and API failures are visible to HR and do not appear as successful evaluations.
7. Existing `Đồng bộ AMIS` and application autosync flows continue to work.

## Out of Scope

- Batch AI screening for multiple candidates.
- Automatic PDF upload after screening.
- A separate manual “Đánh giá lại” action for already completed candidates.
- Changes to the AMIS candidate scoring algorithm or CV parsing pipeline.

## Expected Files

- `apps/backend/src/extension-integration/extension-integration.service.ts`
- `apps/backend/src/extension-integration/dto/sync-amis-applications.dto.ts`
- `apps/backend/src/applications/applications.service.ts`
- `apps/extension/src/api-client.ts`
- `apps/extension/src/types.ts`
- `apps/extension/src/side-panel.tsx`
