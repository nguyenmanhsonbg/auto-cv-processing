# 07. API Contract Specification

## 1. Mục tiêu tài liệu

Tài liệu này mô tả API contract đề xuất cho Recruitment Phase 1 của hệ thống Interview Assistant / VCS Recruitment.

Phạm vi của tài liệu:

- Chuẩn hóa convention API cho các module Phase 1.
- Xác định endpoint, method, auth, role, request, response và lỗi chính.
- Làm cơ sở để triển khai controller, service, DTO và test ở các bước sau.
- Bảo toàn các API hiện có của hệ thống phỏng vấn, đánh giá, export và submission.
- Đặt `Application` làm trung tâm nghiệp vụ tuyển dụng Phase 1.

Tài liệu này không phải là implementation code. Tài liệu không định nghĩa Swagger decorator, migration, entity, service hoặc controller cụ thể.

Các nguyên tắc nền:

- `Candidate` chỉ là hồ sơ định danh hoặc profile ứng viên, không phải trung tâm workflow Phase 1.
- `Application` là hồ sơ ứng tuyển vào một `JobPosting` cụ thể và là trục của CV, Mapping, Form, AI Screening, HR Review, Audit và Timeline.
- Mapping CV-JD là năng lực nội bộ của backend, không được mô tả như external service/API độc lập.
- Public pre-screening form không sử dụng `interview_sessions.accessToken`.
- Các API hiện tại như sessions, evaluations, export và submissions giữ nguyên để phục vụ workflow phỏng vấn hiện hữu.

## 2. API convention

| Nhóm | Convention |
| --- | --- |
| Base prefix | `/api` |
| Versioning | Phase 1 tiếp tục dùng `/api`; `/api/v1` có thể được thêm ở giai đoạn sau nếu cần versioning chính thức |
| Format mặc định | `application/json` |
| Upload CV | `multipart/form-data` |
| Auth nội bộ | `Authorization: Bearer <jwt>` |
| Public apply | Không yêu cầu JWT, bắt buộc rate limit, chống duplicate và khuyến nghị captcha |
| Public form | Không yêu cầu JWT, dùng token riêng của `FormSession`, không dùng `interview_sessions.accessToken` |
| Webhook channel | Dùng chữ ký hoặc shared secret, ví dụ `X-Webhook-Signature` |
| Request trace | Hỗ trợ `X-Request-Id` |
| Idempotency | Hỗ trợ `Idempotency-Key` cho các API có side effect hoặc retry |
| Pagination | `page`, `limit` |
| Filtering | Query params theo từng resource |
| Sorting | `sortBy`, `sortOrder` với `ASC` hoặc `DESC` |
| Error format | Dùng common error envelope ở mục 5 |

Role sử dụng trong tài liệu:

| Role | Ý nghĩa |
| --- | --- |
| `ADMIN` | Quản trị hệ thống, cấu hình, override và toàn quyền nghiệp vụ |
| `HR` | Nhân sự tuyển dụng, vận hành JD, job posting, review application |
| `INTERVIEWER` | Người phỏng vấn, giữ vai trò trong workflow phỏng vấn hiện hữu |
| `SYSTEM` | Luồng tự động nội bộ, worker, scheduler, webhook handler sau khi xác thực |
| `PUBLIC` | Người dùng không đăng nhập, ví dụ ứng viên apply hoặc mở form bằng token |

Quy ước trạng thái nghiệp vụ chính:

| Nhóm | Enum đề xuất |
| --- | --- |
| JD | `JD_DRAFT`, `JD_READY`, `JD_ARCHIVED` |
| Job Posting | `DRAFT`, `PUBLISHED`, `CLOSED`, `ARCHIVED` |
| Channel publish | `PENDING`, `PUBLISHED`, `FAILED`, `MANUAL_REQUIRED`, `CLOSED` |
| Application | `APPLICATION_CREATED`, `CV_UPLOADED`, `CV_STORED_QUARANTINE`, `CV_SCAN_REQUESTED`, `CV_SCAN_PASSED`, `CV_SCAN_FAILED`, `CV_REJECTED_MALWARE`, `CV_SANITIZING`, `CV_SANITIZED`, `CV_SANITIZE_FAILED`, `CV_PARSED`, `CV_PARSE_FAILED`, `MAPPING_REQUESTED`, `MAPPING_DONE`, `MAPPING_REJECTED`, `FORM_SENT`, `FORM_OPENED`, `FORM_SUBMITTED`, `AI_SCREENING_REQUESTED`, `AI_SCREENING_DONE`, `WAITING_HR_REVIEW`, `HR_APPROVED`, `HR_REJECTED`, `TALENT_POOL` |
| Form session | `CREATED`, `SENT`, `OPENED`, `SUBMITTED`, `EXPIRED`, `CANCELLED` |
| HR decision | `APPROVE`, `REJECT`, `REQUEST_MORE_INFO`, `MOVE_TO_TALENT_POOL` |

## 3. Auth / Role matrix

| API group | `ADMIN` | `HR` | `INTERVIEWER` | `SYSTEM` | `PUBLIC` | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| JD APIs | Full | Create/update/read | No | No | No | JD là dữ liệu nội bộ tuyển dụng |
| Job Posting APIs | Full | Create/update/publish/close theo quyền | No | No | Read public endpoint only | Public chỉ đọc job posting đã publish |
| Channel APIs | Full | Publish/import/conversation theo quyền | No | Webhook/import worker | Webhook không phải public tự do | Webhook phải xác thực chữ ký |
| Apply APIs | View through application | Manual apply nếu cần | No | Import từ channel | Submit apply | Public apply phải rate limit và idempotent |
| Application APIs | Full | Read/update theo quyền | No | State update nội bộ | No | Application là workflow center |
| CV APIs | Full | Read/upload lại/sanitize/rerun theo quyền | No | Sanitize/parse worker | Upload qua apply | Original CV không expose trực tiếp |
| Mapping APIs | Full | Run/rerun theo quyền | No | Auto run/rerun | No | Mapping là module nội bộ backend |
| Form APIs | Full | Create/resend/read theo quyền | No | Auto create/send | Access token form | Token form riêng, không dùng session token |
| AI Screening APIs | Full | Run/rerun/read theo quyền | No | Auto run/rerun | No | Chỉ chạy sau khi form đủ điều kiện |
| HR Review APIs | Full | Review/approve/reject/request info | No | No | No | Kết quả HR là quyết định nghiệp vụ |
| Audit / Timeline APIs | Full | Read theo quyền | No | Write events | No | Audit immutable, timeline phục vụ đọc nhanh |

Endpoint public phải luôn có:

- Rate limit theo IP, email, phone và job posting.
- Chống duplicate bằng business key.
- `Idempotency-Key` cho thao tác submit/retry.
- Không trả dữ liệu nội bộ như score chi tiết, prompt, audit hoặc CV file gốc.

## 4. Common response format

Phase 1 đề xuất dùng response envelope thống nhất cho API mới. Các API hiện tại có thể chưa dùng envelope này và được giữ tương thích ở mục 20.

Response thành công cho single resource:

```json
{
  "success": true,
  "data": {
    "id": "app_01JZ9F8P4R2V6M1E9K7T3A0B5C"
  },
  "meta": {
    "requestId": "req_20260618_000001",
    "timestamp": "2026-06-18T09:00:00.000Z"
  }
}
```

Response thành công cho list:

```json
{
  "success": true,
  "data": [
    {
      "id": "app_01JZ9F8P4R2V6M1E9K7T3A0B5C"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 135,
    "totalPages": 7
  },
  "meta": {
    "requestId": "req_20260618_000002",
    "timestamp": "2026-06-18T09:00:00.000Z"
  }
}
```

Response cho command có side effect:

```json
{
  "success": true,
  "data": {
    "accepted": true,
    "applicationId": "app_01JZ9F8P4R2V6M1E9K7T3A0B5C",
    "nextStatus": "MAPPING_PENDING"
  },
  "meta": {
    "requestId": "req_20260618_000003",
    "idempotencyKey": "apply_20260618_email_hash",
    "timestamp": "2026-06-18T09:00:00.000Z"
  }
}
```

## 5. Common error format

Common error response:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request payload is invalid.",
    "details": [
      {
        "field": "email",
        "message": "email must be a valid email address"
      }
    ]
  },
  "meta": {
    "requestId": "req_20260618_000004",
    "timestamp": "2026-06-18T09:00:00.000Z"
  }
}
```

Common error codes:

| Error code | HTTP status | Khi xảy ra |
| --- | --- | --- |
| `VALIDATION_ERROR` | `400` | Payload, query hoặc path param không hợp lệ |
| `UNAUTHORIZED` | `401` | Thiếu hoặc sai JWT/token |
| `FORBIDDEN` | `403` | Role không đủ quyền |
| `NOT_FOUND` | `404` | Resource không tồn tại hoặc không được phép thấy |
| `DUPLICATE_APPLICATION` | `409` | Ứng viên đã apply cùng job posting |
| `UPLOAD_RATE_LIMIT_EXCEEDED` | `429` | Upload/apply vượt giới hạn |
| `UNSUPPORTED_FILE_TYPE` | `400` | File CV không đúng định dạng |
| `FILE_TOO_LARGE` | `400` hoặc `413` | File vượt dung lượng cho phép |
| `MALWARE_DETECTED` | `422` | File bị phát hiện rủi ro bảo mật |
| `CV_SCAN_FAILED` | `500` hoặc `503` | Scanner lỗi/timeout kỹ thuật, chưa xác nhận CV an toàn |
| `CV_SANITIZE_FAILED` | `500` hoặc `422` | Không sanitize được CV |
| `CV_PARSE_FAILED` | `500` hoặc `422` | Không parse được clean CV hoặc text rỗng |
| `MAPPING_FAILED` | `500` hoặc `422` | Mapping CV-JD lỗi kỹ thuật hoặc input không đủ |
| `MAPPING_REJECTED` | `422` hoặc `200` với business status | Mapping chạy thành công nhưng ứng viên dưới ngưỡng |
| `FORM_TOKEN_INVALID` | `401` hoặc `404` | Token form không hợp lệ |
| `FORM_TOKEN_EXPIRED` | `410` | Token form hết hạn |
| `FORM_ALREADY_SUBMITTED` | `409` | Form đã submit trước đó |
| `AI_SCREENING_FAILED` | `500` hoặc `422` | AI Screening lỗi kỹ thuật hoặc input không đủ |
| `INVALID_STATE_TRANSITION` | `409` | Trạng thái không cho phép action hiện tại |
| `CHANNEL_PUBLISH_FAILED` | `502` hoặc `422` | Publish channel thất bại |
| `WEBHOOK_SIGNATURE_INVALID` | `401` | Chữ ký webhook không hợp lệ |

## 6. Pagination / Filtering / Sorting

Query convention:

| Param | Kiểu | Mặc định | Ghi chú |
| --- | --- | --- | --- |
| `page` | number | `1` | Bắt đầu từ 1 |
| `limit` | number | `20` | Khuyến nghị giới hạn tối đa `100` |
| `search` | string | none | Tìm theo text tùy resource |
| `status` | string | none | Lọc theo trạng thái |
| `sourceChannel` | string | none | Lọc theo nguồn ứng tuyển |
| `jobPostingId` | string | none | Lọc theo job posting |
| `candidateId` | string | none | Lọc theo candidate |
| `sortBy` | string | `createdAt` | Field được allowlist theo từng resource |
| `sortOrder` | `ASC` hoặc `DESC` | `DESC` | Thứ tự sort |

Ví dụ:

```http
GET /api/applications?page=1&limit=20&status=WAITING_HR_REVIEW&sourceChannel=TOPCV&sortBy=createdAt&sortOrder=DESC
```

Response list phải trả `pagination.total` và `pagination.totalPages` để UI có thể render paging ổn định.

## 7. JD APIs

JD API quản lý mô tả công việc và version JD. JD version là snapshot dùng cho mapping và screening để đảm bảo kết quả không bị thay đổi khi JD được chỉnh sửa sau này.

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/job-descriptions` | `ADMIN`, `HR` | Danh sách JD |
| `POST` | `/api/job-descriptions` | `ADMIN`, `HR` | Tạo JD draft |
| `GET` | `/api/job-descriptions/:id` | `ADMIN`, `HR` | Chi tiết JD |
| `PUT` | `/api/job-descriptions/:id` | `ADMIN`, `HR` | Cập nhật JD draft |
| `POST` | `/api/job-descriptions/:id/versions` | `ADMIN`, `HR` | Tạo version snapshot |
| `GET` | `/api/job-descriptions/:id/versions` | `ADMIN`, `HR` | Danh sách version của JD |
| `POST` | `/api/job-descriptions/:id/mark-ready` | `ADMIN`, `HR` | Đánh dấu JD sẵn sàng publish |

Tạo JD:

```http
POST /api/job-descriptions
Content-Type: application/json
Authorization: Bearer <jwt>
```

```json
{
  "title": "Backend Developer",
  "positionId": "pos_backend_developer",
  "levelId": "level_senior",
  "description": "Phát triển và vận hành các backend service cho hệ thống tuyển dụng.",
  "requirements": {
    "skills": ["Java", "Spring Boot", "PostgreSQL"],
    "experienceYears": 3,
    "languages": ["English"]
  },
  "benefits": {
    "salaryRange": "2000-3000 USD",
    "workingMode": "HYBRID"
  }
}
```

```json
{
  "success": true,
  "data": {
    "id": "jd_01JZ9FA3CK8D7M1NW9S2P3Q4AA",
    "title": "Backend Developer",
    "status": "JD_DRAFT",
    "createdById": "user_hr_001",
    "createdAt": "2026-06-18T09:05:00.000Z"
  },
  "meta": {
    "requestId": "req_20260618_010001",
    "timestamp": "2026-06-18T09:05:00.000Z"
  }
}
```

Tạo JD version:

```http
POST /api/job-descriptions/:id/versions
Content-Type: application/json
Authorization: Bearer <jwt>
```

```json
{
  "changeNote": "Chốt JD để publish Phase 1",
  "effectiveFrom": "2026-06-18T00:00:00.000Z"
}
```

```json
{
  "success": true,
  "data": {
    "jobDescriptionId": "jd_01JZ9FA3CK8D7M1NW9S2P3Q4AA",
    "jobDescriptionVersionId": "jdv_01JZ9FB5HT8S4VDWR6W1Q7P8BC",
    "versionNo": 1,
    "snapshot": {
      "title": "Backend Developer",
      "requirements": {
        "skills": ["Java", "Spring Boot", "PostgreSQL"],
        "experienceYears": 3
      }
    },
    "createdAt": "2026-06-18T09:08:00.000Z"
  },
  "meta": {
    "requestId": "req_20260618_010002",
    "timestamp": "2026-06-18T09:08:00.000Z"
  }
}
```

Mark ready:

```http
POST /api/job-descriptions/:id/mark-ready
Authorization: Bearer <jwt>
```

```json
{
  "success": true,
  "data": {
    "id": "jd_01JZ9FA3CK8D7M1NW9S2P3Q4AA",
    "status": "JD_READY",
    "readyAt": "2026-06-18T09:10:00.000Z"
  },
  "meta": {
    "requestId": "req_20260618_010003",
    "timestamp": "2026-06-18T09:10:00.000Z"
  }
}
```

Lỗi chính:

| Case | Error code |
| --- | --- |
| Tạo JD thiếu title, position hoặc requirements | `VALIDATION_ERROR` |
| Mark ready khi chưa có version hợp lệ | `INVALID_STATE_TRANSITION` |
| JD không tồn tại | `NOT_FOUND` |

## 8. Job Posting APIs

Job Posting là tin tuyển dụng được publish từ một JD version cụ thể. Một JD có thể có nhiều Job Posting, nhưng một Job Posting phải gắn với đúng một `jobDescriptionVersionId` tại thời điểm publish.

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/job-postings` | `ADMIN`, `HR` | Danh sách job posting |
| `POST` | `/api/job-postings` | `ADMIN`, `HR` | Tạo job posting |
| `GET` | `/api/job-postings/:id` | `ADMIN`, `HR` | Chi tiết nội bộ |
| `PUT` | `/api/job-postings/:id` | `ADMIN`, `HR` | Cập nhật job posting chưa đóng |
| `POST` | `/api/job-postings/:id/publish` | `ADMIN`, `HR` | Publish job posting |
| `POST` | `/api/job-postings/:id/close` | `ADMIN`, `HR` | Đóng job posting |
| `GET` | `/api/job-postings/:id/channels` | `ADMIN`, `HR` | Trạng thái publish theo channel |
| `GET` | `/api/public/job-postings/:slug` | `PUBLIC` | Chi tiết public cho Candidate Apply UI/VCS Portal |

Tạo job posting:

```http
POST /api/job-postings
Content-Type: application/json
Authorization: Bearer <jwt>
```

```json
{
  "jobDescriptionId": "jd_01JZ9FA3CK8D7M1NW9S2P3Q4AA",
  "jobDescriptionVersionId": "jdv_01JZ9FB5HT8S4VDWR6W1Q7P8BC",
  "title": "Senior Backend Developer",
  "openAt": "2026-06-20T02:00:00.000Z",
  "closeAt": "2026-07-20T16:59:59.000Z",
  "channels": ["VCS_PORTAL", "FACEBOOK", "LINKEDIN"]
}
```

```json
{
  "success": true,
  "data": {
    "jobPostingId": "jp_01JZ9FD6Y1EHCB9N5AE2T5P6DD",
    "jobDescriptionId": "jd_01JZ9FA3CK8D7M1NW9S2P3Q4AA",
    "jobDescriptionVersionId": "jdv_01JZ9FB5HT8S4VDWR6W1Q7P8BC",
    "title": "Senior Backend Developer",
    "status": "DRAFT",
    "publicSlug": "senior-backend-developer-202606",
    "createdAt": "2026-06-18T09:15:00.000Z"
  },
  "meta": {
    "requestId": "req_20260618_020001",
    "timestamp": "2026-06-18T09:15:00.000Z"
  }
}
```

Publish job posting:

```http
POST /api/job-postings/:id/publish
Content-Type: application/json
Authorization: Bearer <jwt>
```

```json
{
  "publishChannels": ["VCS_PORTAL", "FACEBOOK"],
  "publishNote": "Mở tuyển đợt tháng 06/2026"
}
```

```json
{
  "success": true,
  "data": {
    "jobPostingId": "jp_01JZ9FD6Y1EHCB9N5AE2T5P6DD",
    "status": "PUBLISHED",
    "publicUrl": "https://careers.vcs.local/jobs/senior-backend-developer-202606",
    "channels": [
      {
        "channel": "VCS_PORTAL",
        "status": "PUBLISHED"
      },
      {
        "channel": "FACEBOOK",
        "status": "PENDING"
      }
    ]
  },
  "meta": {
    "requestId": "req_20260618_020002",
    "timestamp": "2026-06-18T09:20:00.000Z"
  }
}
```

Public detail:

```http
GET /api/public/job-postings/senior-backend-developer-202606
```

```json
{
  "success": true,
  "data": {
    "jobPostingId": "jp_01JZ9FD6Y1EHCB9N5AE2T5P6DD",
    "title": "Senior Backend Developer",
    "status": "PUBLISHED",
    "description": "Phát triển và vận hành các backend service cho hệ thống tuyển dụng.",
    "requirements": {
      "skills": ["Java", "Spring Boot", "PostgreSQL"],
      "experienceYears": 3
    },
    "openAt": "2026-06-20T02:00:00.000Z",
    "closeAt": "2026-07-20T16:59:59.000Z",
    "applyUrl": "/api/public/job-postings/jp_01JZ9FD6Y1EHCB9N5AE2T5P6DD/apply"
  },
  "meta": {
    "requestId": "req_20260618_020003",
    "timestamp": "2026-06-18T09:21:00.000Z"
  }
}
```

Lỗi chính:

| Case | Error code |
| --- | --- |
| Tạo job posting từ JD chưa `JD_READY` | `INVALID_STATE_TRANSITION` |
| `publicSlug` trùng | `VALIDATION_ERROR` |
| Publish khi thiếu JD version | `INVALID_STATE_TRANSITION` |
| Public đọc job posting chưa publish hoặc đã archive | `NOT_FOUND` |

## 9. Channel APIs

Channel API quản lý tài khoản kênh tuyển dụng, publish tin, import application và hội thoại kênh. Channel không sở hữu workflow ứng tuyển. Mọi ứng viên từ channel sau khi import phải quy về `Application`.

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/channel-accounts` | `ADMIN`, `HR` | Danh sách account/channel config |
| `POST` | `/api/channel-accounts` | `ADMIN` | Tạo channel account |
| `PUT` | `/api/channel-accounts/:id` | `ADMIN` | Cập nhật channel account |
| `POST` | `/api/job-postings/:id/channels/:channel/publish` | `ADMIN`, `HR` | Publish một job posting lên một channel |
| `GET` | `/api/job-postings/:id/channels/:channel/status` | `ADMIN`, `HR` | Lấy trạng thái publish của channel |
| `POST` | `/api/channels/:channel/webhook` | `SYSTEM` | Webhook nhận event từ channel |
| `POST` | `/api/channels/:channel/import-applications` | `ADMIN`, `HR`, `SYSTEM` | Import application từ channel |
| `GET` | `/api/channels/:channel/import-jobs` | `ADMIN`, `HR` | Danh sách batch import |
| `GET` | `/api/channel-conversations` | `ADMIN`, `HR` | Danh sách hội thoại từ channel |
| `GET` | `/api/channel-conversations/:id` | `ADMIN`, `HR` | Chi tiết hội thoại |
| `POST` | `/api/channel-conversations/:id/reply` | `ADMIN`, `HR` | Reply qua channel nếu supported |
| `POST` | `/api/channel-conversations/:id/handoff-hr` | `ADMIN`, `HR` | Chuyển hội thoại cho HR xử lý |

Publish lên channel:

```http
POST /api/job-postings/:id/channels/FACEBOOK/publish
Content-Type: application/json
Authorization: Bearer <jwt>
Idempotency-Key: publish_fb_jp_01JZ9FD6
```

```json
{
  "messageTemplate": "Chúng tôi đang tuyển Senior Backend Developer.",
  "targetPageId": "fb_page_vcs_recruitment",
  "publishNow": true
}
```

```json
{
  "success": true,
  "data": {
    "jobPostingId": "jp_01JZ9FD6Y1EHCB9N5AE2T5P6DD",
    "channel": "FACEBOOK",
    "status": "PUBLISHED",
    "publishedUrl": "https://facebook.com/vcs/jobs/123456",
    "externalPostingId": "fb_post_123456",
    "publishedAt": "2026-06-18T09:30:00.000Z"
  },
  "meta": {
    "requestId": "req_20260618_030001",
    "idempotencyKey": "publish_fb_jp_01JZ9FD6",
    "timestamp": "2026-06-18T09:30:00.000Z"
  }
}
```

Channel không hỗ trợ API publish tự động:

```json
{
  "success": true,
  "data": {
    "jobPostingId": "jp_01JZ9FD6Y1EHCB9N5AE2T5P6DD",
    "channel": "TOPCV",
    "status": "MANUAL_REQUIRED",
    "manualInstruction": "TOPCV chưa có API publish trong Phase 1. HR cần đăng thủ công và nhập externalPostingId sau khi đăng."
  },
  "meta": {
    "requestId": "req_20260618_030002",
    "timestamp": "2026-06-18T09:32:00.000Z"
  }
}
```

Webhook:

```http
POST /api/channels/FACEBOOK/webhook
Content-Type: application/json
X-Webhook-Signature: sha256=<signature>
```

```json
{
  "eventType": "APPLICATION_CREATED",
  "externalPostingId": "fb_post_123456",
  "externalApplicationId": "fb_app_987654",
  "candidate": {
    "fullName": "Nguyen Van A",
    "email": "a@example.com",
    "phone": "0900000000"
  },
  "cvUrl": "https://facebook.example/cv/file.pdf",
  "createdAt": "2026-06-18T09:35:00.000Z"
}
```

```json
{
  "success": true,
  "data": {
    "accepted": true,
    "channel": "FACEBOOK",
    "externalApplicationId": "fb_app_987654",
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT"
  },
  "meta": {
    "requestId": "req_20260618_030003",
    "timestamp": "2026-06-18T09:35:01.000Z"
  }
}
```

Lỗi chính:

| Case | Error code |
| --- | --- |
| Channel webhook sai chữ ký | `WEBHOOK_SIGNATURE_INVALID` |
| Publish thất bại do channel external lỗi | `CHANNEL_PUBLISH_FAILED` |
| Channel không hỗ trợ API | Trả `MANUAL_REQUIRED` trong business status |
| Import application bị duplicate | `DUPLICATE_APPLICATION` hoặc trả application hiện có với idempotent response |

## 10. Apply APIs

Apply API nhận ứng tuyển từ ứng viên hoặc nguồn public. Endpoint chính cho public apply là `/api/public/job-postings/:jobPostingId/apply`.

Endpoint `/api/job-postings/:jobPostingId/apply` chỉ nên được xem là internal/legacy alias nếu cần tương thích sau này. Contract Phase 1 ưu tiên endpoint public có namespace rõ ràng.

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/api/public/job-postings/:jobPostingId/apply` | `PUBLIC` | Ứng viên apply vào job posting |
| `POST` | `/api/job-postings/:jobPostingId/apply` | `PUBLIC` hoặc alias nội bộ | Không khuyến nghị làm endpoint chính |

Content type:

```http
Content-Type: multipart/form-data
Idempotency-Key: apply_jp_01JZ9FD6_email_hash_001
```

Fields:

| Field | Required | Kiểu | Ghi chú |
| --- | --- | --- | --- |
| `fullName` | Yes | string | Họ tên ứng viên |
| `email` | Yes | string | Dùng cho duplicate check |
| `phone` | Optional | string | Dùng thêm cho duplicate check |
| `cvFile` | Yes | file | PDF/DOC/DOCX theo whitelist |
| `sourceChannel` | Yes | string | Ví dụ `VCS_PORTAL`, `FACEBOOK`, `LINKEDIN`, `TOPCV` |
| `externalApplicationId` | Optional | string | ID từ channel nếu có |
| `idempotencyKey` | Optional | string | Có thể truyền trong body nếu client không dùng header |

Request dạng multipart:

```http
POST /api/public/job-postings/jp_01JZ9FD6Y1EHCB9N5AE2T5P6DD/apply
Content-Type: multipart/form-data
Idempotency-Key: apply_20260618_a@example.com_jp_01JZ9FD6
```

```json
{
  "fullName": "Nguyen Van A",
  "email": "a@example.com",
  "phone": "0900000000",
  "cvFile": "<binary>",
  "sourceChannel": "VCS_PORTAL",
  "externalApplicationId": null,
  "idempotencyKey": "apply_20260618_a@example.com_jp_01JZ9FD6"
}
```

Response thành công:

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "candidateId": "cand_01JZ9FGHTR2PKQWE75BM3N0R8D",
    "jobPostingId": "jp_01JZ9FD6Y1EHCB9N5AE2T5P6DD",
    "status": "CV_SCAN_PASSED",
    "processingStatus": "ACCEPTED",
    "cvDocumentId": "cv_01JZ9FJ0BEVW3V3Q57BXP4XM6N",
    "nextStep": "CV_SANITIZE_PENDING",
    "message": "CV upload accepted. Sanitization and parsing will continue asynchronously."
  },
  "meta": {
    "requestId": "req_20260618_040001",
    "idempotencyKey": "apply_20260618_a@example.com_jp_01JZ9FD6",
    "timestamp": "2026-06-18T09:40:00.000Z"
  }
}
```

Response duplicate nhưng cùng idempotency key:

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "duplicate": true,
    "status": "CV_SCAN_PASSED",
    "message": "Application already exists for this job posting."
  },
  "meta": {
    "requestId": "req_20260618_040002",
    "idempotencyKey": "apply_20260618_a@example.com_jp_01JZ9FD6",
    "timestamp": "2026-06-18T09:40:10.000Z"
  }
}
```

Response duplicate khác idempotency key:

```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_APPLICATION",
    "message": "Candidate has already applied to this job posting.",
    "details": [
      {
        "field": "email",
        "message": "An application already exists for this email and job posting."
      }
    ]
  },
  "meta": {
    "requestId": "req_20260618_040003",
    "timestamp": "2026-06-18T09:40:20.000Z"
  }
}
```

Lỗi chính:

| Case | Error code |
| --- | --- |
| Job posting đã đóng | `INVALID_STATE_TRANSITION` |
| Email không hợp lệ | `VALIDATION_ERROR` |
| File quá lớn | `FILE_TOO_LARGE` |
| File không được hỗ trợ | `UNSUPPORTED_FILE_TYPE` |
| Upload vượt rate limit | `UPLOAD_RATE_LIMIT_EXCEEDED` |
| File có dấu hiệu malware | `MALWARE_DETECTED` |
| Scan lỗi/timeout kỹ thuật | `CV_SCAN_FAILED` |
| Ứng viên apply trùng | `DUPLICATE_APPLICATION` |

Ghi chú CV processing của public apply:

- API validate file, lưu original CV vào quarantine, tính `original_file_hash` và chạy malware scan đồng bộ trước khi trả response.
- Nếu malware detected, API trả `422 MALWARE_DETECTED` trực tiếp và không enqueue sanitize/parse/mapping.
- Nếu scan pass, API trả accepted/processing như response thành công ở trên; sanitize/parse chạy async và không nằm trong response upload.
- Response public không trả scanner log, storage path, internal path, stack trace, container command, Ghostscript error hoặc parser detail.

## 11. Application APIs

Application API là nhóm API đọc và quản lý hồ sơ ứng tuyển. Đây là trung tâm workflow Phase 1.

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/applications` | `ADMIN`, `HR` | Danh sách application |
| `GET` | `/api/applications/:id` | `ADMIN`, `HR` | Chi tiết application |
| `PATCH` | `/api/applications/:id/status` | `ADMIN`, `SYSTEM` | Override trạng thái có kiểm soát |
| `GET` | `/api/applications/:id/timeline` | `ADMIN`, `HR` | Timeline nghiệp vụ |
| `GET` | `/api/applications/:id/audit-logs` | `ADMIN`, `HR` | Audit log |

Query list:

```http
GET /api/applications?page=1&limit=20&status=WAITING_HR_REVIEW&sourceChannel=TOPCV&sortBy=createdAt&sortOrder=DESC
Authorization: Bearer <jwt>
```

Response list:

```json
{
  "success": true,
  "data": [
    {
      "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
      "candidate": {
        "candidateId": "cand_01JZ9FGHTR2PKQWE75BM3N0R8D",
        "fullName": "Nguyen Van A",
        "email": "a@example.com",
        "phone": "0900000000"
      },
      "jobPosting": {
        "jobPostingId": "jp_01JZ9FD6Y1EHCB9N5AE2T5P6DD",
        "title": "Senior Backend Developer"
      },
      "status": "WAITING_HR_REVIEW",
      "sourceChannel": "TOPCV",
      "mappingScore": 82,
      "aiScreeningScore": 78,
      "createdAt": "2026-06-18T09:40:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req_20260618_050001",
    "timestamp": "2026-06-18T09:50:00.000Z"
  }
}
```

Chi tiết application:

```http
GET /api/applications/app_01JZ9FGHY8DWB6A4H1K8E5Q9TT
Authorization: Bearer <jwt>
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "status": "WAITING_HR_REVIEW",
    "sourceChannel": "TOPCV",
    "candidate": {
      "candidateId": "cand_01JZ9FGHTR2PKQWE75BM3N0R8D",
      "fullName": "Nguyen Van A",
      "email": "a@example.com",
      "phone": "0900000000"
    },
    "jobPosting": {
      "jobPostingId": "jp_01JZ9FD6Y1EHCB9N5AE2T5P6DD",
      "title": "Senior Backend Developer",
      "jobDescriptionVersionId": "jdv_01JZ9FB5HT8S4VDWR6W1Q7P8BC"
    },
    "cv": {
      "currentCvDocumentId": "cv_01JZ9FJ0BEVW3V3Q57BXP4XM6N",
      "sanitizeStatus": "SUCCESS",
      "parseStatus": "SUCCESS"
    },
    "mapping": {
      "mappingResultId": "map_01JZ9FK9Z2N7Q8ABZ0PR7G5V8D",
      "score": 82,
      "status": "PASSED"
    },
    "form": {
      "formSessionId": "form_01JZ9FMA4TB9AKHHM2A7MY0D9C",
      "status": "SUBMITTED"
    },
    "aiScreening": {
      "aiScreeningResultId": "ais_01JZ9FPPH5XQ4BEVA52W5V1AEE",
      "score": 78,
      "recommendation": "HR_REVIEW"
    },
    "createdAt": "2026-06-18T09:40:00.000Z",
    "updatedAt": "2026-06-18T10:10:00.000Z"
  },
  "meta": {
    "requestId": "req_20260618_050002",
    "timestamp": "2026-06-18T10:12:00.000Z"
  }
}
```

Override status:

```http
PATCH /api/applications/:id/status
Content-Type: application/json
Authorization: Bearer <jwt>
```

```json
{
  "status": "WAITING_HR_REVIEW",
  "reason": "Manual recovery after AI Screening retry."
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "previousStatus": "AI_SCREENING_DONE",
    "status": "WAITING_HR_REVIEW"
  },
  "meta": {
    "requestId": "req_20260618_050003",
    "timestamp": "2026-06-18T10:14:00.000Z"
  }
}
```

Ghi chú:

- `PATCH /api/applications/:id/status` chỉ dành cho `ADMIN` hoặc `SYSTEM` recovery, không thay thế các action domain như HR approve/reject.
- Mọi thay đổi trạng thái phải ghi `ApplicationTimeline` và `ApplicationAuditLog`.
- Transition sai phải trả `INVALID_STATE_TRANSITION`.

## 12. CV APIs

CV API quản lý document CV theo application. Original CV cần được lưu và xử lý theo chính sách bảo mật, nhưng public/internal download nên dùng bản clean/sanitized. Không expose trực tiếp original CV qua `/api/uploads/:filename`.

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/api/applications/:applicationId/cv` | `ADMIN`, `HR` | Upload lại CV thủ công cho application |
| `GET` | `/api/applications/:applicationId/cv` | `ADMIN`, `HR` | Danh sách CV document của application |
| `GET` | `/api/applications/:applicationId/cv/:cvDocumentId` | `ADMIN`, `HR` | Metadata CV document |
| `POST` | `/api/applications/:applicationId/cv/:cvDocumentId/sanitize` | `ADMIN`, `HR`, `SYSTEM` | Sanitize CV |
| `POST` | `/api/applications/:applicationId/cv/:cvDocumentId/parse` | `ADMIN`, `HR`, `SYSTEM` | Parse clean CV thành profile |
| `GET` | `/api/applications/:applicationId/parsed-profile` | `ADMIN`, `HR` | Parsed profile hiện tại |
| `GET` | `/api/applications/:applicationId/cv/:cvDocumentId/clean-file` | `ADMIN`, `HR` | Download clean CV |

Upload CV thủ công:

```http
POST /api/applications/app_01JZ9FGHY8DWB6A4H1K8E5Q9TT/cv
Content-Type: multipart/form-data
Authorization: Bearer <jwt>
Idempotency-Key: cv_upload_app_01JZ9FGH_hash_001
```

```json
{
  "cvFile": "<binary>",
  "replaceCurrent": true,
  "reason": "Candidate provided updated CV via HR email."
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "cvDocumentId": "cv_01JZ9FQAZJCGWGYZK2TGMJX0H8",
    "fileName": "nguyen-van-a-cv.pdf",
    "fileType": "application/pdf",
    "fileSize": 845120,
    "status": "CV_SCAN_PASSED",
    "processingStatus": "ACCEPTED",
    "nextStep": "CV_SANITIZE_PENDING",
    "message": "CV upload accepted. Sanitization and parsing will continue asynchronously."
  },
  "meta": {
    "requestId": "req_20260618_060001",
    "idempotencyKey": "cv_upload_app_01JZ9FGH_hash_001",
    "timestamp": "2026-06-18T10:20:00.000Z"
  }
}
```

Sanitize CV:

```http
POST /api/applications/:applicationId/cv/:cvDocumentId/sanitize
Content-Type: application/json
Authorization: Bearer <jwt>
Idempotency-Key: sanitize_cv_01JZ9FQAZJ_hash_001
```

```json
{
  "force": false
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "cvDocumentId": "cv_01JZ9FQAZJCGWGYZK2TGMJX0H8",
    "sanitizeStatus": "SUCCESS",
    "cleanFileId": "clean_01JZ9FR6G3Y96W9VQW8M3N0JAK",
    "nextStatus": "CV_SANITIZED"
  },
  "meta": {
    "requestId": "req_20260618_060002",
    "idempotencyKey": "sanitize_cv_01JZ9FQAZJ_hash_001",
    "timestamp": "2026-06-18T10:22:00.000Z"
  }
}
```

Parse CV:

```http
POST /api/applications/:applicationId/cv/:cvDocumentId/parse
Content-Type: application/json
Authorization: Bearer <jwt>
```

```json
{
  "parserMode": "DEFAULT"
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "parsedProfileId": "profile_01JZ9FSWZQ1D8D6AABRDVNQ7K1",
    "status": "CV_PARSED",
    "profile": {
      "skills": ["Java", "Spring Boot", "PostgreSQL"],
      "experienceYears": 4,
      "education": ["Bachelor of Computer Science"]
    }
  },
  "meta": {
    "requestId": "req_20260618_060003",
    "timestamp": "2026-06-18T10:24:00.000Z"
  }
}
```

Lỗi chính:

| Case | Error code |
| --- | --- |
| Upload file quá lớn | `FILE_TOO_LARGE` |
| File không đúng định dạng | `UNSUPPORTED_FILE_TYPE` |
| Malware detected | `MALWARE_DETECTED` |
| Scan lỗi/timeout kỹ thuật | `CV_SCAN_FAILED` |
| Sanitize thất bại | `CV_SANITIZE_FAILED` |
| Parse thất bại | `CV_PARSE_FAILED` |
| Parse khi chưa có clean CV | `INVALID_STATE_TRANSITION` |
| Application không tồn tại | `NOT_FOUND` |

Ghi chú:

- Manual upload API cũng chạy malware scan đồng bộ trong request.
- Nếu scan pass, sanitize/parse chạy async; endpoint upload không chờ Ghostscript/parse/mapping.
- `POST /sanitize` và `POST /parse` là internal/admin/worker trigger hoặc rerun API có guard/state check, không phải bước public caller phải chờ ngay trong upload.

## 13. Mapping APIs

Mapping API chạy matching giữa clean CV/parsed profile và JD version của application. Đây là module nội bộ backend, không phải external API/service độc lập.

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/api/applications/:applicationId/mapping/run` | `ADMIN`, `HR`, `SYSTEM` | Chạy mapping |
| `GET` | `/api/applications/:applicationId/mapping-result` | `ADMIN`, `HR` | Lấy mapping result hiện tại |
| `POST` | `/api/applications/:applicationId/mapping/rerun` | `ADMIN`, `HR`, `SYSTEM` | Chạy lại mapping có audit |

Run mapping:

```http
POST /api/applications/app_01JZ9FGHY8DWB6A4H1K8E5Q9TT/mapping/run
Content-Type: application/json
Authorization: Bearer <jwt>
Idempotency-Key: mapping_app_01JZ9FGH_cv_01JZ9FQAZJ_jdv_01JZ9FB5
```

```json
{
  "mode": "AUTO",
  "threshold": 70,
  "reason": "Auto run after CV parsed."
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "mappingResultId": "map_01JZ9FK9Z2N7Q8ABZ0PR7G5V8D",
    "status": "PASSED",
    "score": 82,
    "threshold": 70,
    "nextStatus": "FORM_SENT",
    "summary": {
      "matchedSkills": ["Java", "Spring Boot", "PostgreSQL"],
      "missingSkills": ["Kafka"],
      "experienceMatch": "MATCHED"
    }
  },
  "meta": {
    "requestId": "req_20260618_070001",
    "idempotencyKey": "mapping_app_01JZ9FGH_cv_01JZ9FQAZJ_jdv_01JZ9FB5",
    "timestamp": "2026-06-18T10:30:00.000Z"
  }
}
```

Mapping rejected:

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "mappingResultId": "map_01JZ9FTQQZ5SAVAJ3VEK5B0W34",
    "status": "REJECTED",
    "score": 45,
    "threshold": 70,
    "nextStatus": "MAPPING_REJECTED",
    "summary": {
      "matchedSkills": ["PostgreSQL"],
      "missingSkills": ["Java", "Spring Boot"],
      "experienceMatch": "BELOW_REQUIREMENT"
    }
  },
  "meta": {
    "requestId": "req_20260618_070002",
    "timestamp": "2026-06-18T10:31:00.000Z"
  }
}
```

Get mapping result:

```http
GET /api/applications/:applicationId/mapping-result
Authorization: Bearer <jwt>
```

```json
{
  "success": true,
  "data": {
    "mappingResultId": "map_01JZ9FK9Z2N7Q8ABZ0PR7G5V8D",
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "jobDescriptionVersionId": "jdv_01JZ9FB5HT8S4VDWR6W1Q7P8BC",
    "cvDocumentId": "cv_01JZ9FQAZJCGWGYZK2TGMJX0H8",
    "score": 82,
    "status": "PASSED",
    "createdAt": "2026-06-18T10:30:00.000Z"
  },
  "meta": {
    "requestId": "req_20260618_070003",
    "timestamp": "2026-06-18T10:32:00.000Z"
  }
}
```

Rerun mapping:

```http
POST /api/applications/:applicationId/mapping/rerun
Content-Type: application/json
Authorization: Bearer <jwt>
Idempotency-Key: mapping_rerun_app_01JZ9FGH_002
```

```json
{
  "reason": "HR adjusted mapping threshold after JD clarification.",
  "threshold": 75
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "previousMappingResultId": "map_01JZ9FK9Z2N7Q8ABZ0PR7G5V8D",
    "mappingResultId": "map_01JZ9FV5DY6H4ATX4D5QCQR6N8",
    "score": 80,
    "status": "PASSED"
  },
  "meta": {
    "requestId": "req_20260618_070004",
    "idempotencyKey": "mapping_rerun_app_01JZ9FGH_002",
    "timestamp": "2026-06-18T10:35:00.000Z"
  }
}
```

Lỗi chính:

| Case | Error code |
| --- | --- |
| Chưa có clean CV hoặc parsed profile | `INVALID_STATE_TRANSITION` |
| Không có JD version snapshot | `MAPPING_FAILED` |
| Mapping lỗi kỹ thuật | `MAPPING_FAILED` |
| Mapping dưới threshold | `MAPPING_REJECTED` hoặc business status `REJECTED` |
| Rerun không có reason | `VALIDATION_ERROR` |

## 14. Form APIs

Form API quản lý pre-screening form. Token form là token riêng của `FormSession`, không sử dụng `interview_sessions.accessToken` của workflow phỏng vấn hiện có.

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/api/applications/:applicationId/form-sessions` | `ADMIN`, `HR`, `SYSTEM` | Tạo form session cho application |
| `GET` | `/api/forms/access/:token` | `PUBLIC` | Ứng viên mở form bằng token |
| `POST` | `/api/forms/access/:token/answers` | `PUBLIC` | Lưu câu trả lời nháp hoặc từng phần |
| `POST` | `/api/forms/access/:token/submit` | `PUBLIC` | Submit form |
| `POST` | `/api/forms/access/:token/opened` | `PUBLIC` | Ghi nhận ứng viên đã mở form |

Tạo form session:

```http
POST /api/applications/app_01JZ9FGHY8DWB6A4H1K8E5Q9TT/form-sessions
Content-Type: application/json
Authorization: Bearer <jwt>
Idempotency-Key: form_create_app_01JZ9FGH_qset_default
```

```json
{
  "questionSetId": "qset_backend_prescreening",
  "expiresAt": "2026-06-25T16:59:59.000Z",
  "delivery": {
    "email": true,
    "sms": false
  }
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "formSessionId": "form_01JZ9FMA4TB9AKHHM2A7MY0D9C",
    "status": "SENT",
    "accessUrl": "https://careers.vcs.local/forms/access/fs_tok_8f3d1c",
    "expiresAt": "2026-06-25T16:59:59.000Z"
  },
  "meta": {
    "requestId": "req_20260618_080001",
    "idempotencyKey": "form_create_app_01JZ9FGH_qset_default",
    "timestamp": "2026-06-18T10:40:00.000Z"
  }
}
```

Public access form:

```http
GET /api/forms/access/fs_tok_8f3d1c
```

```json
{
  "success": true,
  "data": {
    "formSessionId": "form_01JZ9FMA4TB9AKHHM2A7MY0D9C",
    "status": "SENT",
    "candidate": {
      "displayName": "Nguyen Van A"
    },
    "jobPosting": {
      "title": "Senior Backend Developer"
    },
    "questions": [
      {
        "questionId": "q_001",
        "type": "TEXT",
        "title": "Bạn có bao nhiêu năm kinh nghiệm với Java?",
        "required": true
      },
      {
        "questionId": "q_002",
        "type": "MULTI_CHOICE",
        "title": "Bạn đã từng làm việc với framework nào?",
        "required": true,
        "options": ["Spring Boot", "Quarkus", "Micronaut", "Khác"]
      }
    ],
    "expiresAt": "2026-06-25T16:59:59.000Z"
  },
  "meta": {
    "requestId": "req_20260618_080002",
    "timestamp": "2026-06-18T10:45:00.000Z"
  }
}
```

Lưu answers:

```http
POST /api/forms/access/fs_tok_8f3d1c/answers
Content-Type: application/json
```

```json
{
  "answers": [
    {
      "questionId": "q_001",
      "value": "4 năm"
    },
    {
      "questionId": "q_002",
      "value": ["Spring Boot"]
    }
  ]
}
```

```json
{
  "success": true,
  "data": {
    "formSessionId": "form_01JZ9FMA4TB9AKHHM2A7MY0D9C",
    "saved": true,
    "status": "OPENED",
    "updatedAt": "2026-06-18T10:48:00.000Z"
  },
  "meta": {
    "requestId": "req_20260618_080003",
    "timestamp": "2026-06-18T10:48:00.000Z"
  }
}
```

Submit form:

```http
POST /api/forms/access/fs_tok_8f3d1c/submit
Content-Type: application/json
Idempotency-Key: form_submit_form_01JZ9FMA_001
```

```json
{
  "answers": [
    {
      "questionId": "q_001",
      "value": "4 năm"
    },
    {
      "questionId": "q_002",
      "value": ["Spring Boot"]
    }
  ],
  "consent": true
}
```

```json
{
  "success": true,
  "data": {
    "formSessionId": "form_01JZ9FMA4TB9AKHHM2A7MY0D9C",
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "status": "SUBMITTED",
    "nextStatus": "AI_SCREENING_PENDING",
    "submittedAt": "2026-06-18T10:50:00.000Z"
  },
  "meta": {
    "requestId": "req_20260618_080004",
    "idempotencyKey": "form_submit_form_01JZ9FMA_001",
    "timestamp": "2026-06-18T10:50:00.000Z"
  }
}
```

Lỗi chính:

| Case | Error code |
| --- | --- |
| Token không hợp lệ | `FORM_TOKEN_INVALID` |
| Token hết hạn | `FORM_TOKEN_EXPIRED` |
| Form đã submit | `FORM_ALREADY_SUBMITTED` |
| Câu trả lời thiếu field required | `VALIDATION_ERROR` |
| Tạo form khi mapping chưa pass | `INVALID_STATE_TRANSITION` |

## 15. AI Screening APIs

AI Screening API tổng hợp JD version, clean CV/parsed profile, Mapping Result và Form Answer để tạo kết quả screening phục vụ HR Review. API chỉ nên chạy sau khi form đã submit hoặc khi có rule rõ ràng cho trường hợp bỏ qua form.

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| `POST` | `/api/applications/:applicationId/ai-screening/run` | `ADMIN`, `HR`, `SYSTEM` | Chạy AI Screening |
| `GET` | `/api/applications/:applicationId/ai-screening-result` | `ADMIN`, `HR` | Lấy AI Screening result hiện tại |
| `POST` | `/api/applications/:applicationId/ai-screening/rerun` | `ADMIN`, `HR`, `SYSTEM` | Chạy lại AI Screening có audit |

Run AI Screening:

```http
POST /api/applications/app_01JZ9FGHY8DWB6A4H1K8E5Q9TT/ai-screening/run
Content-Type: application/json
Authorization: Bearer <jwt>
Idempotency-Key: ai_screening_app_01JZ9FGH_map_01JZ9FK9_form_01JZ9FMA
```

```json
{
  "mode": "AUTO",
  "promptProfile": "phase1_default_screening",
  "reason": "Auto run after form submitted."
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "aiScreeningResultId": "ais_01JZ9FPPH5XQ4BEVA52W5V1AEE",
    "status": "COMPLETED",
    "score": 78,
    "recommendation": "HR_REVIEW",
    "summary": "Ứng viên phù hợp với yêu cầu backend, có kinh nghiệm Java/Spring Boot và trả lời form đạt mức tốt.",
    "riskFlags": [
      {
        "code": "MISSING_KAFKA",
        "severity": "LOW",
        "message": "Chưa thể hiện kinh nghiệm Kafka rõ ràng."
      }
    ],
    "nextStatus": "WAITING_HR_REVIEW"
  },
  "meta": {
    "requestId": "req_20260618_090001",
    "idempotencyKey": "ai_screening_app_01JZ9FGH_map_01JZ9FK9_form_01JZ9FMA",
    "timestamp": "2026-06-18T11:00:00.000Z"
  }
}
```

Get AI Screening result:

```http
GET /api/applications/:applicationId/ai-screening-result
Authorization: Bearer <jwt>
```

```json
{
  "success": true,
  "data": {
    "aiScreeningResultId": "ais_01JZ9FPPH5XQ4BEVA52W5V1AEE",
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "mappingResultId": "map_01JZ9FK9Z2N7Q8ABZ0PR7G5V8D",
    "formSessionId": "form_01JZ9FMA4TB9AKHHM2A7MY0D9C",
    "score": 78,
    "recommendation": "HR_REVIEW",
    "createdAt": "2026-06-18T11:00:00.000Z"
  },
  "meta": {
    "requestId": "req_20260618_090002",
    "timestamp": "2026-06-18T11:02:00.000Z"
  }
}
```

Rerun AI Screening:

```http
POST /api/applications/:applicationId/ai-screening/rerun
Content-Type: application/json
Authorization: Bearer <jwt>
Idempotency-Key: ai_screening_rerun_app_01JZ9FGH_002
```

```json
{
  "reason": "HR requested rerun after updated form answer review.",
  "promptProfile": "phase1_default_screening"
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "previousAiScreeningResultId": "ais_01JZ9FPPH5XQ4BEVA52W5V1AEE",
    "aiScreeningResultId": "ais_01JZ9FWVP9NQH3G8G66XQQ1NCJ",
    "score": 80,
    "recommendation": "HR_REVIEW"
  },
  "meta": {
    "requestId": "req_20260618_090003",
    "idempotencyKey": "ai_screening_rerun_app_01JZ9FGH_002",
    "timestamp": "2026-06-18T11:05:00.000Z"
  }
}
```

Lỗi chính:

| Case | Error code |
| --- | --- |
| Form chưa submit | `INVALID_STATE_TRANSITION` |
| Thiếu mapping result hợp lệ | `AI_SCREENING_FAILED` |
| Thiếu clean CV/parsed profile | `AI_SCREENING_FAILED` |
| AI provider hoặc model lỗi | `AI_SCREENING_FAILED` |
| Rerun không có reason | `VALIDATION_ERROR` |

## 16. HR Review APIs

HR Review API là bước HR đọc tổng hợp application và đưa ra quyết định. Đây là decision API của Phase 1. Việc tạo interview session hoặc tích hợp AMIS sau HR approve thuộc giai đoạn tiếp theo, không được tự động redesign trong tài liệu này.

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/hr/applications/waiting-review` | `ADMIN`, `HR` | Danh sách application chờ HR review |
| `GET` | `/api/hr/applications/:applicationId/review` | `ADMIN`, `HR` | Màn hình review tổng hợp |
| `POST` | `/api/hr/applications/:applicationId/approve` | `ADMIN`, `HR` | HR approve application |
| `POST` | `/api/hr/applications/:applicationId/reject` | `ADMIN`, `HR` | HR reject application |
| `POST` | `/api/hr/applications/:applicationId/request-more-info` | `ADMIN`, `HR` | Yêu cầu bổ sung thông tin |
| `POST` | `/api/hr/applications/:applicationId/talent-pool` | `ADMIN`, `HR` | Chuyển vào talent pool |

Waiting review:

```http
GET /api/hr/applications/waiting-review?page=1&limit=20&sortBy=aiScreeningScore&sortOrder=DESC
Authorization: Bearer <jwt>
```

```json
{
  "success": true,
  "data": [
    {
      "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
      "candidateName": "Nguyen Van A",
      "jobTitle": "Senior Backend Developer",
      "sourceChannel": "TOPCV",
      "mappingScore": 82,
      "aiScreeningScore": 78,
      "recommendation": "HR_REVIEW",
      "submittedAt": "2026-06-18T10:50:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req_20260618_100001",
    "timestamp": "2026-06-18T11:10:00.000Z"
  }
}
```

Review detail:

```http
GET /api/hr/applications/app_01JZ9FGHY8DWB6A4H1K8E5Q9TT/review
Authorization: Bearer <jwt>
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "status": "WAITING_HR_REVIEW",
    "candidate": {
      "fullName": "Nguyen Van A",
      "email": "a@example.com",
      "phone": "0900000000"
    },
    "jobPosting": {
      "title": "Senior Backend Developer",
      "jobDescriptionVersionId": "jdv_01JZ9FB5HT8S4VDWR6W1Q7P8BC"
    },
    "cv": {
      "cleanFileUrl": "/api/applications/app_01JZ9FGHY8DWB6A4H1K8E5Q9TT/cv/cv_01JZ9FQAZJCGWGYZK2TGMJX0H8/clean-file",
      "parsedProfile": {
        "skills": ["Java", "Spring Boot", "PostgreSQL"],
        "experienceYears": 4
      }
    },
    "mapping": {
      "score": 82,
      "status": "PASSED",
      "matchedSkills": ["Java", "Spring Boot", "PostgreSQL"],
      "missingSkills": ["Kafka"]
    },
    "form": {
      "status": "SUBMITTED",
      "answers": [
        {
          "question": "Bạn có bao nhiêu năm kinh nghiệm với Java?",
          "answer": "4 năm"
        }
      ]
    },
    "aiScreening": {
      "score": 78,
      "recommendation": "HR_REVIEW",
      "summary": "Ứng viên phù hợp với yêu cầu backend."
    }
  },
  "meta": {
    "requestId": "req_20260618_100002",
    "timestamp": "2026-06-18T11:12:00.000Z"
  }
}
```

Approve:

```http
POST /api/hr/applications/:applicationId/approve
Content-Type: application/json
Authorization: Bearer <jwt>
```

```json
{
  "note": "Phù hợp để chuyển sang vòng phỏng vấn kỹ thuật.",
  "nextAction": "CREATE_INTERVIEW_SESSION_LATER"
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "decision": "APPROVE",
    "previousStatus": "WAITING_HR_REVIEW",
    "status": "HR_APPROVED",
    "decidedById": "user_hr_001",
    "decidedAt": "2026-06-18T11:15:00.000Z"
  },
  "meta": {
    "requestId": "req_20260618_100003",
    "timestamp": "2026-06-18T11:15:00.000Z"
  }
}
```

Reject:

```http
POST /api/hr/applications/:applicationId/reject
Content-Type: application/json
Authorization: Bearer <jwt>
```

```json
{
  "reasonCode": "SKILL_MISMATCH",
  "note": "Chưa đáp ứng yêu cầu Java/Spring Boot cho vị trí hiện tại.",
  "sendCandidateEmail": false
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "decision": "REJECT",
    "previousStatus": "WAITING_HR_REVIEW",
    "status": "HR_REJECTED",
    "decidedById": "user_hr_001",
    "decidedAt": "2026-06-18T11:18:00.000Z"
  },
  "meta": {
    "requestId": "req_20260618_100004",
    "timestamp": "2026-06-18T11:18:00.000Z"
  }
}
```

Request more information:

```http
POST /api/hr/applications/:applicationId/request-more-info
Content-Type: application/json
Authorization: Bearer <jwt>
```

```json
{
  "message": "Vui lòng bổ sung thêm thông tin về kinh nghiệm triển khai Spring Boot production.",
  "dueAt": "2026-06-22T16:59:59.000Z"
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "decision": "REQUEST_MORE_INFO",
    "status": "FORM_SENT",
    "messageSent": true
  },
  "meta": {
    "requestId": "req_20260618_100005",
    "timestamp": "2026-06-18T11:20:00.000Z"
  }
}
```

Move to talent pool:

```http
POST /api/hr/applications/:applicationId/talent-pool
Content-Type: application/json
Authorization: Bearer <jwt>
```

```json
{
  "reason": "Phù hợp với vị trí backend khác trong tương lai.",
  "tags": ["backend", "java", "future-opening"]
}
```

```json
{
  "success": true,
  "data": {
    "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
    "decision": "MOVE_TO_TALENT_POOL",
    "previousStatus": "WAITING_HR_REVIEW",
    "status": "TALENT_POOL"
  },
  "meta": {
    "requestId": "req_20260618_100006",
    "timestamp": "2026-06-18T11:22:00.000Z"
  }
}
```

Lỗi chính:

| Case | Error code |
| --- | --- |
| Review application chưa tới trạng thái `WAITING_HR_REVIEW` | `INVALID_STATE_TRANSITION` |
| HR quyết định lại trên trạng thái terminal | `INVALID_STATE_TRANSITION` |
| Thiếu reason khi reject | `VALIDATION_ERROR` |
| Không đủ quyền review application | `FORBIDDEN` |

## 17. Audit / Timeline APIs

Timeline dùng để hiển thị luồng nghiệp vụ theo thứ tự thời gian. Audit log dùng để truy vết thay đổi, actor, payload rút gọn và lý do.

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/applications/:applicationId/timeline` | `ADMIN`, `HR` | Timeline nghiệp vụ |
| `GET` | `/api/applications/:applicationId/audit-logs` | `ADMIN`, `HR` | Audit log chi tiết |

Timeline:

```http
GET /api/applications/app_01JZ9FGHY8DWB6A4H1K8E5Q9TT/timeline
Authorization: Bearer <jwt>
```

```json
{
  "success": true,
  "data": [
    {
      "eventType": "APPLICATION_CREATED",
      "status": "CV_UPLOADED",
      "actorType": "PUBLIC",
      "message": "Candidate applied from VCS_PORTAL.",
      "createdAt": "2026-06-18T09:40:00.000Z"
    },
    {
      "eventType": "CV_SANITIZED",
      "status": "CV_SANITIZED",
      "actorType": "SYSTEM",
      "message": "CV sanitized successfully.",
      "createdAt": "2026-06-18T10:22:00.000Z"
    },
    {
      "eventType": "HR_DECISION_APPROVE",
      "status": "HR_APPROVED",
      "actorType": "HR",
      "actorId": "user_hr_001",
      "message": "HR approved application.",
      "createdAt": "2026-06-18T11:15:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req_20260618_110001",
    "timestamp": "2026-06-18T11:25:00.000Z"
  }
}
```

Audit logs:

```http
GET /api/applications/app_01JZ9FGHY8DWB6A4H1K8E5Q9TT/audit-logs?page=1&limit=20
Authorization: Bearer <jwt>
```

```json
{
  "success": true,
  "data": [
    {
      "auditLogId": "audit_01JZ9G0R3D94PP9Z5ZBGXMVTJ2",
      "applicationId": "app_01JZ9FGHY8DWB6A4H1K8E5Q9TT",
      "action": "MAPPING_RERUN",
      "actorType": "HR",
      "actorId": "user_hr_001",
      "reason": "HR adjusted mapping threshold after JD clarification.",
      "metadata": {
        "previousMappingResultId": "map_01JZ9FK9Z2N7Q8ABZ0PR7G5V8D",
        "newMappingResultId": "map_01JZ9FV5DY6H4ATX4D5QCQR6N8"
      },
      "createdAt": "2026-06-18T10:35:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req_20260618_110002",
    "timestamp": "2026-06-18T11:26:00.000Z"
  }
}
```

Ghi chú:

- Audit log không được sửa hoặc xóa bằng API nghiệp vụ thông thường.
- Payload audit nên được rút gọn, tránh lưu CV content, prompt đầy đủ hoặc dữ liệu nhạy cảm không cần thiết.
- Timeline có thể được dựng từ audit/event hoặc lưu bảng riêng tùy migration plan.

## 18. Error cases

| Scenario | API liên quan | HTTP status | Error code | Ghi chú xử lý |
| --- | --- | --- | --- | --- |
| Validation error khi tạo JD | `POST /api/job-descriptions` | `400` | `VALIDATION_ERROR` | Trả field-level details |
| Validation error khi apply | `POST /api/public/job-postings/:jobPostingId/apply` | `400` | `VALIDATION_ERROR` | Kiểm tra email, file, consent nếu có |
| Duplicate application | Apply/import channel | `409` | `DUPLICATE_APPLICATION` | Nếu cùng `Idempotency-Key`, trả lại response thành công trước đó |
| Upload limit exceeded | Apply/CV upload | `429` | `UPLOAD_RATE_LIMIT_EXCEEDED` | Rate limit theo IP/email/job |
| Job posting closed | Apply | `409` | `INVALID_STATE_TRANSITION` | Không cho apply vào posting đã đóng |
| Unsupported file type | Apply/CV upload | `400` | `UNSUPPORTED_FILE_TYPE` | Chỉ nhận định dạng whitelist |
| File too large | Apply/CV upload | `400` hoặc `413` | `FILE_TOO_LARGE` | Theo limit cấu hình |
| Malware detected | CV upload/scan | `422` | `MALWARE_DETECTED` | Trả trực tiếp trong upload request; không tiếp tục sanitize/parse/mapping |
| CV scan failed/timeout | CV upload/scan | `500` hoặc `503` | `CV_SCAN_FAILED` | Lỗi kỹ thuật, có thể retry/manual review; không coi là malware |
| CV sanitize failed | CV sanitize async | `500` hoặc `422` | `CV_SANITIZE_FAILED` | Có thể retry nếu lỗi kỹ thuật; không parse nếu chưa có clean CV |
| CV parse failed | CV parse async | `500` hoặc `422` | `CV_PARSE_FAILED` | Retry/manual review/email upload lại theo nguyên nhân; không mapping tự động |
| Mapping failed | Mapping run/rerun | `500` hoặc `422` | `MAPPING_FAILED` | Ghi audit và không chuyển sang form |
| Mapping rejected below threshold | Mapping run | `200` hoặc `422` | `MAPPING_REJECTED` | Ưu tiên `200` với business status `REJECTED` nếu thuật toán chạy thành công |
| Form token invalid | Form public access | `401` hoặc `404` | `FORM_TOKEN_INVALID` | Không leak application tồn tại hay không |
| Form token expired | Form public access/submit | `410` | `FORM_TOKEN_EXPIRED` | Có thể cho HR tạo lại session |
| Form already submitted | Form submit | `409` | `FORM_ALREADY_SUBMITTED` | Nếu cùng idempotency key, trả response cũ |
| AI Screening failed | AI run/rerun | `500` hoặc `422` | `AI_SCREENING_FAILED` | Ghi audit và cho phép retry |
| HR review invalid state | HR approve/reject | `409` | `INVALID_STATE_TRANSITION` | Không cho quyết định khi chưa `WAITING_HR_REVIEW` hoặc đã terminal |
| Channel publish failed | Channel publish | `502` hoặc `422` | `CHANNEL_PUBLISH_FAILED` | Lưu trạng thái `FAILED` hoặc `MANUAL_REQUIRED` |
| Webhook signature invalid | Channel webhook | `401` | `WEBHOOK_SIGNATURE_INVALID` | Không xử lý payload |

## 19. Idempotency / Retry API rule

Các API có side effect phải hỗ trợ retry an toàn. Khuyến nghị nhận `Idempotency-Key` ở header. Nếu client public không gửi header được, có thể nhận thêm `idempotencyKey` trong body, nhưng header vẫn là ưu tiên.

| API/action | Idempotency key logic | Retry rule |
| --- | --- | --- |
| Apply public | `jobPostingId + email/phone + Idempotency-Key` | Cùng key trả lại response cũ; khác key nhưng duplicate trả `DUPLICATE_APPLICATION` |
| CV upload | `applicationId + originalFileHash` | File giống nhau không tạo document trùng nếu chưa cần version mới |
| CV sanitize | `cvDocumentId + originalFileHash` | Cùng input trả clean file hiện có |
| CV parse | `cvDocumentId + cleanFileHash` | Cùng clean file trả parsed profile hiện có |
| Mapping run | `applicationId + cleanCvDocumentId + jobDescriptionVersionId` | Cùng input trả mapping result hiện tại |
| Mapping rerun | `applicationId + cleanCvDocumentId + jobDescriptionVersionId + Idempotency-Key` | Rerun phải có reason và ghi audit |
| Form session create/send | `applicationId + questionSetId + active session` | Không tạo nhiều active session cùng lúc nếu chưa expire/cancel |
| Form answer save | `formSessionId + token + questionId` | Ghi đè draft answer mới nhất |
| Form submit | `formSessionId + token + submittedAt/status` | Submit một lần; cùng key trả response cũ |
| AI Screening run | `applicationId + mappingResultId + formSessionId` | Cùng input trả result hiện tại |
| AI Screening rerun | `applicationId + mappingResultId + formSessionId + Idempotency-Key` | Rerun phải có reason và ghi audit |
| HR Review decision | `applicationId + terminal decision` | Không retry tạo decision khác trên trạng thái terminal |
| Channel publish | `jobPostingId + channel + Idempotency-Key` | Cùng key trả publish result/batch cũ |
| Channel webhook import | `channel + externalApplicationId` | Import duplicate trả application hiện có hoặc bỏ qua có audit |

Quy tắc lỗi retry:

| HTTP status | Retry client | Ghi chú |
| --- | --- | --- |
| `400` | No | Client sửa payload |
| `401`/`403` | No | Cần auth/role đúng |
| `409` | Có điều kiện | Chỉ retry nếu cùng idempotency key hoặc sau khi state hợp lệ |
| `410` | No | Token hết hạn |
| `422` | Có điều kiện | Retry nếu lỗi kỹ thuật có thể khắc phục input |
| `429` | Yes | Retry sau `Retry-After` |
| `500`/`502`/`503` | Yes | Retry với cùng `Idempotency-Key` |

## 20. Compatibility với API hiện tại

Các API hiện hữu không bị redesign trong Phase 1. API mới cần tích hợp theo hướng mở rộng module, không phá vỡ contract đang có.

| API hiện tại | Hướng compatibility |
| --- | --- |
| `/api/auth/*` | Reuse cơ chế login, `me`, user management và JWT hiện có |
| `/api/candidates/*` | Có thể reuse dữ liệu candidate/profile, nhưng không dùng Candidate làm workflow center của Phase 1 |
| `/api/uploads/:filename` | Giữ cho use case hiện tại; không dùng để expose original CV Phase 1. Clean CV nên đi qua endpoint application-owned |
| `/api/questions` | Reuse ngân hàng câu hỏi nếu phù hợp cho pre-screening form |
| `/api/categories` | Reuse taxonomy hiện có nếu form/question cần phân loại |
| `/api/sub-categories` | Reuse taxonomy phụ nếu cần |
| `/api/positions` | Reuse danh mục vị trí cho JD |
| `/api/levels` | Reuse danh mục level cho JD |
| `/api/sessions/*` | Giữ nguyên workflow interview session hiện tại. Không dùng `interview_sessions.accessToken` cho pre-screening form |
| `/api/evaluations/*` | Giữ nguyên cho workflow đánh giá phỏng vấn |
| `/api/export/:sessionId` | Giữ nguyên cho export theo interview session |
| `/api/submissions/*` | Giữ nguyên cho submission hiện tại |
| `/api/ai-prompts/*` | Có thể reuse cấu hình prompt cho AI Screening nếu phù hợp |
| `/api/ai-model-overrides/*` | Có thể reuse cấu hình model override cho AI Screening nếu phù hợp |

Các API Phase 1 nên được thêm theo namespace mới:

- `/api/job-descriptions`
- `/api/job-postings`
- `/api/channel-accounts`
- `/api/channels`
- `/api/channel-conversations`
- `/api/public/job-postings`
- `/api/applications`
- `/api/forms/access`
- `/api/hr/applications`

Không nên đổi tên hoặc thay đổi behavior của API hiện hữu nếu không có migration compatibility rõ ràng.

## 21. Conflict / Assumption

| Chủ đề | Quyết định / assumption |
| --- | --- |
| Public apply path | Chọn `/api/public/job-postings/:jobPostingId/apply` làm endpoint chính vì rõ ràng là public. `/api/job-postings/:jobPostingId/apply` chỉ là alias nếu cần tương thích |
| API versioning | Giữ `/api` theo backend hiện tại. Chưa thêm `/api/v1` trong Phase 1 |
| Application workflow center | `Application` là trung tâm workflow. `Candidate` chỉ là identity/profile |
| Mapping CV-JD | Mapping là module nội bộ backend, không mô tả như external service/API |
| Form token | Pre-screening form dùng token riêng của `FormSession`, không dùng `interview_sessions.accessToken` |
| `PATCH /api/applications/:id/status` | Chỉ dành cho `ADMIN` hoặc `SYSTEM` override/recovery. HR dùng các action domain như approve/reject/request-more-info |
| Mapping rerun | Cho phép `ADMIN`, `HR`, `SYSTEM` nếu có quyền và reason. Mọi rerun phải audit |
| AI Screening rerun | Cho phép `ADMIN`, `HR`, `SYSTEM` nếu có quyền và reason. Mọi rerun phải audit |
| Channel không có API publish | Trả business status `MANUAL_REQUIRED`, không coi là lỗi hệ thống |
| AMIS | Không nằm trong API contract Phase 1. Nếu cần, sẽ là integration phase sau HR approve |
| Clean CV access | Dùng endpoint theo application/CV document. Không dùng `/api/uploads/:filename` để expose original CV |
| Response envelope | API mới nên dùng envelope thống nhất. API cũ giữ format hiện tại cho compatibility |

Không ghi nhận xung đột cần thay đổi source code trong phạm vi tài liệu này.

## 22. Kết luận

API contract Phase 1 mở rộng backend hiện tại theo hướng lấy `Application` làm trung tâm, bao quanh bởi JD, Job Posting, Channel, Apply, CV, Mapping, Form, AI Screening, HR Review, Audit và Timeline.

Contract này giữ nguyên các API phỏng vấn hiện hữu, tránh trộn pre-screening form với interview session token, và định nghĩa rõ ranh giới giữa public API, HR/Admin API và system/webhook API.

Tài liệu này có thể được dùng làm đầu vào cho bước tiếp theo: thiết kế DTO, controller, service, authorization guard, integration test và Swagger documentation cho Recruitment Phase 1.
