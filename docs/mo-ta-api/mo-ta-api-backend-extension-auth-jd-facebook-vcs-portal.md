# Mô tả API Backend/Extension/VCS Portal

Ngày rà soát: 2026-07-15

Tài liệu này được tổng hợp từ source backend NestJS trong `apps/backend/src`. Backend local dùng global prefix `/api`, ví dụ `http://localhost:3002/api`.

## Quy ước chung

- Các API nội bộ yêu cầu JWT dùng header `Authorization: Bearer <accessToken>`.
- API extension AMIS/VCS Portal yêu cầu role `ADMIN` hoặc `HR`, trừ `GET /api/extension/amis/careers` cho phép thêm `INTERVIEWER`.
- API Facebook extension yêu cầu role `ADMIN` hoặc `HR`.
- Các API có envelope thành công thường trả:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z"
  }
}
```

- Lỗi qua `ApiExceptionFilter` thường trả:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request payload is invalid.",
    "details": []
  },
  "meta": {
    "requestId": "req-001",
    "timestamp": "2026-07-15T08:00:00.000Z"
  }
}
```

## 1. POST /api/auth/login

### Api path

`POST /api/auth/login`

### Mô tả ngắn về chức năng

Đăng nhập bằng email/password. Nếu hợp lệ, backend cấp access token, refresh token và thông tin user.

### Request

Headers:

- `Content-Type: application/json`

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `email` | string | Có | Email đăng nhập. |
| `password` | string | Có | Mật khẩu, tối thiểu 6 ký tự. |

### Sample request

```bash
curl -X POST "http://localhost:3002/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin.test@example.com",
    "password": "Test@123456"
  }'
```

### Response

Status: `201 Created`

Body trả trực tiếp, không bọc envelope.

| Field | Type | Mô tả |
| --- | --- | --- |
| `accessToken` | string | JWT access token. |
| `refreshToken` | string | Refresh token dạng `rt_...`. |
| `user` | object | Thông tin user đăng nhập. |

### Sample response

```json
{
  "accessToken": "<jwt-access-token>",
  "refreshToken": "rt_GNn5qY...",
  "user": {
    "id": "8c9a6f46-1b4d-4f4c-9fc8-0b5f3a2d2d42",
    "email": "admin.test@example.com",
    "role": "ADMIN",
    "name": "Admin Test"
  }
}
```

## 2. GET /api/auth/me

### Api path

`GET /api/auth/me`

### Mô tả ngắn về chức năng

Lấy profile user hiện tại từ JWT.

### Request

Headers:

- `Authorization: Bearer <accessToken>`

### Sample request

```bash
curl -X GET "http://localhost:3002/api/auth/me" \
  -H "Authorization: Bearer <accessToken>"
```

### Response

Status: `200 OK`

Body trả trực tiếp `UserEntity`. Theo code hiện tại, service trả entity từ database; response có thể bao gồm trường `password` dạng hash.

### Sample response

```json
{
  "id": "8c9a6f46-1b4d-4f4c-9fc8-0b5f3a2d2d42",
  "email": "admin.test@example.com",
  "name": "Admin Test",
  "password": "$2a$10$<bcrypt-hash>",
  "role": "ADMIN",
  "createdAt": "2026-07-15T07:50:00.000Z",
  "updatedAt": "2026-07-15T07:50:00.000Z"
}
```

## 3. POST /api/auth/refresh

### Api path

`POST /api/auth/refresh`

### Mô tả ngắn về chức năng

Rotate refresh token hiện tại và cấp access token mới. Refresh token cũ bị revoke và response trả refresh token mới.

### Request

Headers:

- `Content-Type: application/json`

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `refreshToken` | string | Có | Refresh token còn hạn, tối thiểu 20 ký tự. |

### Sample request

```bash
curl -X POST "http://localhost:3002/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "rt_GNn5qY..."
  }'
```

### Response

Status: `201 Created`

Body trả trực tiếp, không bọc envelope.

### Sample response

```json
{
  "accessToken": "<new-jwt-access-token>",
  "refreshToken": "rt_aNewRefreshToken...",
  "user": {
    "id": "8c9a6f46-1b4d-4f4c-9fc8-0b5f3a2d2d42",
    "email": "admin.test@example.com",
    "role": "ADMIN",
    "name": "Admin Test"
  }
}
```

## 4. GET /api/job-descriptions

### Api path

`GET /api/job-descriptions`

### Mô tả ngắn về chức năng

Liệt kê Job Description có phân trang, lọc và sắp xếp. Dùng cho HR/Admin xem danh sách JD, bao gồm JD tạo nội bộ và JD sync từ nguồn ngoài như VCS Portal.

### Request

Headers:

- `Authorization: Bearer <accessToken>`

Query params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `page` | number | Không | Trang, mặc định `1`. |
| `limit` | number | Không | Số item/trang, mặc định `20`, tối đa `100`. |
| `search` | string | Không | Tìm theo title/summary/description/requirements/salary/department. |
| `status` | string | Không | `DRAFT`, `ACTIVE`, `ARCHIVED`, hoặc alias `READY`, `JD_READY`, `JD_DRAFT`, `JD_ARCHIVED`, `all`. |
| `positionId` | uuid | Không | Lọc theo vị trí. |
| `levelId` | uuid | Không | Lọc theo level. |
| `sourceSystem` | string | Không | Ví dụ `VCS_PORTAL`. |
| `latestSyncedOnly` | boolean string | Không | Khi `true`, chỉ lấy JD synced mới nhất theo điều kiện. |
| `sortBy` | string | Không | `title`, `status`, `createdAt`, `updatedAt`, `lastSyncedAt`. |
| `sortOrder` | string | Không | `ASC` hoặc `DESC`, mặc định `DESC`. |

### Sample request

```bash
curl -X GET "http://localhost:3002/api/job-descriptions?page=1&limit=20&status=ACTIVE&sourceSystem=VCS_PORTAL&sortBy=lastSyncedAt&sortOrder=DESC" \
  -H "Authorization: Bearer <accessToken>"
```

### Response

Status: `200 OK`

Envelope có `data` là mảng JD và `pagination`.

### Sample response

```json
{
  "success": true,
  "data": [
    {
      "id": "3a2e0df5-3872-4128-ae3e-9dc4cc20f73f",
      "jobDescriptionId": "3a2e0df5-3872-4128-ae3e-9dc4cc20f73f",
      "title": "Backend Developer",
      "positionId": null,
      "position": null,
      "levelId": null,
      "level": null,
      "description": "Develop backend services.",
      "overview": "Build APIs for recruitment platform.",
      "responsibilities": "Design, implement and maintain services.",
      "summary": "Backend Developer",
      "requirements": "Node.js, PostgreSQL, NestJS",
      "benefits": {
        "insurance": "Full insurance"
      },
      "salary": "Negotiable",
      "annualLeaveDays": "12",
      "department": "Engineering",
      "applicationDeadline": "2026-08-31",
      "status": "ACTIVE",
      "sourceSystem": "VCS_PORTAL",
      "sourceJobId": "123",
      "sourceSlug": "backend-developer",
      "sourceUrl": "https://portal.example/jobs/backend-developer",
      "sourceCreatedAt": "2026-07-01T00:00:00.000Z",
      "sourceModifiedAt": "2026-07-10T00:00:00.000Z",
      "sourceContentHash": "9a7f...",
      "lastSyncedAt": "2026-07-15T08:00:00.000Z",
      "sourceCategories": [
        {
          "id": "7e03a010-d18a-4ef3-8f21-2d89d93ba9d7",
          "sourceSystem": "VCS_PORTAL",
          "sourceCategoryId": "10",
          "name": "Engineering",
          "displayName": "Engineering",
          "slug": "engineering"
        }
      ],
      "createdById": "8c9a6f46-1b4d-4f4c-9fc8-0b5f3a2d2d42",
      "createdBy": {
        "id": "8c9a6f46-1b4d-4f4c-9fc8-0b5f3a2d2d42",
        "email": "admin.test@example.com",
        "name": "Admin Test",
        "role": "ADMIN"
      },
      "createdAt": "2026-07-15T08:00:00.000Z",
      "updatedAt": "2026-07-15T08:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "idempotencyKey": null,
    "timestamp": "2026-07-15T08:00:00.000Z"
  }
}
```

## 5. POST /api/extension/amis/job-postings/sync-and-publish

### Api path

`POST /api/extension/amis/job-postings/sync-and-publish`

### Mô tả ngắn về chức năng

Nhận snapshot tin tuyển dụng từ AMIS qua browser extension, tạo/cập nhật JD, JD version, job posting, mapping external reference và chuẩn bị publish theo các kênh đã chọn. Hiện action hỗ trợ là `PUBLISH`.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`
- `Idempotency-Key: <unique-key>` bắt buộc
- `X-Request-Id` không bắt buộc
- `X-Extension-Version` không bắt buộc
- `X-Extension-Instance-Id` không bắt buộc

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `sourceSystem` | enum | Có | `AMIS`. |
| `amisRecruitmentId` | string | Có | ID đợt tuyển dụng trên AMIS. |
| `amisUrl` | string | Không | URL AMIS hiện tại. |
| `action` | enum | Có | `PUBLISH`. |
| `idempotencyKey` | string | Không | Mirror trong body; header là nguồn chính. |
| `snapshot` | object | Có | Snapshot nội dung job. |
| `snapshot.title` | string | Có | Tiêu đề job. |
| `snapshot.description` | string | Có | Mô tả job. |
| `snapshot.summary` | string | Không | Tóm tắt tối đa 500 ký tự. Nếu thiếu, backend derive từ description. |
| `snapshot.requirements.rawText` | string | Có | Requirements dạng text. |
| `snapshot.requirements.sections` | array | Không | Các section requirement. |
| `snapshot.requirements.mustHaveSkills` | string[] | Không | Kỹ năng bắt buộc. |
| `snapshot.requirements.niceToHaveSkills` | string[] | Không | Kỹ năng ưu tiên. |
| `snapshot.requirements.minExperienceYears` | number | Không | Số năm kinh nghiệm tối thiểu. |
| `snapshot.requirements.education` | string | Không | Học vấn. |
| `snapshot.requirements.languages` | string[] | Không | Ngôn ngữ. |
| `snapshot.requirements.certifications` | string[] | Không | Chứng chỉ. |
| `snapshot.requirements.notes` | string | Không | Ghi chú. |
| `snapshot.benefits` | string/object/null | Không | Phúc lợi. |
| `snapshot.location` | string | Không | Địa điểm. |
| `snapshot.deadline` | ISO date string | Không | Deadline phải là ngày tương lai nếu gửi lên. |
| `channels` | enum[] | Có | Một hoặc nhiều: `VCS_PORTAL`, `FACEBOOK`, `TOPCV`, `ITVIEC`, `VIETNAMWORKS`, `LINKEDIN`. |
| `facebookTargetIds` | uuid[] | Không | Danh sách group Facebook đã chọn khi có channel `FACEBOOK`. |
| `selectedQuestionIds` | uuid[] | Không | Danh sách câu hỏi gắn vào form/question set của posting. |
| `metadata` | object | Không | Metadata hỗ trợ debug. |
| `facebookContent` | string | Không | Nội dung Facebook đã chuẩn bị, có thể chứa `{{APPLY_URL}}`. |

### Sample request

```bash
curl -X POST "http://localhost:3002/api/extension/amis/job-postings/sync-and-publish" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: amis-publish-20260715-001" \
  -H "X-Request-Id: req-amis-001" \
  -H "X-Extension-Version: 1.2.0" \
  -d '{
    "sourceSystem": "AMIS",
    "amisRecruitmentId": "AMIS-RC-2026-001",
    "amisUrl": "https://amis.example/recruitments/AMIS-RC-2026-001",
    "action": "PUBLISH",
    "snapshot": {
      "title": "Backend Developer",
      "description": "Develop backend APIs and services.",
      "summary": "Backend Developer for recruitment platform",
      "requirements": {
        "rawText": "NestJS, PostgreSQL, REST API",
        "sections": [
          {
            "title": "Must have",
            "items": ["NestJS", "PostgreSQL"]
          }
        ],
        "mustHaveSkills": ["NestJS", "PostgreSQL"],
        "minExperienceYears": 2
      },
      "benefits": {
        "insurance": "Full insurance"
      },
      "location": "Da Nang",
      "deadline": "2026-08-31T00:00:00.000Z"
    },
    "channels": ["VCS_PORTAL", "FACEBOOK"],
    "facebookTargetIds": ["bf81ef34-7ad4-4bb2-b417-84bdb870b7ed"],
    "selectedQuestionIds": ["ef4bf6b8-65e0-43ab-b441-28d52d420b9d"],
    "metadata": {
      "sourceTab": "amis"
    },
    "facebookContent": "Backend Developer\nApply: {{APPLY_URL}}"
  }'
```

### Response

Status: `201 Created`

Envelope với `data` dạng `ExtensionSyncResponseDto`.

| Field | Type | Mô tả |
| --- | --- | --- |
| `resultCode` | enum | `CREATED`, `UPDATED`, `DUPLICATE_OR_IDEMPOTENT_REPLAY`. |
| `jobDescriptionId` | uuid | JD nội bộ. |
| `jobDescriptionVersionId` | uuid | Version snapshot active. |
| `jobPostingId` | uuid | Job posting nội bộ. |
| `amisRecruitmentId` | string | ID tuyển dụng AMIS. |
| `snapshotHash` | string | Hash snapshot để detect thay đổi. |
| `snapshotChanged` | boolean | Snapshot có thay đổi hay không. |
| `channelPostings` | array | Kết quả theo từng channel. |
| `facebookPublishPlan` | object | Kế hoạch publish Facebook nếu channel Facebook được chọn. |
| `warnings` | array | Cảnh báo nếu có. |

### Sample response

```json
{
  "success": true,
  "data": {
    "resultCode": "CREATED",
    "jobDescriptionId": "3a2e0df5-3872-4128-ae3e-9dc4cc20f73f",
    "jobDescriptionVersionId": "491391d1-838b-4611-9b9e-794e9aef8362",
    "jobPostingId": "f9a6fdbc-8870-4b8c-8e41-c258783b78e2",
    "amisRecruitmentId": "AMIS-RC-2026-001",
    "snapshotHash": "64e6a4d...",
    "snapshotChanged": true,
    "channelPostings": [
      {
        "channelPostingId": "7a046e2d-55b9-49ec-8c79-bf1543c3f1de",
        "channel": "VCS_PORTAL",
        "status": "PUBLISHED",
        "publishedUrl": "/jobs/backend-developer",
        "externalPostingId": "backend-developer",
        "errorCode": null,
        "manualActionRequired": false,
        "message": null,
        "lastSyncAt": "2026-07-15T08:00:00.000Z"
      }
    ],
    "facebookPublishPlan": {
      "jobPostingId": "f9a6fdbc-8870-4b8c-8e41-c258783b78e2",
      "content": "Backend Developer\nApply: http://localhost:4000/jobs/backend-developer",
      "targets": [
        {
          "targetId": "bf81ef34-7ad4-4bb2-b417-84bdb870b7ed",
          "targetType": "GROUP",
          "targetName": "Viec lam IT Da Nang",
          "targetUrl": "https://www.facebook.com/groups/javascript.vn",
          "targetExternalId": "javascript.vn",
          "eligibilityStatus": "CAN_POST",
          "eligibilityReason": null,
          "lastVerifiedAt": "2026-07-15T07:30:00.000Z",
          "lastDiscoveredAt": "2026-07-15T07:20:00.000Z",
          "todayPublishCount": 0,
          "dailyPublishLimit": 10,
          "quotaLabel": "0/10",
          "quotaExceeded": false,
          "selectable": true,
          "disabledReason": null
        }
      ],
      "delay": {
        "minMs": 45000,
        "maxMs": 90000
      }
    },
    "warnings": []
  },
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z",
    "requestId": "req-amis-001",
    "idempotencyKey": "amis-publish-20260715-001",
    "extensionVersion": "1.2.0",
    "extensionInstanceId": null
  }
}
```

## 6. POST /api/extension/amis/careers/sync

### Api path

`POST /api/extension/amis/careers/sync`

### Mô tả ngắn về chức năng

Sync danh mục nghề nghiệp/career từ AMIS vào catalog nội bộ để extension và màn hình chọn câu hỏi dùng.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`
- `X-Request-Id` không bắt buộc
- `X-Extension-Version` không bắt buộc
- `X-Extension-Instance-Id` không bắt buộc

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `items` | array | Có | Danh sách career từ AMIS, không được rỗng. |
| `items[].amisCareerId` | string | Có | ID career trên AMIS. |
| `items[].code` | string | Không | Mã career. |
| `items[].name` | string | Có | Tên career. |
| `items[].description` | string | Không | Mô tả. |
| `items[].organizationUnitId` | string | Không | ID đơn vị tổ chức. |
| `items[].organizationUnitName` | string | Không | Tên đơn vị tổ chức. |
| `items[].usageStatus` | number | Không | Trạng thái sử dụng từ AMIS. |
| `items[].parentAmisCareerId` | string | Không | Career cha trên AMIS. |
| `items[].sortOrder` | number | Không | Thứ tự. |
| `items[].isActive` | boolean | Không | Mặc định `true`. |
| `items[].rawSnapshot` | object | Không | Snapshot đã sanitize, không chứa cookie/secret. |
| `sourceUrl` | string | Không | URL nguồn. |
| `metadata` | object | Không | Metadata sync. |

### Sample request

```bash
curl -X POST "http://localhost:3002/api/extension/amis/careers/sync" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: req-careers-001" \
  -d '{
    "items": [
      {
        "amisCareerId": "CAREER-BE",
        "code": "BE",
        "name": "CNTT - Phan mem",
        "description": "Software engineering career",
        "organizationUnitId": "ORG-001",
        "organizationUnitName": "Engineering",
        "usageStatus": 1,
        "sortOrder": 10,
        "isActive": true,
        "rawSnapshot": {
          "source": "amis"
        }
      }
    ],
    "sourceUrl": "https://amis.example/careers",
    "metadata": {
      "capturedAt": "2026-07-15T08:00:00.000Z"
    }
  }'
```

### Response

Status: `201 Created`

Envelope với summary sync.

### Sample response

```json
{
  "success": true,
  "data": {
    "syncedCount": 1,
    "createdCount": 1,
    "updatedCount": 0,
    "removedCount": 0,
    "skippedCount": 0,
    "lastSyncedAt": "2026-07-15T08:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z",
    "requestId": "req-careers-001",
    "extensionVersion": null,
    "extensionInstanceId": null
  }
}
```

## 7. POST /api/extension/amis/applications/sync

### Api path

`POST /api/extension/amis/applications/sync`

### Mô tả ngắn về chức năng

Sync danh sách ứng viên/application từ AMIS theo một `recruitmentId`. Backend resolve `jobPostingId` qua mapping AMIS recruitment đã được sync trước đó.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`
- `X-Request-Id` không bắt buộc
- `X-Extension-Version` không bắt buộc
- `X-Extension-Instance-Id` không bắt buộc

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `items` | array | Có | Danh sách application AMIS. |
| `items[].recruitmentId` | string | Có | ID đợt tuyển dụng AMIS. Tất cả item hợp lệ phải cùng recruitmentId. |
| `items[].recruitmentRoundId` | string | Có | ID vòng tuyển dụng AMIS. |
| `items[].candidateId` | string | Có | ID ứng viên AMIS. |
| `items[].candidateConvertId` | string | Không | ID chuyển đổi nếu có. |
| `items[].candidateName` | string | Có | Tên ứng viên. |
| `items[].email` | email | Không | Email ứng viên. |
| `items[].mobile` | string | Không | Số điện thoại. |
| `items[].birthday` | string | Không | Ngày sinh từ AMIS. |
| `items[].recruitmentRoundName` | string | Không | Tên vòng tuyển dụng. |
| `items[].status` | number | Không | Status AMIS. |
| `items[].channelName` | string | Không | Kênh nguồn từ AMIS. |
| `items[].applyDate` | string | Không | Ngày ứng tuyển. |
| `items[].recruitmentTitle` | string | Không | Tiêu đề tuyển dụng. |
| `items[].attachmentCvId` | string | Không | ID file CV trên AMIS. |
| `items[].attachmentCvName` | string | Không | Tên file CV trên AMIS. |
| `items[].educationDegreeName` | string | Không | Bằng cấp. |
| `items[].educationMajorName` | string | Không | Chuyên ngành. |
| `items[].workPlaceRecent` | string | Không | Nơi làm gần đây. |
| `items[].rawSnapshot` | object | Không | Snapshot row AMIS. |
| `sourceUrl` | string | Không | URL nguồn. |
| `metadata` | object | Không | Metadata sync. |

### Sample request

```bash
curl -X POST "http://localhost:3002/api/extension/amis/applications/sync" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: req-apps-001" \
  -d '{
    "items": [
      {
        "recruitmentId": "AMIS-RC-2026-001",
        "recruitmentRoundId": "ROUND-001",
        "candidateId": "CAND-001",
        "candidateName": "Nguyen Van A",
        "email": "candidate@example.com",
        "mobile": "0900000000",
        "recruitmentRoundName": "Screening",
        "status": 1,
        "channelName": "AMIS",
        "applyDate": "2026-07-15",
        "recruitmentTitle": "Backend Developer",
        "attachmentCvId": "CV-001",
        "attachmentCvName": "nguyen-van-a.pdf"
      }
    ],
    "sourceUrl": "https://amis.example/recruitments/AMIS-RC-2026-001/applications"
  }'
```

### Response

Status: `201 Created`

Envelope với summary sync.

### Sample response

```json
{
  "success": true,
  "data": {
    "syncedCount": 1,
    "createdCount": 1,
    "updatedCount": 0,
    "skippedCount": 0,
    "jobPostingId": "f9a6fdbc-8870-4b8c-8e41-c258783b78e2",
    "amisRecruitmentId": "AMIS-RC-2026-001",
    "lastSyncedAt": "2026-07-15T08:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z",
    "requestId": "req-apps-001",
    "extensionVersion": null,
    "extensionInstanceId": null
  }
}
```

## 8. POST /api/extension/vcs-portal/jds/sync

### Api path

`POST /api/extension/vcs-portal/jds/sync`

### Mô tả ngắn về chức năng

Full sync Job Description và câu hỏi từ VCS Portal. Backend gọi API ngoài `{VCS_PORTAL_BASE_URL}/wp-json/vcs-portal/v1/jds` bằng `VCS_PORTAL_API_KEY`, sau đó tạo/cập nhật/archive JD và question set nội bộ.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `X-Request-Id` không bắt buộc
- `X-Extension-Version` không bắt buộc

Body: không có.

### Sample request

```bash
curl -X POST "http://localhost:3002/api/extension/vcs-portal/jds/sync" \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Request-Id: req-vcs-jds-001" \
  -H "X-Extension-Version: 1.2.0"
```

### Response

Status: `201 Created`

Envelope với summary sync.

### Sample response

```json
{
  "success": true,
  "data": {
    "fetchedCount": 25,
    "pagesFetched": 1,
    "createdCount": 3,
    "updatedCount": 5,
    "unchangedCount": 17,
    "archivedCount": 0,
    "failedCount": 0,
    "questionSetCreatedCount": 8,
    "questionSetDeletedCount": 8,
    "questionCount": 64,
    "lastSyncedAt": "2026-07-15T08:00:00.000Z",
    "warnings": [
      {
        "code": "VCS_PORTAL_DEADLINE_INVALID",
        "message": "acf.end_date must use dd/MM/yyyy format.",
        "sourceJobId": "123",
        "sourceSlug": "backend-developer",
        "page": null
      }
    ]
  },
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z",
    "requestId": "req-vcs-jds-001",
    "extensionVersion": "1.2.0"
  }
}
```

## 9. GET /api/extension/amis/recruitments/:amisRecruitmentId/applications

### Api path

`GET /api/extension/amis/recruitments/:amisRecruitmentId/applications`

### Mô tả ngắn về chức năng

Lấy danh sách application đã sync nội bộ theo AMIS recruitment ID, bao gồm trạng thái CV và form session mới nhất.

### Request

Headers:

- `Authorization: Bearer <accessToken>`

Path params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `amisRecruitmentId` | string | Có | ID đợt tuyển dụng AMIS. |

### Sample request

```bash
curl -X GET "http://localhost:3002/api/extension/amis/recruitments/AMIS-RC-2026-001/applications" \
  -H "Authorization: Bearer <accessToken>"
```

### Response

Status: `200 OK`

Body trả trực tiếp, không bọc envelope.

### Sample response

```json
{
  "amisRecruitmentId": "AMIS-RC-2026-001",
  "jobPostingId": "f9a6fdbc-8870-4b8c-8e41-c258783b78e2",
  "total": 1,
  "applications": [
    {
      "applicationId": "7b3f6b7e-3517-4f9a-b64b-fca517d0b76a",
      "candidateId": "0e2b04ca-768a-4af9-b2e6-fd5a7e9c61a0",
      "candidateName": "Nguyen Van A",
      "email": "candidate@example.com",
      "mobile": "0900000000",
      "status": "CV_UPLOADED",
      "formStatus": "SENT",
      "latestForm": {
        "formSessionId": "6ddf2614-c346-40d7-853f-b1ef3c64d84d",
        "status": "SENT",
        "expiresAt": "2026-07-22T08:00:00.000Z",
        "sentAt": "2026-07-15T08:10:00.000Z",
        "openedAt": null,
        "submittedAt": null,
        "createdAt": "2026-07-15T08:05:00.000Z"
      },
      "currentCvDocumentId": "019a56d2-497a-4689-8a09-20f9baf6c4b1",
      "cvScanStatus": "PASSED",
      "cvSanitizeStatus": "SANITIZED",
      "cvParseStatus": "PARSED",
      "cvDocumentType": "CLEAN",
      "sourceChannel": "AMIS",
      "externalApplicationId": "AMIS-RC-2026-001::ROUND-001::CAND-001",
      "amisRecruitmentRoundId": "ROUND-001",
      "amisRecruitmentRoundName": "Screening",
      "amisStatus": 1,
      "attachmentCvId": "CV-001",
      "attachmentCvName": "nguyen-van-a.pdf",
      "applyDate": "2026-07-15",
      "createdAt": "2026-07-15T08:00:00.000Z",
      "updatedAt": "2026-07-15T08:00:00.000Z"
    }
  ]
}
```

## 10. GET /api/extension/amis/job-descriptions/:jobDescriptionId/question-set

### Api path

`GET /api/extension/amis/job-descriptions/:jobDescriptionId/question-set`

### Mô tả ngắn về chức năng

Lấy active question set của một Job Description, ưu tiên question set sync từ VCS Portal mới nhất.

### Request

Headers:

- `Authorization: Bearer <accessToken>`

Path params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `jobDescriptionId` | uuid/string | Có | ID JD nội bộ. |

### Sample request

```bash
curl -X GET "http://localhost:3002/api/extension/amis/job-descriptions/3a2e0df5-3872-4128-ae3e-9dc4cc20f73f/question-set" \
  -H "Authorization: Bearer <accessToken>"
```

### Response

Status: `200 OK`

Body trả trực tiếp, không bọc envelope.

### Sample response

```json
{
  "jobDescription": {
    "id": "3a2e0df5-3872-4128-ae3e-9dc4cc20f73f",
    "jobDescriptionId": "3a2e0df5-3872-4128-ae3e-9dc4cc20f73f",
    "title": "Backend Developer",
    "summary": "Backend Developer",
    "description": "Develop backend services.",
    "status": "ACTIVE",
    "sourceSystem": "VCS_PORTAL",
    "sourceJobId": "123",
    "sourceSlug": "backend-developer",
    "position": null,
    "level": null
  },
  "questionSet": {
    "id": "89a4d7c4-096f-4195-9f7e-7054f2a4308f",
    "name": "Backend Developer - VCS Portal",
    "status": "ACTIVE",
    "sourceSystem": "VCS_PORTAL",
    "sourceJobId": "123",
    "sourceLastSyncedAt": "2026-07-15T08:00:00.000Z",
    "updatedAt": "2026-07-15T08:00:00.000Z"
  },
  "questions": [
    {
      "id": "2f902dc8-289c-401a-a050-fc70b89cc6e4",
      "questionSetItemId": "2f902dc8-289c-401a-a050-fc70b89cc6e4",
      "questionId": "ef4bf6b8-65e0-43ab-b441-28d52d420b9d",
      "text": "Explain transaction management in PostgreSQL.",
      "type": "OPEN_ENDED",
      "required": true,
      "orderIndex": 1,
      "category": "BACKEND_MUST",
      "subcategory": "Database",
      "competencyType": "KNOWLEDGE",
      "difficulty": 2,
      "targetLevels": ["ENTRY", "EXPERIENCED"],
      "expectedAnswer": "Candidate explains ACID and transaction boundaries.",
      "scoringGuide": null,
      "metadata": {
        "source": "vcs-portal"
      }
    }
  ]
}
```

## 11. GET /api/extension/amis/careers

### Api path

`GET /api/extension/amis/careers`

### Mô tả ngắn về chức năng

Liệt kê AMIS careers active đã sync vào catalog, dùng để chọn career và load câu hỏi tương ứng.

### Request

Headers:

- `Authorization: Bearer <accessToken>`

### Sample request

```bash
curl -X GET "http://localhost:3002/api/extension/amis/careers" \
  -H "Authorization: Bearer <accessToken>"
```

### Response

Status: `200 OK`

Body trả trực tiếp là mảng `AmisCareerCatalogItemDto`, không bọc envelope.

### Sample response

```json
[
  {
    "id": "d2a45562-612e-4c65-8412-39aee3f84520",
    "amisCareerId": "CAREER-BE",
    "name": "CNTT - Phan mem",
    "description": "Software engineering career",
    "organizationUnitId": "ORG-001",
    "organizationUnitName": "Engineering",
    "usageStatus": 1,
    "questionCategoryNames": ["BACKEND_MUST", "BACKEND_SHOULD", "SOFT_SKILL", "PERSONALITY"],
    "isActive": true,
    "lastSyncedAt": "2026-07-15T08:00:00.000Z"
  }
]
```

## 12. GET /api/extension/amis/careers/:amisCareerId/questions

### Api path

`GET /api/extension/amis/careers/:amisCareerId/questions`

### Mô tả ngắn về chức năng

Lấy context câu hỏi cho một AMIS career: career info, categories/subcategories được map và danh sách câu hỏi active thuộc các category đó.

### Request

Headers:

- `Authorization: Bearer <accessToken>`

Path params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `amisCareerId` | string | Có | ID career trên AMIS. |

### Sample request

```bash
curl -X GET "http://localhost:3002/api/extension/amis/careers/CAREER-BE/questions" \
  -H "Authorization: Bearer <accessToken>"
```

### Response

Status: `200 OK`

Body trả trực tiếp, không bọc envelope.

### Sample response

```json
{
  "career": {
    "id": "d2a45562-612e-4c65-8412-39aee3f84520",
    "amisCareerId": "CAREER-BE",
    "name": "CNTT - Phan mem",
    "description": "Software engineering career",
    "organizationUnitId": "ORG-001",
    "organizationUnitName": "Engineering",
    "usageStatus": 1,
    "questionCategoryNames": ["BACKEND_MUST", "BACKEND_SHOULD"],
    "isActive": true,
    "lastSyncedAt": "2026-07-15T08:00:00.000Z"
  },
  "categories": [
    {
      "id": "f5a08a95-158d-4760-84cc-50370de635f4",
      "name": "BACKEND_MUST",
      "displayName": "Backend Must Have",
      "description": "Core backend requirements",
      "subcategories": [
        {
          "id": "a2a372b0-1baf-4ec6-95fa-87844c04f084",
          "name": "Database",
          "competencyType": "KNOWLEDGE",
          "orderIndex": 1
        }
      ]
    }
  ],
  "questions": [
    {
      "id": "ef4bf6b8-65e0-43ab-b441-28d52d420b9d",
      "category": "BACKEND_MUST",
      "subcategory": "Database",
      "competencyType": "KNOWLEDGE",
      "text": "Explain transaction management in PostgreSQL.",
      "difficulty": 2,
      "targetLevels": ["ENTRY", "EXPERIENCED"],
      "type": "OPEN_ENDED",
      "options": null,
      "correctAnswers": null,
      "expectedAnswer": "Candidate explains ACID and transaction boundaries.",
      "scoringGuide": null,
      "testCases": null,
      "hiddenTestCases": null,
      "timeLimit": null,
      "memoryLimit": null,
      "starterCode": null,
      "architectureTemplate": null,
      "code": null,
      "isActive": true,
      "isCustomized": false,
      "createdAt": "2026-07-15T08:00:00.000Z",
      "updatedAt": "2026-07-15T08:00:00.000Z"
    }
  ]
}
```

## 13. POST /api/extension/amis/careers/:amisCareerId/questions

### Api path

`POST /api/extension/amis/careers/:amisCareerId/questions`

### Mô tả ngắn về chức năng

Tạo câu hỏi mới thuộc một category đang được map với AMIS career. Question được lưu với `isCustomized: true`.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Path params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `amisCareerId` | string | Có | ID career trên AMIS. |

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `category` | string | Có | Category phải nằm trong `questionCategoryNames` của career. |
| `subcategory` | string | Có | Subcategory. |
| `text` | string | Có | Nội dung câu hỏi. |
| `difficulty` | number | Không | 1-5, mặc định `1`. |
| `targetLevels` | string[] | Không | Mặc định `ENTRY`, `EXPERIENCED`, `SENIOR`, `SPECIALIST`. |
| `type` | enum | Không | `OPEN_ENDED`, `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `CODING`, `SCENARIO`, `ARCHITECTURE`. |
| `competencyType` | enum | Không | `KNOWLEDGE`, `SKILL`, `ADDITIONAL`, `PERSONALITY`. |
| `expectedAnswer` | string | Không | Đáp án kỳ vọng. |
| `scoringGuide` | string | Không | Hướng dẫn chấm điểm. |

### Sample request

```bash
curl -X POST "http://localhost:3002/api/extension/amis/careers/CAREER-BE/questions" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "BACKEND_MUST",
    "subcategory": "Database",
    "text": "How would you design indexes for a high-traffic application table?",
    "difficulty": 3,
    "targetLevels": ["EXPERIENCED", "SENIOR"],
    "type": "OPEN_ENDED",
    "competencyType": "SKILL",
    "expectedAnswer": "Discuss cardinality, query plans, composite indexes and write overhead.",
    "scoringGuide": "Score higher when candidate explains trade-offs and measurement."
  }'
```

### Response

Status: `201 Created`

Body trả trực tiếp `QuestionEntity`, không bọc envelope.

### Sample response

```json
{
  "id": "caee1eda-b601-4203-8c93-d6a5dfc63f06",
  "category": "BACKEND_MUST",
  "subcategory": "Database",
  "text": "How would you design indexes for a high-traffic application table?",
  "difficulty": 3,
  "targetLevels": ["EXPERIENCED", "SENIOR"],
  "type": "OPEN_ENDED",
  "competencyType": "SKILL",
  "expectedAnswer": "Discuss cardinality, query plans, composite indexes and write overhead.",
  "scoringGuide": "Score higher when candidate explains trade-offs and measurement.",
  "isCustomized": true,
  "isActive": true,
  "options": null,
  "correctAnswers": null,
  "testCases": null,
  "hiddenTestCases": null,
  "timeLimit": null,
  "memoryLimit": null,
  "starterCode": null,
  "architectureTemplate": null,
  "code": null,
  "createdAt": "2026-07-15T08:00:00.000Z",
  "updatedAt": "2026-07-15T08:00:00.000Z"
}
```

## 14. GET /api/applications/:applicationId/cv/:cvDocumentId/clean-file

### Api path

`GET /api/applications/:applicationId/cv/:cvDocumentId/clean-file`

### Mô tả ngắn về chức năng

Preview hoặc download file CV đã sanitize. Success response là binary stream, không bọc envelope.

### Request

Headers:

- `Authorization: Bearer <accessToken>`

Path params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `applicationId` | uuid | Có | ID application. |
| `cvDocumentId` | uuid | Có | ID CV document dạng CLEAN đã sanitize. |

Query params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `disposition` | string | Không | `inline` mặc định, hoặc `attachment` để download. |

### Sample request

```bash
curl -X GET "http://localhost:3002/api/applications/7b3f6b7e-3517-4f9a-b64b-fca517d0b76a/cv/019a56d2-497a-4689-8a09-20f9baf6c4b1/clean-file?disposition=attachment" \
  -H "Authorization: Bearer <accessToken>" \
  -o clean-cv.pdf
```

### Response

Status: `200 OK`

Headers:

- `Content-Type: <cleanFile.mimeType>`, thường `application/pdf`
- `Content-Length: <fileSize>`
- `Cache-Control: no-store`
- `X-Content-Type-Options: nosniff`
- `Content-Disposition: inline; filename="<fileName>"` hoặc `attachment; filename="<fileName>"`

Body: binary stream của file clean CV.

Nếu file bị lỗi khi stream, backend trả `503` envelope lỗi `CLEAN_CV_FILE_UNAVAILABLE` nếu headers chưa được gửi.

### Sample response

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Length: 245760
Cache-Control: no-store
X-Content-Type-Options: nosniff
Content-Disposition: attachment; filename="nguyen-van-a.clean.pdf"

<binary pdf content>
```

## 15. GET /api/extension/facebook/groups

### Api path

`GET /api/extension/facebook/groups`

### Mô tả ngắn về chức năng

Liệt kê các Facebook group active được phép publish cho tài khoản extension hiện tại.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `X-Extension-Instance-Id` không bắt buộc

### Sample request

```bash
curl -X GET "http://localhost:3002/api/extension/facebook/groups" \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Extension-Instance-Id: 05fe6c2d-0a53-4b45-a47a-2cf39e1dd084"
```

### Response

Status: `200 OK`

Envelope với `data` là mảng Facebook publish targets đã resolve quota/eligibility.

### Sample response

```json
{
  "success": true,
  "data": [
    {
      "targetId": "bf81ef34-7ad4-4bb2-b417-84bdb870b7ed",
      "targetType": "GROUP",
      "targetName": "Viec lam IT Da Nang",
      "targetUrl": "https://www.facebook.com/groups/javascript.vn",
      "targetExternalId": "javascript.vn",
      "eligibilityStatus": "CAN_POST",
      "eligibilityReason": null,
      "lastVerifiedAt": "2026-07-15T07:30:00.000Z",
      "lastDiscoveredAt": "2026-07-15T07:20:00.000Z",
      "todayPublishCount": 0,
      "dailyPublishLimit": 10,
      "quotaLabel": "0/10",
      "quotaExceeded": false,
      "selectable": true,
      "disabledReason": null,
      "ownerExtensionInstanceId": "05fe6c2d-0a53-4b45-a47a-2cf39e1dd084",
      "lastVerifiedByInstanceId": "05fe6c2d-0a53-4b45-a47a-2cf39e1dd084",
      "facebookAccountLabel": null
    }
  ],
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z"
  }
}
```

## 16. POST /api/extension/facebook/groups

### Api path

`POST /api/extension/facebook/groups`

### Mô tả ngắn về chức năng

Thêm một Facebook group vào danh sách group được phép publish cho tài khoản extension hiện tại.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`
- `X-Extension-Instance-Id` không bắt buộc

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `targetName` | string | Có | Tên group, tối đa 255 ký tự. |
| `targetUrl` | string | Có | URL group Facebook, tối đa 2048 ký tự. |

### Sample request

```bash
curl -X POST "http://localhost:3002/api/extension/facebook/groups" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "targetName": "Viec lam IT Da Nang",
    "targetUrl": "https://www.facebook.com/groups/javascript.vn"
  }'
```

### Response

Status: `201 Created`

Envelope với `data` là Facebook publish target đã resolve.

### Sample response

```json
{
  "success": true,
  "data": {
    "targetId": "bf81ef34-7ad4-4bb2-b417-84bdb870b7ed",
    "targetType": "GROUP",
    "targetName": "Viec lam IT Da Nang",
    "targetUrl": "https://www.facebook.com/groups/javascript.vn",
    "targetExternalId": "javascript.vn",
    "eligibilityStatus": "UNKNOWN",
    "eligibilityReason": "Group has not been verified yet.",
    "lastVerifiedAt": null,
    "lastDiscoveredAt": "2026-07-15T08:00:00.000Z",
    "todayPublishCount": 0,
    "dailyPublishLimit": 10,
    "quotaLabel": "0/10",
    "quotaExceeded": false,
    "selectable": false,
    "disabledReason": "Group has not been verified yet.",
    "ownerExtensionInstanceId": null,
    "lastVerifiedByInstanceId": null,
    "facebookAccountLabel": null
  },
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z"
  }
}
```

## 17. PUT /api/extension/facebook/groups/:targetId

### Api path

`PUT /api/extension/facebook/groups/:targetId`

### Mô tả ngắn về chức năng

Cập nhật tên/URL Facebook group đã cấu hình. Sau khi cập nhật, eligibility reset về `UNKNOWN` để extension verify lại.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`
- `X-Extension-Instance-Id` không bắt buộc

Path params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `targetId` | uuid | Có | ID Facebook publish target. |

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `targetName` | string | Có | Tên group mới. |
| `targetUrl` | string | Có | URL group mới. |

### Sample request

```bash
curl -X PUT "http://localhost:3002/api/extension/facebook/groups/bf81ef34-7ad4-4bb2-b417-84bdb870b7ed" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "targetName": "Viec lam IT Da Nang - Backend",
    "targetUrl": "https://www.facebook.com/groups/backend.danang"
  }'
```

### Response

Status: `200 OK`

Envelope với `data` là target sau cập nhật.

### Sample response

```json
{
  "success": true,
  "data": {
    "targetId": "bf81ef34-7ad4-4bb2-b417-84bdb870b7ed",
    "targetType": "GROUP",
    "targetName": "Viec lam IT Da Nang - Backend",
    "targetUrl": "https://www.facebook.com/groups/backend.danang",
    "targetExternalId": "backend.danang",
    "eligibilityStatus": "UNKNOWN",
    "eligibilityReason": "Group has not been verified yet.",
    "lastVerifiedAt": null,
    "lastDiscoveredAt": "2026-07-15T08:00:00.000Z",
    "todayPublishCount": 0,
    "dailyPublishLimit": 10,
    "quotaLabel": "0/10",
    "quotaExceeded": false,
    "selectable": false,
    "disabledReason": "Group has not been verified yet.",
    "ownerExtensionInstanceId": null,
    "lastVerifiedByInstanceId": null,
    "facebookAccountLabel": null
  },
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z"
  }
}
```

## 18. DELETE /api/extension/facebook/groups/:targetId

### Api path

`DELETE /api/extension/facebook/groups/:targetId`

### Mô tả ngắn về chức năng

Xóa mềm Facebook group khỏi danh sách được phép publish bằng cách set `active = false`.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `X-Extension-Instance-Id` không bắt buộc

Path params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `targetId` | uuid | Có | ID Facebook publish target. |

### Sample request

```bash
curl -X DELETE "http://localhost:3002/api/extension/facebook/groups/bf81ef34-7ad4-4bb2-b417-84bdb870b7ed" \
  -H "Authorization: Bearer <accessToken>"
```

### Response

Status: `200 OK`

Envelope với `data` là target sau khi bị deactivate.

### Sample response

```json
{
  "success": true,
  "data": {
    "targetId": "bf81ef34-7ad4-4bb2-b417-84bdb870b7ed",
    "targetType": "GROUP",
    "targetName": "Viec lam IT Da Nang",
    "targetUrl": "https://www.facebook.com/groups/javascript.vn",
    "targetExternalId": "javascript.vn",
    "eligibilityStatus": "CAN_POST",
    "eligibilityReason": null,
    "lastVerifiedAt": "2026-07-15T07:30:00.000Z",
    "lastDiscoveredAt": "2026-07-15T07:20:00.000Z",
    "todayPublishCount": 0,
    "dailyPublishLimit": 10,
    "quotaLabel": "0/10",
    "quotaExceeded": false,
    "selectable": true,
    "disabledReason": null,
    "ownerExtensionInstanceId": null,
    "lastVerifiedByInstanceId": null,
    "facebookAccountLabel": null
  },
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z"
  }
}
```

## 19. POST /api/extension/facebook/groups/discover

### Api path

`POST /api/extension/facebook/groups/discover`

### Mô tả ngắn về chức năng

Nhận danh sách group do extension scan/discover từ browser, chuẩn hóa URL, tạo mới/cập nhật/reactivate hoặc bỏ qua group trùng/conflict.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `groups` | array | Có | Danh sách group, tối đa 2000 item, không được rỗng. |
| `groups[].targetName` | string | Có | Tên group. |
| `groups[].targetUrl` | string | Có | URL group. |
| `groups[].targetExternalId` | string | Không | External ID/slug nếu extension đã parse được. |

### Sample request

```bash
curl -X POST "http://localhost:3002/api/extension/facebook/groups/discover" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "groups": [
      {
        "targetName": "Hoi lap Java",
        "targetUrl": "https://www.facebook.com/groups/javascript.vn",
        "targetExternalId": "javascript.vn"
      }
    ]
  }'
```

### Response

Status: `201 Created`

Envelope với summary discover/sync.

### Sample response

```json
{
  "success": true,
  "data": {
    "requested": 1,
    "valid": 1,
    "created": 1,
    "updated": 0,
    "reactivated": 0,
    "duplicates": 0,
    "skipped": 0,
    "conflicts": 0,
    "errors": [],
    "items": [
      {
        "action": "created",
        "targetName": "Hoi lap Java",
        "targetUrl": "https://www.facebook.com/groups/javascript.vn",
        "targetExternalId": "javascript.vn",
        "targetId": "bf81ef34-7ad4-4bb2-b417-84bdb870b7ed",
        "reason": null
      }
    ]
  },
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z"
  }
}
```

## 20. POST /api/extension/facebook/groups/:targetId/verify-result

### Api path

`POST /api/extension/facebook/groups/:targetId/verify-result`

### Mô tả ngắn về chức năng

Extension báo kết quả kiểm tra khả năng post vào một Facebook group. Backend cập nhật eligibility của target.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`
- `X-Extension-Instance-Id` không bắt buộc

Path params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `targetId` | uuid | Có | ID Facebook publish target. |

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `eligibilityStatus` | enum | Có | `UNKNOWN`, `CAN_POST`, `CANNOT_POST`. |
| `eligibilityReason` | string/null | Không | Lý do/ghi chú, tối đa 1000 ký tự. |
| `verifiedAt` | ISO datetime/null | Không | Thời điểm extension verify; nếu thiếu backend dùng thời điểm hiện tại. |

### Sample request

```bash
curl -X POST "http://localhost:3002/api/extension/facebook/groups/bf81ef34-7ad4-4bb2-b417-84bdb870b7ed/verify-result" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -H "X-Extension-Instance-Id: 05fe6c2d-0a53-4b45-a47a-2cf39e1dd084" \
  -d '{
    "eligibilityStatus": "CAN_POST",
    "eligibilityReason": "Current Facebook account can open the group composer.",
    "verifiedAt": "2026-07-15T08:00:00.000Z"
  }'
```

### Response

Status: `201 Created`

Envelope với `data` là target sau verify.

### Sample response

```json
{
  "success": true,
  "data": {
    "targetId": "bf81ef34-7ad4-4bb2-b417-84bdb870b7ed",
    "targetType": "GROUP",
    "targetName": "Hoi lap Java",
    "targetUrl": "https://www.facebook.com/groups/javascript.vn",
    "targetExternalId": "javascript.vn",
    "eligibilityStatus": "CAN_POST",
    "eligibilityReason": "Current Facebook account can open the group composer.",
    "lastVerifiedAt": "2026-07-15T08:00:00.000Z",
    "lastDiscoveredAt": "2026-07-15T07:20:00.000Z",
    "todayPublishCount": 0,
    "dailyPublishLimit": 10,
    "quotaLabel": "0/10",
    "quotaExceeded": false,
    "selectable": true,
    "disabledReason": null,
    "ownerExtensionInstanceId": null,
    "lastVerifiedByInstanceId": "05fe6c2d-0a53-4b45-a47a-2cf39e1dd084",
    "facebookAccountLabel": null
  },
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z"
  }
}
```

## 21. GET /api/extension/facebook/groups/:targetId/publish-histories

### Api path

`GET /api/extension/facebook/groups/:targetId/publish-histories`

### Mô tả ngắn về chức năng

Liệt kê lịch sử publish Facebook của một group, có summary theo trạng thái review.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `X-Extension-Instance-Id` không bắt buộc

Path params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `targetId` | uuid | Có | ID Facebook publish target. |

Query params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `status` | enum | Không | `POSTED`, `PENDING_REVIEW`, `REJECTED`, `DELETED`, `UNKNOWN`. |
| `page` | number | Không | Mặc định `1`. |
| `limit` | number | Không | Mặc định `10`, tối đa `50`. |

### Sample request

```bash
curl -X GET "http://localhost:3002/api/extension/facebook/groups/bf81ef34-7ad4-4bb2-b417-84bdb870b7ed/publish-histories?status=POSTED&page=1&limit=10" \
  -H "Authorization: Bearer <accessToken>"
```

### Response

Status: `200 OK`

Envelope với `data.summary`, `data.items`, pagination fields.

### Sample response

```json
{
  "success": true,
  "data": {
    "summary": {
      "total": 1,
      "posted": 1,
      "pendingReview": 0,
      "rejected": 0,
      "deleted": 0,
      "unknown": 0
    },
    "items": [
      {
        "id": "ef2f5e2a-97df-46b5-b1d5-2a6b709377e2",
        "jobPostingId": "f9a6fdbc-8870-4b8c-8e41-c258783b78e2",
        "title": "Backend Developer",
        "contentPreview": "Backend Developer Apply: http://localhost:4000/jobs/backend-developer",
        "targetId": "bf81ef34-7ad4-4bb2-b417-84bdb870b7ed",
        "targetName": "Hoi lap Java",
        "targetUrl": "https://www.facebook.com/groups/javascript.vn",
        "targetExternalId": "javascript.vn",
        "publishStatus": "SUCCESS",
        "facebookReviewStatus": "POSTED",
        "message": "Posted successfully.",
        "errorReason": null,
        "submittedAt": "2026-07-15T08:00:00.000Z",
        "lastStatusCheckedAt": null,
        "lastStatusCheckMessage": null,
        "externalPostId": "1234567890",
        "externalPostUrl": "https://www.facebook.com/groups/javascript.vn/posts/1234567890",
        "createdAt": "2026-07-15T08:00:00.000Z",
        "updatedAt": "2026-07-15T08:00:00.000Z",
        "extensionInstanceId": "05fe6c2d-0a53-4b45-a47a-2cf39e1dd084"
      }
    ],
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z"
  }
}
```

## 22. POST /api/extension/facebook/publish-histories/:historyId/status-check

### Api path

`POST /api/extension/facebook/publish-histories/:historyId/status-check`

### Mô tả ngắn về chức năng

Extension refresh lại bài post Facebook và cập nhật moderation/review status của publish history.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`
- `X-Extension-Instance-Id` không bắt buộc

Path params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `historyId` | uuid | Có | ID publish history. |

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `facebookReviewStatus` | enum | Có | `POSTED`, `PENDING_REVIEW`, `REJECTED`, `DELETED`, `UNKNOWN`. |
| `message` | string/null | Không | Ghi chú tối đa 4000 ký tự. |
| `externalPostUrl` | string/null | Không | URL bài post, tối đa 2048 ký tự. |
| `externalPostId` | string/null | Không | ID bài post, tối đa 255 ký tự. |
| `checkedAt` | ISO date string/null | Không | Thời điểm check; nếu thiếu backend dùng hiện tại. |

### Sample request

```bash
curl -X POST "http://localhost:3002/api/extension/facebook/publish-histories/ef2f5e2a-97df-46b5-b1d5-2a6b709377e2/status-check" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "facebookReviewStatus": "POSTED",
    "message": "Post is visible.",
    "externalPostUrl": "https://www.facebook.com/groups/javascript.vn/posts/1234567890",
    "checkedAt": "2026-07-15T09:00:00.000Z"
  }'
```

### Response

Status: `201 Created`

Envelope với `data` là publish history list item sau cập nhật.

### Sample response

```json
{
  "success": true,
  "data": {
    "id": "ef2f5e2a-97df-46b5-b1d5-2a6b709377e2",
    "jobPostingId": "f9a6fdbc-8870-4b8c-8e41-c258783b78e2",
    "title": "Backend Developer",
    "contentPreview": "Backend Developer Apply: http://localhost:4000/jobs/backend-developer",
    "targetId": "bf81ef34-7ad4-4bb2-b417-84bdb870b7ed",
    "targetName": "Hoi lap Java",
    "targetUrl": "https://www.facebook.com/groups/javascript.vn",
    "targetExternalId": "javascript.vn",
    "publishStatus": "SUCCESS",
    "facebookReviewStatus": "POSTED",
    "message": "Post is visible.",
    "errorReason": null,
    "submittedAt": "2026-07-15T08:00:00.000Z",
    "lastStatusCheckedAt": "2026-07-15T09:00:00.000Z",
    "lastStatusCheckMessage": "Post is visible.",
    "externalPostId": "1234567890",
    "externalPostUrl": "https://www.facebook.com/groups/javascript.vn/posts/1234567890",
    "createdAt": "2026-07-15T08:00:00.000Z",
    "updatedAt": "2026-07-15T09:00:00.000Z",
    "extensionInstanceId": "05fe6c2d-0a53-4b45-a47a-2cf39e1dd084"
  },
  "meta": {
    "timestamp": "2026-07-15T09:00:00.000Z"
  }
}
```

## 23. POST /api/extension/facebook/publish-results

### Api path

`POST /api/extension/facebook/publish-results`

### Mô tả ngắn về chức năng

Extension báo kết quả publish một bài tuyển dụng lên Facebook. Backend lưu publish history và cập nhật trạng thái job posting khi cần.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`
- `X-Extension-Instance-Id` không bắt buộc

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `jobPostingId` | uuid | Có | ID job posting nội bộ. |
| `targetId` | uuid/null | Không | ID target nếu publish vào group đã cấu hình. |
| `targetType` | enum | Có | `GROUP` hoặc `FANPAGE`. |
| `targetName` | string | Có | Tên target. |
| `targetUrl` | string/null | Không | URL target. |
| `content` | string/null | Không | Nội dung đã publish. Nếu thiếu, backend build từ posting. |
| `status` | enum | Có | `PENDING`, `SUCCESS`, `FAILED`, `SKIPPED`. |
| `facebookReviewStatus` | enum/null | Không | `POSTED`, `PENDING_REVIEW`, `REJECTED`, `DELETED`, `UNKNOWN`. Nếu thiếu, backend suy luận từ status/message. |
| `message` | string | Có | Thông báo kết quả, tối đa 4000 ký tự. |
| `externalPostId` | string/null | Không | ID post nếu có. |
| `externalPostUrl` | string/null | Không | URL post nếu có. Backend parse URL để lấy post ID. |
| `submittedAt` | ISO date string/null | Không | Thời điểm submit thành công; nếu status `SUCCESS` và thiếu, backend dùng hiện tại. |

### Sample request

```bash
curl -X POST "http://localhost:3002/api/extension/facebook/publish-results" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -H "X-Extension-Instance-Id: 05fe6c2d-0a53-4b45-a47a-2cf39e1dd084" \
  -d '{
    "jobPostingId": "f9a6fdbc-8870-4b8c-8e41-c258783b78e2",
    "targetId": "bf81ef34-7ad4-4bb2-b417-84bdb870b7ed",
    "targetType": "GROUP",
    "targetName": "Hoi lap Java",
    "targetUrl": "https://www.facebook.com/groups/javascript.vn",
    "content": "Backend Developer\nApply: http://localhost:4000/jobs/backend-developer",
    "status": "SUCCESS",
    "facebookReviewStatus": "POSTED",
    "message": "Posted successfully.",
    "externalPostUrl": "https://www.facebook.com/groups/javascript.vn/posts/1234567890",
    "submittedAt": "2026-07-15T08:00:00.000Z"
  }'
```

### Response

Status: `201 Created`

Envelope với thông tin publish history vừa ghi nhận.

### Sample response

```json
{
  "success": true,
  "data": {
    "id": "ef2f5e2a-97df-46b5-b1d5-2a6b709377e2",
    "jobPostingId": "f9a6fdbc-8870-4b8c-8e41-c258783b78e2",
    "targetId": "bf81ef34-7ad4-4bb2-b417-84bdb870b7ed",
    "targetType": "GROUP",
    "targetName": "Hoi lap Java",
    "targetUrl": "https://www.facebook.com/groups/javascript.vn",
    "status": "SUCCESS",
    "facebookReviewStatus": "POSTED",
    "message": "Posted successfully.",
    "errorReason": null,
    "externalPostId": "1234567890",
    "externalPostUrl": "https://www.facebook.com/groups/javascript.vn/posts/1234567890",
    "extensionInstanceId": "05fe6c2d-0a53-4b45-a47a-2cf39e1dd084",
    "submittedAt": "2026-07-15T08:00:00.000Z",
    "createdAt": "2026-07-15T08:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z"
  }
}
```

## 24. POST /api/extension/facebook/generate-preview-content

### Api path

`POST /api/extension/facebook/generate-preview-content`

### Mô tả ngắn về chức năng

Sinh preview nội dung bài đăng Facebook từ snapshot job của extension. `mode = AI` được chấp nhận để tương thích API nhưng backend hiện fallback về template.

### Request

Headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`
- `X-Extension-Instance-Id` không bắt buộc

Body:

| Field | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `snapshot` | object | Có | Cùng schema `AmisJobSnapshotDto` như API sync-and-publish. |
| `mode` | enum | Không | `TEMPLATE` hoặc `AI`, mặc định `TEMPLATE`. |
| `facebookContent` | string | Không | Nội dung đang edit, hiện reserved cho future rewrite flow. |

### Sample request

```bash
curl -X POST "http://localhost:3002/api/extension/facebook/generate-preview-content" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "TEMPLATE",
    "snapshot": {
      "title": "Backend Developer",
      "description": "Develop backend APIs and services.",
      "summary": "Backend Developer for recruitment platform",
      "requirements": {
        "rawText": "NestJS, PostgreSQL, REST API",
        "mustHaveSkills": ["NestJS", "PostgreSQL"]
      },
      "benefits": {
        "insurance": "Full insurance"
      },
      "location": "Da Nang",
      "deadline": "2026-08-31T00:00:00.000Z"
    }
  }'
```

### Response

Status: `201 Created`

Envelope với `data.content` và `data.mode`.

### Sample response

```json
{
  "success": true,
  "data": {
    "content": "Backend Developer\n\nDevelop backend APIs and services.\n\nRequirements:\nNestJS, PostgreSQL, REST API",
    "mode": "TEMPLATE"
  },
  "meta": {
    "timestamp": "2026-07-15T08:00:00.000Z"
  }
}
```

## 25. GET {VCS_PORTAL_BASE_URL}/wp-json/vcs-portal/v1/jds

### Api path

`GET {VCS_PORTAL_BASE_URL}/wp-json/vcs-portal/v1/jds`

Backend gọi API này từ `VcsPortalClientService` với query:

`include_detail=true&include_questions=true&per_page=100&page=<page>`

### Mô tả ngắn về chức năng

API ngoài của VCS Portal trả danh sách Job Description để backend import/sync. Backend chấp nhận response là mảng trực tiếp hoặc object có một trong các field array: `data`, `items`, `results`.

### Request

Headers:

- `Accept: application/json`
- `X-VCS-API-Key: <VCS_PORTAL_API_KEY>`

Query params:

| Param | Type | Required | Mô tả |
| --- | --- | --- | --- |
| `include_detail` | boolean string | Có | Backend luôn gửi `true`. |
| `include_questions` | boolean string | Có | Backend luôn gửi `true`. |
| `per_page` | number | Có | Backend luôn gửi `100`. |
| `page` | number | Có | Trang hiện tại, bắt đầu từ `1`. |

Response header được backend đọc:

- `x-wp-totalpages`: tổng số trang nếu VCS Portal trả về. Nếu thiếu, backend dừng khi số item trả về nhỏ hơn `per_page`.

### Sample request

```bash
curl -X GET "{VCS_PORTAL_BASE_URL}/wp-json/vcs-portal/v1/jds?include_detail=true&include_questions=true&per_page=100&page=1" \
  -H "Accept: application/json" \
  -H "X-VCS-API-Key: <VCS_PORTAL_API_KEY>"
```

### Response

Status: `200 OK`

Mỗi item nên có các field mà mapper đang đọc:

| Field | Type | Required với backend | Mô tả |
| --- | --- | --- | --- |
| `id` | string/number | Có | Source job ID. |
| `title` | string/object | Có | Title. Có thể là string hoặc object có `rendered`, `raw`, `plain`, `text`. |
| `slug` | string | Không | Slug nguồn. |
| `url` | string | Không | URL JD trên portal. |
| `date` | string | Không | Ngày tạo nguồn. |
| `modified` | string | Không | Ngày cập nhật nguồn. |
| `categories` | array | Không | Category dạng string/number hoặc object `{ id, name, displayName, title, slug }`. |
| `content` | string/object | Không | Nội dung chi tiết. |
| `excerpt` | string/object | Không | Tóm tắt. |
| `acf.end_date` | string | Không | Deadline định dạng `dd/MM/yyyy`. |
| `acf.department` | string | Không | Phòng ban. |
| `acf.overview` | string/object | Không | Overview. |
| `acf.responsibilities` | string/object | Không | Responsibilities. |
| `acf.qualifications` | string/object | Không | Requirements. |
| `acf.salary` | string/object | Không | Salary. |
| `acf.annual_leave_days` | string/object | Không | Annual leave days. |
| `acf.insurance` | string/object | Không | Benefit insurance. |
| `acf.awards` | string/object | Không | Benefit awards. |
| `acf.office` | string/object | Không | Benefit office. |
| `acf.celebration` | string/object | Không | Benefit celebration. |
| `questions` | array | Không | String hoặc object câu hỏi. Object có thể dùng `text`, `question`, `label`, `title`, `type`, `required`, `placeholder`. |

### Sample response

Dạng mảng trực tiếp:

```json
[
  {
    "id": 123,
    "title": {
      "rendered": "Backend Developer"
    },
    "slug": "backend-developer",
    "url": "https://portal.example/jobs/backend-developer",
    "date": "2026-07-01T00:00:00.000Z",
    "modified": "2026-07-10T00:00:00.000Z",
    "categories": [
      {
        "id": 10,
        "name": "Engineering",
        "slug": "engineering"
      }
    ],
    "content": {
      "rendered": "<p>Develop backend services.</p>"
    },
    "excerpt": {
      "rendered": "Backend Developer for recruitment platform"
    },
    "acf": {
      "end_date": "31/08/2026",
      "department": "Engineering",
      "overview": "<p>Build APIs for recruitment platform.</p>",
      "responsibilities": "<ul><li>Design services</li><li>Maintain APIs</li></ul>",
      "qualifications": "<p>Node.js, PostgreSQL, NestJS</p>",
      "salary": "Negotiable",
      "annual_leave_days": "12",
      "insurance": "Full insurance",
      "awards": "Performance bonus",
      "office": "Da Nang office",
      "celebration": "Company trip"
    },
    "questions": [
      {
        "text": "Explain transaction management in PostgreSQL.",
        "type": "OPEN_ENDED",
        "required": true,
        "placeholder": "Candidate answer"
      },
      "Describe a production incident you handled."
    ]
  }
]
```

Dạng object có `data`:

```json
{
  "data": [
    {
      "id": 123,
      "title": "Backend Developer",
      "acf": {
        "qualifications": "Node.js, PostgreSQL, NestJS"
      },
      "questions": []
    }
  ]
}
```
