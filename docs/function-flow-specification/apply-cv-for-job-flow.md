# Specification: Luong ung vien apply CV cho Job

Ngay cap nhat: 2026-07-15

## 1. Muc tieu

Tai lieu nay mo ta luong hien tai khi ung vien nop CV vao mot Job da publish tren public recruitment site.

Pham vi bao gom:

- Frontend public job detail/apply.
- Backend public apply API.
- Tao ho so ung tuyen (`applications`).
- Luu va xu ly CV.
- Sanitize CV, parse CV, tao parsed profile.
- Tao form cau hoi va gui email cho ung vien.
- Cap nhat trang thai ho so trong workflow.

Luu y hien tai: buoc malware scan/ClamAV da duoc bo. Backend van giu trang thai `CV_SCAN_PASSED` de cac buoc sanitize/parse tiep tuc chay, nhung metadata ghi ro `scannerSkipped: true`.

## 2. Thanh phan lien quan

| Thanh phan | File/Module | Vai tro |
| --- | --- | --- |
| Public job UI | `apps/frontend/src/pages/public/PublicJobDetailPage.tsx` | Hien thi chi tiet job theo slug. |
| Public apply UI | `apps/frontend/src/pages/public/PublicJobApplyPage.tsx` | Form nop ho so va upload CV. |
| Public apply API client | `apps/frontend/src/lib/recruitment-public-api.ts` | Goi public job/apply API. |
| Public job controller | `apps/backend/src/job-postings/public-job-postings.controller.ts` | Entry point public job detail va apply. |
| Applications service | `apps/backend/src/applications/applications.service.ts` | Tao/lay application, xu ly duplicate va workflow. |
| CV documents service | `apps/backend/src/cv-documents/cv-documents.service.ts` | Luu CV goc, validate file, danh dau scan skipped/pass. |
| CV sanitization service | `apps/backend/src/cv-sanitization/cv-sanitization.service.ts` | Tao clean CV trong safe storage. |
| Ghostscript sanitizer | `apps/backend/src/cv-sanitization/sanitizer/*` va `apps/cv-sanitizer/server.js` | Lam sach PDF bang Ghostscript truc tiep hoac qua HTTP service. |
| CV parsing service | `apps/backend/src/cv-parsing/cv-parsing.service.ts` | Parse clean CV va tao parsed profile. |
| Form sessions service | `apps/backend/src/form-sessions/form-sessions.service.ts` | Tao form session, snapshot bo cau hoi, gui email. |

## 3. Frontend route va API

### 3.1 Route public

| Route | Mo ta |
| --- | --- |
| `/jobs/:slug` | Trang chi tiet job public. |
| `/jobs/:slug/apply` | Trang nop CV cho job. |
| `/apply/:applicationId/status` | Trang ket qua/trang thai apply sau khi nop. |

### 3.2 Lay thong tin job public

Frontend goi:

```http
GET /api/public/job-postings/:slug
```

Backend xu ly tai:

```ts
PublicJobPostingsController.findBySlug()
```

Dieu kien backend:

- Job posting phai published.
- Job posting duoc tim theo `publicSlug`.
- Response tra ve thong tin job va `applyUrl`.

### 3.3 Nop CV

Frontend goi:

```http
POST /api/public/job-postings/:jobPostingId/apply
Content-Type: multipart/form-data
Idempotency-Key: <optional-client-generated-key>
```

Request fields:

| Ten field | Bat buoc | Mo ta |
| --- | --- | --- |
| `fullName` | Co | Ho ten ung vien. |
| `email` | Co | Email ung vien, dung de tao candidate va gui form cau hoi. |
| `phone` | Co | So dien thoai ung vien. |
| `note` | Khong | Ghi chu ung vien. |
| `cvFile` | Co | File CV upload. Public apply hien chi chap nhan PDF o interceptor. |

Frontend implementation:

```ts
submitPublicApplication(jobPostingId, payload, cvFile, idempotencyKey)
```

## 4. Luong backend chi tiet

### 4.1 Entry point public apply

Backend method:

```ts
PublicJobPostingsController.apply()
```

Thu tu xu ly:

1. Kiem tra co `cvFile`, neu khong co thi throw `BadRequestException`.
2. Normalize `Idempotency-Key`.
3. Normalize candidate input:
   - `name` tu `fullName`.
   - `email`.
   - `phone`.
4. Rate limit public apply theo:
   - `jobPostingId`.
   - email.
   - phone.
   - IP.
   - user agent.
5. Kiem tra file upload co dau hieu la CV qua `assertUploadedFileLooksLikeResume`.
6. Ghi nhan apply attempt.
7. Tao ho so ung tuyen qua `ApplicationsService.createFromApply`.
8. Upload original CV.
9. Sanitize original CV thanh clean CV.
10. Parse clean CV thanh parsed profile.
11. Tao form session va gui email cau hoi trong background.
12. Tra response thanh cong.

### 4.2 Tao application

Backend method:

```ts
ApplicationsService.createFromApply()
ApplicationsService.createOrGetApplication()
```

Gia tri mac dinh:

| Field | Gia tri |
| --- | --- |
| `source` | `PORTAL` |
| `sourceChannel` | `VCS_PORTAL` |
| `externalApplicationId` | `Idempotency-Key` neu co |

Thu tu xu ly:

1. Validate source/channel.
2. Neu co `sourceChannel + externalApplicationId`:
   - Lock application source reference.
   - Neu da co source trung idempotency key thi return existing application voi duplicate reason `IDEMPOTENT_REPLAY`.
3. Tim `jobPosting`.
4. Kiem tra job posting co nhan application khong.
5. Resolve candidate:
   - Co the dung candidate co san neu input co `candidateId`.
   - Neu khong, tim theo email/phone/name hoac tao candidate moi.
6. Kiem tra duplicate application theo identity:
   - candidate.
   - email.
   - phone.
   - job posting.
7. Lock cap `candidateId + jobPostingId`.
8. Neu da ton tai application cho candidate/job:
   - Return duplicate reason `CANDIDATE_JOB_MATCH`.
9. Tao record `applications`.

Application moi duoc gan:

| Field | Gia tri |
| --- | --- |
| `candidateId` | Candidate da resolve. |
| `jobPostingId` | Job posting public ung vien nop vao. |
| `jobDescriptionVersionId` | Lay tu `jobPosting.jobDescriptionVersionId`. Day la snapshot JD cua post tai thoi diem publish/sync. |
| `status` | Bat dau tu `APPLICATION_CREATED`, sau do transition tiep. |
| `currentCvDocumentId` | `null` ban dau. |
| `mappingStatus` | `null`. |
| `formStatus` | `null`. |
| `aiScreeningStatus` | `null`. |
| `hrReviewStatus` | `null`. |

Workflow events/trang thai ban dau:

1. `APPLICATION_SUBMITTED`
2. `APPLICATION_CREATED`
3. `APPLICATION_VALIDATING`
4. `APPLICATION_DUPLICATE_CHECKING`
5. Duplicate check `PASSED`

### 4.3 Xu ly duplicate public re-apply

Sau khi `createFromApply` tra ve:

- Neu `duplicate = true` va `duplicateReason != IDEMPOTENT_REPLAY`, controller coi day la public re-apply.
- Backend kiem tra re-apply co dung cung ung vien khong bang:
  - normalized name.
  - normalized email.
  - normalized phone.
- Neu khac identity, throw `DUPLICATE_APPLICATION`.
- Neu dung identity, cho phep upload CV moi neu application status nam trong danh sach allowed.

## 5. Luong CV hien tai

### 5.1 Upload original CV

Backend method:

```ts
CvDocumentsService.uploadOriginalCv()
CvDocumentsService.createOriginalCv()
```

Input tu public apply:

| Field | Gia tri |
| --- | --- |
| `applicationId` | Application vua tao hoac existing duplicate hop le. |
| `file` | File multipart `cvFile`. |
| `replaceCurrent` | `true`. |
| `reason` | `dto.note`. |
| `actorId` | `null` vi public candidate. |
| `idempotencyKey` | Idempotency key neu co. |
| `scheduleSanitizeAfterScanPass` | `false` trong public apply, vi controller goi sanitize dong bo ngay sau upload. |

Validation file:

- Co file.
- Extension hop le theo `CV_FILE_RULES`.
- File size > 0 va <= 20MB.
- Filename do server generate hop le.
- Signature file hop le.
- Tinh SHA-256 hash cua original file.

Public apply interceptor hien tai chi chap nhan PDF. `CvDocumentsService` van co rule cho PDF/DOCX/XLSX vi duoc dung cho cac luong upload khac.

### 5.2 Luu original CV

Original CV duoc luu trong quarantine storage.

Record `cv_documents` duoc tao voi:

| Field | Gia tri |
| --- | --- |
| `documentType` | `ORIGINAL` |
| `storageZone` | `QUARANTINE` |
| `storagePath` | Quarantine storage key. |
| `scanStatus` | Ban dau `PENDING`, sau do duoc set `PASSED` do scan da bi skip. |
| `sanitizeStatus` | `PENDING` |
| `parseStatus` | `PENDING` |
| `isCurrent` | `true` neu `replaceCurrent = true`. |

Application duoc cap nhat:

- `currentCvDocumentId = originalCvDocument.id` luc original CV la current.

Workflow/audit:

1. `CV_UPLOADED`
2. `CV_HASH_CALCULATED`
3. File duplicate check `PASSED`
4. `CV_STORED_QUARANTINE`

### 5.3 Malware scan da duoc bo

Truoc day backend goi scanner/ClamAV sau khi luu quarantine. Hien tai buoc nay da duoc bo.

Thay vao do:

```ts
CvDocumentsService.markCvScanSkippedAsPassed()
```

Hanh vi hien tai:

- Khong goi ClamAV.
- Khong khoi tao malware scanner provider.
- Khong can container `clamav`.
- Set `cvDocument.scanStatus = PASSED`.
- Record workflow transition:

```text
CV_STORED_QUARANTINE -> CV_SCAN_PASSED
```

Metadata ghi kem:

| Field | Gia tri |
| --- | --- |
| `scanner` | `disabled` |
| `scannerResult` | `SKIPPED` |
| `reasonCode` | `MALWARE_SCAN_DISABLED` |
| `scannerSkipped` | `true` |
| `threatDetected` | `false` |

Ly do van dung status `CV_SCAN_PASSED`:

- `CvSanitizationService` hien yeu cau original CV co `scanStatus = PASSED` truoc khi sanitize.
- Cach nay giu flow downstream on dinh, khong phai thay doi contract trang thai hien tai.

### 5.4 Sanitize clean CV

Backend method:

```ts
CvDocumentsService.sanitizeOriginalCvAfterScanPass()
CvSanitizationService.sanitizeCvDocument()
```

Public apply goi sanitize dong bo ngay sau upload:

```ts
scheduleParseAfterSanitizeSuccess: false
```

Dieu kien:

- Original CV ton tai.
- Original CV co `scanStatus = PASSED`.
- Application khong o terminal status.

Sanitizer hien tai:

- Module: `CvSanitizationModule`.
- Injection token: `CLEAN_CV_SANITIZER`.
- Env dieu khien: `CV_PDF_SANITIZER_MODE`.
- Mode trong `.env.example` va Docker Compose hien tai: `HTTP_SERVICE`.
- Khi `HTTP_SERVICE`, backend goi service sanitizer HTTP tai `CV_SANITIZER_SERVICE_URL`.
- Docker Compose chay service `cv-sanitizer` tu target `cv-sanitizer`, service nay dung Ghostscript de render/lam sach PDF.
- Mode khac co san trong code: `GHOSTSCRIPT_DOCKER`, dung `GhostscriptDockerPdfSanitizer` de chay Ghostscript qua Docker image cau hinh boi `CV_GHOSTSCRIPT_DOCKER_IMAGE`.

Noi cach khac: ClamAV malware scan da bi bo, nhung Ghostscript sanitize van la mot buoc bat buoc truoc khi parse CV.

Ket qua:

- Tao clean CV document trong safe storage.
- Clean CV co:
  - `documentType = CLEAN`
  - `storageZone = SAFE`
  - `sanitizeStatus = SANITIZED`
  - `parseStatus = PENDING`
  - `isCurrent = true`
- Application `currentCvDocumentId` duoc cap nhat sang clean CV.

Workflow:

1. `CV_SANITIZING`
2. `CV_SANITIZED`

Neu sanitize fail:

- Clean/original document duoc danh dau failed tuy ngu canh.
- Application co the chuyen `CV_SANITIZE_FAILED`.
- Public API tra loi loi qua public exception filter.

### 5.4.1 Ghostscript HTTP sanitizer trong Docker Compose

Docker Compose hien co service:

```yaml
cv-sanitizer:
  target: cv-sanitizer
  environment:
    PORT: 8080
    CV_QUARANTINE_DIR: /app/apps/backend/storage/cv-quarantine
    CV_SAFE_DIR: /app/apps/backend/storage/cv-safe
    CV_GHOSTSCRIPT_TIMEOUT_MS: 60000
```

Backend trong Docker cau hinh:

```yaml
CV_PDF_SANITIZER_MODE: HTTP_SERVICE
CV_SANITIZER_SERVICE_URL: http://cv-sanitizer:8080
```

Y nghia:

1. Backend khong parse truc tiep file quarantine.
2. Backend yeu cau sanitizer tao file clean trong safe storage.
3. File clean moi duoc dung cho buoc parse CV.
4. Neu Ghostscript/HTTP sanitizer loi, flow dung o `CV_SANITIZE_FAILED`.

### 5.5 Parse clean CV

Backend method:

```ts
CvParsingService.parseCleanCvDocument()
```

Input tu public apply:

| Field | Gia tri |
| --- | --- |
| `applicationId` | Application hien tai. |
| `cvDocumentId` | Clean CV document id. |
| `actorId` | `null`. |
| `idempotencyKey` | Idempotency key neu co. |

Thu tu xu ly:

1. Tim clean CV hien tai.
2. Neu da co parsed profile cho clean CV va khong force, return parsed profile cu.
3. Kiem tra application status co cho phep parse.
4. Set clean CV `parseStatus = PARSING`.
5. Ghi event `CV_PARSE_REQUESTED`.
6. Parse file bang `FileParserService`.
7. Validate resume signals.
8. Goi `GeminiCvParserService.parseProfile` de enrich structured profile.
9. Luu `parsed_profiles`.
10. Set clean CV `parseStatus = PARSED`.
11. Workflow transition `CV_PARSED`.
12. Ghi audit log:
    - `CV_PARSED`
    - `PARSED_PROFILE_CREATED`
13. Ghi profile duplicate check.

Neu parse fail:

- Clean CV `parseStatus = FAILED`.
- Application transition `CV_PARSE_FAILED`.
- Audit action `CV_PARSE_FAILED`.

## 6. Tao form session va gui email cau hoi

Sau khi parse CV thanh cong, public apply controller goi background:

```ts
this.formSessionsService.generateFormSession(applicationId).catch(...)
```

Luu y:

- Day la background promise, khong block response apply.
- Neu fail, backend chi log loi:

```text
Failed to auto-generate form session on candidate apply: ...
```

### 6.1 Chon bo cau hoi

Backend method:

```ts
FormSessionsService.generateFormSession()
```

Thu tu uu tien:

1. `jobPosting.formQuestionSet` snapshot neu co.
2. `jobPosting.formQuestionIds` legacy/configured ids neu co.
3. Portal question set theo `jobPosting.jobDescriptionId`.
4. Neu JD la VCS Portal source va khong co synced questions, throw loi.
5. Fallback legacy: infer category theo job title, lay active questions tu question bank.
6. Neu van khong co question, throw loi.

Neu job posting chua co `formQuestionSetId` nhung da resolve duoc questions:

- Service tao posting question set snapshot.
- Set:
  - `jobPosting.formQuestionSetId`
  - `jobPosting.formQuestionIds`

Muc tieu: job da publish se khong bi anh huong khi JD/question set goc sync lai sau nay.

### 6.2 Tao form session

Service tao:

- Mot `QuestionSetEntity` rieng cho form session cua application.
- Cac `QuestionSetItemEntity` snapshot text/type/required/metadata.
- Huy cac form session cu co status `CREATED` hoac `SENT`.
- Tao token plain `form_<random>` va luu `tokenHash`.
- Set expiration hien tai: 5 phut.
- Tao `FormSessionEntity`:
  - `status = SENT`
  - `sentAt = now`
  - `openedAt = null`
  - `submittedAt = null`

Workflow:

```text
FORM_SENT
```

### 6.3 Gui email cau hoi

Email gui toi:

```text
application.candidate.email
```

Thong tin email:

- `candidateName`: `application.candidate.name` neu co.
- `jobTitle`: `jobPosting.title`.
- `formUrl`: `${FRONTEND_URL}/form/${plainToken}`.
- Template: `form-questionnaire-email.ejs`.

Neu `candidate.email` khong hop le hoac khong co `@`, service khong gui email.

## 7. Luong ung vien mo va submit form

### 7.1 Mo form

API:

```http
GET /api/public/form-sessions/:token
```

Backend:

```ts
PublicFormSessionsController.getForm()
FormSessionsService.getFormSessionByToken()
```

Xu ly:

1. Hash token de tim session.
2. Neu session khong ton tai, cancelled, submitted hoac expired thi throw loi.
3. Neu qua han:
   - Set `FormSessionStatus.EXPIRED`.
   - Workflow transition `FORM_EXPIRED`.
4. Neu session dang `SENT`:
   - Set `FormSessionStatus.OPENED`.
   - Set `openedAt`.
   - Workflow transition `FORM_OPENED`.
5. Tra ve candidate name, job title va questions.

### 7.2 Submit form

API:

```http
POST /api/public/form-sessions/:token/submit
```

Request:

```json
{
  "answers": [
    {
      "questionSetItemId": "uuid",
      "answer": {}
    }
  ]
}
```

Backend:

```ts
PublicFormSessionsController.submitForm()
FormSessionsService.submitAnswers()
```

Xu ly:

1. Tim form session theo token hash.
2. Neu da submitted thi throw loi.
3. Neu expired thi set `EXPIRED`, workflow `FORM_EXPIRED`, throw loi.
4. Validate required answers.
5. Luu `form_answers`.
6. Set session:
   - `status = SUBMITTED`
   - `submittedAt = now`
7. Workflow transition:

```text
FORM_SUBMITTED
```

## 8. Response public apply hien tai

Thanh cong:

```json
{
  "success": true,
  "data": {
    "applicationId": "uuid",
    "candidateId": "uuid",
    "jobPostingId": "uuid",
    "status": "CV_ACCEPTED",
    "processingStatus": "ACCEPTED",
    "originalCvDocumentId": "uuid",
    "cleanCvDocumentId": "uuid",
    "currentCvDocumentId": "uuid",
    "parsedProfileId": "uuid",
    "nextStep": "CV_JD_MAPPING_PENDING",
    "message": "CV accepted. Malware scan, sanitization and parsing completed successfully."
  },
  "meta": {
    "requestId": "uuid",
    "idempotencyKey": "optional-key",
    "timestamp": "ISO timestamp"
  }
}
```

Luu y: message response hien van con cum "Malware scan" theo legacy text, mac du buoc scanner da bi skip. Ve hanh vi thuc te, backend khong goi ClamAV nua va ghi metadata `scannerSkipped: true`.

## 9. Trang thai application lien quan

Thu tu trang thai thanh cong trong luong public apply:

```text
APPLICATION_CREATED
APPLICATION_VALIDATING
APPLICATION_DUPLICATE_CHECKING
CV_UPLOADED
CV_STORED_QUARANTINE
CV_SCAN_PASSED
CV_SANITIZING
CV_SANITIZED
CV_PARSED
FORM_SENT
FORM_OPENED
FORM_SUBMITTED
```

Mot so trang thai loi co the gap:

| Trang thai | Khi nao |
| --- | --- |
| `APPLICATION_REJECTED_RATE_LIMIT` | Qua gioi han public apply. |
| `APPLICATION_DUPLICATE_FOUND` | Duplicate application/profile can review. |
| `CV_SANITIZE_FAILED` | Clean CV sanitizer loi. |
| `CV_PARSE_FAILED` | Parse clean CV loi. |
| `FORM_EXPIRED` | Ung vien mo/submit sau han. |

## 10. Bang du lieu chinh

| Bang | Du lieu lien quan |
| --- | --- |
| `candidates` | Ho ten, email, phone cua ung vien. |
| `applications` | Ho so ung tuyen, lien ket candidate/job posting/JD version/current CV/status. |
| `application_sources` | Source/channel/external id/idempotency cua application. |
| `duplicate_checks` | Ket qua duplicate check application/file/profile. |
| `cv_documents` | Original CV va clean CV theo version. |
| `parsed_profiles` | Profile structured sau khi parse CV. |
| `workflow_events` | Lich su transition/event cua application. |
| `audit_logs` | Audit theo application/action/object. |
| `question_sets` | Bo cau hoi snapshot cua form session. |
| `question_set_items` | Cac cau hoi snapshot. |
| `form_sessions` | Token hash, status sent/opened/submitted/expired. |
| `form_answers` | Cau tra loi cua ung vien. |

## 11. Cac diem can luu y khi refine tiep

1. Public apply response message nen duoc doi de khong con noi "Malware scan" neu muon dong nhat voi flow moi.
2. `CV_SCAN_PASSED` hien duoc dung nhu compatibility status cho sanitizer. Neu muon semantic sach hon, co the them status rieng `CV_SCAN_SKIPPED`, nhung se can update `CvSanitizationService` va UI/status labels.
3. Ghostscript sanitize van la bat buoc. Neu muon bo ca Ghostscript, can thay doi `CvSanitizationService`, safe storage contract va parse source.
4. Form session generation la background task, nen apply response co the thanh cong trong khi email/form session fail sau do.
5. Email form duoc gui toi `application.candidate.email`, khong lay tu CV parsed profile.
6. Application luu `jobDescriptionVersionId` tai thoi diem apply, giup snapshot JD cua post khong bi anh huong khi JD goc sync lai.
7. Public apply hien block den khi sanitize va parse xong; neu parse cham, request apply se cham theo.
8. CV-JD mapping/AI screening khong tu dong chay trong public apply flow hien tai; response `nextStep = CV_JD_MAPPING_PENDING`.
