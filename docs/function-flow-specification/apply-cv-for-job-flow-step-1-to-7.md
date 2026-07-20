# Specification: Luong ung vien apply CV cho Job - den buoc parse CV

Ngay cap nhat: 2026-07-20

## 1. Muc tieu

Tai lieu nay mo ta phan dau cua luong ung vien nop CV vao mot Job da publish tren public recruitment site.

Pham vi chi bao gom den buoc 7:

1. Ung vien mo trang job public.
2. Ung vien submit form apply va upload CV.
3. Backend validate request apply.
4. Backend tao hoac lay candidate va application.
5. Backend luu original CV vao quarantine storage.
6. Backend sanitize original CV thanh clean CV.
7. Backend parse clean CV va tao parsed profile.

Ngoai pham vi tai lieu nay:

- Tao form session cau hoi.
- Gui email cau hoi cho ung vien.
- Ung vien mo form va submit cau tra loi.
- CV-JD mapping.
- AI screening.
- HR review.

Luu y hien tai: malware scan/ClamAV da duoc bo. Backend van dung trang thai `CV_SCAN_PASSED` de giu contract cho buoc sanitize, nhung metadata ghi ro `scannerSkipped: true`.

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
| CV parsing service | `apps/backend/src/cv-parsing/cv-parsing.service.ts` | Parse clean CV va tao parsed profile. |

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
| `email` | Co | Email ung vien. |
| `phone` | Co | So dien thoai ung vien. |
| `note` | Khong | Ghi chu ung vien. |
| `cvFile` | Co | File CV upload. Public apply hien chi chap nhan PDF o interceptor. |

## 4. Happy flow den buoc 7

### Buoc 1: Ung vien mo trang job public

Ung vien truy cap:

```http
GET /jobs/:slug
```

Frontend lay thong tin job bang:

```http
GET /api/public/job-postings/:slug
```

Backend chi tra job neu job da publish va co `publicSlug` hop le.

### Buoc 2: Ung vien submit apply va upload CV

Ung vien nhap thong tin ca nhan va chon file CV PDF.

Frontend submit multipart form toi:

```http
POST /api/public/job-postings/:jobPostingId/apply
```

Neu co, frontend gui them `Idempotency-Key` de ho tro retry an toan.

### Buoc 3: Backend validate request apply

Backend entry point:

```ts
PublicJobPostingsController.apply()
```

Thu tu xu ly chinh:

1. Kiem tra request co `cvFile`.
2. Normalize `Idempotency-Key`.
3. Normalize candidate input tu `fullName`, `email`, `phone`.
4. Rate limit theo `jobPostingId`, email, phone, IP va user agent.
5. Kiem tra file upload co dau hieu la CV.
6. Ghi nhan apply attempt.

Neu request khong hop le, backend tra loi loi public apply va khong tao application moi.

### Buoc 4: Backend tao hoac lay candidate va application

Backend service:

```ts
ApplicationsService.createFromApply()
ApplicationsService.createOrGetApplication()
```

Gia tri mac dinh cua application:

| Field | Gia tri |
| --- | --- |
| `source` | `PORTAL` |
| `sourceChannel` | `VCS_PORTAL` |
| `externalApplicationId` | `Idempotency-Key` neu co |
| `jobDescriptionVersionId` | Lay tu `jobPosting.jobDescriptionVersionId` |
| `status` | Bat dau tu `APPLICATION_CREATED` |

Xu ly duplicate:

- Neu trung `sourceChannel + externalApplicationId`, backend return application cu voi duplicate reason `IDEMPOTENT_REPLAY`.
- Neu trung candidate/job posting, backend return duplicate reason `CANDIDATE_JOB_MATCH`.
- Public re-apply chi duoc chap nhan neu identity candidate trung theo name, email va phone, va application dang o trang thai cho phep upload CV moi.

Workflow events ban dau:

```text
APPLICATION_SUBMITTED
APPLICATION_CREATED
APPLICATION_VALIDATING
APPLICATION_DUPLICATE_CHECKING
```

### Buoc 5: Backend luu original CV

Backend service:

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
| `actorId` | `null`. |
| `idempotencyKey` | Idempotency key neu co. |
| `scheduleSanitizeAfterScanPass` | `false`, vi controller goi sanitize dong bo ngay sau upload. |

Validation file:

- Co file.
- Extension hop le theo `CV_FILE_RULES`.
- File size > 0 va <= 20MB.
- Filename do server generate hop le.
- Signature file hop le.
- Tinh SHA-256 hash cua original file.

Original CV duoc luu trong quarantine storage.

Record `cv_documents` duoc tao voi:

| Field | Gia tri |
| --- | --- |
| `documentType` | `ORIGINAL` |
| `storageZone` | `QUARANTINE` |
| `scanStatus` | Ban dau `PENDING`, sau do set `PASSED` do scan da skip. |
| `sanitizeStatus` | `PENDING` |
| `parseStatus` | `PENDING` |
| `isCurrent` | `true` neu `replaceCurrent = true`. |

Application duoc cap nhat:

```text
currentCvDocumentId = originalCvDocument.id
```

Workflow/audit:

```text
CV_UPLOADED
CV_HASH_CALCULATED
CV_STORED_QUARANTINE
CV_SCAN_PASSED
```

Metadata scan skipped:

| Field | Gia tri |
| --- | --- |
| `scanner` | `disabled` |
| `scannerResult` | `SKIPPED` |
| `reasonCode` | `MALWARE_SCAN_DISABLED` |
| `scannerSkipped` | `true` |
| `threatDetected` | `false` |

### Buoc 6: Backend sanitize original CV thanh clean CV

Backend service:

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
- Mode trong `.env.example` va Docker Compose: `HTTP_SERVICE`.
- Khi `HTTP_SERVICE`, backend goi service sanitizer HTTP tai `CV_SANITIZER_SERVICE_URL`.

Ket qua thanh cong:

- Tao clean CV document trong safe storage.
- Clean CV co `documentType = CLEAN`.
- Clean CV co `storageZone = SAFE`.
- Clean CV co `sanitizeStatus = SANITIZED`.
- Clean CV co `parseStatus = PENDING`.
- Clean CV duoc set `isCurrent = true`.
- Application `currentCvDocumentId` duoc cap nhat sang clean CV.

Workflow:

```text
CV_SANITIZING
CV_SANITIZED
```

Neu sanitize fail:

- Clean/original document duoc danh dau failed tuy ngu canh.
- Application co the chuyen `CV_SANITIZE_FAILED`.
- Public API tra loi loi qua public exception filter.

### Buoc 7: Backend parse clean CV va tao parsed profile

Backend service:

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
12. Ghi audit log `CV_PARSED` va `PARSED_PROFILE_CREATED`.
13. Ghi profile duplicate check.

Neu parse fail:

- Clean CV `parseStatus = FAILED`.
- Application transition `CV_PARSE_FAILED`.
- Audit action `CV_PARSE_FAILED`.

## Response public apply trong pham vi buoc 1-7

Neu buoc 1-7 thanh cong, API public apply tra response dang:

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

Luu y: message response hien con cum "Malware scan" theo legacy text, mac du hanh vi thuc te la scanner da bi skip va metadata ghi `scannerSkipped: true`.

## Trang thai application lien quan den buoc 1-7

Thu tu trang thai thanh cong trong pham vi tai lieu:

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
```

Mot so trang thai loi co the gap:

| Trang thai | Khi nao |
| --- | --- |
| `APPLICATION_REJECTED_RATE_LIMIT` | Qua gioi han public apply. |
| `APPLICATION_DUPLICATE_FOUND` | Duplicate application/profile can review. |
| `CV_SANITIZE_FAILED` | Clean CV sanitizer loi. |
| `CV_PARSE_FAILED` | Parse clean CV loi. |

## Bang du lieu chinh trong pham vi buoc 1-7

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

## Cac diem can luu y

1. Tai lieu nay dung o buoc parse CV, khong mo ta form session va email cau hoi.
2. Public apply hien block den khi sanitize va parse xong.
3. Ghostscript sanitize van la buoc bat buoc truoc khi parse CV.
4. Malware scan da bi skip nhung status `CV_SCAN_PASSED` van duoc dung de tuong thich voi downstream.
5. CV-JD mapping va AI screening khong tu dong chay trong pham vi buoc 1-7.
