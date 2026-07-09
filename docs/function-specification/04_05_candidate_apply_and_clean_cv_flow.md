# Step 4-5: Candidate Apply CV, Malware Scan, Clean CV Generation

## 1. Muc tieu

Tai lieu nay mo ta flow hien tai cua hai buoc:

- Step 4: Ung vien apply CV.
- Step 5: He thong quet ma doc va tao CV sach.

Pham vi tai lieu dua tren code hien tai trong backend/frontend sau khi refine public Candidate Apply + Upload CV flow.

Ngay cap nhat: 2026-07-07.

## 2. Module lien quan

| Thanh phan | File chinh | Vai tro |
| --- | --- | --- |
| Public apply UI | `apps/frontend/src/pages/public/PublicJobApplyPage.tsx` | Form ung vien nhap thong tin va upload CV. |
| Public recruitment API client | `apps/frontend/src/lib/recruitment-public-api.ts` | Goi API public apply. |
| CV upload field | `apps/frontend/src/components/recruitment/CvUploadField.tsx` | Validate file tren client. |
| Public job postings controller | `apps/backend/src/job-postings/public-job-postings.controller.ts` | Entry point public apply. |
| Applications service | `apps/backend/src/applications/applications.service.ts` | Tao application, rate limit, idempotency, duplicate check. |
| CV documents service | `apps/backend/src/cv-documents/cv-documents.service.ts` | Luu CV goc, hash, validate file, scan malware, va cho public apply tat schedule sanitize async. |
| CV sanitization service | `apps/backend/src/cv-sanitization/cv-sanitization.service.ts` | Tao CV sach trong safe storage; public apply tat schedule parse async de parse sync trong request. |
| CV sanitizer HTTP service | `apps/cv-sanitizer/server.js` | Chay Ghostscript de rewrite PDF sach. |
| CV parsing service | `apps/backend/src/cv-parsing/cv-parsing.service.ts` | Parse CV sach sau khi sanitize thanh cong. |
| File parser | `apps/backend/src/file-parser/file-parser.service.ts` | Parse PDF de validate CV public apply va parse clean profile. |

## 3. Flow tong quan

```text
Candidate mo public apply page
-> FE validate thong tin va file CV
-> FE POST /api/public/job-postings/:jobPostingId/apply
-> Backend luu file upload vao quarantine
-> Backend validate rate limit, CV-like signals, duplicate/idempotency
-> Backend tao hoac lay application
-> Backend tao CvDocument ORIGINAL trong quarantine
-> Backend hash va validate file signature
-> Backend scan malware dong bo trong request
-> Neu scan fail/malware: tra loi loi va dung flow
-> Neu scan pass: backend await sanitize trong cung request
-> Sanitizer tao PDF sach trong safe storage
-> Backend tao CvDocument CLEAN
-> Backend parse CLEAN CV trong cung request
-> Backend tao parsed profile va duplicate profile check
-> Backend tra success cho candidate voi status CV_ACCEPTED
```

## 4. Step 4 - Ung vien apply CV

### 4.1. Entry point frontend

Ung vien apply qua public apply page:

```text
/jobs/:slug/apply
```

Frontend lay thong tin job posting public, hien thi form ung tuyen va cho upload CV.

Du lieu ung vien nhap:

| Field | Bat buoc | Ghi chu |
| --- | --- | --- |
| `fullName` | Co | Ho ten ung vien. |
| `email` | Co | FE validate format email co ban. |
| `phone` | Co | So dien thoai. |
| `note` | Khong | Ghi chu them cua ung vien. |
| `consent` | Co | Checkbox xac nhan thong tin truoc khi gui. |
| `cvFile` | Co | File CV. |

### 4.2. Validate tren frontend

`CvUploadField` hien tai chi cho phep:

```text
.pdf
```

Gioi han dung luong:

```text
20 MB
```

Neu file sai dinh dang, qua lon hoac rong, FE chan submit va hien loi cho ung vien.

### 4.3. API public apply

Frontend goi:

```http
POST /api/public/job-postings/:jobPostingId/apply
Content-Type: multipart/form-data
Header: Idempotency-Key: apply_<uuid>
```

Multipart fields:

| Field | Type | Bat buoc |
| --- | --- | --- |
| `fullName` | string | Co |
| `email` | string | Co |
| `phone` | string | Co |
| `note` | string | Khong |
| `cvFile` | binary | Co |

Controller xu ly tai:

```text
PublicJobPostingsController.apply()
```

### 4.4. Luu file tam vao quarantine ngay khi nhan request

Backend dung `FileInterceptor('cvFile')` voi `diskStorage`.

File duoc ghi vao quarantine root:

```text
CV_QUARANTINE_DIR
```

Neu khong cau hinh, default la:

```text
./storage/cv-quarantine
```

Ten file server-side duoc sinh theo dang:

```text
<timestamp>-<uuid>.<extension>
```

Muc dich:

- Khong dung filename tu client lam filename luu tru noi bo.
- Tach CV goc ra khoi public upload storage.
- Chuan bi cho scanner chi doc tu quarantine.

### 4.5. Validate backend truoc khi tao application

Backend thuc hien cac buoc:

1. Bat buoc co file `cvFile`.
2. Normalize `Idempotency-Key`.
3. Bat buoc co `fullName`, `email`, `phone`.
4. Check public apply rate limit.
5. Parse nhanh file de xac minh file trong giong CV.
6. Ghi audit log `PUBLIC_APPLY_RECEIVED`.
7. Tao hoac lay application.

Rate limit hien tai:

| Loai gioi han | Rule |
| --- | --- |
| Theo IP | Toi da 20 attempt / 1 phut / job posting. |
| Theo email/phone | Toi da 5 attempt / 1 ngay / job posting. |

### 4.6. Validate file co phai CV khong

Backend goi:

```text
FileParserService.parseFile(file.path)
validateResumeSignals(parsedData, rawText)
```

File chi duoc coi la CV hop le khi co du 3 tin hieu:

| Tin hieu | Dieu kien |
| --- | --- |
| `rawText` | Text extract duoc dai toi thieu 120 ky tu. |
| `email` | Tim thay email trong parsed data hoac raw text. |
| `skills` | Tim thay it nhat mot keyword ky nang trong cau hinh. |

Neu khong du tin hieu, API tra loi:

```text
422 CV_NOT_RESUME
```

### 4.7. Tao application va duplicate/idempotency

Backend goi:

```text
ApplicationsService.createFromApply()
```

Application public apply duoc gan:

| Field | Gia tri |
| --- | --- |
| `source` | `PORTAL` |
| `sourceChannel` | `VCS_PORTAL` |
| `externalApplicationId` | `Idempotency-Key` neu co |
| `status` ban dau | `APPLICATION_CREATED` |

Service thuc hien:

1. Lock external reference neu co `sourceChannel + externalApplicationId`.
2. Kiem tra job posting con nhan ho so.
3. Resolve hoac tao candidate.
4. Check duplicate application theo candidate/job/email/phone.
5. Tao `applications`.
6. Tao `application_sources`.
7. Ghi workflow/audit events.
8. Chuyen status qua:

```text
APPLICATION_CREATED
-> APPLICATION_VALIDATING
-> APPLICATION_DUPLICATE_CHECKING
```

Neu duplicate cung idempotency key va cung payload, backend tra lai application cu.

Neu duplicate theo identity:

- Neu la public re-apply va thong tin candidate trung khop, backend cho phep cap nhat CV trong cac status cho phep.
- Neu thong tin candidate khac, backend tra `DUPLICATE_APPLICATION`.

### 4.8. Response thanh cong cho candidate

Sau khi upload CV, scan malware pass va sanitize pass, response thanh cong co dang:

```json
{
  "success": true,
  "data": {
    "applicationId": "...",
    "candidateId": "...",
    "jobPostingId": "...",
    "status": "CV_ACCEPTED",
    "processingStatus": "ACCEPTED",
    "originalCvDocumentId": "...",
    "cleanCvDocumentId": "...",
    "currentCvDocumentId": "...",
    "parsedProfileId": "...",
    "nextStep": "CV_JD_MAPPING_PENDING",
    "message": "CV accepted. Malware scan, sanitization and parsing completed successfully."
  }
}
```

Luu y: Response chi tra thanh cong sau khi clean CV da ton tai trong safe storage, parse CLEAN CV da pass, parsed profile da luu, va duplicate profile check da ghi nhan.

## 5. Step 5 - Quet ma doc va tao CV sach

### 5.1. Upload original CV

Backend goi:

```text
CvDocumentsService.uploadOriginalCv()
```

Ben trong service, truoc khi tao `CvDocument`, backend validate:

| Validate | Mo ta |
| --- | --- |
| Original filename | Ten file client gui duoc normalize, cat toi da 255 ky tu. |
| Quarantine path | File path phai nam trong `CV_QUARANTINE_DIR`. |
| Extension | Public apply chi chap nhan `.pdf`; cac flow noi bo khac co the dung rule upload rieng. |
| Size | File phai > 0 va <= 20 MB. |
| Server filename | Filename phai dung pattern do server sinh. |
| File signature | Magic bytes phai khop dinh dang file. |
| SHA-256 | Tinh `originalFileHash`. |

Sau khi validate, backend tao `CvDocument` loai original:

| Field | Gia tri |
| --- | --- |
| `documentType` | `ORIGINAL` |
| `storageZone` | `QUARANTINE` |
| `storagePath` | `quarantine/<server-file-name>` |
| `originalFileHash` | SHA-256 cua file goc |
| `cleanFileHash` | `null` |
| `scanStatus` | `PENDING` |
| `sanitizeStatus` | `PENDING` |
| `parseStatus` | `PENDING` |
| `isCurrent` | Theo `replaceCurrent`, public apply mac dinh true |

Workflow/audit events lien quan:

```text
CV_UPLOADED
CV_HASH_CALCULATED
CV_STORED_QUARANTINE
```

### 5.2. File duplicate check

Backend check duplicate theo `originalFileHash` trong cung application.

Neu file da tung duoc upload cho application do, backend tra:

```text
409 DUPLICATE_CV_FILE
```

Neu cung `Idempotency-Key` nhung file khac, backend tra:

```text
409 IDEMPOTENCY_CONFLICT
```

### 5.3. Malware scan

Sau khi original CV duoc luu trong DB va quarantine, backend scan dong bo trong request.

Status transition:

```text
CV_STORED_QUARANTINE
-> CV_SCAN_REQUESTED
-> CV_SCAN_PASSED | CV_REJECTED_MALWARE | CV_SCAN_FAILED
```

`CvDocument.scanStatus` tuong ung:

```text
PENDING
-> SCANNING
-> PASSED | REJECTED_MALWARE | FAILED
```

Scanner input gom:

| Field | Mo ta |
| --- | --- |
| `applicationId` | Application dang upload CV. |
| `cvDocumentId` | Original CV document id. |
| `originalFileHash` | SHA-256 cua file goc. |
| `filePath` | Duong dan file trong quarantine. |
| `storageZone` | `QUARANTINE`. |
| `storagePath` | Storage key quarantine. |
| `mimeType` | MIME type da validate. |
| `fileSize` | Dung luong file. |

Timeout mac dinh:

```text
CV_SCANNER_TIMEOUT_MS = 15000
```

Neu scanner timeout hoac throw error, ket qua duoc map thanh `CV_SCAN_FAILED`.

### 5.4. Scanner provider hien tai

Provider trong `CvSanitizationModule` duoc chon bang:

```text
CV_SCANNER_PROVIDER
```

Gia tri support:

| Provider | Implementation | Muc dich |
| --- | --- | --- |
| `clamav` | `ClamAvCvMalwareScanner` | Scanner that, noi toi `clamd` qua TCP. |
| `stub` | `StubCvMalwareScanner` | Local/dev override khi can fake scanner result. |

`.env` hien tai set:

```text
CV_SCANNER_PROVIDER=clamav
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
CV_SCANNER_TIMEOUT_MS=15000
```

Docker Compose set backend noi toi service:

```text
CV_SCANNER_PROVIDER=clamav
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
```

Service `clamav` dung image:

```text
clamav/clamav:1.5.3-debian
```

Healthcheck cua Compose ping `clamd` va co `start_period` de cho database virus load/update truoc khi backend start.

Neu khong set provider, code fallback ve `stub`, nhung public apply runtime nen dung `clamav`.

Stub scanner:

- Kiem tra file co doc duoc khong.
- Tra ket qua theo env `CV_SCANNER_STUB_RESULT`.
- Chi nen dung khi `CV_SCANNER_PROVIDER=stub`.

Gia tri hop le:

```text
PASSED
REJECTED_MALWARE
FAILED
```

ClamAV scanner dung giao thuc `INSTREAM`: backend stream file tu quarantine sang `clamd`, khong expose CV goc qua public storage.

### 5.5. Xu ly ket qua scan

| Scanner result | Application status | CV scan status | API behavior |
| --- | --- | --- | --- |
| `PASSED` | `CV_SCAN_PASSED` | `PASSED` | Public apply tiep tuc await sanitize trong cung request. |
| `REJECTED_MALWARE` | `CV_REJECTED_MALWARE` | `REJECTED_MALWARE` | Tra `422 MALWARE_DETECTED`. |
| `FAILED` | `CV_SCAN_FAILED` | `FAILED` | Tra `503 CV_SCAN_FAILED`. |

Neu scan khong pass, backend khong schedule sanitize.

### 5.6. Await sanitize trong public apply

Public apply goi `uploadOriginalCv()` voi:

```text
scheduleSanitizeAfterScanPass: false
```

Sau khi scan pass, controller await:

```text
CvDocumentsService.sanitizeOriginalCvAfterScanPass()
```

Do do public apply chi tra success sau khi `CvSanitizationService.sanitizeCvDocument()` tao clean CV thanh cong. Method schedule async van co the duoc giu cho cac flow khac dung default behavior.

### 5.7. Dieu kien bat dau sanitize

`CvSanitizationService.prepareSanitize()` validate:

| Dieu kien | Mo ta |
| --- | --- |
| CV document ton tai | Phai dung `applicationId` va `cvDocumentId`. |
| Document type | Phai la `ORIGINAL`. |
| Scan status | Phai la `PASSED`. |
| Current CV | Chi sanitize current original CV. |
| Application status | Khong duoc nam trong terminal status, hoac dang o status cho phep. |
| Source file | Resolve duoc file tu quarantine storage key. |

Khi bat dau sanitize:

```text
Application status -> CV_SANITIZING
Original CvDocument.sanitizeStatus -> SANITIZING
```

Workflow/audit event:

```text
CV_SANITIZING
```

### 5.8. Sanitizer mode hien tai

Backend chon sanitizer theo env:

```text
CV_PDF_SANITIZER_MODE
```

Mode support:

| Mode | Implementation |
| --- | --- |
| `HTTP_SERVICE` | `GhostscriptHttpPdfSanitizer` |
| `GHOSTSCRIPT_DOCKER` | `GhostscriptDockerPdfSanitizer` |

`.env` hien tai dang set:

```text
CV_PDF_SANITIZER_MODE=HTTP_SERVICE
CV_SANITIZER_SERVICE_URL=http://localhost:8080
CV_GHOSTSCRIPT_TIMEOUT_MS=60000
```

### 5.9. Tao CV sach bang Ghostscript HTTP service

Khi dung `HTTP_SERVICE`, backend POST toi:

```http
POST http://localhost:8080/sanitize
```

Payload gom:

| Field | Mo ta |
| --- | --- |
| `applicationId` | Application id. |
| `cvDocumentId` | Original CV document id. |
| `originalFileHash` | Hash cua CV goc. |
| `sourceFilePath` | File path backend resolve duoc. |
| `sourceStoragePath` | `quarantine/...`. |
| `sourceMimeType` | MIME type cua CV goc. |
| `outputFilePath` | Duong dan file output trong safe storage. |
| `outputStoragePath` | `safe/...`. |

HTTP service validate:

1. `sourceMimeType` phai la `application/pdf`.
2. Source path phai nam trong quarantine root.
3. Output path phai nam trong safe root.
4. Source file phai ton tai.
5. Tao output directory neu can.
6. Chay Ghostscript:

```text
gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite ...
```

Output:

```text
storage/cv-safe/<timestamp>-<uuid>.pdf
```

### 5.10. Gioi han PDF-only cua public apply

Public apply hien tai chi cho phep:

```text
.pdf
```

Ly do: sanitizer hien tai chi support:

```text
application/pdf
```

DOCX/XLSX bi reject ngay tai public upload validation voi `UNSUPPORTED_FILE_TYPE`; khong di toi buoc scan/sanitize.

Internal CV upload flow khac van co the giu rule rieng neu can, nhung public apply khong tra success cho file khong the tao clean CV.

### 5.11. Validate clean artifact

Sau khi sanitizer tra `SANITIZED`, backend validate artifact:

| Validate | Mo ta |
| --- | --- |
| Path | Output phai nam trong `CV_SAFE_DIR`. |
| File ton tai | Phai la file va size > 0. |
| Magic bytes | 5 byte dau phai la `%PDF-`. |
| Hash | Tinh `cleanFileHash`. |
| MIME type | Gan `application/pdf`. |
| Storage path | Luu theo dang `safe/<file-name>.pdf`. |

Neu validate fail, backend xoa best-effort file output va mark sanitize failed.

### 5.12. Tao CvDocument CLEAN

Khi sanitize thanh cong, backend:

1. Mark original CV:

```text
sanitizeStatus = SANITIZED
isCurrent = false
```

2. Tao `CvDocument` moi:

| Field | Gia tri |
| --- | --- |
| `documentType` | `CLEAN` |
| `versionNo` | Giong version cua original CV |
| `originalFileName` | Giong original |
| `mimeType` | `application/pdf` |
| `fileSize` | Size cua clean PDF |
| `originalFileHash` | Hash cua original |
| `cleanFileHash` | SHA-256 cua clean PDF |
| `storageZone` | `SAFE` |
| `storagePath` | `safe/<server-file-name>.pdf` |
| `scanStatus` | `PASSED` |
| `sanitizeStatus` | `SANITIZED` |
| `parseStatus` | `PENDING` |
| `isCurrent` | true neu original dang la current CV |

3. Update application:

```text
currentCvDocumentId = cleanCvDocument.id
status = CV_SANITIZED
```

Workflow/audit event:

```text
CV_SANITIZED
```

### 5.13. Neu sanitize fail

Backend mark:

```text
Original CvDocument.sanitizeStatus = FAILED
Application status = CV_SANITIZE_FAILED
```

Metadata co:

| Field | Mo ta |
| --- | --- |
| `reasonCode` | Ly do fail, vi du `UNSUPPORTED_SANITIZER_INPUT`, `SANITIZER_SERVICE_UNAVAILABLE`, `GHOSTSCRIPT_SANITIZE_FAILED`. |
| `manualReviewRequired` | `true`. |
| `retryAllowed` | `true`. |

API/manual sanitize endpoint se tra:

| Reason | HTTP |
| --- | --- |
| `UNSUPPORTED_SANITIZER_INPUT` | `422` |
| Cac loi sanitizer/service khac | `503` |

Trong flow public apply, sanitize chay sync trong request. Neu sanitize fail, ung vien nhan error response ngay va khong nhan `CV_ACCEPTED`.

## 6. Parse clean CV sau Step 5

Sau khi tao clean CV thanh cong trong public apply, backend parse sync:

```text
-> CvParsingService.parseCleanCvDocument()
```

Dieu kien parse:

- Document type phai la `CLEAN`.
- Storage zone phai la `SAFE`.
- Sanitize status phai la `SANITIZED`.
- Clean CV phai la current CV.

Parse flow:

1. Resolve file tu `safe/...`.
2. Set `parseStatus = PARSING`.
3. Ghi event `CV_PARSE_REQUESTED`.
4. Parse file bang `FileParserService`.
5. Validate raw text khong rong.
6. Validate resume signals.
7. Goi Gemini parser neu cau hinh duoc.
8. Tao `parsed_profiles`.
9. Set `parseStatus = PARSED`.
10. Chuyen application status sang `CV_PARSED`.
11. Ghi duplicate profile check theo `normalizedTextHash`.
12. Chuyen application status sang `PROFILE_DUPLICATE_CHECKED` hoac `PROFILE_DUPLICATE_NEEDS_REVIEW`.

Neu parse fail:

```text
parseStatus = FAILED
Application status = CV_PARSE_FAILED
manualReviewRequired = true
retryAllowed = true
```

## 7. Trang thai chinh

### 7.1. Application status

Flow thanh cong hien tai:

```text
APPLICATION_CREATED
-> APPLICATION_VALIDATING
-> APPLICATION_DUPLICATE_CHECKING
-> CV_UPLOADED
-> CV_STORED_QUARANTINE
-> CV_SCAN_REQUESTED
-> CV_SCAN_PASSED
-> CV_SANITIZING
-> CV_SANITIZED
-> CV_PARSED
-> PROFILE_DUPLICATE_CHECKED
```

Nhanh loi:

```text
CV_SCAN_REQUESTED -> CV_REJECTED_MALWARE
CV_SCAN_REQUESTED -> CV_SCAN_FAILED
CV_SANITIZING -> CV_SANITIZE_FAILED
CV_SANITIZED -> CV_PARSE_FAILED
CV_PARSED -> PROFILE_DUPLICATE_NEEDS_REVIEW
```

### 7.2. CvDocument status

Original CV:

```text
documentType = ORIGINAL
storageZone = QUARANTINE
scanStatus = PENDING -> SCANNING -> PASSED/FAILED/REJECTED_MALWARE
sanitizeStatus = PENDING -> SANITIZING -> SANITIZED/FAILED
parseStatus = PENDING
```

Clean CV:

```text
documentType = CLEAN
storageZone = SAFE
scanStatus = PASSED
sanitizeStatus = SANITIZED
parseStatus = PENDING -> PARSING -> PARSED/FAILED
```

## 8. Error mapping public apply

| Code | HTTP | Khi nao xay ra |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Payload thieu/sai. |
| `UNSUPPORTED_FILE_TYPE` | 400 | Sai extension, MIME/signature, filename khong hop le. |
| `FILE_TOO_LARGE` | 413 | File vuot 20 MB. |
| `CV_NOT_RESUME` | 422 | File parse duoc nhung khong du tin hieu CV. |
| `MALWARE_DETECTED` | 422 | Scanner tra `REJECTED_MALWARE`. |
| `CV_SCAN_FAILED` | 503 | Scanner timeout/fail. |
| `CV_SANITIZE_FAILED` | 422/503 | Tao clean CV fail; 422 cho input khong support, 503 cho sanitizer/service fail. |
| `CV_PARSE_FAILED` | 422/503 | Parse clean CV fail; 422 cho CV khong doc duoc/khong du tin hieu, 503 cho parser service fail. |
| `DUPLICATE_APPLICATION` | 409 | Application da ton tai cho job/candidate khac thong tin re-apply. |
| `DUPLICATE_CV_FILE` | 409 | Cung file hash da upload cho application. |
| `IDEMPOTENCY_CONFLICT` | 409 | Cung idempotency key nhung payload/file khac. |
| `UPLOAD_RATE_LIMIT_EXCEEDED` | 429 | Vuot rate limit public apply. |
| `INVALID_STATE_TRANSITION` | 409 | Application o trang thai khong cho cap nhat CV. |
| `NOT_FOUND` | 404 | Job posting khong ton tai/khong public/da dong. |

## 9. Storage va security boundaries

| Storage | Env | Muc dich | Public access |
| --- | --- | --- | --- |
| Public uploads | `UPLOAD_DIR` | Upload legacy/public asset khac | Co the public qua API rieng. |
| Quarantine CV | `CV_QUARANTINE_DIR` | Luu CV goc vua upload | Khong public. |
| Safe CV | `CV_SAFE_DIR` | Luu CV sach da sanitize | Chi truy cap qua controlled API. |

Guard hien tai:

- Quarantine root khong duoc nam trong `UPLOAD_DIR`.
- Safe root khong duoc nam trong `UPLOAD_DIR`.
- Safe root va quarantine root phai tach biet.
- Storage key khong duoc absolute path, khong co `..`, khong co backslash.
- Clean CV chi duoc stream qua endpoint co auth:

```http
GET /api/applications/:applicationId/cv/:cvDocumentId/clean-file
```

Endpoint nay chi tra file neu:

```text
documentType = CLEAN
storageZone = SAFE
sanitizeStatus = SANITIZED
cleanFileHash exists
```

## 10. Cau hinh hien tai trong `.env`

```text
UPLOAD_DIR=./uploads
CV_QUARANTINE_DIR=../../storage/cv-quarantine
CV_SAFE_DIR=../../storage/cv-safe
CV_SCANNER_PROVIDER=clamav
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
CV_SCANNER_TIMEOUT_MS=15000
CV_SCANNER_STUB_RESULT=PASSED
CV_PDF_SANITIZER_MODE=HTTP_SERVICE
CV_SANITIZER_SERVICE_URL=http://localhost:8080
CV_GHOSTSCRIPT_TIMEOUT_MS=60000
```

Y nghia:

- Scanner runtime mac dinh cua `.env` la ClamAV qua `localhost:3310`.
- `CV_SCANNER_STUB_RESULT` chi co tac dung khi doi `CV_SCANNER_PROVIDER=stub`.
- Sanitizer can service HTTP local port 8080 dang chay.
- Clean CV chi tao thanh cong cho PDF vi sanitizer chi support `application/pdf`.

## 11. Diem can luu y / gap hien tai

| Gap | Tac dong |
| --- | --- |
| ClamAV can warm-up | Docker compose can healthcheck/start period vi database virus can load/update. |
| Public apply chi nhan PDF | DOCX/XLSX can converter truoc sanitize neu muon mo lai sau nay. |
| Public apply sync hon | Request cho scan, sanitize va parse nen co the lau hon truoc. |

## 12. Acceptance criteria cho Step 4-5 hien tai

Flow duoc coi la thanh cong khi:

1. Candidate submit public apply thanh cong.
2. Application duoc tao hoac re-apply hop le.
3. Original CV duoc luu trong quarantine.
4. Original CV co `originalFileHash`.
5. Malware scan pass.
6. Clean CV duoc tao trong safe storage.
7. Clean `CvDocument` co `documentType=CLEAN`, `storageZone=SAFE`, `sanitizeStatus=SANITIZED`, `cleanFileHash`.
8. Application current CV tro sang clean CV.
9. Clean CV duoc parse thanh parsed profile.
10. Duplicate profile check da ghi nhan.
11. Response public apply tra `CV_ACCEPTED` va `CV_JD_MAPPING_PENDING`.
