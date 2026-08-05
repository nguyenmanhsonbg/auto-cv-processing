# AMIS Job Status Synchronization Design

## Goal

When AMIS updates a recruitment through `POST https://amisapp.misa.vn/recruitment/APIS/g1/RecruitmentAPI/api/recruitment/update-field`, capture the successful response in the browser extension, identify the `recruitmentID` and `status`, and synchronize the mapped internal job posting.

## Status mapping

| AMIS status | Meaning | Internal `JobPostingStatus` |
| ---: | --- | --- |
| 1 | Công khai | `PUBLISHED` |
| 2 | Nội bộ | `INTERNAL` |
| 5 | Ngừng nhận hồ sơ | `NOT_ACCEPTING_APPLICATIONS` |
| 3 | Đóng | `CLOSED` |

The two new internal statuses are explicit values rather than being collapsed into draft/closed. Existing public and closed behavior remains compatible.

## Data flow

1. The AMIS page hook observes fetch and XHR responses for the update-field endpoint.
2. On a successful JSON response, the hook extracts `recruitmentID` and numeric `status` from the response payload. It emits a runtime event only when both are valid and the status is supported.
3. The extension background forwards the event to the backend using the authenticated extension API.
4. The backend looks up the AMIS mapping in `recruitment_external_references` (`source_system=AMIS`, `external_entity_type=JOB_POSTING`, `external_id=recruitmentID`) and updates the mapped `job_postings.status`.
5. The backend returns the updated posting status. Unknown/unmapped IDs do not create records; they produce a diagnostic/error response.

## Initial sync-and-publish path

The existing `POST /extension/amis/job-postings/sync-and-publish` path also participates in status synchronization:

- The extension includes the captured AMIS numeric `status` in the sync payload.
- The backend validates the status and applies the same four-value mapping when it creates or updates the job posting.
- The AMIS status is applied within the same transaction as the job-posting sync, so a successful sync response cannot leave the posting with a stale status.
- Both the initial sync path and the later `update-field` event path use one shared mapping/update helper.
- If the status is absent for backward-compatible older extension payloads, the existing sync behavior is preserved; invalid supplied statuses are rejected.

## Reliability and safety

- Ignore non-2xx responses, malformed payloads, unsupported statuses, and duplicate events with the same recruitment ID/status.
- Use the existing extension authentication and heartbeat flow.
- Do not overwrite a closed posting with a non-closed status unless the AMIS event explicitly says so; AMIS remains authoritative for this synchronization path, so the event status is applied as received.
- Record diagnostics for captured, skipped, successful, and failed status-sync events.

## Testing

- Unit-test response extraction for fetch/XHR payload shapes and all four status values.
- Unit-test backend mapping and update behavior for both `sync-and-publish` and the standalone status event, including unmapped recruitment IDs and unsupported statuses.
- Run extension/backend type checks and the targeted test suites.
