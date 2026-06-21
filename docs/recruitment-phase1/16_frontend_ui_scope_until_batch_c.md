# 16. Frontend UI Scope Until Batch C

## 1. Mục tiêu tài liệu

Tài liệu này chốt danh sách UI cần có tính đến sau Batch C của Recruitment Phase 1.

Tài liệu này là UI scope specification, không phải implementation, không mô tả task code chi tiết và không xác nhận rằng UI đã được triển khai.

Tài liệu này là đầu vào cho frontend implementation task breakdown sau này.

Nguyên tắc trung tâm:

- UI recruitment mới phải bám `Application` làm trung tâm workflow.
- `Candidate` chỉ là hồ sơ người ứng tuyển được liên kết với `Application`.
- Existing Candidate/Interview Session UI chỉ được reuse pattern giao diện, không reuse business flow nếu flow đó trái với Recruitment Phase 1.
- Batch C dừng ở trạng thái có clean CV, parsed profile và sẵn sàng cho Mapping CV-JD.

## 2. Căn cứ đầu vào

| Nguồn | Vai trò |
| ----- | ------- |
| `01_phase1_context_summary.md` | Context tổng quan của Recruitment Phase 1 và mục tiêu tách recruitment core khỏi interview flow cũ. |
| `02_target_architecture_phase1.md` | Kiến trúc target, module boundary và nguyên tắc application-centric. |
| `03_module_extension_plan.md` | Kế hoạch module: `applications`, `job-descriptions`, `job-postings`, `cv-documents`, `workflow-state`, `audit-logs`. |
| `04_domain_model_and_relationships.md` | Domain model và quan hệ giữa JD, JobPosting, Candidate, Application, CV, ParsedProfile. |
| `05_workflow_state_machine.md` | State machine cho `Application.status` và các transition cần hiển thị. |
| `06_database_migration_plan.md` | Bảng, field, enum, status và index phục vụ UI list/detail. |
| `07_api_contract_specification.md` | API contract cho public job detail/apply, application list/detail/timeline, CV upload, clean file, parsed profile. |
| `08_cv_processing_specification.md` | Quy trình CV: validate, quarantine, hash, scan, sanitize, parse, versioning và clean CV access. |
| `14_security_and_audit_log_specification.md` | Role matrix, public endpoint security, clean CV rule, audit rule và PII handling. |
| `15_implementation_task_breakdown.md` | Batch scope: Batch B cho JD/Application core, Batch C cho CV processing MVP. |
| `docs/frontend-document/frontend_ui_readiness_assessment_until_batch_c.md` | Assessment trước đó về mức sẵn sàng của specification và frontend source. |
| `apps/frontend/src/app/routes.tsx` | Route hiện tại của React app; chưa có recruitment routes. |
| `apps/frontend/src/app/layouts/InterviewerLayout.tsx` | Internal layout/sidebar/auth shell có thể mở rộng cho HR workspace. |
| `apps/frontend/src/lib/api-client.ts` | API wrapper hiện tại có JSON/upload/download helper, chưa có `Idempotency-Key`. |
| `apps/frontend/src/lib/auth-context.tsx` | Auth context hiện tại lưu `User` sau `/auth/me`. |
| `apps/frontend/src/components/ui` | UI primitives có thể reuse: Button, Input, Select, Table, Dialog, Tabs, Toast, Badge, Card, Pagination. |
| `apps/frontend/src/pages/interviewer/candidates` | Candidate list/detail/upload/preview pattern có thể tham khảo nhưng không reuse business flow cũ. |
| `apps/frontend/src/pages/interviewer/settings/ManagementPage.tsx` | CRUD table/dialog pattern phù hợp cho JD/JobPosting management. |
| `packages/shared/src/types` | Shared types hiện có cho user/candidate/session; chưa có Phase 1 recruitment types đầy đủ. |

## 3. Scope và non-scope

### Scope đến Batch C

UI trong scope gồm:

- Public job detail.
- Apply form.
- Upload CV trong apply flow.
- Upload result / processing / error page.
- HR JD management.
- HR Job Posting management.
- HR Application list.
- HR Application detail.
- CV processing panel.
- Clean CV preview/download.
- Parsed profile view.
- CV version history.
- Workflow timeline / audit basic.

Workflow UI cần phản ánh:

```text
JD / Job Posting / Application Core
-> Candidate apply/upload CV
-> Validate file
-> Lưu original CV vào quarantine
-> Tính hash
-> Malware scan đồng bộ trong request
-> Nếu malware: trả lỗi trực tiếp qua API
-> Nếu scan pass: trả accepted/processing
-> Sanitize async
-> Tạo clean CV
-> Parse clean CV
-> Lưu ParsedProfile
-> Ready for Mapping CV-JD
```

### Non-scope

Các UI sau không triển khai trong Batch C:

- Mapping CV-JD UI.
- Pre-screening Form UI.
- AI Screening UI.
- HR Review decision UI.
- Channel posting dashboard hoàn chỉnh.
- Bot conversation UI.
- Offer UI.
- Interview/session/evaluation UI mới.
- Onboarding UI.

Existing session/evaluation UI hiện tại được xem là legacy interview flow. Batch C recruitment UI không kéo các màn này vào scope, chỉ có thể reuse pattern table/detail/status nếu cần.

## 4. Actor và quyền truy cập UI

| Actor | UI được truy cập | Ghi chú |
| ----- | ---------------- | ------- |
| Public/Candidate | Public job detail, apply form, upload CV, apply/upload result page. | Không cần account trong Phase 1 mặc định. Chỉ thấy kết quả tiếp nhận hoặc lỗi public-safe. |
| HR | HR workspace: JD, Job Posting, Application list/detail, CV processing status, clean CV preview/download theo permission, parsed profile, CV versions, timeline basic. | Không xem raw/original/quarantine CV trong UI thông thường. |
| Admin | Toàn bộ HR workspace, cộng thêm operation action nếu được policy cho phép như retry sanitize/parse. | Admin vẫn phải đi qua clean CV API có permission/audit; raw access đặc biệt không thuộc UI thông thường. |
| System/Internal worker | Không phải user UI chính. Trạng thái worker có thể được hiển thị gián tiếp qua CV processing status/timeline. | Không tạo dashboard vận hành riêng trong Batch C nếu chưa có spec đủ. |

Quy tắc bắt buộc:

- Candidate/Public chỉ apply/upload và xem kết quả tiếp nhận.
- Candidate/Public không được xem clean CV, raw CV, mapping result, AI result, HR decision hoặc audit log.
- HR/Admin được xem Application, CV processing và clean CV theo permission.
- Raw/original/quarantine CV không hiển thị trên UI thông thường.
- UI không expose storage path, scanner log, parser stack trace, container command hoặc internal file path.

## 5. Route map đề xuất

Assumption: frontend hiện dùng `react-router-dom` với `InterviewerLayout` cho internal authenticated routes. Các route internal recruitment nên đặt dưới `/recruitment/*` để không trộn với legacy `/candidates` và `/sessions`.

| Route đề xuất | Actor | Screen | Ghi chú |
| ------------- | ----- | ------ | ------- |
| `/jobs/:slug` | Public/Candidate | Public Job Detail | Public read cho published job posting. |
| `/jobs/:slug/apply` | Public/Candidate | Apply Form + Upload CV | Có thể gộp apply form và CV upload trong một màn. |
| `/apply/:applicationId/status` | Public/Candidate | Apply Result / Processing Status | CẦN CHỐT có cho candidate tra cứu trạng thái sau apply không. Nếu không có API public status, chỉ dùng result page sau submit. |
| `/recruitment/job-descriptions` | HR/Admin | JD List | Internal authenticated route. |
| `/recruitment/job-descriptions/:id` | HR/Admin | JD Detail / Versions | Có create/edit/mark ready theo quyền. |
| `/recruitment/job-postings` | HR/Admin | Job Posting List | List/filter/publish status. |
| `/recruitment/job-postings/:id` | HR/Admin | Job Posting Detail | Edit/publish/close/public preview link. |
| `/recruitment/applications` | HR/Admin | Application List | Application-centric work queue. |
| `/recruitment/applications/:applicationId` | HR/Admin | Application Detail | Overview, candidate, job, CV, parsed profile, timeline. |
| `/recruitment/applications/:applicationId/cv` | HR/Admin | CV Documents / Version History | Có thể là tab trong detail thay vì route riêng. |

## 6. Screen list tổng thể

| Screen | Actor | Mục đích | Bắt buộc Batch C? | Ghi chú |
| ------ | ----- | -------- | ----------------- | ------- |
| Public Job Detail | Public/Candidate | Xem posting published và bắt đầu apply. | Required | Dựa trên public job posting API. |
| Apply Form + Upload CV | Public/Candidate | Tạo/link Candidate + Application và upload CV. | Required | CV phải đi qua application-centric CV flow. |
| Apply Result / Processing | Public/Candidate | Thông báo accepted/processing hoặc lỗi safe. | Required | Không hiển thị trạng thái nội bộ sâu. |
| JD List | HR/Admin | Quản lý JD nội bộ. | Required | CRUD/list/filter cơ bản. |
| JD Detail / Edit / Version | HR/Admin | Xem/sửa JD, version và mark ready. | Required | Mark ready có thể là action trong detail. |
| Job Posting List | HR/Admin | Quản lý posting, status và public publish. | Required | Cần status publish/closed. |
| Job Posting Detail / Edit | HR/Admin | Xem/sửa posting, publish/close, preview link. | Required | Public preview route liên quan `/jobs/:slug`. |
| Application List | HR/Admin | Work queue theo Application status/source/job. | Required | Không dùng Candidate list làm trung tâm. |
| Application Detail | HR/Admin | Tổng hợp thông tin Application và các section Batch C. | Required | Nên dùng tab/section. |
| CV Processing Panel | HR/Admin | Theo dõi scan/sanitize/parse status và lỗi safe. | Required | Không expose raw file/path. |
| Clean CV Preview/Download | HR/Admin | Xem/download clean CV theo permission. | Required | Chỉ qua clean CV API. |
| Parsed Profile View | HR/Admin | Xem kết quả parse clean CV. | Required | Hiển thị khi parse success. |
| CV Version History | HR/Admin | Xem version CV, hash ngắn, status và current flag. | Required | Upload lại tạo version mới. |
| Workflow Timeline / Audit Basic | HR/Admin | Xem transition chính của Application/CV. | Required | Không hiển thị sensitive metadata. |
| Retry sanitize/parse | Admin/HR tùy policy | Kích hoạt lại sanitize/parse khi fail. | Optional | CẦN CHỐT quyền và UX. |
| CV processing job monitor | Admin/Operation | Theo dõi job/worker toàn hệ thống. | Later | Chưa đủ spec vận hành Batch C. |

## 7. Candidate/Public UI

### 7.1. Public Job Detail

Cần hiển thị:

- Job title.
- JD/posting description.
- Requirements.
- Benefits nếu có.
- Location/working mode nếu có.
- Apply button.
- Posting closed state.

Behavior:

- Chỉ published/open job posting mới cho apply.
- Closed/unpublished posting không cho submit apply.
- Không hiển thị internal JD version id, internal workflow status hoặc HR-only metadata.

Source spec:

- `07_api_contract_specification.md`: public job posting detail.
- `15_implementation_task_breakdown.md`: `P1-B04`.
- `14_security_and_audit_log_specification.md`: public endpoint security.

### 7.2. Apply Form + Upload CV

Field tối thiểu:

- Full name.
- Email.
- Phone.
- CV file.
- Optional note nếu API DTO/spec cho phép.
- Consent/privacy checkbox nếu policy chốt bắt buộc.
- Submit button.

File rule hiển thị:

- Allow `.pdf`, `.docx`, `.xlsx`.
- Không support `.xls` trong Batch C.
- Max size: CẦN CHỐT theo backend config; nếu chưa chốt, UI copy không hardcode số cụ thể hoặc dùng giá trị từ config/API.
- Không hiển thị thông tin kỹ thuật nội bộ.

Behavior:

- Submit phải gửi application/apply payload kèm CV qua public apply API.
- Nếu backend yêu cầu `Idempotency-Key`, frontend phải tạo và gửi key ổn định cho retry.
- UI không tự coi upload success là parse/sanitize xong.
- Upload request chỉ chờ tới malware scan đồng bộ theo spec.

### 7.3. Upload Result / Processing

| Case | UI message |
| ---- | ---------- |
| Validation error | Thông tin ứng tuyển hoặc CV chưa hợp lệ. Vui lòng kiểm tra lại. |
| Unsupported file | Định dạng CV chưa được hỗ trợ. Vui lòng tải lên file PDF, DOCX hoặc XLSX. |
| File too large | File vượt dung lượng cho phép. Vui lòng chọn file nhỏ hơn. |
| Malware detected | CV không được chấp nhận do không đáp ứng chính sách bảo mật. |
| Accepted/processing | Hồ sơ đã được tiếp nhận và đang được xử lý. |

Không hiển thị:

- Scanner log.
- Threat detail/tên malware cụ thể.
- Storage path.
- Stack trace.
- Container/Ghostscript/parser error detail.

Assumption: Candidate/Public chỉ thấy result tức thời sau apply/upload. Trang tra cứu trạng thái dài hạn `/apply/:applicationId/status` cần được chốt thêm trước khi implement.

## 8. HR Workspace UI

### 8.1. JD Management

Screens:

- JD list.
- JD detail.
- Create/edit JD.
- JD version list.
- Mark ready.

List nên có:

- Title/name.
- Position/level nếu có.
- Status/draft/ready.
- Created/updated time.
- Action view/edit.

Detail nên có:

- JD metadata.
- Requirements/responsibilities.
- Version history.
- Current/ready version.
- Action create new version/edit/mark ready.

### 8.2. Job Posting Management

Screens:

- Job posting list.
- Job posting detail.
- Create/edit posting.
- Publish/close posting.
- Public preview link.

List nên có:

- Job title.
- Linked JD/version.
- Status: draft/published/closed.
- Public slug/link.
- Created/updated time.
- Action view/edit/publish/close.

Behavior:

- Publish/close là action có side effect, nên dùng confirmation và safe toast.
- Public preview chỉ mở được khi posting có public route hợp lệ.

### 8.3. Application List

Cột tối thiểu:

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

Filter tối thiểu:

- Status.
- Job posting.
- Source channel.
- Keyword.
- Created date range nếu backend hỗ trợ.

Behavior:

- Đây là work queue chính cho HR/Admin đến Batch C.
- Không thay thế bằng `/candidates` legacy list.

### 8.4. Application Detail

Nên có tab hoặc section:

- Overview.
- Candidate info.
- Job/JD info.
- CV Processing.
- Parsed Profile.
- CV Versions.
- Timeline/Audit basic.

Overview:

- Application id/reference.
- Application status.
- Source.
- Job posting/JD version.
- Created/updated time.
- Current CV status summary.

Candidate info:

- Full name.
- Email.
- Phone.
- Basic profile fields nếu có.

Job/JD info:

- Job title.
- Posting status.
- JD version linked to application.

### 8.5. CV Processing Panel

Hiển thị:

- Current CV version.
- Original file metadata ở mức safe: file name, extension, size nếu được phép.
- Không hiển thị raw file path.
- Scan status.
- Sanitize status.
- Parse status.
- Clean CV availability.
- Parsed profile availability.
- Safe error reason.
- Retry action nếu policy/API đã có; nếu chưa rõ thì đánh dấu optional.

Trạng thái cần phân biệt:

- `CV_REJECTED_MALWARE` là malware detected.
- `CV_SCAN_FAILED` là lỗi kỹ thuật/timeout scan, không phải malware.
- `CV_SANITIZE_FAILED` là lỗi tạo clean CV.
- `CV_PARSE_FAILED` là lỗi parse clean CV hoặc text rỗng.

### 8.6. Clean CV Preview/Download

Rule:

- Chỉ clean CV.
- Chỉ HR/Admin theo permission.
- Không raw/original CV.
- Không dùng legacy `/api/uploads/:filename`.
- Preview/download phải gọi clean CV API có ownership check.
- Backend ghi audit event khi view/download.
- Frontend không cache/share URL dài hạn nếu dùng signed URL.

UI behavior:

- Nếu clean CV chưa sẵn sàng, hiển thị disabled state với lý do safe.
- Nếu forbidden, hiển thị message quyền truy cập, không lộ file id/path.
- Nếu download fail, toast/error không chứa internal detail.

### 8.7. Parsed Profile View

Hiển thị nếu parse thành công:

- Name.
- Email.
- Phone.
- Skills.
- Experience.
- Education.
- Normalized text preview giới hạn.
- Parse warnings/confidence nếu API có.

Rule:

- Parsed profile phải đến từ clean CV, gắn với `applicationId` và `cvDocumentId`.
- Không dùng trực tiếp `candidates.parsedProfile` legacy làm source of truth cho Recruitment Phase 1 nếu chưa có migration/mapping rõ.

### 8.8. CV Version History

Hiển thị:

- Version no.
- Upload time.
- File name metadata.
- Original hash short.
- Clean hash short nếu có.
- Scan status.
- Sanitize status.
- Parse status.
- Current flag.
- Action xem clean CV nếu có quyền và đã sanitized.

Rule:

- Upload lại tạo version mới.
- Retry cùng request/hash không tạo version trùng.
- Chỉ một current version cho application theo policy backend.

### 8.9. Workflow Timeline / Audit Basic

Hiển thị event cơ bản:

- Application created.
- CV uploaded.
- Stored quarantine.
- Scan requested.
- Scan passed.
- Malware rejected.
- Sanitizing.
- Sanitized.
- Parse success/fail.
- Clean CV viewed/downloaded nếu audit policy cho phép hiển thị.

Không hiển thị:

- Raw CV content.
- Full storage path.
- Token/secret.
- Scanner raw log.
- Parser stack trace.
- Sensitive metadata không cần thiết.

## 9. Admin/Operation UI tối thiểu

Các UI operation sau chỉ đưa vào optional nếu spec/source đủ:

| UI | Scope Batch C | Ghi chú |
| -- | ------------- | ------- |
| Retry sanitize | Optional | Có API `POST /api/applications/:applicationId/cv/:cvDocumentId/sanitize`; CẦN CHỐT HR có được bấm hay chỉ Admin/System. |
| Retry parse | Optional | Có API `POST /api/applications/:applicationId/cv/:cvDocumentId/parse`; CẦN CHỐT quyền và reason/audit UX. |
| View failure reason an toàn | Optional | Chỉ hiển thị error code/message đã redacted. |
| View notification sent status | Later | Spec có rule email sau retry/manual review nhưng chưa đủ UI contract. |
| Scanner/sanitizer mode read-only | Later | Chưa có config/status API UI rõ. |
| CV processing job monitor | Later | Chưa đủ spec cho operation dashboard toàn hệ thống. |

## 10. UI không triển khai trong Batch C

| UI | Lý do |
| -- | ----- |
| Mapping CV-JD UI | Thuộc Batch D; Batch C chỉ dừng ở ready for mapping. |
| Mapping result view/rerun | Thuộc Batch D; không có trong UI cần làm ngay. |
| Pre-screening Form UI | Thuộc Batch E. |
| Form token answer/submission UI | Thuộc Batch E, không dùng `/session/:token` legacy. |
| AI Screening UI | Thuộc Batch F. |
| AI score/result/rerun UI | Thuộc Batch F. |
| HR Review decision UI | Thuộc Batch G. |
| HR approve/reject/request more info/talent pool | Thuộc Batch G. |
| Channel posting dashboard hoàn chỉnh | Thuộc Batch H/later. |
| Bot conversation UI | Later. |
| Offer UI | Ngoài Batch C. |
| Interview/session/evaluation UI mới | Không thuộc recruitment Batch C; existing UI là legacy interview flow. |
| Onboarding UI | Ngoài scope. |
| Raw CV access UI | Security spec không cho UI thông thường xem raw/original/quarantine CV. |

## 11. API dependency theo màn hình

| Screen | API/resource cần có | Batch backend liên quan | Ghi chú |
| ------ | ------------------- | ----------------------- | ------- |
| Public Job Detail | `GET /api/public/job-postings/:slug` hoặc equivalent | `P1-B04` | Chỉ published/open posting. |
| Apply Form + Upload CV | `POST /api/public/job-postings/:jobPostingId/apply` | `P1-B05`, `P1-C01`, `P1-C02` | Có `Idempotency-Key`, validate file, scan đồng bộ. |
| Apply Result / Processing | Response apply/upload hoặc public status API nếu có | `P1-B05`, `P1-C01` | CẦN CHỐT có public status endpoint dài hạn không. |
| JD List | JD list API | `P1-B01`, `P1-B02` | Path cụ thể theo backend implementation. |
| JD Detail / Version | JD detail/version/mark ready APIs | `P1-B01`, `P1-B02` | Mark ready là side effect. |
| Job Posting List | Job posting list API | `P1-B03` | Có filter status/public. |
| Job Posting Detail | Job posting detail/edit/publish/close APIs | `P1-B03`, `P1-B04` | Publish/close cần confirmation. |
| Application List | `GET /api/applications?page=...&status=...&sourceChannel=...` | `P1-B08` | Application-centric list. |
| Application Detail | `GET /api/applications/:applicationId` | `P1-B08` | Tổng hợp candidate/job/current CV summary. |
| Application Timeline | `GET /api/applications/:applicationId/timeline` | `P1-B07`, `P1-B08` | Timeline nghiệp vụ. |
| Audit Basic | `GET /api/applications/:applicationId/audit-logs` nếu dùng | `P1-B07`, security/audit | Chỉ HR/Admin theo permission. |
| CV Upload manual | `POST /api/applications/:applicationId/cv` | `P1-C01`, `P1-C02` | HR/Admin manual upload theo application. |
| CV Version History | `GET /api/applications/:applicationId/cv` | `P1-C08` | Danh sách CV documents/versions. |
| Retry Sanitize | `POST /api/applications/:applicationId/cv/:cvDocumentId/sanitize` | `P1-C06` | Optional UI, CẦN CHỐT quyền. |
| Retry Parse | `POST /api/applications/:applicationId/cv/:cvDocumentId/parse` | `P1-C07` | Optional UI, CẦN CHỐT quyền. |
| Parsed Profile | `GET /api/applications/:applicationId/parsed-profile` | `P1-C07` | Chỉ HR/Admin. |
| Clean CV Preview/Download | `GET /api/applications/:applicationId/cv/:cvDocumentId/clean-file` | `P1-C09`, `P1-I04` | Không dùng `/api/uploads/:filename`. |

## 12. Status mapping cho UI

| Backend status | UI label | UI group | Color suggestion | Candidate visible? | HR visible? |
| -------------- | -------- | -------- | ---------------- | ------------------ | ----------- |
| `APPLICATION_CREATED` | Hồ sơ đã tạo | Application | Blue | Có, nếu có status page | Có |
| `APPLICATION_VALIDATING` | Đang kiểm tra hồ sơ | Application | Blue | Có | Có |
| `APPLICATION_REJECTED_INVALID` | Hồ sơ không hợp lệ | Application | Red | Có, message safe | Có |
| `APPLICATION_DUPLICATE_CHECKING` | Đang kiểm tra trùng | Application | Amber | Không mặc định | Có |
| `APPLICATION_DUPLICATE_FOUND` | Hồ sơ có thể bị trùng | Application | Amber | Không mặc định | Có |
| `APPLICATION_OVERWRITTEN` | Hồ sơ đã được cập nhật | Application | Blue | Có, nếu là retry/upload lại hợp lệ | Có |
| `APPLICATION_REJECTED_RATE_LIMIT` | Tạm thời chưa thể tiếp nhận | Application | Red | Có, message safe | Có |
| `CV_UPLOADED` | CV đã tải lên | CV | Blue | Có | Có |
| `CV_STORED_QUARANTINE` | CV đã được lưu an toàn để kiểm tra | CV | Blue | Không mặc định | Có |
| `CV_SCAN_REQUESTED` | Đang kiểm tra bảo mật CV | CV | Amber | Có | Có |
| `CV_SCAN_PASSED` | CV đã qua kiểm tra bảo mật | CV | Green | Có, dạng "đã tiếp nhận" | Có |
| `CV_SCAN_FAILED` | Kiểm tra bảo mật CV gặp lỗi kỹ thuật | CV | Red | Có, message generic | Có |
| `CV_REJECTED_MALWARE` | CV không đáp ứng chính sách bảo mật | CV | Red | Có, message safe | Có |
| `CV_SANITIZING` | Đang tạo bản CV sạch | CV | Amber | Không mặc định | Có |
| `CV_SANITIZED` | Đã có clean CV | CV | Green | Không | Có |
| `CV_SANITIZE_FAILED` | Không tạo được clean CV | CV | Red | Không mặc định | Có |
| `CV_PARSE_FAILED` | Không parse được clean CV | CV | Red | Không mặc định | Có |
| `CV_PARSED` | Đã parse CV | CV | Green | Không | Có |

Recommended rule:

- Candidate/Public chỉ thấy status ở mức tiếp nhận/lỗi an toàn.
- HR/Admin thấy đầy đủ trạng thái Application/CV.
- Các status sau Batch C như `MAPPING_*`, `FORM_*`, `AI_*`, `HR_*` không đưa vào UI hiện tại, chỉ để later.

## 13. Public-safe error message

| Error code | Public message | HR/Admin message | Ghi chú security |
| ---------- | -------------- | ---------------- | ---------------- |
| `VALIDATION_ERROR` | Thông tin ứng tuyển chưa hợp lệ. Vui lòng kiểm tra lại. | Hiển thị field validation chi tiết nếu không chứa sensitive data. | Không trả stack trace/DTO internals. |
| `UNSUPPORTED_FILE_TYPE` | Định dạng CV chưa được hỗ trợ. Vui lòng tải lên PDF, DOCX hoặc XLSX. | File type hoặc MIME không được hỗ trợ. | Không tin MIME/filename từ client. |
| `FILE_TOO_LARGE` | File vượt dung lượng cho phép. Vui lòng chọn file nhỏ hơn. | File vượt limit cấu hình. | Nếu limit chưa chốt, UI copy lấy từ config/API. |
| `UPLOAD_RATE_LIMIT_EXCEEDED` | Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau. | Rate limit theo IP/email/jobPosting. | Không expose rule chi tiết để tránh abuse. |
| `MALWARE_DETECTED` | CV không được chấp nhận do không đáp ứng chính sách bảo mật. | CV bị scanner đánh dấu rủi ro bảo mật. | Không hiển thị tên malware/raw scanner log cho public. |
| `CV_SCAN_FAILED` | Hệ thống chưa thể kiểm tra CV. Vui lòng thử lại sau. | Scanner failed/timeout, có thể retry/manual review. | Không đánh đồng với malware. |
| `CV_SANITIZE_FAILED` | Hồ sơ đang cần được xử lý thêm. | Sanitize clean CV failed. | Public thường không nhận lỗi này trong upload response. |
| `CV_PARSE_FAILED` | Hồ sơ đang cần được xử lý thêm. | Parse clean CV failed hoặc text rỗng. | Không expose parser stack trace. |
| `INVALID_STATE_TRANSITION` | Thao tác hiện chưa thể thực hiện. | State transition không hợp lệ. | Dùng cho HR/Admin action. |
| `FORBIDDEN` | Bạn không có quyền truy cập nội dung này. | Permission/ownership check failed. | Không lộ object tồn tại hay không nếu không cần. |

## 14. Clean CV security rule trên UI

Rule bắt buộc:

- Không có UI raw CV download.
- Không expose storage path.
- Không expose quarantine file.
- Không expose original CV qua UI HR thông thường.
- Clean CV preview/download chỉ qua API riêng có permission.
- Candidate/Public không được xem clean CV.
- HR/Admin download/view clean CV phải để backend ghi audit event.
- Frontend không cache/share URL dài hạn nếu dùng signed URL.
- Frontend không dùng legacy `/api/uploads/:filename` cho clean CV Batch C.
- Frontend không hiển thị scanner log, Ghostscript error, parser stack trace, container command hoặc private file path.

Clean CV access hợp lệ:

```text
GET /api/applications/:applicationId/cv/:cvDocumentId/clean-file
```

Raw/original/quarantine access:

- Không thuộc UI thông thường.
- Nếu sau này có Admin/security special access, phải có spec riêng, reason bắt buộc và audit riêng.

## 15. Component/source frontend có thể reuse

| UI need | Existing component/screen/pattern | Reuse level | Ghi chú |
| ------- | --------------------------------- | ----------- | ------- |
| Internal shell/sidebar | `InterviewerLayout` | Medium | Cần thêm recruitment nav và HR/Admin route visibility. |
| Auth user context | `auth-context.tsx`, `/auth/me` flow trong layout | Medium | Cần guard rõ hơn cho HR/Admin nếu route phức tạp. |
| API calls | `api-client.ts` | Medium | Có JSON/upload/download; cần thêm headers/options cho `Idempotency-Key`. |
| Public/internal route setup | `routes.tsx` | Medium | Cần thêm `/jobs/*` public và `/recruitment/*` internal routes. |
| JD/JobPosting CRUD | `ManagementPage` pattern | High | Table/dialog/form/toast/pagination pattern phù hợp. |
| Application list | `CandidateListPage` table pattern | High | Reuse table/filter/pagination pattern, đổi domain sang Application. |
| Application detail | `CandidateDetailPage` layout/detail cards | Medium | Chỉ reuse layout pattern, không reuse candidate-centric data flow. |
| CV upload | `CandidateCreatePage`, `CandidateDetailPage` upload UI pattern | Low-Medium | Phải đổi endpoint, accepted extensions, idempotency và status copy. |
| Clean CV preview/download | `CandidateDetailPage` PDF dialog + `apiClient.downloadBlob` | High | Dùng endpoint clean-file, không dùng legacy upload URL. |
| Parsed profile view | `CandidateDetailPage` parsed profile cards | Medium | Cần Phase 1 parsed profile schema. |
| Status badges | `Badge` component, role/status badge patterns | High | Cần mapping màu/label mới cho Application/CV. |
| Table/pagination | `Table`, `DataTablePagination`, `SortableHeader` | High | Dùng cho JD, posting, application, CV versions. |
| Modal/action confirm | `Dialog` | High | Dùng cho create/edit/publish/close/retry. |
| Toast/error state | `toast`, `Toaster`, `ApiError` | Medium | Cần normalize error code sang public-safe copy. |
| Tabs/detail organization | `Tabs`, `Card` | High | Dùng cho Application Detail sections. |
| Timeline | Chưa có component riêng | Low | Tạo component mới từ Card/Table pattern. |

## 16. Conflict/risk khi reuse frontend hiện tại

| Conflict/Risk | Vì sao rủi ro | Cách xử lý |
| ------------- | ------------- | ---------- |
| Existing candidate upload cũ dùng `/candidates/upload` | Flow cũ upload/parse theo Candidate, không application-centric và không đảm bảo quarantine/safe split cho Batch C. | Không dùng làm business flow mới; chỉ tham khảo UI pattern upload. |
| `.xls` đang được UI cũ accept | `CandidateCreatePage` và `CandidateDetailPage` accept `.xls`, trong khi Batch C không support `.xls`. | Batch C UI chỉ allow `.pdf`, `.docx`, `.xlsx`; hiển thị error `UNSUPPORTED_FILE_TYPE`. |
| Existing file preview có thể dùng legacy upload route | Candidate detail hiện dùng file URL như `resumeUrl/profileXlsxUrl` và `downloadBlob`. | Clean CV UI phải gọi `clean-file` API theo `applicationId`/`cvDocumentId`; không dùng `/api/uploads/:filename`. |
| UI cũ candidate-centric | `/candidates` đang là trung tâm màn hình. Recruitment Phase 1 yêu cầu `Application` là workflow center. | Tạo `/recruitment/applications` và `/recruitment/applications/:applicationId` làm route chính. |
| Session/evaluation UI là legacy interview flow | Batch C chưa triển khai interview/evaluation mới. | Không đưa session/evaluation vào recruitment Batch C; chỉ reuse pattern nếu cần. |
| Public token cũ `/session/:token` không phải apply/form token mới | Existing candidate session token thuộc interview flow. | Không reuse cho public apply; tạo `/jobs/:slug/apply`. |
| API client thiếu idempotency header | Apply/CV upload/retry cần `Idempotency-Key`. | Mở rộng `api-client.ts` để hỗ trợ custom headers/request options trước khi implement UI. |
| Shared types thiếu Phase 1 model | `packages/shared/src/types` chưa có JobDescription, JobPosting, Application, CvDocument, WorkflowEvent. | Bổ sung shared/frontend types trong implementation task breakdown trước khi build screens. |
| HR/Admin route visibility chưa rõ | Sidebar hiện chỉ phân biệt admin-only settings/questions; HR workspace chưa có nav riêng. | Thêm recruitment nav theo role policy khi implement. |
| Error copy hiện lấy `err.message` trực tiếp | Có nguy cơ hiển thị internal backend message. | Map error code sang public-safe/admin-safe copy. |

## 17. Open questions cần chốt trước khi implement

| Câu hỏi cần chốt | Ảnh hưởng | Ưu tiên |
| ---------------- | --------- | ------- |
| Apply form chính thức gồm field nào? | Quyết định form schema, validation, UI labels. | High |
| Có consent/privacy checkbox bắt buộc không? | Public apply compliance và submit enable/disable. | High |
| Có captcha/bot protection ở UI không? | Public endpoint abuse protection. | High |
| Status label/color final cho Application/CV là gì? | Tránh UI mapping lệch backend enum. | High |
| Retry sanitize/parse cho HR bấm hay chỉ Admin/System? | Quyết định action button, dialog reason và audit UX. | High |
| Parsed profile hiển thị bao nhiêu normalized text? | PII/privacy và UX detail. | Medium |
| Clean CV preview inline hay chỉ download? | Quyết định PDF viewer/modal và permission UX. | Medium |
| Candidate có cần trang tra cứu trạng thái sau apply không? | Quyết định route `/apply/:applicationId/status` và public status API. | Medium |
| Idempotency key tạo ở frontend thế nào? | Retry apply/upload không tạo duplicate. | High |
| Max file size hiển thị là bao nhiêu và lấy từ đâu? | Public upload copy và client-side validation. | Medium |
| Public job detail có cần SEO/share metadata không? | Public route implementation và page metadata. | Low |
| HR ownership/scope theo application được xác định thế nào? | Route/action visibility và forbidden state. | High |

## 18. Kết luận

Đến Batch C, frontend cần xây dựng một recruitment UI mới xoay quanh `Application`, gồm public apply flow và HR/Admin workspace cho JD, Job Posting, Application và CV processing.

Specification hiện tại đủ để chốt danh sách màn hình chính, route đề xuất, API dependency, status/error mapping và security boundary. Các điểm còn thiếu chủ yếu là chi tiết UX/policy cần chốt trước implementation: apply form fields, consent/captcha, idempotency key strategy, status color final, quyền retry sanitize/parse và clean CV preview behavior.

Frontend hiện tại có thể reuse một phần đáng kể về layout, table, form, dialog, toast, upload/download và detail-card pattern. Tuy nhiên không được reuse business flow cũ của Candidate upload, không được dùng `/api/uploads/:filename` cho clean CV, không được đưa session/evaluation flow vào Batch C, và không được biến Candidate thành workflow center.

