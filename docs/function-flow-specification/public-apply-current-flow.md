# Public apply current flow specification

Ngay cap nhat: 2026-07-20

Pham vi cua tai lieu nay la flow hien tai cua API:

`POST /api/public/job-postings/:jobPostingId/apply`

Tai lieu tap trung vao duong di nop don ung tuyen public, luu CV, scan CV, sanitize CV bang disposable worker pool, parse CV va tao form session.

## 1. Dieu kien cau hinh

Flow sanitizer worker pool duoc kich hoat khi backend su dung:

```env
CV_PDF_SANITIZER_MODE=DISPOSABLE_POOL
CV_SANITIZER_POOL_ENABLED=true
CV_SANITIZER_POOL_MIN_READY=2
CV_SANITIZER_POOL_MAX_WORKERS=2
CV_SANITIZER_WORKER_IMAGE=auto-cv-processing-cv-sanitizer-worker:latest
```

Process backend API va process pool manager co vai tro khac nhau:

- Backend API nhan request apply, tao CV sanitization job va cho job ket thuc.
- Pool manager doc queue trong DB, tao worker container, gan job cho worker va terminate worker sau moi job.
- Process nao chay pool manager can co `CV_SANITIZER_POOL_MANAGER=true`.
- Process backend API thong thuong co the de `CV_SANITIZER_POOL_MANAGER=false` neu da co process pool manager rieng.

Rang buoc cau hinh:

- `CV_SANITIZER_POOL_MIN_READY <= CV_SANITIZER_POOL_MAX_WORKERS`.
- Neu `MIN_READY=2` va `MAX_WORKERS=2`, he thong se duy tri toi da 2 worker container dang duoc tinh capacity.
- Cac status `STARTING`, `READY`, `RESERVED`, `PROCESSING` deu duoc tinh vao capacity.

## 2. Thanh phan tham gia

| Thanh phan | Vai tro |
| --- | --- |
| Frontend public apply form | Gui multipart form data den API public apply. |
| `PublicJobPostingsController` | Entry point cua request apply. Validate input, goi cac service theo thu tu dong bo. |
| `ApplicationsService` | Rate limit theo public apply, tao hoac reuse application/candidate, xu ly duplicate/idempotency. |
| `CvDocumentsService` | Luu original CV vao quarantine, mark scan skipped-as-passed, trigger sanitize. |
| `CvSanitizationService` | Chuyen application sang sanitize queue, goi sanitizer adapter, tao clean CV trong safe storage. |
| `DisposableGhostscriptSanitizer` | Tao/reuse `cv_sanitization_jobs`, doi job terminal va tra ket qua cho API request. |
| `SanitizerPoolManagerService` | Duy tri worker pool, reserve job + worker, chay Ghostscript trong disposable container. |
| `cv-sanitizer-worker` image | Container mot-lan-dung. Doc `job.json`, chay Ghostscript, ghi `result.json`, exit. |
| `CvParsingService` | Parse clean CV tu safe storage, goi Gemini parser neu co, tao parsed profile. |
| `FormSessionsService` | Tao questionnaire form session va email cho candidate o background. |
| PostgreSQL | Luu application, CV document, parsed profile, workflow events, audit logs, sanitizer jobs/workers. |

## 3. Request dau vao

Endpoint:

```http
POST /api/public/job-postings/:jobPostingId/apply
Content-Type: multipart/form-data
```

Fields bat buoc:

- `fullName`
- `email`
- `phone`
- `cvFile`

Fields tuy chon:

- `note`
- Header `Idempotency-Key`

File upload:

- Field file la `cvFile`.
- Chi chap nhan file `.pdf` cho public apply.
- Gioi han kich thuoc public apply la 20 MB.
- File duoc ghi tam vao quarantine storage bang server-generated filename.

## 4. Flow tong quan

1. API nhan request apply va validate file upload.
2. API normalize `Idempotency-Key`, `fullName`, `email`, `phone`.
3. API check public apply rate limit theo job, email, phone, IP, user agent.
4. API parse nhanh file vua upload de xac nhan day co ve la CV/resume.
5. API record public apply received.
6. API tao hoac reuse application/candidate.
7. API upload original CV vao quarantine va tao `CvDocument` loai `ORIGINAL`.
8. Malware scan hien tai bi disable, nen he thong mark scan la `PASSED` voi metadata `scannerResult=SKIPPED`.
9. API sanitize original CV bang disposable sanitizer pool va doi ket qua dong bo.
10. API parse clean CV va tao `ParsedProfile`.
11. API trigger tao form session o background.
12. API tra response thanh cong khi sanitize va parse da hoan tat.

## 5. Chi tiet flow backend API

### 5.1. Upload va validate public CV

`PublicJobPostingsController.apply()` dung `FileInterceptor('cvFile')`.

Interceptor:

- Ghi file vao quarantine root.
- Sinh filename bang helper server-side.
- Reject file khong phai `.pdf`.
- Reject file vuot 20 MB.

Sau khi co file:

- Neu khong co file, API tra `BadRequestException`.
- `Idempotency-Key` duoc trim va cat toi da 255 ky tu.
- `fullName`, `email`, `phone` duoc trim va bat buoc khong rong.

API sau do goi:

```text
ApplicationsService.assertPublicApplyRateLimit()
PublicJobPostingsController.assertUploadedFileLooksLikeResume()
ApplicationsService.recordPublicApplyReceived()
ApplicationsService.createFromApply()
```

`assertUploadedFileLooksLikeResume()` parse file qua `FileParserService`, lay raw text va validate resume signals. Neu khong du dau hieu CV, API tra `CV_NOT_RESUME`.

### 5.2. Tao hoac reuse application

`ApplicationsService.createFromApply()` tao hoac reuse application tu thong tin candidate va job posting.

Neu phat hien duplicate public reapply khong phai idempotent replay, controller kiem tra application cu co cung candidate identity khong:

- Ten sau normalize phai trung.
- Email sau normalize phai trung.
- Phone sau normalize phai trung.

Neu khong trung, API tra `DUPLICATE_APPLICATION`.

### 5.3. Luu original CV

Controller goi:

```ts
cvDocumentsService.uploadOriginalCv({
  applicationId,
  file,
  replaceCurrent: true,
  reason: dto.note,
  actorId: null,
  idempotencyKey,
  scheduleSanitizeAfterScanPass: false,
})
```

Trong flow public apply, `scheduleSanitizeAfterScanPass=false`, nen sanitize khong chay background o buoc upload. Controller se goi sanitize dong bo ngay sau upload.

`CvDocumentsService.createOriginalCv()` thuc hien:

- Validate file ton tai, dung extension, dung size.
- Kiem tra server-generated filename.
- Kiem tra file signature.
- Tinh SHA-256 cua original file.
- Lock application bang pessimistic write.
- Kiem tra idempotency key va duplicate file hash.
- Kiem tra application khong o terminal status.
- Neu `replaceCurrent=true`, mark cac CV current cu thanh `isCurrent=false`.
- Tao `CvDocument` loai `ORIGINAL`, storage zone `QUARANTINE`, scan `PENDING`, sanitize `PENDING`, parse `PENDING`.
- Ghi workflow/audit cho upload, quarantine storage va hash.

### 5.4. Scan CV hien tai

Sau khi tao original CV, `CvDocumentsService.uploadOriginalCv()` goi `markCvScanSkippedAsPassed()` neu co `scanFilePath`.

Day la flow hien tai, chua co malware scanner that:

- `scanStatus` cua original CV duoc set thanh `PASSED`.
- Application chuyen sang `CV_SCAN_PASSED`.
- Audit action la `CV_SCAN_PASSED`.
- Metadata co:
  - `scanner: disabled`
  - `scannerResult: SKIPPED`
  - `reasonCode: MALWARE_SCAN_DISABLED`
  - `threatDetected: false`
  - `scannerSkipped: true`

Sau do service goi `assertCvScanAccepted()`. Neu scan khong pass, flow dung lai.

## 6. Flow sanitize bang disposable worker pool

Controller goi:

```ts
cvDocumentsService.sanitizeOriginalCvAfterScanPass({
  applicationId,
  originalCvDocumentId,
  actorId: null,
  idempotencyKey,
  scheduleParseAfterSanitizeSuccess: false,
})
```

Trong public apply, `scheduleParseAfterSanitizeSuccess=false`, nen parse khong chay background trong `CvSanitizationService`. Controller se parse dong bo sau khi sanitize thanh cong.

### 6.1. Prepare sanitize

`CvSanitizationService.prepareSanitize()`:

1. Lock original CV.
2. Tim clean CV da ton tai cho cung application/version/hash. Neu co, return idempotent retry va khong tao job moi.
3. Yeu cau original CV co `scanStatus=PASSED`.
4. Lock application.
5. Kiem tra original CV la current CV hoac la retry hop le sau sanitize failure.
6. Kiem tra application status cho phep sanitize.
7. Resolve source file path trong quarantine storage.
8. Vi mode la `DISPOSABLE_POOL`, application chuyen sang `CV_SANITIZE_QUEUED`.
9. Original CV co `sanitizeStatus=SANITIZING`.
10. Ghi workflow event va audit action `CV_SANITIZATION_JOB_CREATED`.

### 6.2. API tao job va doi ket qua

`DisposableGhostscriptSanitizer.sanitize()`:

1. Chi chap nhan input MIME `application/pdf`.
2. Doc pool config tu env.
3. Neu `CV_SANITIZER_POOL_ENABLED=false`, return failed voi reason `SANITIZER_POOL_NOT_ENABLED`.
4. Tao hoac reuse row trong `cv_sanitization_jobs`.
5. Job moi co status `QUEUED`, `attempt=0`, `maxAttempts=CV_SANITIZER_MAX_ATTEMPTS`.
6. API request cho den khi job vao terminal status hoac qua `CV_SANITIZER_JOB_WAIT_TIMEOUT_MS`.
7. Neu job `SUCCEEDED`, API tiep tuc validate output va tao clean CV.
8. Neu job `FAILED`, `TIMEOUT`, `CANCELLED`, API mark sanitize failed/timeout va tra loi public-safe error.

Trang thai job:

```text
QUEUED -> ASSIGNED -> PROCESSING -> SUCCEEDED
QUEUED -> ASSIGNED -> PROCESSING -> RETRY_PENDING -> ASSIGNED -> PROCESSING -> SUCCEEDED
QUEUED/ASSIGNED/PROCESSING/RETRY_PENDING -> FAILED
QUEUED/ASSIGNED/PROCESSING/RETRY_PENDING -> TIMEOUT
```

Loi retryable hien tai:

- `WORKER_START_FAILED`
- `WORKER_CRASHED`
- `GHOSTSCRIPT_TRANSIENT_FAILURE`
- `CONTAINER_RUNTIME_ERROR`
- `SANITIZER_TIMEOUT`

### 6.3. Pool manager startup

Pool manager chi hoat dong khi process co:

```env
CV_SANITIZER_POOL_ENABLED=true
CV_SANITIZER_POOL_MANAGER=true
```

Khi khoi dong, `SanitizerPoolManagerService`:

1. Xoa orphan worker containers co label `vcs.component=cv-sanitizer-worker`.
2. Invalidate cac worker row cu dang `STARTING`, `READY`, `RESERVED`, `PROCESSING`, `TERMINATING` thanh `FAILED`.
3. Recover active worker jobs va expired leases.
4. Chay reconcile dinh ky theo `CV_SANITIZER_RECONCILE_INTERVAL_MS`.

### 6.4. Duy tri pool voi `CV_SANITIZER_POOL_MIN_READY=2`

Trong moi lan reconcile:

1. Recover job leases qua han.
2. Recover worker leases qua han.
3. Goi `maintainReadyCapacity()`.
4. Goi `assignQueuedJobs()`.

`maintainReadyCapacity()` dem:

- `readyOrStarting`: worker co status `STARTING` hoac `READY`.
- `capacity`: worker co status duoc tinh capacity, gom `STARTING`, `READY`, `RESERVED`, `PROCESSING`.

Sau do tao worker moi khi:

```text
readyOrStarting < CV_SANITIZER_POOL_MIN_READY
and capacity < CV_SANITIZER_POOL_MAX_WORKERS
```

Voi `MIN_READY=2` va `MAX_WORKERS=2`:

- Luc idle, pool manager tao 2 worker container va dua ve `READY`.
- Khi 1 job duoc gan, worker 1 di tu `READY -> RESERVED -> PROCESSING`.
- Worker 2 van o `READY`.
- Luc nay `readyOrStarting=1`, nhung `capacity=2`, nen pool manager khong the tao worker thu 3.
- Sau khi worker 1 xu ly xong, worker 1 bi terminate va status thanh `TERMINATED` hoac `FAILED`.
- Reconcile tiep theo thay `capacity=1`, nen tao worker moi de dua pool ve 2 worker `READY`.

Ket luan quan trong:

- `MIN_READY=2, MAX_WORKERS=2` nghia la idle co 2 worker ready va toi da 2 worker dang ton tai trong capacity.
- Trong luc 1 worker dang processing, he thong khong dam bao van con du 2 worker ready; luc do chi con 1 worker ready.
- Neu muon trong luc 1 job processing van con 2 worker ready, can `MAX_WORKERS >= 3`.

### 6.5. Gan job cho worker

`assignQueuedJobs()` lap toi da `CV_SANITIZER_POOL_MAX_WORKERS` lan moi reconcile.

Moi lan reserve:

1. Mo DB transaction.
2. Lay job dau tien co status `QUEUED` hoac `RETRY_PENDING`, order theo `queuedAt`, dung `FOR UPDATE SKIP LOCKED`.
3. Lay worker dau tien co status `READY`, order theo `readyAt`, dung `FOR UPDATE SKIP LOCKED`.
4. Set worker thanh `RESERVED`, gan `currentJobId`, set `leaseExpiresAt`.
5. Set job thanh `ASSIGNED`, gan `workerId`, tang `attempt`, set `assignedAt`, set `leaseExpiresAt`.
6. Commit transaction.
7. Xu ly assignment async trong pool manager.

Neu khong co worker `READY`, job van nam o queue cho lan reconcile sau.

### 6.6. Xu ly job trong disposable worker

Sau khi reserve thanh cong:

1. Pool manager set worker `PROCESSING`.
2. Pool manager set job `PROCESSING`.
3. Runtime prepare workspace rieng cho worker:
   - `control`
   - `input`
   - `output`
4. Runtime copy source PDF tu quarantine vao worker input voi ten `input.pdf`.
5. Runtime ghi `job.json` vao control dir.
6. Worker container doc `job.json`, chay Ghostscript va ghi `result.json`.
7. Worker exit sau mot job.
8. Runtime `docker wait` container va doc `result.json`.

Container worker duoc tao bang Docker CLI voi cac guard rail:

- `--network none`
- `--user 65534:65534`
- `--read-only`
- `--cap-drop ALL`
- `--security-opt no-new-privileges`
- `--pids-limit 128`
- `--memory 512m`
- `--cpus 1`
- tmpfs `/tmp`
- input mount read-only
- output/control mount co quyen ghi can thiet

Neu worker tra `SANITIZED`:

1. Pool manager validate output tam trong worker output dir.
2. Copy output vao safe storage path cua job.
3. Validate lai output trong safe storage.
4. Mark job `SUCCEEDED` va luu `outputHash`.
5. Mark worker `TERMINATED`.
6. Terminate container va cleanup workspace.

Neu worker fail hoac timeout:

1. Pool manager goi `failOrRetry()`.
2. Neu loi retryable va `attempt < maxAttempts`, job thanh `RETRY_PENDING`.
3. Neu het retry hoac loi non-retryable, job thanh `FAILED`.
4. Worker thanh `FAILED`.
5. Container va workspace bi terminate/cleanup.

## 7. Tao clean CV sau khi job thanh cong

Khi `DisposableGhostscriptSanitizer` tra ket qua `SANITIZED`, `CvSanitizationService`:

1. Validate clean PDF output bang `CleanPdfOutputValidator`.
2. Lock original CV va application.
3. Tao `CvDocument` loai `CLEAN`.
4. Set clean CV:
   - `storageZone=SAFE`
   - `scanStatus=PASSED`
   - `sanitizeStatus=SANITIZED`
   - `parseStatus=PENDING`
   - `cleanFileHash=<sha256 cua safe output>`
5. Mark original CV:
   - `sanitizeStatus=SANITIZED`
   - `isCurrent=false`
6. Set application `currentCvDocumentId` sang clean CV neu day la current flow hop le.
7. Update `cv_sanitization_jobs.cleanCvDocumentId`.
8. Ghi workflow event `CV_SANITIZED`.
9. Ghi audit action `CV_SANITIZATION_SUCCEEDED`.

Neu sanitize fail:

- Original CV `sanitizeStatus=FAILED`.
- Neu application dang point vao original CV, `currentCvDocumentId` bi clear.
- Application chuyen sang `CV_SANITIZE_FAILED` hoac `CV_SANITIZE_TIMEOUT`.
- API public tra error da normalize.

## 8. Parse clean CV

Sau sanitize thanh cong, controller goi dong bo:

```ts
cvParsingService.parseCleanCvDocument({
  applicationId,
  cvDocumentId: cleanCvDocument.id,
  actorId: null,
  idempotencyKey,
})
```

`CvParsingService.prepareParse()`:

1. Lock clean CV.
2. Neu parsed profile da ton tai va khong force, return idempotent retry.
3. Lock application.
4. Kiem tra application status cho phep parse.
5. Kiem tra clean CV la current CV.
6. Resolve source file path tu safe storage.
7. Set clean CV `parseStatus=PARSING`.
8. Ghi workflow/audit `CV_PARSE_REQUESTED`.

`parseCleanFile()`:

1. Parse file bang `FileParserService`.
2. Lay va normalize raw text.
3. Reject neu parser error hoac text rong.
4. Validate resume signals.
5. Goi `GeminiCvParserService.parseProfile()` de enrich structured profile neu provider kha dung.
6. Tinh `normalizedTextHash`.

Khi parse thanh cong:

- Clean CV `parseStatus=PARSED`.
- Tao `ParsedProfileEntity`.
- Application chuyen sang `CV_PARSED`.
- Ghi audit `CV_PARSED` va `PARSED_PROFILE_CREATED`.
- Ghi duplicate profile check.

Neu parse fail:

- Clean CV `parseStatus=FAILED`.
- Application chuyen sang `CV_PARSE_FAILED`.
- Audit co `manualReviewRequired=true`, `retryAllowed=true`.
- API public tra error da normalize.

## 9. Tao form session

Sau khi parse thanh cong, controller trigger:

```ts
formSessionsService.generateFormSession(applicationId).catch(...)
```

Day la background task, khong duoc await trong response chinh.

`FormSessionsService.generateFormSession()`:

1. Load application, candidate, job posting, job description va question set.
2. Resolve `createdById`; neu khong truyen thi lay user dau tien trong DB.
3. Chon questionnaire items theo thu tu:
   - Snapshot question set cua job posting.
   - Configured question IDs cua job posting.
   - Portal questionnaire items theo job description.
   - Fallback question bank theo category/job title.
4. Tao question set/session can thiet.
5. Gui email/form session theo logic service hien tai.

Neu background task fail, loi duoc log nhung response apply da khong bi rollback.

## 10. Response thanh cong

API chi tra success khi original upload, scan skipped-as-passed, sanitize va parse deu da hoan tat.

Response data:

```json
{
  "applicationId": "<uuid>",
  "candidateId": "<uuid>",
  "jobPostingId": "<uuid>",
  "status": "CV_ACCEPTED",
  "processingStatus": "ACCEPTED",
  "originalCvDocumentId": "<uuid>",
  "cleanCvDocumentId": "<uuid>",
  "currentCvDocumentId": "<cleanCvDocumentId>",
  "parsedProfileId": "<uuid>",
  "nextStep": "CV_JD_MAPPING_PENDING",
  "message": "CV accepted. PDF sanitization and parsing completed successfully."
}
```

Meta:

- `requestId`
- `idempotencyKey`
- `timestamp`

## 11. Public error mapping

`PublicApplyExceptionFilter` normalize loi thanh public-safe response.

Mot so mapping quan trong:

| Dieu kien | Public code | HTTP status |
| --- | --- | --- |
| File vuot 20 MB | `FILE_TOO_LARGE` | 413 |
| Malware detected | `MALWARE_DETECTED` | 422 |
| Sanitize timeout | `CV_SANITIZE_TIMEOUT` | 503 |
| Sanitize failed | `CV_SANITIZE_FAILED` | 422 hoac 503 tuy nguon loi |
| File khong phai CV | `CV_NOT_RESUME` | 422 |
| Duplicate application | `DUPLICATE_APPLICATION` | 409 |
| Idempotency conflict | `IDEMPOTENCY_CONFLICT` | 409 |

## 12. Data/status summary

Application status tren happy path:

```text
APPLICATION_CREATED/received
-> CV_STORED_QUARANTINE
-> CV_SCAN_PASSED
-> CV_SANITIZE_QUEUED
-> CV_SANITIZED
-> CV_PARSED
```

CV document:

```text
ORIGINAL:
  storageZone=QUARANTINE
  scanStatus=PENDING -> PASSED
  sanitizeStatus=PENDING -> SANITIZING -> SANITIZED
  isCurrent=true -> false

CLEAN:
  storageZone=SAFE
  scanStatus=PASSED
  sanitizeStatus=SANITIZED
  parseStatus=PENDING -> PARSING -> PARSED
  isCurrent=true
```

Sanitizer job:

```text
QUEUED -> ASSIGNED -> PROCESSING -> SUCCEEDED
```

Worker happy path:

```text
STARTING -> READY -> RESERVED -> PROCESSING -> TERMINATED
```

## 13. Ghi chu van hanh

- Worker image can duoc build truoc khi pool manager tao container.
- Backend API can ket noi duoc PostgreSQL va thay cac bang `cv_sanitization_jobs`, `cv_sanitizer_workers`.
- Pool manager can truy cap Docker CLI tren host/noi chay process.
- Neu pool manager khong chay, API van tao job nhung se doi den `CV_SANITIZER_JOB_WAIT_TIMEOUT_MS` roi tra `CV_SANITIZE_TIMEOUT`.
- Neu `MIN_READY=2, MAX_WORKERS=2` va co 2 apply request dong thoi, ca 2 worker co the vao `PROCESSING`; request tiep theo se cho queue cho den khi co worker moi duoc tao lai.
- Disposable worker la one-job worker: moi container chi xu ly mot CV, sau do bi terminate va cleanup.
- Flow hien tai khong con su dung HTTP sanitizer service cho public apply khi `CV_PDF_SANITIZER_MODE=DISPOSABLE_POOL`.
