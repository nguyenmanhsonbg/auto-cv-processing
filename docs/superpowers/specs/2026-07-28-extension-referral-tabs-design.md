# Extension Freelancer and Internal Tabs Design

## Goal

Add global Freelancer and Internal management tabs to the browser extension, matching the supplied HR/card and CV-list references while preserving the existing Posting and CV tabs.

## Confirmed requirements

- The tabs show all Freelancer/Internal records and all associated applications across the system, not only the AMIS recruitment currently open.
- Freelancer supports create, detail/application inspection, and soft delete. Soft delete means deactivation: referral history and CV/application data remain intact, and the record can be activated again.
- Freelancer creation stores name, email, and phone. The existing generated identifier and initial password remain available after creation so HR can send them to the Freelancer.
- Internal supports create, detail/application inspection, and activate/deactivate. Internal has no delete action in this iteration.
- Internal creation stores only an email and validates the exact `@viettel.com.vn` domain. Internal does not receive a login account.
- Both tabs are available only to authenticated HR/Admin users through existing backend role guards.
- Existing Posting and CV workflows remain available and unchanged.

## Recommended architecture

The extension receives one consolidated referral-management response per source type from a new HR/Admin-protected extension endpoint. The backend composes the existing Freelancer/Internal summaries with their application rows, metrics, application date, process status, evaluation note, and candidate assignees. This keeps the extension from making one request per card and keeps source/statistics rules in the backend.

The extension adds a small API client and two focused UI renderers inside the existing side panel. Existing management endpoints continue to own create/status behavior; the Freelancer soft-delete button calls the existing status update operation with `isActive=false`, so no destructive delete is introduced.

## Data contract

The consolidated response contains:

- Source type: `FREELANCER` or `INTERNAL`.
- Person summary: id, display name when applicable, identifier when applicable, email, phone when applicable, active status, total application count, and created/updated timestamps.
- Metrics: total applications, processing applications, passed applications, and pass rate.
- Application rows: referral/application ids, candidate name, job posting title, process status, HR reception status, applied time, evaluation note, and assigned HR/TA users.
- Pagination/search/status parameters for people; the applications in each returned person group include all rows for that person.

Existing records without a phone remain valid and display an empty placeholder until updated through a future edit flow. The Internal response never includes login credentials.

## UI behavior

The top navigation becomes:

`Đăng bài | CV | Freelancer | Nội bộ`

Freelancer and Internal tabs use the same visual system:

- Search input and active/inactive filter.
- Person cards with identity information, metric cards, and an expandable `Chi tiết` section.
- Detail table columns: STT, CV/ứng viên, JD, tình trạng xử lý, thời gian nộp CV, TA quản lý/assignee, and note.
- Empty, loading, error, and pagination states.

Freelancer-only actions:

- `Thêm Freelancer`: modal fields name, email, phone; on success show identifier and initial password with copy actions.
- Soft-delete icon: confirmation modal explains that the Freelancer is deactivated and history is preserved; confirmation calls status update. Inactive records expose an activate action.

Internal-only actions:

- `Thêm Nội bộ`: modal with email only; client and server validate exact `@viettel.com.vn` domain.
- Activate/deactivate is supported; no delete icon or delete confirmation is shown.

## Phone field extension

Phone is stored on `freelancers`, not shared `users`, because it is a Freelancer management attribute and must not change unrelated users. The column is nullable for backward compatibility. Freelancer create DTO/service/response and the extension client are extended to accept and return it. A migration adds the nullable column.

## Error handling

- Auth/permission errors use the existing extension API error handling.
- Create validation errors stay inline in the modal.
- Failed list/detail loads stay inside the relevant tab and do not reset the Posting/CV workflow.
- Soft-delete failures show a toast and leave the card state unchanged.
- Internal invalid-domain and duplicate-email errors are shown as safe inline messages.

## Testing and verification

- Backend tests cover phone normalization/storage input, consolidated Freelancer/Internal response mapping, and soft-delete behavior preserving referrals.
- Extension typecheck and production build must pass.
- Existing backend/frontend tests must be rerun; known unrelated baseline failures are reported separately rather than hidden.
