# 14. Security and Audit Log Specification

## 1. Mục tiêu tài liệu

Tài liệu này mô tả security và audit log cho Recruitment Phase 1 của Interview Assistant / Recruitment Core Backend.

Tài liệu làm nền cho implementation sau này của các module `audit-logs`, `workflow-state`, public apply, form session, CV processing, mapping, AI screening, HR review và channel integration. Đây không phải tài liệu implement code, không tạo migration, không tạo module/service/controller/entity thật.

Mục tiêu chính:

- Bảo vệ dữ liệu ứng viên, CV, PII, token, webhook và các endpoint public.
- Chuẩn hóa access control cho `Admin`, `HR`, `Interviewer`, `Candidate/Public` và `System/Webhook`.
- Tách rõ CV gốc trong quarantine với clean CV dùng cho parse/mapping/AI/HR Review.
- Không expose mapping score, AI score hoặc HR decision cho Candidate/Public.
- Ghi audit đầy đủ cho upload, sanitize, mapping, form, AI Screening, HR decision, channel publish và các sự kiện security quan trọng.

## 2. Security principles

| STT | Principle | Nội dung |
| --- | --------- | -------- |
| 1 | Core là source of truth | Recruitment Core Backend sở hữu trạng thái `Application`, CV, mapping, form, AI Screening, HR Review, channel ingestion và audit. |
| 2 | `Application` là trung tâm audit | Mọi action quan trọng phải cố gắng gắn với `applicationId` nếu context đã có. |
| 3 | Principle of least privilege | Mỗi actor chỉ được truy cập đúng tài nguyên cần cho vai trò của mình. |
| 4 | Public endpoint phải được bảo vệ riêng | Public apply, form token và channel webhook cần validation, rate limit, idempotency và cơ chế xác thực riêng phù hợp. |
| 5 | Không expose CV gốc | Original/quarantine CV không được trả qua public API hoặc HR Review UI thông thường. |
| 6 | Không dùng original/quarantine CV cho nghiệp vụ | Parse, mapping, AI Screening và HR Review chỉ dùng clean CV hoặc parsed profile từ clean CV. |
| 7 | Clean CV có phân quyền | Clean CV chỉ cho HR/Admin có quyền theo application/candidate xem hoặc download. |
| 8 | Form token có expiry và hash | Public form token phải random, có `expiresAt`, submit once và DB chỉ lưu `tokenHash`. |
| 9 | Webhook xác thực nguồn gửi | Channel webhook phải verify signature nếu channel hỗ trợ; nếu chưa có signature chuẩn thì dùng shared secret/token và thêm replay/rate limit. |
| 10 | Không log dữ liệu nhạy cảm | Không log secret, token, raw CV content, full prompt chứa PII, credential hoặc private file path. |
| 11 | Error response an toàn | Response public không leak stack trace, DB query, storage path, secret hoặc chi tiết nội bộ. |
| 12 | Decision/action quan trọng phải audit | Upload, sanitize, mapping, form, AI, HR decision, channel publish và security event phải ghi `AuditLog` hoặc `WorkflowEvent`. |
| 13 | Migration-first cho production | Production/staging phải dùng TypeORM migration rõ ràng, không dựa vào `synchronize=true`. |

## 3. Role matrix

| Action / Resource | Admin | HR | Interviewer | Candidate/Public | System/Webhook |
| ----------------- | ----- | -- | ----------- | ---------------- | -------------- |
| Quản lý user/role | Yes | No | No | No | No |
| Quản lý JD | Yes | Yes | Read nếu được phân quyền | No | No |
| Quản lý job posting | Yes | Yes | Read nếu được phân quyền | Public read published only | No |
| Publish channel | Yes | Yes | No | No | System task nếu được cấu hình |
| Cấu hình channel/bot | Yes | Limited theo policy | No | No | No |
| Public apply | No | No | No | Yes | No |
| Upload CV qua apply | No | No | No | Yes | Channel/import system nếu xác thực |
| Xem application list/detail | Yes | Yes theo scope | Read nếu được phân quyền rõ | No | No |
| Xem clean CV | Yes | Yes theo application scope | Read nếu được phân quyền rõ | No | No |
| Xem original/quarantine CV | Special audited access | No mặc định | No | No | Internal scanner/sanitizer only |
| Run/rerun mapping | Yes | Yes có reason | No | No | System theo workflow |
| Xem mapping result | Yes | Yes theo scope | Read nếu được phân quyền rõ | No | No |
| Tạo/gửi form session | Yes | Yes | No | No | System theo workflow |
| Candidate access form token | No | No | No | Yes với token hợp lệ | No |
| Candidate submit form | No | No | No | Yes với token hợp lệ | No |
| Run/rerun AI Screening | Yes | Yes có reason | No | No | System theo workflow |
| Xem AI Screening result | Yes | Yes theo scope | Read nếu được phân quyền rõ | No | No |
| HR Review approve/reject/request more info/talent pool | Yes | Yes | No | No | No |
| Xem audit logs | Yes | HR theo application scope | No mặc định | No | No |
| Xem workflow timeline | Yes | Yes theo scope | Read nếu được phân quyền rõ | No | System append only |
| Channel webhook ingestion | No | No | No | No | Yes nếu xác thực webhook/system |
| Bot conversation reply | Yes | Yes | No | Candidate chỉ nhận/gửi qua channel hợp lệ | Bot/System nếu policy cho phép |
| Admin override state | Yes, phải audit | No mặc định | No | No | System recovery nếu được duyệt |

Quy tắc:

- `Admin`: quyền cấu hình cao nhất, có thể override nhưng mọi override phải ghi audit.
- `HR`: thao tác nghiệp vụ tuyển dụng Phase 1 trong scope được phân quyền.
- `Interviewer`: không phải role chính trong Phase 1 intake; chỉ xem nếu được phân quyền rõ.
- `Candidate/Public`: chỉ apply, mở form token và submit form; không có quyền xem dữ liệu review nội bộ.
- `System/Webhook`: chỉ gọi webhook/system task có xác thực riêng.
- Candidate/Public không được xem mapping result, AI result, HR decision, audit log hoặc clean CV download.
- Original/quarantine CV mặc định không cho HR Review xem. Nếu có Admin/security access đặc biệt, action đó phải audit.

## 4. Public endpoint security

| Endpoint group | API ví dụ | Security requirement | Ghi chú |
| -------------- | --------- | -------------------- | ------- |
| Public apply | `POST /api/public/job-postings/:jobPostingId/apply` | Rate limit theo IP/email/phone/jobPosting; validate job posting open/closed; validate required fields; validate MIME/extension/size; idempotency key; CAPTCHA hoặc bot protection nếu expose internet; không tin filename/MIME từ client; CV upload vào quarantine; không trả internal path; không expose stack trace khi upload fail. | Public apply tạo/link `Candidate` + `Application`; CV phải đi qua CV processing. |
| Public form token | `GET /api/forms/access/:token`<br>`PUT /api/forms/access/:token/answers`<br>`POST /api/forms/access/:token/submit` | Token random, khó đoán; DB lưu `tokenHash`, không lưu plain token; có expiration; rate limit theo IP/token; submit once; không expose mapping/AI/HR data; không expose clean CV/raw CV; chống brute-force token; trả lỗi chung chung cho token invalid/expired nếu cần giảm enumeration. | Không dùng `interview_sessions.accessToken`. |
| Channel webhook | `POST /api/channels/:channel/webhook` | Verify signature nếu channel hỗ trợ; verify shared secret/token nếu chưa có signature chuẩn; timestamp/replay protection nếu có; IP allowlist nếu khả thi; rate limit; idempotency theo external id; validate payload schema; không tin file URL từ channel; raw payload chứa PII phải hạn chế log/access. | Chỉ xử lý payload từ kênh hợp lệ; mọi apply/CV vẫn normalize về `Application`. |

Public endpoint response rule:

- Không trả storage path, DB id không cần thiết, stack trace hoặc provider/internal error chi tiết.
- Với token invalid/expired, cân nhắc response generic để giảm enumeration.
- Với duplicate/retry hợp lệ, trả lại response trước đó theo idempotency thay vì tạo bản ghi mới.

## 5. File security

| Security area | Rule |
| ------------- | ---- |
| CV gốc / quarantine | CV gốc lưu ở quarantine storage; chỉ dùng cho scan/sanitize; không dùng cho parse/mapping/AI/HR Review; không expose qua public API; không expose qua HR Review UI; Admin/security access nếu có phải audit. |
| Clean CV | Clean CV lưu ở safe storage; là file được phép dùng cho parse/mapping/AI/HR Review; HR/Admin xem theo permission application/candidate; không trả storage path trực tiếp nếu không có access control; có thể dùng signed URL ngắn hạn hoặc API streaming có permission check. |
| File validation | Check MIME, extension, size, magic bytes nếu có thể; reject mismatch MIME/extension; reject dangerous extension; reject path traversal; generate server-side filename/storage key; không dùng client filename làm path; không log full file path nội bộ. |
| Malware scan | Public/manual/channel CV upload API phải chạy malware scan đồng bộ trong request; malware detected trả `422 MALWARE_DETECTED`; scan failed/timeout là lỗi kỹ thuật riêng, không sanitize/parse khi chưa pass. |
| Ghostscript sanitizer | Ghostscript là sanitizer/converter tạo clean PDF sau scan pass, không phải malware scanner. Nếu dùng Docker, container phải harden: no network, non-root, read-only input, drop capabilities, no-new-privileges, CPU/memory/PID limit, timeout, output mount riêng và cleanup temp/container. |
| Existing upload risk | Existing `/api/uploads/:filename` hiện role-gated nhưng chưa check ownership theo application/candidate; Phase 1 clean CV access nên có API riêng theo `applicationId`/`cvDocumentId`; không dùng existing upload route để phục vụ raw CV. |

Ghi chú triển khai:

- Quarantine storage và safe storage là boundary logic bắt buộc. Implementation có thể là bucket riêng, prefix riêng hoặc service storage riêng, nhưng access control phải tách rõ.
- File URL từ channel webhook không được tự động tin cậy. Nếu cần download, phải safe fetch, validate, quarantine và scan.
- Parser, mapping, AI Screening và HR Review không đọc original/quarantine CV; chỉ dùng clean CV hoặc parsed profile từ clean CV.

## 6. Rate limit

| Endpoint / Process | Rate limit đề xuất | Key | Ghi chú |
| ------------------ | ------------------ | --- | ------- |
| Public apply upload | Chặt hơn global default, ví dụ `5-10 requests/phút/IP` | IP + jobPostingId | Thêm idempotency để retry không tạo duplicate. |
| Apply theo email/phone/jobPosting | Giới hạn theo ngày hoặc window nghiệp vụ | email/phone + jobPostingId | Chống spam apply và upload lại quá mức. |
| Form access token | Chặt theo token và IP | tokenHash + IP | Chống brute-force token. |
| Form submit | Ví dụ `5 requests/phút/token/IP`; submit thành công chỉ một lần | tokenHash + IP + formSessionId | Retry cùng idempotency trả response cũ. |
| Form answer save draft nếu có | Trung bình, vẫn giới hạn theo token/IP | tokenHash + questionId + IP | Draft có thể upsert, không chuyển state. |
| Channel webhook | Theo channel + IP/source; phụ thuộc rate channel | channel + source IP + external event id | Kết hợp signature và idempotency. |
| Channel import | Giới hạn batch/import job | HR user + channel + batchId | Tránh import trùng hoặc quá tải. |
| Bot conversation/reply webhook | Theo channel + externalConversationId | channel + externalConversationId + IP/source | Chống message storm và reply lặp. |
| Login | Giữ strict như baseline login | email + IP | Baseline có login throttle thấp hơn global. |
| Mapping run/rerun | Internal guard + idempotency | applicationId + cleanCvDocumentId + jdVersionId | Rerun cần reason và audit. |
| AI Screening run/rerun | Internal guard + idempotency | applicationId + mappingResultId + formSessionId | Rerun cần reason và audit. |
| CV sanitize/parse trigger | Internal queue/lock | cvDocumentId + hash | Không chạy song song cùng CV version. |
| HR decision API | Global rate limit + state guard | userId + applicationId | Không cho nhiều terminal decision conflict. |

Baseline hiện tại có global throttler cao. Phase 1 public endpoints cần override thấp hơn, đặc biệt apply upload, form token, form submit và webhook.

## 7. Audit log events

| Nhóm | Event | Khi nào ghi | Metadata chính |
| ---- | ----- | ----------- | -------------- |
| Application / Apply | `APPLICATION_SUBMITTED` | Nhận apply từ public apply/channel/manual import | `applicationId`, `candidateId`, `jobPostingId`, `sourceChannel`, `actorType`, `requestId`, `ipAddress` |
| Application / Apply | `APPLICATION_VALIDATION_FAILED` | Payload apply thiếu/sai dữ liệu | `jobPostingId`, `errorCode`, `errorMessage`, `requestId`, `ipAddress` |
| Application / Apply | `APPLICATION_DUPLICATE_FOUND` | Phát hiện application trùng | `applicationId`, `candidateId`, `jobPostingId`, `externalId` |
| Application / Apply | `APPLICATION_OVERWRITTEN` | Cho phép upload lại/version mới hoặc overwrite theo rule | `applicationId`, `candidateId`, `cvDocumentId`, `actorType`, `actorId` |
| Application / Apply | `UPLOAD_RATE_LIMIT_EXCEEDED` | Apply/upload bị chặn bởi rate limit | `jobPostingId`, `candidateId`, `ipAddress`, `userAgent` |
| CV | `CV_UPLOADED` | CV được nhận từ apply/import/manual upload | `applicationId`, `candidateId`, `cvDocumentId`, `sourceChannel` |
| CV | `CV_STORED_QUARANTINE` | Original CV đã lưu quarantine | `applicationId`, `cvDocumentId`, `requestId` |
| CV | `CV_HASH_CALCULATED` | Tính hash CV | `applicationId`, `cvDocumentId` |
| CV | `CV_SCAN_REQUESTED` | Yêu cầu malware scan | `applicationId`, `cvDocumentId` |
| CV | `CV_SCAN_PASSED` | Scanner xác nhận an toàn | `applicationId`, `cvDocumentId` |
| CV | `CV_MALWARE_DETECTED` | Phát hiện malware | `applicationId`, `cvDocumentId`, `errorCode` |
| CV | `CV_SCAN_FAILED` | Scanner lỗi/timeout kỹ thuật | `applicationId`, `cvDocumentId`, `errorCode`, redacted `errorMessage`, attempt |
| CV | `CV_SANITIZE_STARTED` | Bắt đầu sanitize/create clean CV | `applicationId`, `cvDocumentId` |
| CV | `CV_SANITIZED` | Clean CV đã tạo | `applicationId`, `cvDocumentId` |
| CV | `CV_SANITIZE_FAILED` | Sanitize thất bại | `applicationId`, `cvDocumentId`, `errorCode`, `errorMessage` |
| CV | `CV_PARSED` | Clean CV đã parse | `applicationId`, `cvDocumentId` |
| CV | `CV_PARSE_FAILED` | Parse clean CV thất bại | `applicationId`, `cvDocumentId`, `errorCode`, `errorMessage` |
| CV | `CV_FAILURE_NOTIFICATION_SENT` | Gửi email yêu cầu ứng viên upload lại hoặc thông báo lỗi CV theo policy | `applicationId`, `candidateId`, `cvDocumentId`, notification template, reason code |
| CV | `CLEAN_CV_VIEWED` | HR/Admin xem clean CV | `applicationId`, `candidateId`, `cvDocumentId`, `actorId` |
| CV | `CLEAN_CV_DOWNLOADED` | HR/Admin download clean CV | `applicationId`, `candidateId`, `cvDocumentId`, `actorId` |
| CV | `RAW_CV_ACCESS_ATTEMPTED` | Có attempt truy cập raw/quarantine CV | `applicationId`, `candidateId`, `cvDocumentId`, `actorId`, `errorCode` |
| Mapping | `MAPPING_REQUESTED` | Mapping được trigger | `applicationId`, `cvDocumentId`, `jobDescriptionVersionId`, `actorType` |
| Mapping | `MAPPING_DONE` | Mapping thành công | `applicationId`, `mappingResultId`, `jobDescriptionVersionId` |
| Mapping | `MAPPING_FAILED` | Mapping lỗi kỹ thuật/schema/rule | `applicationId`, `mappingResultId`, `errorCode`, `errorMessage` |
| Mapping | `MAPPING_REJECTED` | Mapping dưới threshold hoặc bị reject theo rule | `applicationId`, `mappingResultId` |
| Mapping | `MAPPING_RERUN_REQUESTED` | HR/Admin/System rerun mapping | `applicationId`, `mappingResultId`, `actorId`, `reason` |
| Form | `FORM_SESSION_CREATED` | Tạo form session/token | `applicationId`, `formSessionId`, `actorType`, `actorId` |
| Form | `FORM_SENT` | Gửi link form | `applicationId`, `formSessionId`, `requestId` |
| Form | `FORM_OPENED` | Candidate mở form token | `applicationId`, `formSessionId`, `ipAddress`, `userAgent` |
| Form | `FORM_SUBMITTED` | Candidate submit form thành công | `applicationId`, `formSessionId`, `candidateId`, `ipAddress` |
| Form | `FORM_EXPIRED` | Form hết hạn | `applicationId`, `formSessionId` |
| Form | `FORM_SUBMIT_FAILED` | Submit form fail validation/state | `applicationId`, `formSessionId`, `errorCode` |
| Form | `FORM_TOKEN_INVALID` | Token không hợp lệ | `requestId`, `ipAddress`, `userAgent`, `errorCode` |
| Form | `FORM_TOKEN_EXPIRED` | Token hết hạn | `formSessionId`, `requestId`, `ipAddress` |
| AI Screening | `AI_SCREENING_REQUESTED` | AI Screening được trigger | `applicationId`, `mappingResultId`, `formSessionId`, `actorType` |
| AI Screening | `AI_SCREENING_INPUT_BUILT` | Input AI đã được build từ dữ liệu hợp lệ | `applicationId`, `aiScreeningResultId`, `cvDocumentId`, `mappingResultId`, `formSessionId` |
| AI Screening | `AI_SCREENING_DONE` | AI Screening thành công | `applicationId`, `aiScreeningResultId` |
| AI Screening | `AI_SCREENING_FAILED` | AI Screening lỗi provider/schema/rule | `applicationId`, `aiScreeningResultId`, `errorCode`, `errorMessage` |
| AI Screening | `AI_SCREENING_RERUN_REQUESTED` | HR/Admin/System rerun AI Screening | `applicationId`, `aiScreeningResultId`, `actorId`, `reason` |
| HR Review | `HR_REVIEW_VIEWED` | HR/Admin mở review detail | `applicationId`, `candidateId`, `actorId` |
| HR Review | `HR_APPROVED` | HR duyệt đi tiếp | `applicationId`, `hrReviewDecisionId`, `actorId` |
| HR Review | `HR_REJECTED` | HR loại hồ sơ | `applicationId`, `hrReviewDecisionId`, `actorId` |
| HR Review | `HR_REQUESTED_MORE_INFO` | HR yêu cầu bổ sung | `applicationId`, `hrReviewDecisionId`, `actorId` |
| HR Review | `HR_SENT_TO_TALENT_POOL` | HR đưa vào talent pool | `applicationId`, `hrReviewDecisionId`, `actorId` |
| HR Review | `HR_DECISION_OVERRIDDEN` | Admin override decision/state | `applicationId`, `hrReviewDecisionId`, `actorId`, `reason` |
| Channel / Bot | `CHANNEL_PUBLISH_REQUESTED` | HR/Admin yêu cầu publish channel | `jobPostingId`, `channel`, `actorId`, `requestId` |
| Channel / Bot | `CHANNEL_PUBLISHED` | Channel publish thành công | `jobPostingId`, `channel`, `externalId` |
| Channel / Bot | `CHANNEL_PUBLISH_FAILED` | Publish channel fail | `jobPostingId`, `channel`, `errorCode`, `errorMessage` |
| Channel / Bot | `CHANNEL_MANUAL_REQUIRED` | Channel cần manual fallback | `jobPostingId`, `channel`, `actorId` |
| Channel / Bot | `CHANNEL_WEBHOOK_RECEIVED` | Nhận webhook hợp lệ | `channel`, `externalId`, `requestId` |
| Channel / Bot | `CHANNEL_WEBHOOK_REJECTED` | Webhook bị reject | `channel`, `externalId`, `errorCode`, `ipAddress` |
| Channel / Bot | `CHANNEL_APPLICATION_IMPORTED` | Import application từ channel | `applicationId`, `candidateId`, `channel`, `externalId` |
| Channel / Bot | `BOT_MESSAGE_RECEIVED` | Nhận message inbound | `channel`, `externalId`, `applicationId`, `candidateId` |
| Channel / Bot | `BOT_MESSAGE_REPLIED` | Bot reply message | `channel`, `externalId`, `actorType` |
| Channel / Bot | `BOT_ESCALATED_TO_HR` | Bot handoff HR | `channel`, `externalId`, `applicationId`, `reason` |
| Channel / Bot | `HR_REPLIED_CONVERSATION` | HR trả lời conversation | `channel`, `externalId`, `actorId` |
| Security | `UNAUTHORIZED_ACCESS_ATTEMPT` | Request chưa auth vào resource cần auth | `objectType`, `objectId`, `requestId`, `ipAddress` |
| Security | `FORBIDDEN_ACCESS_ATTEMPT` | Actor có auth nhưng không đủ quyền | `actorId`, `objectType`, `objectId`, `requestId` |
| Security | `WEBHOOK_SIGNATURE_INVALID` | Signature webhook sai | `channel`, `requestId`, `ipAddress` |
| Security | `RATE_LIMIT_EXCEEDED` | Request bị rate limit | `actorType`, `actorId`, `requestId`, `ipAddress` |
| Security | `TOKEN_BRUTE_FORCE_SUSPECTED` | Nhiều attempt token invalid | `ipAddress`, `userAgent`, `requestId` |
| Security | `FILE_VALIDATION_FAILED` | File upload fail validation | `applicationId`, `errorCode`, `requestId`, `ipAddress` |

Metadata chung nên hỗ trợ: `applicationId`, `candidateId`, `jobPostingId`, `jobDescriptionVersionId`, `cvDocumentId`, `mappingResultId`, `formSessionId`, `aiScreeningResultId`, `hrReviewDecisionId`, `channel`, `externalId`, `actorType`, `actorId`, `requestId`, `ipAddress`, `userAgent`, `errorCode`, `errorMessage`.

## 8. AuditLog entity proposal

| Field | Type đề xuất | Required | Mô tả |
| ----- | ------------ | -------- | ----- |
| `id` | `uuid` | Yes | Khóa chính audit log. |
| `actorType` | `varchar/enum` | Yes | `USER`, `CANDIDATE_PUBLIC`, `SYSTEM`, `WEBHOOK`, `BOT`, `ADMIN_OVERRIDE`. |
| `actorId` | `uuid/varchar` | No | User id hoặc external id nếu có. |
| `action` | `varchar` | Yes | Tên event/action, ví dụ `CLEAN_CV_DOWNLOADED`. |
| `objectType` | `varchar` | Yes | Entity bị tác động, ví dụ `Application`, `CvDocument`, `FormSession`. |
| `objectId` | `uuid/varchar` | No | ID entity bị tác động. |
| `applicationId` | `uuid` | No | Application liên quan nếu có. |
| `candidateId` | `uuid` | No | Candidate liên quan nếu có. |
| `jobPostingId` | `uuid` | No | Job posting liên quan nếu có. |
| `channel` | `varchar` | No | Channel liên quan nếu có. |
| `metadata` | `jsonb` | No | Chỉ lưu dữ liệu cần thiết, đã mask/redact nếu nhạy cảm. |
| `ipAddress` | `varchar` | No | IP request nếu có. |
| `userAgent` | `text` | No | User agent nếu có. |
| `requestId` | `varchar` | No | Correlation id cho tracing. |
| `createdAt` | `timestamp` | Yes | Thời điểm ghi log. |

Không lưu trong `metadata`: raw CV content, secret, token plain text, credential, private file path, full prompt nếu chứa PII.

| Log type | Mục đích | Ví dụ |
| -------- | -------- | ----- |
| `WorkflowEvent` | Ghi transition state của `Application` | `MAPPING_DONE` |
| `AuditLog` | Ghi action/security/business event | `CLEAN_CV_DOWNLOADED` |
| App log | Debug/technical log | Provider timeout |
| Security log | Có thể dùng `AuditLog` hoặc app security log | Webhook signature invalid |

Ghi chú triển khai:

- `WorkflowEvent` và `AuditLog` có thể trùng tên event, nhưng mục đích khác nhau: workflow để dựng timeline state, audit để truy vết actor/action/security.
- Audit log không nên bị sửa/xóa bằng API nghiệp vụ thông thường.

## 9. PII handling

| PII data | Nơi xuất hiện | Access rule | Logging rule |
| -------- | ------------- | ----------- | ------------ |
| Email | `Candidate`, `Application`, apply payload, form, channel payload | HR/Admin theo application scope; Candidate chỉ dữ liệu của token/session public hợp lệ | Mask nếu không cần đầy đủ; không dùng để leak existence public. |
| Phone | `Candidate`, `Application`, apply payload, parsed profile | HR/Admin theo scope | Mask nếu không cần đầy đủ. |
| Full name | `Candidate`, apply payload, parsed profile, form | HR/Admin theo scope; Candidate chỉ context form của chính mình | Có thể log tối thiểu nếu cần, ưu tiên id. |
| CV file | `cv_documents`, storage | Original chỉ internal scanner/sanitizer; clean CV HR/Admin theo quyền | Không log content, không log full internal path. |
| Parsed profile | `parsed_profiles`, `Candidate.parsedProfile` nếu reuse | HR/Admin theo scope; AI/mapping system task | Không log full profile ở production nếu chứa PII. |
| Form answers | `form_answers` | HR/Admin theo application; Candidate submit/xem tối thiểu trong token session nếu cần | Không log full answer nếu không cần. |
| Conversation messages | `channel_messages` | HR/Admin theo channel/job/application scope | Không log full message ở level info/debug nếu chứa PII. |
| Raw channel payload | `ApplicationSource`, webhook/import logs | Hạn chế quyền Admin/authorized HR/system debug | Không log raw payload chứa PII ở production app log. |
| AI prompt input | AI Screening/mapping runtime metadata | System/authorized Admin debugging có kiểm soát | Không log full prompt production; lưu tối thiểu hoặc redacted. |
| AI raw result | `ai_screening_results.rawResult`, mapping raw result nếu có | HR/Admin theo scope nếu cần; Candidate không xem | Access-controlled; không expose public. |
| HR comment/reason | `hr_reviews`, audit metadata | HR/Admin theo scope | Không gửi chi tiết cho Candidate/Public nếu không có policy. |
| IP address/user agent | Audit/security log | Admin/security/authorized audit viewer | Được log để security trace, retention theo policy. |
| External channel id/message id | `ApplicationSource`, `ChannelConversation`, `ChannelMessage` | HR/Admin/System theo scope | Được log nếu cần idempotency, chú ý nếu external id chứa PII. |

Rule bắt buộc:

- Chỉ HR/Admin có quyền mới xem PII theo application.
- Candidate chỉ xem dữ liệu form của chính token session, không xem dữ liệu nội bộ.
- Không log full CV content.
- Không log full form answer nếu không cần.
- Không log raw payload chứa PII ở level info/debug production.
- Mask email/phone trong log nếu không cần đầy đủ.
- Raw channel payload phải giới hạn quyền xem.
- AI prompt input chứa PII cần kiểm soát lưu trữ.
- Export dữ liệu PII nếu có phải có quyền và audit.
- Không gửi mapping/AI/HR decision chi tiết cho candidate.

## 10. Token security

| Token type | Rule |
| ---------- | ---- |
| JWT | Dùng cho HR/Admin/internal APIs; `JWT_SECRET` bắt buộc; không log JWT; expiry rõ ràng; route nội bộ phải dùng JWT/role guard phù hợp. |
| Form token | Random, khó đoán; lưu `tokenHash`, không lưu plain token; có `expiresAt`; chỉ dùng cho form access/submit; submit once; có thể revoke/cancel nếu cần; không dùng `interview_sessions.accessToken`. |
| Channel webhook token/signature | Dùng shared secret/signature nếu channel hỗ trợ; không log secret; rotate được nếu cần; reject request thiếu/sai credential. |
| Idempotency key | Không dùng làm auth token; dùng để chống retry tạo trùng; có TTL nếu lưu cache/DB; không cấp quyền truy cập tài nguyên. |
| Reset/reissue token | Resend form link có thể dùng token cũ nếu còn hạn hoặc rotate theo policy; nếu rotate, token cũ phải invalid; mọi rotate/revoke phải audit. |

Assumption:

- Candidate/Public không có account trong Phase 1 mặc định; public access dựa vào apply endpoint và form token.

## 11. Webhook security

| Security control | Nội dung |
| ---------------- | -------- |
| Signature verification | Verify signature nếu channel hỗ trợ. |
| Shared secret/token | Dùng shared secret/token nếu chưa có signature chuẩn. |
| Timestamp tolerance | Kiểm tra timestamp để chống replay nếu channel cung cấp. |
| IP allowlist | Áp dụng nếu channel có source IP ổn định hoặc documented range. |
| Idempotency theo external id | Dùng `channel + externalApplicationId` hoặc event id để tránh xử lý trùng. |
| Payload schema validation | Validate required fields, enum, size và nested payload trước khi xử lý. |
| Reject payload quá lớn | Giới hạn body size và attachment metadata. |
| Rate limit theo channel/source | Key theo channel + IP/source + external conversation/application id nếu có. |
| Không tự động trust file URL | File URL từ channel phải safe fetch, validate, quarantine và scan. |
| File từ webhook | Nếu có CV/file, download an toàn và đưa vào quarantine trước xử lý. |
| Raw payload PII | Hạn chế log/access, chỉ lưu khi cần audit/debug có kiểm soát. |
| Webhook failure response | Trả response an toàn, không leak internal error. |
| Audit rejected webhook | Ghi `CHANNEL_WEBHOOK_REJECTED` hoặc `WEBHOOK_SIGNATURE_INVALID`. |

| Webhook error | HTTP status | Error code |
| ------------- | ----------- | ---------- |
| Missing signature | `401` | `WEBHOOK_SIGNATURE_MISSING` |
| Invalid signature | `401` | `WEBHOOK_SIGNATURE_INVALID` |
| Replay detected | `409` | `WEBHOOK_REPLAY_DETECTED` |
| Payload invalid | `400` | `WEBHOOK_PAYLOAD_INVALID` |
| Rate limited | `429` | `RATE_LIMIT_EXCEEDED` |
| Duplicate external event | `200/409` | `WEBHOOK_DUPLICATE_EVENT` |

Ghi chú triển khai:

- Một số channel có thể chưa hỗ trợ signature chuẩn. Khi đó phải ghi rõ capability là `TBD / Need verification` và dùng fallback an toàn.
- Webhook không được tạo `Application` nếu payload không đủ job/candidate/apply context tối thiểu.

## 12. Error response security

Error response rule:

- Không leak stack trace.
- Không leak file path nội bộ.
- Không leak storage path.
- Không leak DB query.
- Không leak secret/env.
- Không leak raw token.
- Không leak whether email/phone exists nếu không cần.
- Không trả chi tiết signature expected/actual.
- Log internal error ở server; response public chỉ có message an toàn.

| Scenario | Public response | Internal log |
| -------- | --------------- | ------------ |
| Validation error | `400 VALIDATION_ERROR`, field message an toàn | Request id, safe validation summary, không log payload PII đầy đủ |
| Auth error | `401 UNAUTHORIZED` | Actor/request id, route, IP |
| Forbidden | `403 FORBIDDEN` | Actor id, object type/id, permission denied reason |
| File validation failed | `400 FILE_VALIDATION_FAILED` hoặc `UNSUPPORTED_FILE_TYPE` | MIME/extension/size summary, không log full path |
| Malware detected | `422 MALWARE_DETECTED` | `cvDocumentId`, scanner code, no file content |
| Scan failed/timeout | `500/503 CV_SCAN_FAILED` hoặc generic retry message | Scanner/provider code redacted, request id, no raw scanner log |
| Sanitize failed | Không trả qua upload API; nếu query/rerun thì `CV_SANITIZE_FAILED` an toàn | Ghostscript/container error redacted, no command/path/file content |
| Parse failed | Không trả qua upload API; nếu query/rerun thì `CV_PARSE_FAILED` an toàn | Parser code redacted, no stack trace/raw CV content |
| Token invalid/expired | `401/410 FORM_TOKEN_INVALID/FORM_TOKEN_EXPIRED` | token hash lookup result, IP, request id; không log raw token |
| Webhook invalid signature | `401 WEBHOOK_SIGNATURE_INVALID` | channel, request id, source IP; không log expected/actual secret |
| AI provider failed | `502/503 AI_PROVIDER_FAILED` hoặc `AI_SCREENING_FAILED` | provider code, timeout, request id; không log full prompt |
| Mapping failed | `500/422 MAPPING_FAILED` | mapping input ids, error code, request id |
| Storage error | `500 STORAGE_ERROR` | storage operation, object key redacted/masked, request id |
| DB error | `500 INTERNAL_ERROR` | internal DB error with request id in server log only |

Candidate-facing email hoặc public response không được chứa Ghostscript error, parser stack trace, scanner raw log, container timeout detail, storage path hoặc tên malware cụ thể nếu không cần thiết.

Ví dụ error response an toàn:

```json
{
  "success": false,
  "error": {
    "code": "FORM_TOKEN_EXPIRED",
    "message": "Liên kết biểu mẫu đã hết hạn."
  },
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-06-18T10:00:00.000Z"
  }
}
```

## 13. Data access rule theo module

| Module | Sensitive data | Access rule |
| ------ | -------------- | ----------- |
| `applications` | Candidate/application status, source, decision context | HR/Admin theo scope; Candidate/Public không xem internal detail. |
| `candidates` | Email, phone, full name, parsed profile | HR/Admin theo scope; Interviewer chỉ nếu được phân quyền rõ. |
| `cv-documents` | Original/clean CV metadata, hashes, storage refs | Raw/original chỉ internal scanner/sanitizer hoặc Admin/security special audit; clean CV HR/Admin theo permission. |
| `cv-sanitization` | Quarantine file, scanner result, clean artifact | Internal system task; HR chỉ xem status, không xem quarantine path/file. |
| `mapping` | Mapping score, gaps, recommendation | HR/Admin xem result; Candidate/Public không xem. |
| `form-sessions` | Token hash, expiry, status, recipient | Public token chỉ xem/submit form; HR/Admin quản trị; không expose token hash. |
| `form-answers` | Câu trả lời candidate | HR/Admin theo application; Candidate chỉ submit/xem tối thiểu nếu token còn hợp lệ. |
| `ai-screening` | AI prompt input, raw result, score/recommendation | HR/Admin xem; Candidate/Public không xem; raw result access-controlled. |
| `hr-review` | HR decision, comment, reason | HR/Admin thao tác; Candidate/Public không xem decision nội bộ. |
| `channel-publishing` | Channel account config, publish payload/status | Admin/HR publish; config credential Admin/authorized HR only. |
| `channel-ingestion` | Raw payload, external ids, imported PII | System/Webhook ingest; HR/Admin xem có kiểm soát; raw payload hạn chế quyền. |
| `bot-conversations` | Candidate messages, external conversation id | HR/Admin theo channel/job/application; bot chỉ dùng allowed knowledge; Candidate chỉ qua channel hợp lệ. |
| `audit-logs` | Actor/action/security metadata, PII rút gọn | Admin hoặc HR có quyền phù hợp; không public; audit log immutable nghiệp vụ. |
| `workflow-state` | Application transition timeline | HR/Admin theo scope; System append; Candidate/Public không xem. |

## 14. Logging rule

| Log content | Có được log không? | Ghi chú |
| ----------- | ------------------ | ------- |
| Request id | Yes | Dùng correlation/tracing. |
| User id/actor id | Yes | Dùng audit/security trace. |
| Application id | Yes | Nên log để trace workflow. |
| Candidate email/phone | Mask hoặc chỉ khi cần | Ưu tiên mask ở app log; audit metadata chỉ lưu khi thực sự cần. |
| CV content | No | Không log raw/clean CV content. |
| Original CV path | No trong public/app log thông thường | Chỉ internal secure log nếu cần và có redaction. |
| Clean CV path | Hạn chế | Ưu tiên `cvDocumentId`, không log full storage path. |
| Token plain text | No | Không log form token/JWT/id token. |
| JWT | No | Không log header Authorization đầy đủ. |
| Webhook secret/signature raw | No | Không log shared secret hoặc signature raw. |
| AI prompt full | Không nên log production | Prompt có thể chứa PII/form answer/CV text. |
| AI raw response | Hạn chế | Nếu lưu thì access-controlled, không public. |
| Stack trace | Internal only | Không trả ra response; server log cần requestId. |
| Error code | Yes | Dùng cho support/audit. |
| External id | Yes nếu cần | Cẩn thận nếu external id chứa PII. |

## 15. Production note

| Production area | Note |
| --------------- | ---- |
| Migration | Dùng TypeORM migration; không dùng `synchronize=true` cho staging/production; migration phải có `up/down`; kiểm tra migration path/config đang lệch ở baseline. |
| Env / Secret | `JWT_SECRET` bắt buộc; AI API key, SMTP credential, channel credential phải ở env/secret manager; không commit `.env`; không log secret; credential cần rotation policy nếu production. |
| Storage permission | Quarantine storage và safe storage tách quyền; raw CV không public; clean CV access qua API/signed URL có TTL; service account chỉ có quyền cần thiết; backup/encryption nếu production yêu cầu. |
| Network / CORS | CORS theo `FRONTEND_URL`, không mở wildcard production; public endpoints có rate limit; webhook endpoint chỉ nhận từ nguồn hợp lệ nếu có thể. |
| AI / External provider | Không gửi original CV; chỉ gửi dữ liệu tối thiểu; có timeout/retry; không log prompt chứa PII. |
| Monitoring | Log lỗi kỹ thuật; alert malware detected, webhook invalid spike, rate limit spike, AI provider failure, storage failure; có audit log retention. |
| Database | Index cho audit/workflow/application status; PII access cần kiểm soát; có backup/restore policy. |

## 16. Compatibility với source hiện tại

| Source hiện tại | Compatibility / Action |
| --------------- | ---------------------- |
| `auth`, JWT, role guard, Google OAuth | Reuse làm nền cho HR/Admin/internal API; cần authorization matrix Phase 1 rõ hơn. |
| Global `ThrottlerGuard` | Có sẵn nhưng public Phase 1 endpoints cần throttle riêng thấp hơn. |
| Helmet/CORS/ValidationPipe | Reuse; production cần CORS origin rõ theo `FRONTEND_URL`. |
| Runtime `synchronize=true` | Rủi ro production; Phase 1 production phải migration-first. |
| Upload route `/api/uploads/:filename` | Hiện role-gated nhưng chưa check ownership theo application/candidate; không dùng để expose original CV; clean CV nên có endpoint application-owned. |
| Quarantine/safe CV storage | Chưa có; Phase 1 cần tách boundary trước khi dùng CV cho parse/mapping/AI/HR Review. |
| Audit log chính thức | Chưa có; anti-cheat events không thay thế audit log recruitment. |
| Anti-cheat events | Giữ cho interview/session; không dùng làm audit log chung. |
| Telegram notification scheduler | Chỉ là interview reminder, chưa phải notification/security audit platform. |
| AI JSON parse cơ bản | Cần schema validation cho mapping/AI screening, không chỉ `JSON.parse`. |
| `sessions/evaluations/export/submissions` | Không sửa mạnh; giữ workflow interview hiện tại ổn định. |

## 17. Conflict / Assumption

| Vấn đề | File liên quan | Cách xử lý |
| ------ | -------------- | ---------- |
| Role hiện tại chỉ có `ADMIN`, `INTERVIEWER`, `HR`; có cần thêm `RECRUITER` không | `backend-specification.md`, `00_source_baseline_analysis.md` | Default: không thêm role mới ngoài `ADMIN`, `HR`, `INTERVIEWER`, `Candidate/Public`; nếu cần `RECRUITER` thì là decision sau. |
| Candidate/Public có tài khoản không hay chỉ dùng token | Business flow, form spec, API contract | Default: Candidate không có account, chỉ dùng public apply/form token. |
| HR có được xem original CV trong trường hợp đặc biệt không | CV processing spec, HR review spec | Default: HR Review không xem original CV; Admin/security access đặc biệt nếu có phải audit. |
| Clean CV access dùng API streaming hay signed URL | API contract, CV processing spec | Assumption: có thể dùng API streaming hoặc signed URL TTL, nhưng bắt buộc permission check. |
| Form token expiry mặc định là bao lâu | Form spec, API contract | Assumption: token có expiry và submit once; default cụ thể như `3 ngày` hoặc configurable sẽ chốt khi implement. |
| Có dùng CAPTCHA cho public apply không | Architecture/business/API security notes | Assumption: public apply cần rate limit và có thể bổ sung CAPTCHA khi expose internet. |
| Webhook có signature/IP allowlist được không với từng channel | Channel spec | Assumption: webhook capability/signature cần xác minh theo từng channel; nếu không có, dùng shared secret/token và fallback phù hợp. |
| Audit log lưu bao lâu | Chưa chốt trong source docs | Assumption: audit log lưu trong PostgreSQL ở Phase 1, retention chốt theo policy production; có thể tách log store later. |
| Có mask email/phone trong audit/log không | Baseline security, PII requirement | Assumption: app log mask mặc định; audit metadata chỉ lưu đầy đủ khi cần và có quyền xem. |
| Có cần encryption at rest cho CV/PII không | Production note chưa chốt | Assumption: cần đánh giá theo production policy; storage/DB encryption nên bật nếu hạ tầng hỗ trợ. |
| Có dùng Redis cho rate limit/token/lock không | Architecture spec, baseline | Assumption: Redis optional; có thể dùng PostgreSQL trước cho Phase 1, Redis tốt hơn cho rate limit/lock/token cache. |

Không phát hiện conflict ảnh hưởng trực tiếp đến Security and Audit Log specification ở mức specification. Các điểm còn mở được ghi nhận là assumption để xử lý khi implement thực tế.

## 18. Kết luận

Security Phase 1 cần bảo vệ các điểm public như apply, form token và channel webhook; tách rõ CV gốc quarantine với clean CV; kiểm soát quyền truy cập PII; không leak thông tin nội bộ qua error/log; và ghi audit đầy đủ cho upload, sanitize, mapping, form, AI, HR decision và channel publishing. Production cần dùng migration rõ ràng, quản lý secret/storage permission an toàn và không dựa vào synchronize=true.
