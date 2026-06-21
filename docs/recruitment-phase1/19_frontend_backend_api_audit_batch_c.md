# 19. Frontend Backend API Audit For Batch C Functional Flow

## 1. Tom tat ket luan

Pham vi dem trong bao cao nay la API frontend dang goi cho Recruitment Batch C functional flow, cong them auth/internal layout bat buoc. Scan toan frontend cung phat hien legacy API, nhung cac legacy flow duoc gom rieng o muc guardrail vi khong thuoc Batch C.

```text
Tong so API frontend dang goi trong scope Batch C + auth: 25
So API match backend: 8
So API missing: 17
So API mismatch: 1 cross-cutting error envelope mismatch
So blocker: 6 nhom blocker
Co the test full flow UI Batch C chua: NO
```

Ly do chinh: frontend da goi day du UI Batch C, nhung backend hien tai chua expose controller cho JD/internal Job Posting, chua co public apply endpoint, chua co parsed-profile endpoint, chua co audit-logs endpoint, va backend typecheck dang fail.

## 2. Bang doi chieu API frontend goi vs backend

| No | Flow/Screen | FE file | Method | FE path | Backend status | Backend controller/file | Mismatch detail | Severity |
| -: | ----------- | ------- | ------ | ------- | -------------- | ----------------------- | --------------- | -------- |
| 1 | Auth login | `pages/auth/LoginPage.tsx` | POST | `/api/auth/login` | MATCH | `auth/auth.controller.ts` | Legacy raw response `{ accessToken, user }`, FE expects raw. | INFO |
| 2 | Internal layout auth | `app/layouts/InterviewerLayout.tsx` | GET | `/api/auth/me` | MATCH | `auth/auth.controller.ts` | Legacy raw user response, FE expects raw. | INFO |
| 3 | Public job detail | `lib/recruitment-public-api.ts` | GET | `/api/public/job-postings/:slug` | MATCH | `job-postings/public-job-postings.controller.ts` | Success envelope matches FE unwrap. Public route has no JWT guard. | INFO |
| 4 | Public apply + CV upload | `lib/recruitment-public-api.ts` | POST multipart | `/api/public/job-postings/:jobPostingId/apply` | MISSING_BACKEND | N/A | FE sends `fullName`, `email`, `phone`, optional `note`, `cvFile`, `Idempotency-Key`. Backend public controller only has `GET :slug`. | BLOCKER |
| 5 | JD list | `lib/recruitment-api.ts` | GET | `/api/job-descriptions` | MISSING_BACKEND | `job-descriptions` module has service only | `JobDescriptionsModule` has no controller registered. | BLOCKER |
| 6 | JD create | `lib/recruitment-api.ts` | POST | `/api/job-descriptions` | MISSING_BACKEND | `job-descriptions` module has service only | FE sends JSON `title`, `positionId`, `levelId`, `description`, `requirements`, `benefits`, `Idempotency-Key`. | BLOCKER |
| 7 | JD detail | `lib/recruitment-api.ts` | GET | `/api/job-descriptions/:id` | MISSING_BACKEND | `job-descriptions` module has service only | Service has `findOne`, but no controller. | BLOCKER |
| 8 | JD update | `lib/recruitment-api.ts` | PUT | `/api/job-descriptions/:id` | MISSING_BACKEND | `job-descriptions` module has service only | Service has `update`, but no controller. | BLOCKER |
| 9 | JD versions | `lib/recruitment-api.ts` | GET | `/api/job-descriptions/:id/versions` | MISSING_BACKEND | `job-description-versions.service.ts` only | Service has `findByJobDescription`, but no controller. | BLOCKER |
| 10 | JD create version | `lib/recruitment-api.ts` | POST | `/api/job-descriptions/:id/versions` | MISSING_BACKEND | `job-description-versions.service.ts` only | FE sends `{ changeNote }`, backend service create input does not include changeNote. Controller missing. | BLOCKER |
| 11 | JD mark ready | `lib/recruitment-api.ts` | POST | `/api/job-descriptions/:id/mark-ready` | MISSING_BACKEND | `job-descriptions` module has service only | No controller/action exposed. | BLOCKER |
| 12 | Job posting list | `lib/recruitment-api.ts` | GET | `/api/job-postings` | MISSING_BACKEND | `job-postings` module has public controller only | Internal controller missing. | BLOCKER |
| 13 | Job posting create | `lib/recruitment-api.ts` | POST | `/api/job-postings` | MISSING_BACKEND | `job-postings` module has public controller only | FE sends `jobDescriptionVersionId`, `title`, `publicSlug`, `openAt`, `closeAt`, `Idempotency-Key`. | BLOCKER |
| 14 | Job posting detail | `lib/recruitment-api.ts` | GET | `/api/job-postings/:id` | MISSING_BACKEND | `job-postings` module has public controller only | Service has `findOne`, but no internal controller. | BLOCKER |
| 15 | Job posting update | `lib/recruitment-api.ts` | PUT | `/api/job-postings/:id` | MISSING_BACKEND | `job-postings` module has public controller only | Service has `update`, but no controller. | BLOCKER |
| 16 | Job posting publish | `lib/recruitment-api.ts` | POST | `/api/job-postings/:id/publish` | MISSING_BACKEND | `job-postings` module has public controller only | FE sends `publishChannels`, optional `publishNote`, `Idempotency-Key`; service has mark publish helpers but no controller/channel response. | BLOCKER |
| 17 | Job posting close | `lib/recruitment-api.ts` | POST | `/api/job-postings/:id/close` | MISSING_BACKEND | `job-postings` module has public controller only | Service has `close`, but no controller. | BLOCKER |
| 18 | Job posting channels | `lib/recruitment-api.ts` | GET | `/api/job-postings/:id/channels` | MISSING_BACKEND | N/A | No controller/service response for channel status found. | HIGH |
| 19 | Application list | `lib/recruitment-api.ts` | GET | `/api/applications` | MATCH | `applications/applications.controller.ts` | Auth roles `ADMIN`, `HR`; success envelope matches FE unwrap. | INFO |
| 20 | Application detail | `lib/recruitment-api.ts` | GET | `/api/applications/:id` | MATCH | `applications/applications.controller.ts` | Auth roles `ADMIN`, `HR`; success envelope matches FE unwrap. | INFO |
| 21 | Application timeline | `lib/recruitment-api.ts` | GET | `/api/applications/:id/timeline` | MATCH | `applications/applications.controller.ts` | Auth roles `ADMIN`, `HR`; `id` vs `applicationId` param equivalent. | INFO |
| 22 | Application audit logs | `lib/recruitment-api.ts` | GET | `/api/applications/:id/audit-logs` | MISSING_BACKEND | N/A | Audit entity exists and services write logs, but no read controller endpoint. | HIGH |
| 23 | CV versions | `lib/recruitment-api.ts` | GET | `/api/applications/:applicationId/cv` | MATCH | `cv-documents/cv-documents.controller.ts` | Auth roles `ADMIN`, `HR`; response `data.versions` matches FE. | INFO |
| 24 | Parsed profile | `lib/recruitment-api.ts` | GET | `/api/applications/:applicationId/parsed-profile` | MISSING_BACKEND | N/A | ParsedProfile entity/service output exists through parse command, but no GET endpoint. | BLOCKER |
| 25 | Clean CV preview/download | `lib/recruitment-api.ts` | GET blob | `/api/applications/:applicationId/cv/:cvDocumentId/clean-file?disposition=` | MATCH | `cv-documents/cv-documents.controller.ts` | Auth roles `ADMIN`, `HR`; returns stream/blob, not envelope, which is expected by FE. | INFO |

## 3. API expected theo flow nhung frontend chua goi

| API expected | Co backend chua? | Frontend co goi chua? | Co can cho flow test khong? | Ghi chu |
| ------------ | ---------------- | --------------------- | --------------------------- | ------- |
| `PATCH /api/applications/:id/status` | Yes | No | No, chi admin recovery | Backend exposes `ApplicationsController.updateStatus`, ADMIN only. |
| `POST /api/applications/:applicationId/cv` | Yes | No | Optional/manual | Backend supports HR/Admin manual CV upload, but FE Batch C public apply is primary flow. |
| `GET /api/applications/:applicationId/cv/:cvDocumentId` | Yes | No | Optional | Metadata endpoint exists, FE currently uses versions list. |
| `POST /api/applications/:applicationId/cv/:cvDocumentId/sanitize` | Yes | No | Optional for retry/manual test | Backend exposes command, FE has no retry button. Worker auto-schedules sanitize after scan pass. |
| `POST /api/applications/:applicationId/cv/:cvDocumentId/parse` | Yes | No | Optional for retry/manual test | Backend exposes command, FE has no retry button. Sanitization service schedules parse after sanitize success. |

## 4. Backend co API nhung frontend chua dung

Chi liet ke API lien quan Recruitment Batch C.

| Backend API | Controller/file | Co nen dung trong FE flow khong? | Ghi chu |
| ----------- | --------------- | -------------------------------- | ------- |
| `PATCH /api/applications/:id/status` | `applications/applications.controller.ts` | No by default | Admin-only controlled recovery. Khong can cho public-to-CV-ready happy path. |
| `POST /api/applications/:applicationId/cv` | `cv-documents/cv-documents.controller.ts` | Optional | Nen dung neu them HR/Admin manual upload CV sau nay. |
| `GET /api/applications/:applicationId/cv/:cvDocumentId` | `cv-documents/cv-documents.controller.ts` | Optional | FE co the dung neu can metadata chi tiet hon versions list. |
| `POST /api/applications/:applicationId/cv/:cvDocumentId/sanitize` | `cv-documents/cv-documents.controller.ts` | Optional | Nen dung cho retry UI neu policy HR/Admin retry duoc confirm. |
| `POST /api/applications/:applicationId/cv/:cvDocumentId/parse` | `cv-documents/cv-documents.controller.ts` | Optional | Nen dung cho retry UI neu policy HR/Admin retry duoc confirm. |

## 5. Guardrail / endpoint khong duoc dung

| Endpoint/route | Tim thay o dau | Batch C co dung khong? | Ket luan |
| -------------- | -------------- | ---------------------- | -------- |
| `/candidates/upload` | `CandidateCreatePage.tsx`, `CandidateDetailPage.tsx` | No | OUT_OF_SCOPE, legacy candidate flow only. Khong phai blocker. |
| `/api/uploads/:filename` | Backend `uploads/uploads.controller.ts`; legacy candidate detail download qua URL field | No trong recruitment flow | OUT_OF_SCOPE, khong thay Batch C clean CV dung route nay. |
| `/session/:token` va `/sessions/access/:token/*` | `routes.tsx`, `CandidateSessionPage.tsx` | No | OUT_OF_SCOPE, legacy interview session flow only. Khong phai blocker. |

## 6. Response envelope va error handling

Success response:

- Public job detail, application list/detail/timeline, CV versions, CV commands hien co dung envelope `success/data/meta`.
- Clean CV endpoint tra blob/stream, phu hop `downloadBlob`.
- Auth endpoints la legacy raw response va FE dang expect raw, chap nhan.

Error response:

- Khong tim thay global exception filter trong `main.ts`/backend source de chuan hoa error thanh:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details": []
  },
  "meta": {}
}
```

- Nhieu service throw `BadRequestException('message')`, Nest default se tra shape kieu `statusCode/message/error`, khong co `error.code`.
- Mot so CV scan errors throw object `{ code, message }` trong exception, nhung Nest co the boc object nay duoi `message`, trong khi FE parser chi doc `raw.error.code` hoac `raw.code`.
- Ket luan: `RESPONSE_MISMATCH` cross-cutting cho error envelope/error code normalization. Public apply missing nen chua kiem tra duoc public apply errors thuc te.

Public apply errors can kiem tra sau khi implement endpoint:

```text
VALIDATION_ERROR
UNSUPPORTED_FILE_TYPE
FILE_TOO_LARGE
UPLOAD_RATE_LIMIT_EXCEEDED
MALWARE_DETECTED
CV_SCAN_FAILED
DUPLICATE_APPLICATION
```

## 7. Blocker truoc khi test full flow

- Backend typecheck fail tai `apps/backend/src/cv-sanitization/cv-sanitization.service.ts:435`.
- FE goi `POST /api/public/job-postings/:jobPostingId/apply` nhung backend chua co endpoint.
- FE goi toan bo JD APIs nhung backend chua co `JobDescriptionsController`.
- FE goi internal Job Posting APIs nhung backend chua co `JobPostingsController`.
- FE goi `GET /api/applications/:id/audit-logs` nhung backend chua co endpoint doc audit logs.
- FE goi `GET /api/applications/:applicationId/parsed-profile` nhung backend chua co endpoint.
- Error envelope/error code chua khop contract Phase 1, co nguy co FE hien generic error thay vi status-specific message.

## 8. De xuat thu tu sua sau audit

Khong sua code trong task audit nay. Thu tu patch de mo full UI flow:

1. Sua backend typecheck tai `cv-sanitization.service.ts:435`.
2. Them `JobDescriptionsController` cho list/create/detail/update/versions/mark-ready, dung roles `ADMIN`, `HR`.
3. Them internal `JobPostingsController` cho list/create/detail/update/publish/close/channels, dung roles `ADMIN`, `HR`.
4. Them public apply endpoint `POST /api/public/job-postings/:jobPostingId/apply` multipart, gom create Application + upload CV + scan sync, co `Idempotency-Key`.
5. Them `GET /api/applications/:applicationId/parsed-profile`.
6. Them `GET /api/applications/:applicationId/audit-logs` voi redaction metadata theo security spec.
7. Them global/common exception filter hoac local response mapping de error envelope/code khop frontend.
8. Chay lai functional flow: public job detail -> apply/upload CV -> scan -> sanitize -> parse -> application detail/CV/parsed profile/timeline/audit.

## 9. Commands da chay

```powershell
pnpm --filter @interview-assistant/frontend typecheck
pnpm --filter @interview-assistant/backend typecheck
```

Ket qua:

```text
Frontend typecheck: pass
Backend typecheck: fail
```

Backend typecheck fail:

```text
apps/backend/src/cv-sanitization/cv-sanitization.service.ts(435,7):
Type '{ applicationId: string; documentType: CvDocumentType.CLEAN; versionNo: number; originalFileHash: string | null; sanitizeStatus: CvSanitizeStatus.SANITIZED; }'
is not assignable to type 'FindOptionsWhere<CvDocumentEntity>'.
originalFileHash: string | null is not assignable to string | FindOperator<string> | undefined.
```

Khong chay build/lint vi `AGENTS.md` cam build va lint.

## 10. Ket luan cuoi

```text
FAIL: Chua nen test full flow UI Batch C.
```

Co the test mot phan:

- Auth login/me.
- Public job detail neu DB co published job posting.
- Application list/detail/timeline neu DB co application.
- CV versions va clean CV download neu DB co CV document da sanitized.

Chua the test full happy path tu dau den CV ready for first AI screening vi thieu public apply, internal JD/job posting controller, parsed-profile read endpoint, audit-log read endpoint, va backend typecheck dang fail.

