# 17. Frontend Implementation Task Breakdown Until Batch C

## 1. Mục tiêu tài liệu

Tài liệu này chia nhỏ kế hoạch triển khai frontend UI tính đến Batch C của Recruitment Phase 1.

Tài liệu này là implementation task breakdown ở mức frontend, dùng làm đầu vào để triển khai code sau này. Tài liệu này không xác nhận rằng code đã được implement.

Phạm vi UI đến Batch C:

- JD / Job Posting / Application Core.
- Candidate/Public apply + upload CV.
- CV validation, accepted/processing/error UI.
- HR/Admin Application workspace.
- CV processing status, clean CV access, parsed profile, CV version history.
- Workflow timeline / audit basic.

Nguyên tắc trung tâm: UI mới phải application-centric. `Application` là workflow center; `Candidate` chỉ là profile được liên kết.

## 2. Input documents

| Input | Vai trò |
| ----- | ------- |
| `16_frontend_ui_scope_until_batch_c.md` | Scope UI, route đề xuất, actor, security rule, API dependency và open questions. |
| `15_implementation_task_breakdown.md` | Backend batch scope, đặc biệt P1-B04..P1-B08 và P1-C01..P1-C09. |
| `07_api_contract_specification.md` | API endpoints, error code, idempotency, public apply, application, CV, timeline/audit. |
| `08_cv_processing_specification.md` | CV flow: validate, quarantine, scan, sanitize, parse, versioning, clean CV access. |
| `14_security_and_audit_log_specification.md` | Role matrix, public-safe response, clean CV permission, audit/security constraints. |
| `apps/frontend/src/app/routes.tsx` | Existing route map; cần thêm public recruitment routes và internal `/recruitment/*`. |
| `apps/frontend/src/app/layouts/InterviewerLayout.tsx` | Existing authenticated layout/sidebar; cần thêm recruitment nav. |
| `apps/frontend/src/lib/api-client.ts` | Existing API wrapper; cần custom headers, idempotency, normalized errors. |
| `apps/frontend/src/components/ui` | Existing UI primitives: Button, Input, Select, Table, Dialog, Tabs, Toast, Badge, Card, Pagination. |
| `apps/frontend/src/pages/interviewer/candidates` | Candidate table/detail/upload/preview patterns; chỉ reuse pattern, không reuse business flow. |
| `apps/frontend/src/pages/interviewer/settings/ManagementPage.tsx` | CRUD/table/dialog/search/pagination pattern cho JD/Job Posting UI. |
| `packages/shared/src/types` | Existing shared types; cần bổ sung hoặc tạo frontend recruitment types. |

## 3. Frontend implementation principles

- UI mới application-centric, không candidate-centric.
- Không dùng `/candidates/upload` cho Batch C CV flow.
- Không dùng `/api/uploads/:filename` cho clean CV.
- Không reuse `/session/:token` cho apply/form.
- Không đưa Mapping, Form pre-screening, AI Screening, HR Review decision vào Batch C UI.
- Không sửa mạnh session/evaluation legacy screens.
- Chỉ reuse component/pattern từ Candidate/ManagementPage, không reuse business flow cũ.
- Public apply không cần login.
- Internal recruitment routes cần login và role guard phù hợp cho HR/Admin.
- Candidate/Public không được xem clean CV, raw CV, mapping result, AI result, HR decision hoặc audit log.
- HR/Admin chỉ xem clean CV qua application-owned clean file API.
- Frontend không hiển thị scanner log, storage path, stack trace, parser/Ghostscript/container detail.
- Các side-effect API cần idempotency support trước khi triển khai UI upload/apply/retry.

## 4. Suggested implementation order

Thứ tự đề xuất:

1. FE-0: Chuẩn bị frontend foundation, types, API client, status/error mapping.
2. FE-1: Thêm route shell/navigation cho recruitment, không phá route legacy.
3. FE-2: Làm public job detail/apply/upload/result vì phụ thuộc route/API client foundation.
4. FE-3: Làm JD management UI.
5. FE-4: Làm Job Posting management UI.
6. FE-5: Làm Application list/detail UI.
7. FE-6: Làm CV processing UI trong Application detail.
8. FE-7: Làm workflow timeline/audit basic.
9. FE-8: Regression, cleanup, route/security review.

Không nên bắt đầu FE-2 trước FE-0 vì public apply/CV upload cần `Idempotency-Key`, public-safe error mapping và multipart support đúng.

Không nên bắt đầu FE-6 trước FE-5 vì CV UI phải bám `applicationId`.

## 5. FE task list tổng thể

| Task ID | Batch | Module/Area | Mô tả | File dự kiến | Dependency | Risk |
| ------- | ----- | ----------- | ----- | ------------ | ---------- | ---- |
| FE-0-01 | FE-0 | Types | Tạo model/type frontend cho JobDescription, JobPosting, Application, CvDocument, ParsedProfile, WorkflowEvent, AuditLog. | `apps/frontend/src/types/recruitment.ts` hoặc `packages/shared/src/types/recruitment.ts` | API contract ổn định | High |
| FE-0-02 | FE-0 | Status mapping | Tạo Application/CV status label, badge color, candidate-visible và HR-visible rule. | `apps/frontend/src/components/recruitment/status.ts` hoặc `apps/frontend/src/types/recruitment.ts` | FE-0-01 | High |
| FE-0-03 | FE-0 | Error mapping | Tạo public-safe và HR/Admin-safe error message mapping. | `apps/frontend/src/lib/api-errors.ts` hoặc `apps/frontend/src/components/recruitment/errors.ts` | API error code từ `07` | High |
| FE-0-04 | FE-0 | API client | Mở rộng request options để hỗ trợ custom headers. | `apps/frontend/src/lib/api-client.ts` | Existing api-client | High |
| FE-0-05 | FE-0 | API client | Hỗ trợ `Idempotency-Key` cho post/upload side-effect APIs. | `apps/frontend/src/lib/api-client.ts` | FE-0-04 | High |
| FE-0-06 | FE-0 | API client | Normalize error code/status/message từ backend, không expose internal error trực tiếp. | `apps/frontend/src/lib/api-client.ts`, `apps/frontend/src/lib/api-errors.ts` | FE-0-03 | High |
| FE-0-07 | FE-0 | API client | Hỗ trợ multipart upload cho public apply/CV upload với extra fields và custom headers. | `apps/frontend/src/lib/api-client.ts` | FE-0-04, FE-0-05 | High |
| FE-0-08 | FE-0 | API client | Giữ/download blob helper cho clean CV, đảm bảo dùng endpoint application-owned. | `apps/frontend/src/lib/api-client.ts` | Existing `downloadBlob` | Medium |
| FE-1-01 | FE-1 | Routes | Thêm public routes `/jobs/:slug`, `/jobs/:slug/apply`, optional `/apply/:applicationId/status`. | `apps/frontend/src/app/routes.tsx`, `apps/frontend/src/pages/public/...` | FE-0 | Medium |
| FE-1-02 | FE-1 | Routes | Thêm internal routes `/recruitment/job-descriptions`, `/recruitment/job-postings`, `/recruitment/applications`. | `apps/frontend/src/app/routes.tsx`, `apps/frontend/src/pages/recruitment/...` | FE-0 | Medium |
| FE-1-03 | FE-1 | Layout/navigation | Thêm recruitment nav vào sidebar cho HR/Admin, không phá Dashboard/Candidates/Sessions/Settings. | `apps/frontend/src/app/layouts/InterviewerLayout.tsx` | FE-1-02 | High |
| FE-1-04 | FE-1 | Route protection | Xác định route nào public, route nào cần login, route nào HR/Admin. | `routes.tsx`, optional guard component | FE-1-01, FE-1-02 | High |
| FE-2-01 | FE-2 | Public Job Detail | Implement page public job detail. | `apps/frontend/src/pages/public/PublicJobDetailPage.tsx` | FE-1-01 | Medium |
| FE-2-02 | FE-2 | Apply form | Implement apply form fields tối thiểu: full name, email, phone, CV, optional note, consent nếu chốt. | `apps/frontend/src/pages/public/PublicJobApplyPage.tsx` | FE-2-01, FE-0-07 | High |
| FE-2-03 | FE-2 | Upload CV | Client-side file allowlist `.pdf`, `.docx`, `.xlsx`; không allow `.xls`. | `PublicJobApplyPage.tsx`, `components/recruitment/CvUploadField.tsx` | FE-2-02 | High |
| FE-2-04 | FE-2 | Public result | Implement accepted/processing/error states. | `PublicApplyResultPage.tsx` hoặc section trong `PublicJobApplyPage.tsx` | FE-2-02 | High |
| FE-2-05 | FE-2 | Public error copy | Map `VALIDATION_ERROR`, `UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE`, `MALWARE_DETECTED`, `CV_SCAN_FAILED`. | `api-errors.ts`, public pages | FE-0-03 | High |
| FE-3-01 | FE-3 | JD list | Implement JD list with search/filter/pagination/table pattern. | `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionListPage.tsx` | FE-1-02, FE-0-01 | Medium |
| FE-3-02 | FE-3 | JD detail | Implement JD detail and version display. | `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionDetailPage.tsx` | FE-3-01 | Medium |
| FE-3-03 | FE-3 | JD create/edit | Implement create/edit form/dialog or page. | `components/recruitment/JobDescriptionForm.tsx` | FE-3-01 | Medium |
| FE-3-04 | FE-3 | JD mark ready | Implement mark-ready action with confirmation/toast. | `JobDescriptionDetailPage.tsx` | FE-3-02 | Medium |
| FE-4-01 | FE-4 | Job Posting list | Implement posting list with status filters. | `apps/frontend/src/pages/recruitment/job-postings/JobPostingListPage.tsx` | FE-3, FE-1-02 | Medium |
| FE-4-02 | FE-4 | Job Posting detail | Implement posting detail/edit. | `apps/frontend/src/pages/recruitment/job-postings/JobPostingDetailPage.tsx` | FE-4-01 | Medium |
| FE-4-03 | FE-4 | Publish/close | Implement publish/close action with confirmation and safe errors. | `JobPostingDetailPage.tsx`, `components/recruitment/PostingActions.tsx` | FE-4-02 | High |
| FE-4-04 | FE-4 | Public preview | Add public preview link to `/jobs/:slug`. | `JobPostingDetailPage.tsx` | FE-2-01, FE-4-02 | Low |
| FE-5-01 | FE-5 | Application list | Implement application table/list with status, job, source, keyword filters. | `apps/frontend/src/pages/recruitment/applications/ApplicationListPage.tsx` | FE-1-02, FE-0-01, FE-0-02 | High |
| FE-5-02 | FE-5 | Application detail shell | Implement application detail page with sections/tabs. | `apps/frontend/src/pages/recruitment/applications/ApplicationDetailPage.tsx` | FE-5-01 | High |
| FE-5-03 | FE-5 | Application overview | Implement overview, candidate info, job/JD info. | `components/recruitment/ApplicationOverview.tsx` | FE-5-02 | Medium |
| FE-5-04 | FE-5 | Internal error states | Handle forbidden/not found/loading/empty for internal pages. | recruitment pages/components | FE-0-03 | Medium |
| FE-6-01 | FE-6 | CV status panel | Implement scan/sanitize/parse status summary. | `components/recruitment/CvProcessingPanel.tsx` | FE-5-02, FE-0-02 | High |
| FE-6-02 | FE-6 | CV version history | Implement CV versions table. | `components/recruitment/CvVersionHistory.tsx` | FE-6-01 | Medium |
| FE-6-03 | FE-6 | Clean CV access | Implement clean CV preview/download using clean-file endpoint only. | `components/recruitment/CleanCvActions.tsx`, `api-client.ts` | FE-6-01, FE-0-08 | High |
| FE-6-04 | FE-6 | Parsed profile | Implement parsed profile section. | `components/recruitment/ParsedProfileView.tsx` | FE-6-01 | Medium |
| FE-6-05 | FE-6 | Retry actions | Optional retry sanitize/parse actions with permission/policy guard. | `CvProcessingPanel.tsx` | Open question on role policy | High |
| FE-6-06 | FE-6 | Manual CV upload | Optional HR/Admin manual CV upload in Application detail. | `components/recruitment/ApplicationCvUpload.tsx` | FE-0-07, API availability | High |
| FE-7-01 | FE-7 | Timeline | Implement workflow timeline component. | `components/recruitment/WorkflowTimeline.tsx` | FE-5-02 | Medium |
| FE-7-02 | FE-7 | Audit basic | Implement audit basic table if API and permission allow. | `components/recruitment/ApplicationAuditLog.tsx` | FE-7-01 | Medium |
| FE-7-03 | FE-7 | Sensitive metadata filter | Ensure timeline/audit UI does not display sensitive metadata. | timeline/audit components | FE-7-01, security review | High |
| FE-8-01 | FE-8 | Regression route check | Verify legacy routes still work: `/login`, `/dashboard`, `/candidates`, `/sessions`, `/settings`, `/session/:token`. | `routes.tsx`, browser/manual | FE-1..FE-7 | High |
| FE-8-02 | FE-8 | Copy cleanup | Review public-safe and HR/Admin-safe messages. | public/recruitment pages | FE-2..FE-7 | Medium |
| FE-8-03 | FE-8 | Type cleanup | Remove temporary `any`, align frontend/shared models. | recruitment types/pages | FE-0..FE-7 | Medium |
| FE-8-04 | FE-8 | Accessibility/basic UX | Check loading/empty/error/disabled states. | recruitment pages/components | FE-2..FE-7 | Medium |

## 6. FE execution batches

### FE-0: Frontend foundation/types/api-client

Goal:

- Chuẩn bị nền frontend trước khi tạo màn.
- Không tạo route/screen nghiệp vụ nếu API client và model chưa sẵn sàng.

Tasks:

- Define recruitment types.
- Define status mapping.
- Define error mapping.
- Extend API client for custom headers.
- Add `Idempotency-Key` support.
- Add multipart upload helper with extra fields and headers.
- Keep blob download for clean CV access.

Expected files:

- `apps/frontend/src/types/recruitment.ts` hoặc `packages/shared/src/types/recruitment.ts`.
- `apps/frontend/src/lib/api-client.ts`.
- `apps/frontend/src/lib/api-errors.ts`.
- `apps/frontend/src/components/recruitment/status.ts`.

Exit criteria:

- Public apply/CV upload can be called with custom headers.
- Error codes can be mapped without leaking internal backend messages.
- Status badge mapping exists for Application/CV statuses through Batch C.

### FE-1: Recruitment routes/navigation/layout

Goal:

- Add route structure without breaking existing app.
- Add HR/Admin navigation for recruitment workspace.

Tasks:

- Add public routes under `/jobs/*`.
- Add internal routes under `/recruitment/*`.
- Add sidebar nav item "Recruitment" or explicit sub-items.
- Decide route guard for HR/Admin.

Expected files:

- `apps/frontend/src/app/routes.tsx`.
- `apps/frontend/src/app/layouts/InterviewerLayout.tsx`.
- Optional: `apps/frontend/src/components/recruitment/RecruitmentRouteGuard.tsx`.

Exit criteria:

- Public apply routes do not require login.
- Internal recruitment routes require login.
- Existing routes still work.

### FE-2: Public job detail + apply form + upload CV + result page

Goal:

- Implement candidate/public flow through accepted/processing or public-safe error.

Tasks:

- Public job detail page.
- Apply form page.
- CV upload field with `.pdf`, `.docx`, `.xlsx` allowlist.
- Submit apply with `Idempotency-Key`.
- Public result state for validation, unsupported file, too large, malware detected, accepted/processing.

Expected files:

- `apps/frontend/src/pages/public/PublicJobDetailPage.tsx`.
- `apps/frontend/src/pages/public/PublicJobApplyPage.tsx`.
- `apps/frontend/src/pages/public/PublicApplyResultPage.tsx` if separate.
- `apps/frontend/src/components/recruitment/CvUploadField.tsx`.

Exit criteria:

- Public flow never uses `/candidates/upload`.
- Public flow never exposes scanner/storage/internal errors.

### FE-3: JD management UI

Goal:

- Provide HR/Admin UI to manage JD and JD versions.

Tasks:

- JD list.
- JD detail.
- JD create/edit form.
- JD version display.
- Mark ready action.

Expected files:

- `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionListPage.tsx`.
- `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionDetailPage.tsx`.
- `apps/frontend/src/components/recruitment/JobDescriptionForm.tsx`.

Exit criteria:

- UI can list, create/edit, view detail and mark JD ready if backend API allows.
- Uses table/dialog/form patterns from `ManagementPage`.

### FE-4: Job posting management UI

Goal:

- Provide HR/Admin UI to create and publish public job postings.

Tasks:

- Job posting list.
- Job posting detail.
- Create/edit posting form.
- Publish/close actions.
- Public preview link.

Expected files:

- `apps/frontend/src/pages/recruitment/job-postings/JobPostingListPage.tsx`.
- `apps/frontend/src/pages/recruitment/job-postings/JobPostingDetailPage.tsx`.
- `apps/frontend/src/components/recruitment/JobPostingForm.tsx`.
- `apps/frontend/src/components/recruitment/PostingActions.tsx`.

Exit criteria:

- Posting state is clear.
- Closed/unpublished posting behavior aligns with public apply route.

### FE-5: Application list/detail UI

Goal:

- Create application-centric HR/Admin workspace.

Tasks:

- Application list with filters.
- Application detail shell.
- Overview/candidate/job/JD sections.
- Loading/empty/forbidden/not-found states.

Expected files:

- `apps/frontend/src/pages/recruitment/applications/ApplicationListPage.tsx`.
- `apps/frontend/src/pages/recruitment/applications/ApplicationDetailPage.tsx`.
- `apps/frontend/src/components/recruitment/ApplicationOverview.tsx`.
- `apps/frontend/src/components/recruitment/ApplicationStatusBadge.tsx`.

Exit criteria:

- HR/Admin navigates application work queue without relying on `/candidates`.
- Application status and CV summary are visible.

### FE-6: CV processing UI

Goal:

- Display CV processing through Batch C and provide clean CV access.

Tasks:

- CV processing status panel.
- Clean CV preview/download using clean-file endpoint.
- Parsed profile view.
- CV version history.
- Optional manual CV upload for existing application.
- Optional retry sanitize/parse if policy is confirmed.

Expected files:

- `apps/frontend/src/components/recruitment/CvProcessingPanel.tsx`.
- `apps/frontend/src/components/recruitment/CleanCvActions.tsx`.
- `apps/frontend/src/components/recruitment/ParsedProfileView.tsx`.
- `apps/frontend/src/components/recruitment/CvVersionHistory.tsx`.
- `apps/frontend/src/components/recruitment/ApplicationCvUpload.tsx`.

Exit criteria:

- No raw/original/quarantine CV access.
- No legacy `/api/uploads/:filename` usage for clean CV.
- `CV_SCAN_FAILED`, `CV_REJECTED_MALWARE`, `CV_SANITIZE_FAILED`, `CV_PARSE_FAILED` are distinct in UI.

### FE-7: Timeline/audit basic

Goal:

- Show workflow transitions and audit basics without leaking sensitive metadata.

Tasks:

- Workflow timeline component.
- Audit log basic table if API and permission allow.
- Metadata redaction/filtering in UI.

Expected files:

- `apps/frontend/src/components/recruitment/WorkflowTimeline.tsx`.
- `apps/frontend/src/components/recruitment/ApplicationAuditLog.tsx`.

Exit criteria:

- Timeline shows Application/CV events through Batch C.
- Sensitive metadata is hidden.

### FE-8: Regression and cleanup

Goal:

- Stabilize frontend after adding recruitment UI.

Tasks:

- Route regression.
- Auth/public/internal access check.
- Type cleanup.
- Error copy review.
- Loading/empty/error/disabled UX pass.

Expected files:

- Existing touched frontend files only.

Exit criteria:

- Existing app routes are not broken.
- Public/internal route behavior is correct.
- Build/lint/typecheck commands are ready for user-run checkpoint.

## 7. Route implementation plan

| Route | Page file dự kiến | Access | Batch | Notes |
| ----- | ----------------- | ------ | ----- | ----- |
| `/jobs/:slug` | `apps/frontend/src/pages/public/PublicJobDetailPage.tsx` | Public | FE-2 | No login. |
| `/jobs/:slug/apply` | `apps/frontend/src/pages/public/PublicJobApplyPage.tsx` | Public | FE-2 | Submit apply + CV upload. |
| `/apply/:applicationId/status` | `apps/frontend/src/pages/public/PublicApplyResultPage.tsx` | Public | FE-2 | Optional; CẦN CHỐT public status API. |
| `/recruitment/job-descriptions` | `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionListPage.tsx` | HR/Admin | FE-3 | Auth required. |
| `/recruitment/job-descriptions/:id` | `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionDetailPage.tsx` | HR/Admin | FE-3 | Auth required. |
| `/recruitment/job-postings` | `apps/frontend/src/pages/recruitment/job-postings/JobPostingListPage.tsx` | HR/Admin | FE-4 | Auth required. |
| `/recruitment/job-postings/:id` | `apps/frontend/src/pages/recruitment/job-postings/JobPostingDetailPage.tsx` | HR/Admin | FE-4 | Auth required. |
| `/recruitment/applications` | `apps/frontend/src/pages/recruitment/applications/ApplicationListPage.tsx` | HR/Admin | FE-5 | Auth required. |
| `/recruitment/applications/:applicationId` | `apps/frontend/src/pages/recruitment/applications/ApplicationDetailPage.tsx` | HR/Admin | FE-5/FE-6/FE-7 | Auth required. |
| `/recruitment/applications/:applicationId/cv` | Optional page or tab | HR/Admin | FE-6 | Prefer tab/section unless deep-link needed. |

Existing routes that must continue to work:

- `/login`
- `/dashboard`
- `/candidates`
- `/sessions`
- `/settings/*`
- `/session/:token`

## 8. Type/model implementation plan

Preferred location:

- `apps/frontend/src/types/recruitment.ts` for frontend-only task start.
- Move to `packages/shared/src/types/recruitment.ts` only when backend/frontend contract is stable enough and workspace build impact is acceptable.

Minimum types:

- `JobDescription`
- `JobDescriptionVersion`
- `JobPosting`
- `Application`
- `ApplicationSource`
- `CvDocument`
- `ParsedProfile`
- `WorkflowEvent`
- `AuditLog`
- `ApplicationStatus`
- `CvScanStatus`
- `CvSanitizeStatus`
- `CvParseStatus`
- `PaginatedRecruitmentResponse<T>` if existing `PaginatedResponse<T>` is insufficient.

Status constants through Batch C:

- `APPLICATION_CREATED`
- `APPLICATION_VALIDATING`
- `APPLICATION_REJECTED_INVALID`
- `APPLICATION_DUPLICATE_CHECKING`
- `APPLICATION_DUPLICATE_FOUND`
- `APPLICATION_OVERWRITTEN`
- `APPLICATION_REJECTED_RATE_LIMIT`
- `CV_UPLOADED`
- `CV_STORED_QUARANTINE`
- `CV_SCAN_REQUESTED`
- `CV_SCAN_PASSED`
- `CV_SCAN_FAILED`
- `CV_REJECTED_MALWARE`
- `CV_SANITIZING`
- `CV_SANITIZED`
- `CV_SANITIZE_FAILED`
- `CV_PARSE_FAILED`
- `CV_PARSED`

Do not include as active Batch C UI statuses:

- `MAPPING_*`
- `FORM_*`
- `AI_*`
- `HR_*`

They may exist in backend enum, but UI should mark them later/out-of-scope until corresponding batches.

## 9. API client implementation plan

Required API client capabilities:

| Capability | Current state | Required change | Risk |
| ---------- | ------------- | --------------- | ---- |
| JSON requests | Exists in `api-client.ts` | Add request options object with custom headers. | Medium |
| Auth bearer token | Exists | Preserve behavior. | Medium |
| Custom headers | Missing | Add `headers?: Record<string,string>` to request/upload methods. | High |
| `Idempotency-Key` | Missing | Add helper option `idempotencyKey` or explicit custom header. | High |
| Multipart upload | Exists for `upload`/`uploadMulti` | Add extra fields + custom headers for public apply/CV upload. | High |
| Blob download | Exists as `downloadBlob` | Keep for clean CV endpoint only. | Medium |
| Error normalization | Basic `ApiError(message,status)` | Preserve code/status/message/details safely. | High |
| Public-safe error copy | Missing | Map error codes in UI instead of rendering raw backend message. | High |
| Internal-safe error copy | Missing | HR/Admin can see redacted reason/code, not stack/storage path. | High |

Suggested API client types:

```ts
interface RequestOptions {
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: unknown;
}
```

Rules:

- Do not render backend `message` directly in public apply UI unless it is mapped/approved.
- `MALWARE_DETECTED` public copy must not include threat name/scanner log.
- `CV_SCAN_FAILED` must not be shown as malware.
- Clean CV download must use `downloadBlob('/applications/:applicationId/cv/:cvDocumentId/clean-file')`.
- Public apply/CV upload must not call `/candidates/upload`.

## 10. Screen implementation detail

### 10.1 Public Job Detail

Files:

- `apps/frontend/src/pages/public/PublicJobDetailPage.tsx`
- optional `apps/frontend/src/components/recruitment/PublicJobHeader.tsx`

Required UI:

- Job title.
- Description.
- Requirements.
- Benefits if present.
- Location/working mode if present.
- Apply button.
- Closed/unavailable state.

APIs:

- `GET /api/public/job-postings/:slug`

### 10.2 Apply Form + Upload CV

Files:

- `apps/frontend/src/pages/public/PublicJobApplyPage.tsx`
- `apps/frontend/src/components/recruitment/CvUploadField.tsx`

Required UI:

- Full name.
- Email.
- Phone.
- CV file.
- Optional note if API supports.
- Consent/privacy checkbox if confirmed.
- Submit button.
- Client-side file hint: `.pdf`, `.docx`, `.xlsx`; no `.xls`.

APIs:

- `POST /api/public/job-postings/:jobPostingId/apply`

Special rules:

- Generate/send `Idempotency-Key`.
- Show accepted/processing if scan pass.
- Show safe error for malware/validation/unsupported/too large.
- Do not expose internal error.

### 10.3 JD Management

Files:

- `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionListPage.tsx`
- `apps/frontend/src/pages/recruitment/job-descriptions/JobDescriptionDetailPage.tsx`
- `apps/frontend/src/components/recruitment/JobDescriptionForm.tsx`

Required UI:

- List/search/filter/pagination.
- Detail.
- Create/edit.
- Version list.
- Mark ready.

Reuse:

- `ManagementPage` table/dialog/search/pagination pattern.

### 10.4 Job Posting Management

Files:

- `apps/frontend/src/pages/recruitment/job-postings/JobPostingListPage.tsx`
- `apps/frontend/src/pages/recruitment/job-postings/JobPostingDetailPage.tsx`
- `apps/frontend/src/components/recruitment/JobPostingForm.tsx`
- `apps/frontend/src/components/recruitment/PostingActions.tsx`

Required UI:

- List/filter by status.
- Detail/edit.
- Publish/close.
- Public preview link.

Special rules:

- Publish/close should have confirmation.
- Closed posting must align with public apply disabled state.

### 10.5 Application List

Files:

- `apps/frontend/src/pages/recruitment/applications/ApplicationListPage.tsx`
- `apps/frontend/src/components/recruitment/ApplicationStatusBadge.tsx`

Required columns:

- Candidate name.
- Email.
- Phone.
- Job title.
- Source channel.
- Application status.
- CV status.
- Created at.
- Updated at.
- Action view detail.

Required filters:

- Status.
- Job posting.
- Source channel.
- Keyword.
- Created date range if backend supports.

### 10.6 Application Detail

Files:

- `apps/frontend/src/pages/recruitment/applications/ApplicationDetailPage.tsx`
- `apps/frontend/src/components/recruitment/ApplicationOverview.tsx`

Sections/tabs:

- Overview.
- Candidate info.
- Job/JD info.
- CV Processing.
- Parsed Profile.
- CV Versions.
- Timeline/Audit basic.

Special rules:

- Do not redirect to candidate detail as primary workflow.
- Candidate detail link can exist as secondary reference only if useful.

### 10.7 CV Processing UI

Files:

- `apps/frontend/src/components/recruitment/CvProcessingPanel.tsx`
- `apps/frontend/src/components/recruitment/CleanCvActions.tsx`
- `apps/frontend/src/components/recruitment/ParsedProfileView.tsx`
- `apps/frontend/src/components/recruitment/CvVersionHistory.tsx`
- optional `apps/frontend/src/components/recruitment/ApplicationCvUpload.tsx`

Required UI:

- Current CV version.
- Safe original file metadata, no path.
- Scan status.
- Sanitize status.
- Parse status.
- Clean CV availability.
- Parsed profile availability.
- Safe failure reason.
- Clean CV preview/download when allowed.
- Version table.

Special rules:

- No raw/original download.
- No `/api/uploads/:filename`.
- Clean CV only from `clean-file` endpoint.
- Retry actions optional until policy is confirmed.

### 10.8 Timeline/Audit Basic

Files:

- `apps/frontend/src/components/recruitment/WorkflowTimeline.tsx`
- `apps/frontend/src/components/recruitment/ApplicationAuditLog.tsx`

Required UI:

- Timeline of Application/CV transitions through Batch C.
- Audit basic only if API/permission allows.

Sensitive metadata must be filtered:

- No raw CV content.
- No storage path.
- No scanner raw log.
- No parser stack trace.
- No token/secret.

## 11. Component reuse plan

| Need | Reuse source | Reuse style | Notes |
| ---- | ------------ | ----------- | ----- |
| Table/list/pagination | `CandidateListPage`, `Table`, `DataTablePagination`, `SortableHeader` | Pattern reuse | Use for JD, posting, application, CV versions. |
| CRUD dialogs/forms | `ManagementPage`, `Dialog`, `Input`, `Textarea`, `Select` | Pattern reuse | Use for JD/posting create/edit. |
| Sidebar/internal shell | `InterviewerLayout` | Extend | Add recruitment nav; do not remove legacy nav. |
| Auth context | `auth-context.tsx` | Extend if needed | Add route guard if needed. |
| Upload UI | `CandidateCreatePage`, `CandidateDetailPage` | Visual pattern only | Do not reuse `/candidates/upload` or `.xls` allowlist. |
| File preview/download | `CandidateDetailPage`, `downloadBlob` | Pattern reuse | Only call clean-file endpoint. |
| Parsed profile cards | `CandidateDetailPage` | Pattern reuse | Use Phase 1 ParsedProfile model, not legacy candidate source of truth. |
| Toast/error | `toast`, `ApiError` | Extend | Use mapped public-safe/admin-safe errors. |
| Badge/status | `Badge` | Extend | Add Application/CV status mappings. |
| Tabs/detail layout | `Tabs`, `Card` | Pattern reuse | Use for Application detail sections. |
| Timeline | None dedicated | New component | Build from Card/Table primitives. |

## 12. Do-not-touch / legacy guardrail

Do not touch strongly unless explicitly required:

- `apps/frontend/src/pages/interviewer/sessions/*`
- `apps/frontend/src/components/interview/*`
- Existing evaluation/survey/live session pages.
- Existing `/session/:token` candidate interview flow.
- Backend source as part of this frontend implementation plan.

Do not reuse as business flow:

- `/candidates/upload`
- Existing candidate CV upload flow.
- Existing candidate `resumeUrl` / `profileXlsxUrl` as clean CV source.
- Legacy `/api/uploads/:filename` for clean CV.
- Interview session token as recruitment apply/form token.

Allowed reuse:

- UI primitives.
- Table/dialog/form patterns.
- File preview visual pattern.
- Parsed profile card layout pattern.
- Auth/layout shell pattern.

## 13. Build/test checkpoints

This repo's frontend package name is `@interview-assistant/frontend`. If using a short filter such as `frontend`, verify it matches the workspace package first.

User-run checkpoint commands after each FE batch:

| Checkpoint | Command | Notes |
| ---------- | ------- | ----- |
| Typecheck | `pnpm --filter @interview-assistant/frontend typecheck` | Package script exists. |
| Build | `pnpm --filter @interview-assistant/frontend build` | Package script exists. |
| Lint | `pnpm --filter @interview-assistant/frontend lint` | Package script exists; run if lint config/deps are available. |
| Short filter build, if supported | `pnpm --filter frontend build` | Only if workspace filter resolves. |
| Short filter lint/typecheck, if supported | `pnpm --filter frontend lint`; `pnpm --filter frontend typecheck` | Only if workspace filter resolves. |

Manual route regression checklist:

- `/login` still works.
- `/dashboard` still works.
- `/candidates` still works.
- `/sessions` still works.
- `/settings/*` still works.
- `/session/:token` still works.
- `/jobs/:slug` does not require login.
- `/jobs/:slug/apply` does not require login.
- `/recruitment/*` requires login.
- HR/Admin nav is visible according to role policy.

Security checkpoint:

- Public apply does not render raw backend errors.
- Public apply does not expose scanner log, storage path or stack trace.
- Clean CV uses `clean-file` endpoint only.
- UI has no raw CV download action.
- `.xls` is not accepted in Batch C upload UI.

## 14. Review checkpoints

| Review checkpoint | When | Focus |
| ----------------- | ---- | ----- |
| FE-0 review | Before FE-1 | Types, error mapping, API client headers/idempotency. |
| FE-1 review | Before FE-2 | Route protection, public/internal split, legacy route safety. |
| FE-2 review | Before FE-3 | Public-safe apply/upload, no `/candidates/upload`, no `.xls`. |
| FE-3/FE-4 review | Before FE-5 | JD/posting CRUD consistency and publish/close behavior. |
| FE-5 review | Before FE-6 | Application-centric detail structure; no candidate-centric workflow. |
| FE-6 review | Before FE-7 | Clean CV security, no raw/original access, status distinctions. |
| FE-7 review | Before FE-8 | Timeline/audit redaction and permission handling. |
| FE-8 final review | Before marking frontend Batch C ready | Route regression, type/build status, copy/security review. |

## 15. Risk tasks

| Task | Risk | Mitigation |
| ---- | ---- | ---------- |
| FE-0-04 to FE-0-07 | API client changes can break existing calls. | Keep backward-compatible method signatures or overloads; regression check `/login`, `/dashboard`, existing pages. |
| FE-1-03 | Sidebar changes can hide legacy nav or mis-handle HR/Admin roles. | Add nav incrementally; preserve existing nav arrays and admin-only behavior. |
| FE-2-02/FE-2-03 | Public apply can leak errors or accept invalid file type. | Use error mapping; whitelist `.pdf`, `.docx`, `.xlsx`; no raw messages. |
| FE-2-05 | Malware/scan failed copy can mislead candidate. | Keep `MALWARE_DETECTED` distinct from `CV_SCAN_FAILED`. |
| FE-5-01/FE-5-02 | UI may stay candidate-centric. | All Application screens use `applicationId` as primary route/id. |
| FE-6-03 | Clean CV access can accidentally use legacy upload route. | Hard rule: only `clean-file` endpoint; grep for `/api/uploads` before review. |
| FE-6-05 | Retry sanitize/parse may be exposed to wrong role. | Keep optional until role/policy is confirmed. |
| FE-7-02/FE-7-03 | Audit UI can leak sensitive metadata. | Redact/filter known sensitive keys and avoid rendering raw metadata objects by default. |
| FE-8-01 | New routes can break legacy app. | Manual regression of all listed legacy routes. |

## 16. Open questions before coding

| Câu hỏi cần chốt | Ảnh hưởng | Ưu tiên |
| ---------------- | --------- | ------- |
| Apply form chính thức gồm field nào? | Form schema, validation, labels. | High |
| Consent/privacy checkbox có bắt buộc không? | Public apply UX and validation. | High |
| Có captcha/bot protection frontend không? | Public apply implementation. | High |
| `Idempotency-Key` frontend tạo theo format nào? | Retry apply/upload không tạo duplicate. | High |
| Max file size lấy từ config/API hay hardcode? | Upload hint and client validation. | Medium |
| Public status route `/apply/:applicationId/status` có cần không? | Route and API dependency. | Medium |
| Retry sanitize/parse cho HR hay chỉ Admin/System? | FE-6 action visibility. | High |
| Clean CV preview inline hay chỉ download? | `CleanCvActions` UX. | Medium |
| Parsed profile hiển thị bao nhiêu normalized text? | PII/privacy and layout. | Medium |
| HR ownership/scope theo application được xác định thế nào? | Route guard and forbidden state. | High |
| JD/Posting API path final đã ổn định chưa? | FE-3/FE-4 service layer. | Medium |
| Recruitment types đặt ở frontend-only hay shared package? | Build boundaries and package exports. | Medium |

## 17. Definition of done

Frontend Batch C UI được xem là đạt khi:

- FE-0 đến FE-8 hoàn tất hoặc các optional task được đánh dấu rõ là deferred.
- Public job detail/apply/upload/result flow tồn tại và không cần login.
- Public upload chỉ cho `.pdf`, `.docx`, `.xlsx`; không cho `.xls`.
- Public apply/CV upload hỗ trợ `Idempotency-Key`.
- Public error messages là public-safe.
- Internal `/recruitment/*` routes cần login.
- HR/Admin có JD management, Job Posting management, Application list/detail.
- Application detail là workflow center.
- CV processing panel hiển thị scan/sanitize/parse status rõ ràng.
- Clean CV preview/download chỉ dùng application-owned `clean-file` endpoint.
- Không có UI raw/original/quarantine CV download.
- Parsed profile view hiển thị từ clean CV parse result.
- CV version history hiển thị version/status/hash ngắn/current flag.
- Timeline/audit basic không leak sensitive metadata.
- Legacy `/login`, `/dashboard`, `/candidates`, `/sessions`, `/settings`, `/session/:token` không bị phá.
- Mapping/Form/AI/HR Review decision không nằm trong Batch C UI.
- User-run checkpoints được liệt kê và log được review trước khi chuyển sang phase frontend tiếp theo.

