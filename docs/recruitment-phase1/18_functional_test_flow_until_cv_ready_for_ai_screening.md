# 18. Functional Test Flow Until CV Ready For First AI Screening

## 1. Muc tieu

Tai lieu nay mo ta flow test chuc nang tu luc nha tuyen dung chuan bi job posting den khi ung vien nop CV va CV dat trang thai san sang cho lan AI screening/scoring dau tien.

Trong pham vi Batch C, "san sang cho AI screening lan 1" duoc hieu la:

- Application da duoc tao thanh cong.
- Original CV chi duoc luu o quarantine/internal storage.
- Malware scan da pass.
- Clean CV da duoc tao va luu o safe storage.
- Parser da doc clean CV va tao parsed profile.
- CV/Application dat trang thai co the lam input cho buoc Mapping CV-JD / AI Screening tiep theo.

Batch C khong test UI Mapping CV-JD, Pre-screening Form, AI Screening, HR Review.

## 2. Pham vi test

Flow duoc test:

1. HR/Admin dang nhap.
2. HR/Admin chuan bi JD va job posting public.
3. Ung vien truy cap public job detail.
4. Ung vien nop application kem CV.
5. He thong validate file va tao application.
6. He thong luu original CV, hash, scan malware.
7. Scan pass thi application duoc accepted/processing.
8. He thong sanitize original CV de tao clean CV.
9. He thong parse clean CV de tao parsed profile.
10. HR/Admin xem application detail, CV processing, clean CV, parsed profile, timeline/audit.
11. Ket luan CV da san sang cho AI screening lan 1.

Khong test:

- `/candidates/upload` legacy CV flow.
- `/api/uploads/:filename` clean CV download.
- `/session/:token` apply/form flow.
- Mapping/Form/AI/HR Review UI.
- Legacy session/evaluation business flow.

## 3. Tai khoan test

Mat khau chung:

```text
Test@123456
```

| Role | Email | Muc dich |
| --- | --- | --- |
| ADMIN | `admin.test@example.com` | Quan tri toan bo recruitment UI va kiem tra permission cao nhat |
| HR | `hr.test@example.com` | Tao/quan ly job posting va theo doi application |
| INTERVIEWER | `interviewer.test@example.com` | Kiem tra user khong phu hop khong duoc thao tac HR/Admin neu API co guard |

## 4. Dieu kien truoc khi test

- Backend dang chay dung repo va dung DB da migrate.
- Frontend dang chay va tro den backend API dung qua `.env`.
- DB da co migration Recruitment Phase 1.
- Da seed user test theo tung role.
- Da co it nhat mot JD va mot job posting public/open, hoac tester se tao moi trong flow.
- Co file CV hop le de upload: `.pdf`, `.docx`, hoac `.xlsx`.

Luu y: `.xls` khong nam trong dinh dang hop le cua Phase 1.

## 5. Lenh chay moi truong thu cong

Chay tu root repo:

```powershell
pnpm --filter @interview-assistant/backend dev
pnpm --filter @interview-assistant/frontend dev
```

Checkpoint nen chay sau khi thay doi code:

```powershell
pnpm --filter @interview-assistant/backend typecheck
pnpm --filter @interview-assistant/frontend typecheck
```

Theo guardrail hien tai, Codex khong tu chay build/lint/unit test. Neu can checkpoint thu cong ngoai guardrail, nguoi test tu quyet dinh va gui log loi neu co.

## 6. Flow test chi tiet

### Step 1 - Login internal user

Muc tieu:

- HR/Admin co the dang nhap.
- Internal recruitment route yeu cau token.

Thao tac UI:

1. Mo frontend.
2. Vao `/login`.
3. Dang nhap bang `hr.test@example.com` hoac `admin.test@example.com`.
4. Xac nhan vao duoc dashboard/internal layout.

API smoke test tuy chon:

```powershell
$body = @{ email = "hr.test@example.com"; password = "Test@123456" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "http://localhost:3002/api/auth/login" -Method Post -ContentType "application/json" -Body $body
$token = $login.accessToken
```

Ket qua mong doi:

- Login thanh cong.
- Token duoc tra ve.
- Internal recruitment routes khong public.

### Step 2 - Chuan bi JD

Muc tieu:

- Co JD lam nguon cho job posting.
- JD phai co title/position/level/description/requirements du de ung vien apply.

Thao tac UI:

1. Vao recruitment JD management UI.
2. Tao JD moi hoac chon JD co san.
3. Luu va xac nhan JD o trang thai co the dung cho job posting.

Ket qua mong doi:

- JD xuat hien trong danh sach.
- JD detail hien thi dung noi dung.
- Khong can Mapping/Form/AI UI trong buoc nay.

### Step 3 - Tao hoac mo job posting public

Muc tieu:

- Co public job posting cho ung vien truy cap.

Thao tac UI:

1. Vao job posting management UI.
2. Tao job posting tu JD da chon.
3. Dat trang thai public/open theo API/backend hien co.
4. Ghi lai public slug hoac public URL.

Ket qua mong doi:

- Job posting hien thi trong danh sach internal.
- Public job detail co the truy cap khong can login.
- Job posting khong yeu cau dung `/session/:token`.

### Step 4 - Mo public job detail

Muc tieu:

- Ung vien xem duoc job detail public.

Thao tac UI:

1. Dang xuat hoac mo incognito.
2. Truy cap `/jobs/<slug>`.
3. Kiem tra title, company/location/type, requirements va CTA apply.

Ket qua mong doi:

- Trang public load khong can login.
- Khong hien thong tin noi bo nhu audit log, scanner log, storage path.

### Step 5 - Ung vien nop application va upload CV

Muc tieu:

- Public apply form tao application va upload CV hop le.

Thao tac UI:

1. Tu public job detail, bam Apply.
2. Dien thong tin ung vien.
3. Upload file `.pdf`, `.docx`, hoac `.xlsx`.
4. Submit form.

API multipart smoke test tuy chon:

```powershell
curl.exe -X POST "http://localhost:3002/api/public/job-postings/<jobPostingId>/apply" `
  -H "Idempotency-Key: apply_test_001" `
  -F "fullName=Candidate Test" `
  -F "email=candidate.test+001@example.com" `
  -F "phone=0900000001" `
  -F "cvFile=@C:\path\to\sample.pdf"
```

Ket qua mong doi:

- File hop le duoc chap nhan.
- Response public chi hien thong diep an toan.
- Neu backend tra application reference thi khong de lo internal storage path/scanner log.
- Frontend result page khong can login.

### Step 6 - Verify malware scan gate

Muc tieu:

- Original CV phai qua malware scan truoc khi sanitize/parse.

Thao tac:

1. Kiem tra result sau submit.
2. Mo application detail bang HR/Admin.
3. Kiem tra CV status panel.

Ket qua mong doi:

- Neu file clean: application vao accepted/processing.
- Neu malware: public response la loi an toan, vi du `MALWARE_DETECTED`; khong sanitize, khong parse, khong tao clean CV.
- Khong co UI download original/quarantine CV.

### Step 7 - Mo application list/detail internal

Muc tieu:

- HR/Admin thay application moi trong application-centric UI.

Thao tac UI:

1. Dang nhap HR/Admin.
2. Vao `/recruitment/applications`.
3. Tim application vua submit.
4. Mo application detail.

API smoke test tuy chon:

```powershell
Invoke-RestMethod -Uri "http://localhost:3002/api/applications?page=1&limit=20" -Headers @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:3002/api/applications/<applicationId>" -Headers @{ Authorization = "Bearer $token" }
```

Ket qua mong doi:

- Danh sach application hien thi theo application-centric flow.
- Detail co tabs/sections cho overview, CV processing, parsed profile, timeline/audit neu endpoint san sang.
- INTERVIEWER khong nen co quyen HR/Admin neu backend guard ap dung.

### Step 8 - Sanitize CV va tao clean CV

Muc tieu:

- He thong tao clean CV tu original CV sau scan pass.
- Clean CV la file duy nhat duoc dung cho parser/mapping/AI.

Thao tac:

1. Neu worker async dang chay, cho den khi sanitize hoan tat.
2. Neu backend yeu cau trigger thu cong trong test, goi sanitize endpoint bang HR/Admin.

API trigger tuy chon:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3002/api/applications/<applicationId>/cv/<cvDocumentId>/sanitize" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $token"; "Idempotency-Key" = "sanitize_<cvDocumentId>" } `
  -ContentType "application/json" `
  -Body '{"force":false}'
```

Ket qua mong doi:

- CV status chuyen sang sanitized/clean available theo model hien co.
- Clean CV preview/download dung endpoint clean-file.
- Khong dung `/api/uploads/:filename`.
- Khong co link raw/original/quarantine file tren UI.

### Step 9 - Parse clean CV

Muc tieu:

- Parser doc clean CV va tao parsed profile.

Thao tac:

1. Neu worker async dang chay, cho den khi parse hoan tat.
2. Neu backend yeu cau trigger thu cong trong test, goi parse endpoint bang HR/Admin.

API trigger tuy chon:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3002/api/applications/<applicationId>/cv/<cvDocumentId>/parse" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $token"; "Idempotency-Key" = "parse_<cvDocumentId>" } `
  -ContentType "application/json" `
  -Body '{"force":false}'
```

Ket qua mong doi:

- Parser chi su dung clean CV.
- Parsed profile duoc tao.
- CV/Application dat trang thai `CV_PARSED` hoac trang thai tuong duong trong backend hien tai.
- Neu parse fail, UI hien error HR/Admin-safe va khong expose parser stack/internal path.

### Step 10 - Verify parsed profile

Muc tieu:

- HR/Admin xem duoc parsed profile sau parse.

Thao tac UI:

1. Trong application detail, mo Parsed Profile/CV Processing section.
2. Kiem tra cac thong tin da parse: name/email/phone, skills, education, experience neu co.

API smoke test tuy chon:

```powershell
Invoke-RestMethod -Uri "http://localhost:3002/api/applications/<applicationId>/parsed-profile" -Headers @{ Authorization = "Bearer $token" }
```

Ket qua mong doi:

- Parsed profile hien thi tu clean CV parse result.
- Neu profile thieu field, UI hien empty state ro rang.
- Khong hien metadata nhay cam khong can thiet.

### Step 11 - Verify CV versions va clean CV action

Muc tieu:

- HR/Admin xem duoc version/history cua CV.
- Clean CV co the preview/download qua endpoint dung.

API smoke test tuy chon:

```powershell
Invoke-RestMethod -Uri "http://localhost:3002/api/applications/<applicationId>/cv" -Headers @{ Authorization = "Bearer $token" }
```

Ket qua mong doi:

- CV version list co document vua upload.
- Clean CV action chi xuat hien khi clean CV san sang.
- Download/preview khong dung original path va khong dung `/api/uploads/:filename`.

### Step 12 - Verify timeline va audit basic

Muc tieu:

- Timeline the hien cac moc chinh cua application/CV processing.
- Audit log khong lo thong tin nhay cam.

API smoke test tuy chon:

```powershell
Invoke-RestMethod -Uri "http://localhost:3002/api/applications/<applicationId>/timeline" -Headers @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:3002/api/applications/<applicationId>/audit-logs" -Headers @{ Authorization = "Bearer $token" }
```

Ket qua mong doi:

- Timeline co cac event gan voi application submitted, CV uploaded, scan passed, sanitized, parsed.
- Audit log neu co khong hien filename/path/email/phone/raw metadata khong can thiet.
- Public user khong truy cap duoc audit/timeline internal.

## 7. Tieu chi ket thuc flow

CV duoc xem la san sang cho AI screening lan 1 khi tat ca dieu kien sau dung:

| Dieu kien | Ky vong |
| --- | --- |
| Application exists | Co application record lien ket job posting va candidate |
| CV uploaded | Co CV document/version record |
| Original CV quarantine | Original khong public, khong dung cho parser/AI |
| Malware scan | Da pass truoc sanitize/parse |
| Clean CV | Co clean file trong safe storage |
| Parsed profile | Da tao parsed profile tu clean CV |
| Status | `CV_PARSED` hoac status tuong duong |
| UI | Application detail hien CV processing + parsed profile |
| Security | Khong expose raw path, scanner log, internal error |

Neu mot trong cac dieu kien tren fail, CV chua san sang cho AI screening lan 1.

## 8. Negative test cases

| Case | Thao tac | Ket qua mong doi |
| --- | --- | --- |
| Unsupported file | Upload `.xls` | Public error an toan, khong tao clean CV |
| Missing CV | Submit apply khong file | Form/API bao loi validation |
| Malware detected | Upload file test bi scanner danh dau | `MALWARE_DETECTED`, khong sanitize/parse |
| Duplicate submit | Retry cung Idempotency-Key | Khong tao duplicate application/CV ngoai y muon |
| Sanitize fail | Gia lap sanitizer loi | HR/Admin thay error an toan, khong parse |
| Parse fail | Gia lap parser loi/empty text | HR/Admin thay error an toan, khong ready for AI |
| Public internal access | Public goi application detail/audit | 401/403 |
| Wrong clean CV endpoint | Dung `/api/uploads/:filename` | Khong duoc xem la pass |
| Legacy apply route | Dung `/session/:token` de apply | Khong thuoc Batch C flow |

## 9. Security assertions

- Public apply khong can login.
- Internal recruitment routes can login.
- Public response khong tra storage path, scanner log, stack trace, command, parser detail.
- Original/quarantine CV khong co UI download.
- Parser, mapping va AI screening chi duoc phep dung clean CV.
- Clean CV download phai qua endpoint clean-file co authorization phu hop.
- Audit log UI phai redact metadata nhay cam.
- Idempotency-Key phai duoc gui cho submit/upload/sanitize/parse neu operation co nguy co retry.

## 10. Checklist UI

- `/login` khong bi vo.
- `/dashboard` khong bi vo.
- `/candidates` legacy route khong bi vo.
- `/sessions` legacy route khong bi vo.
- `/settings` khong bi vo.
- `/session/:token` legacy route khong bi vo nhung khong dung cho apply Batch C.
- `/jobs/:slug` public job detail khong can login.
- `/jobs/:slug/apply` public apply khong can login.
- `/recruitment/applications` can login.
- Application detail la trung tam cua flow CV processing.
- CV status badge/message ro rang.
- Clean CV preview/download chi hien khi san sang.
- Parsed profile co loading/empty/error state.

## 11. Checklist API

- API client co the gui custom headers.
- API client co the gui `Idempotency-Key`.
- Multipart upload hoat dong cho public apply/CV upload.
- Blob download hoat dong cho clean CV.
- Error code duoc normalize thanh public-safe hoac HR/Admin-safe message.
- Khong expose internal error ra UI.

## 12. Rủi ro va diem can chu y

- Neu backend worker async chua chay, sanitize/parse co the can trigger endpoint thu cong trong test.
- Neu endpoint parsed-profile/audit-log chua co trong backend runtime dang chay, FE se chi hien empty/error state; can xac nhan backend version.
- Neu dang chay backend tu repo khac voi repo dang edit, DB va source co the khong khop. Can xac nhan process backend dang dung dung repo mong muon.
- AI Screening that su khong nam trong Batch C UI; flow nay chi ket thuc tai diem du lieu da san sang lam input.

## 13. Ket luan pass/fail

Flow pass khi:

```text
Public apply accepted
-> malware scan passed
-> clean CV created
-> parsed profile created
-> application/CV status ready/CV_PARSED
-> HR/Admin can review CV processing and parsed profile
-> no raw/original/quarantine/internal data exposed
```

Flow fail neu:

```text
CV chua co clean file
or parsed profile chua tao
or parser dung original CV
or public/internal security boundary bi pha
or UI dung legacy upload/session route cho Batch C flow
```

