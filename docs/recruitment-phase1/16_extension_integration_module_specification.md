# 16. Extension Integration Module Specification

## 1. Mục tiêu tài liệu

Tài liệu này đặc tả backend boundary cho module `extension-integration` trong VCS Recruitment / HRM CV Phase 1.

Mục tiêu chính:

- Nhận dữ liệu Job Posting do Browser Extension capture/preview/confirm từ AMIS.
- Validate dữ liệu trước khi ghi vào Recruitment Core.
- Đồng bộ dữ liệu vào domain hiện có của Phase 1: `JobDescription`, `JobDescriptionVersion`, `JobPosting`, `ChannelPosting`, `AuditLog` và các event liên quan nếu đã có.
- Trigger publish lên VCS Portal theo flow Phase 1.
- Ghi nhận trạng thái các kênh ngoài như `FACEBOOK`, `TOPCV`, `ITVIEC`, `VIETNAMWORKS`, `LINKEDIN` theo hướng chưa cấu hình thì trả cảnh báo/trạng thái riêng, không làm fail toàn bộ request.
- Giữ BE CV / Recruitment Core là source of truth cho validate, idempotency, versioning, channel publishing và audit.

Tài liệu này không triển khai code, không thay đổi backend source, không tạo extension source và không chỉnh legacy interview/evaluation modules.

## 2. Bối cảnh nghiệp vụ

AMIS là màn hình làm việc chính của HR khi tạo hoặc quản lý nhu cầu tuyển dụng. Browser Extension chỉ đóng vai trò phụ trợ trên trình duyệt:

- Detect ngữ cảnh AMIS.
- Capture dữ liệu job/recruitment từ trang hiện tại.
- Preview dữ liệu cho HR.
- Cho HR confirm.
- Gửi request về VCS Recruitment Core để sync/publish.

Backend không được phụ thuộc vào việc extension đã validate đủ. Backend vẫn phải là nơi quyết định dữ liệu có hợp lệ để tạo/sync/publish hay không.

Flow mục tiêu ở mức nghiệp vụ:

1. HR mở AMIS.
2. Extension detect job posting / recruitment page. Chi tiết domain, URL, selector, API AMIS: `CẦN KHẢO SÁT AMIS`.
3. Extension capture snapshot tối thiểu.
4. HR preview và confirm action `PUBLISH`.
5. Extension gọi backend `extension-integration`.
6. Backend validate, map, idempotency check, ghi audit.
7. Backend tạo hoặc cập nhật JD / JD Version / Job Posting theo quy tắc đã confirm.
8. Backend publish VCS Portal nếu request hợp lệ.
9. Backend trả kết quả từng channel để extension hiển thị.

Phase 1 không mở rộng sang legacy interview/evaluation flow. Các module `sessions`, `evaluations`, `export`, `submissions` không bị ảnh hưởng bởi tài liệu này.

## 3. Relationship với backend Phase 1 hiện tại

| Phase 1 component | Relationship với `extension-integration` |
| --- | --- |
| `auth` | Reuse JWT Bearer token, role guard và user context hiện có. |
| `job-descriptions` | Nhận dữ liệu JD đã normalize từ AMIS snapshot để tạo/cập nhật JD. |
| `job-description-versions` | Lưu version mới khi AMIS snapshot thay đổi nội dung tuyển dụng có ý nghĩa. |
| `job-postings` | Là aggregate chính cho publish flow. Extension không tự publish trực tiếp. |
| `channel-publishing` / channel services | Backend quyết định channel nào publish được, channel nào chưa cấu hình. |
| `channel-postings` | Ghi trạng thái publish từng channel. |
| `applications`, CV, mapping, form, AI screening, HR review | Không được extension gọi trực tiếp trong MVP. Chỉ nhận candidate/application sau khi VCS Portal hoặc channel ingestion có dữ liệu apply. |
| `audit-logs` / `workflow-events` | Ghi nhận sync/publish attempt, actor, source và result ở mức metadata an toàn. |
| Legacy `sessions`, `evaluations`, `export`, `submissions` | Không thay đổi, không thêm dependency từ extension integration. |

Các tài liệu Phase 1 hiện tại mô tả AMIS là extension point/later integration. Tài liệu này đặc tả boundary backend nếu product quyết định đưa Browser Extension AMIS vào Phase 1 hoặc vào extension track liền kề Phase 1.

## 4. Module boundary

`extension-integration` là module adapter/orchestration, không phải domain source mới.

Nằm trong scope:

- Expose API riêng cho Browser Extension.
- Validate input DTO từ extension.
- Normalize AMIS snapshot thành command nội bộ.
- Gọi các service domain hiện có để tạo/cập nhật JD, version và posting.
- Điều phối publish VCS Portal.
- Trả kết quả từng channel cho extension.
- Ghi audit/security event ở mức metadata.
- Áp dụng idempotency để tránh tạo trùng job posting khi HR bấm nhiều lần hoặc retry.

Ngoài scope:

- Không parse AMIS bằng backend.
- Không scrape AMIS.
- Không lưu AMIS cookie/token.
- Không gọi trực tiếp AMIS API khi chưa khảo sát.
- Không triển khai bot external channel trong module này.
- Không xử lý CV, application, AI screening hoặc HR review.
- Không sửa lifecycle legacy interview session/evaluation/export/submission.

## 5. Proposed backend module structure

Theo convention hiện tại của repo, module mới nếu được implement sẽ nằm dưới `apps/backend/src/<module-name>`.

```text
apps/backend/src/extension-integration/
  extension-integration.module.ts
  extension-integration.controller.ts
  extension-integration.service.ts
  dto/
    sync-amis-job-posting.dto.ts
    amis-job-snapshot.dto.ts
    extension-sync-response.dto.ts
  interfaces/
    extension-sync-result.interface.ts
  utils/
    snapshot-hash.util.ts
```

Dependency dự kiến:

- `AuthModule` hoặc guard/strategy hiện có.
- `JobDescriptionsModule`.
- `JobPostingsModule`.
- Channel publishing/channel posting services hiện có.
- `AuditLogsModule` hoặc audit service tương đương.
- Shared enum/type từ `@interview-assistant/shared` hoặc `recruitment-common` nếu đã là source hiện tại.

Ghi chú source hiện tại: chưa tìm thấy module/folder `extension-integration` hoặc route extension tương ứng trong backend source hiện tại. Đây là backend spec đề xuất, không phải mô tả implementation đã tồn tại.

## 6. API contract

### 6.1 Sync and publish AMIS job posting

```http
POST /api/extension/amis/job-postings/sync-and-publish
Authorization: Bearer <jwt>
Content-Type: application/json
Idempotency-Key: <required-idempotency-key>
```

Auth:

- `ADMIN`: allowed.
- `HR`: allowed.
- `INTERVIEWER`: forbidden.
- Candidate/public: forbidden.

`Idempotency-Key`:

- Required cho request sync/publish từ Browser Extension.
- Đây là idempotency key chính, không chỉ là metadata/audit.
- Nếu request được retry với cùng `Idempotency-Key`, backend phải trả lại kết quả đã xử lý trước đó hoặc `DUPLICATE_OR_IDEMPOTENT_REPLAY`, không tạo duplicate JD/JD Version/JobPosting/ChannelPosting.
- Có thể hỗ trợ thêm `idempotencyKey` trong body để extension trace rõ hơn, nhưng header là chuẩn chính. Nếu cả header và body cùng có, header ưu tiên. Việc có nhận body field hay không vẫn là implementation detail cần chốt khi viết DTO.

Request body dự kiến:

```json
{
  "sourceSystem": "AMIS",
  "action": "PUBLISH",
  "idempotencyKey": "same-value-as-header-if-body-support-is-enabled",
  "amisRecruitmentId": "CẦN KHẢO SÁT AMIS",
  "amisUrl": "CẦN KHẢO SÁT AMIS",
  "snapshot": {
    "title": "Senior Backend Engineer",
    "department": "Engineering",
    "location": "Ho Chi Minh City",
    "employmentType": "FULL_TIME",
    "level": "SENIOR",
    "description": "Plain text or normalized content. HTML/rich text handling CẦN CONFIRM.",
    "requirements": {
      "rawText": "Required job requirements text captured from AMIS.",
      "sections": []
    },
    "benefits": "CẦN CONFIRM",
    "salaryRange": {
      "min": 0,
      "max": 0,
      "currency": "VND"
    },
    "deadline": "2026-07-31",
    "headcount": 1
  },
  "channels": [
    "VCS_PORTAL",
    "FACEBOOK",
    "TOPCV",
    "ITVIEC",
    "VIETNAMWORKS",
    "LINKEDIN"
  ],
  "metadata": {
    "extensionVersion": "0.1.0",
    "capturedAt": "2026-06-29T00:00:00.000Z"
  }
}
```

Response envelope nên theo Phase 1 API contract:

```json
{
  "success": true,
  "data": {
    "resultCode": "CREATED",
    "jobDescriptionId": "uuid",
    "jobDescriptionVersionId": "uuid",
    "jobPostingId": "uuid",
    "snapshotHash": "sha256",
    "channels": [
      {
        "channel": "VCS_PORTAL",
        "status": "PUBLISHED",
        "publishedUrl": "https://example.com/jobs/uuid"
      },
      {
        "channel": "TOPCV",
        "status": "NOT_CONFIGURED",
        "message": "Channel is not configured for automatic publishing."
      }
    ],
    "warnings": [
      {
        "code": "CHANNEL_NOT_CONFIGURED",
        "message": "TOPCV is not configured for automatic publishing."
      }
    ]
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

Confirmed `resultCode` values:

| Code | Meaning |
| --- | --- |
| `CREATED` | AMIS job mới, backend tạo JD/JD Version/JobPosting mới và xử lý publish theo `channels`. |
| `UPDATED` | AMIS job đã tồn tại, snapshot thay đổi, backend update JD và tạo JD Version mới theo workflow đã implement. |
| `DUPLICATE_OR_IDEMPOTENT_REPLAY` | Replay cùng `Idempotency-Key` hoặc cùng request đã xử lý, không tạo duplicate. |

Không dùng `OK` làm resultCode chính trong MVP. Nếu cần đọc response cũ, chỉ ghi chú backward compatibility ở implementation/API adapter, không đưa `OK` vào contract chính.

`NOT_CONFIGURED` là status chính thức cho external channel chưa cấu hình/API chưa verified trong MVP. `MANUAL_REQUIRED` là later/not used in MVP.

## 7. DTO specification

### 7.1 `SyncAmisJobPostingDto`

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `sourceSystem` | enum | Yes | MVP chỉ nhận `AMIS`. |
| `action` | enum | Yes | MVP chỉ nhận `PUBLISH`; `UPDATE`/`CLOSE` để later. |
| `idempotencyKey` | string | No/conditional | Optional body mirror nếu implementation quyết định hỗ trợ; `Idempotency-Key` header vẫn là chuẩn chính và required. |
| `amisRecruitmentId` | string | Yes | External stable id từ AMIS. Giá trị/source: `CẦN KHẢO SÁT AMIS`. |
| `amisUrl` | string | No/conditional | URL AMIS để audit/link back. Domain/path: `CẦN KHẢO SÁT AMIS`. |
| `snapshot` | `AmisJobSnapshotDto` | Yes | Data đã được extension capture và normalize. |
| `channels` | enum[] | Yes | Không rỗng; chỉ nhận `VCS_PORTAL`, `FACEBOOK`, `TOPCV`, `ITVIEC`, `VIETNAMWORKS`, `LINKEDIN`. |
| `metadata` | object | No | Chỉ metadata an toàn: extension version, capturedAt, source page hint nếu không chứa PII/secret. |

### 7.2 `AmisJobSnapshotDto`

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `title` | string | Yes | Required để tạo JD/posting. |
| `department` | string | `CẦN CONFIRM` | Map tới org/team nếu backend có domain tương ứng. |
| `location` | string | `CẦN CONFIRM` | Required hay optional phụ thuộc JobPosting entity hiện tại. |
| `employmentType` | enum/string | `CẦN CONFIRM` | Cần map với enum backend nếu có. |
| `level` | enum/string | `CẦN CONFIRM` | Cần map với level module hiện tại nếu dùng reference data. |
| `description` | string | Yes | Plain text hoặc sanitized HTML. Rich text handling: `CẦN CONFIRM`. |
| `requirements` | object | Yes | Phải là object; `requirements.rawText` required, non-empty string; các field còn lại optional. |
| `benefits` | string/object | No | Schema và rich text: `CẦN CONFIRM`. |
| `salaryRange` | object | No | Cần confirm có lưu ở Phase 1 hay chỉ metadata. |
| `deadline` | ISO date string | No | Validate date nếu có. |
| `headcount` | number | No | Integer positive nếu có. |

`requirements` schema tối thiểu đã confirm cho MVP:

```json
{
  "rawText": "string",
  "sections": [
    {
      "title": "string",
      "items": ["string"]
    }
  ],
  "mustHaveSkills": ["string"],
  "niceToHaveSkills": ["string"],
  "minExperienceYears": 0,
  "education": "string",
  "languages": ["string"],
  "certifications": ["string"],
  "notes": "string"
}
```

Validation MVP:

- `requirements` phải là object.
- `requirements.rawText` required, non-empty string.
- Các field còn lại optional.
- `sections` optional array.
- Nếu có `sections`, mỗi item có `title` string optional và `items` array string.
- Extension không bắt buộc parse đầy đủ skills/experience trong MVP. Payload tối thiểu hợp lệ là:

```json
{
  "rawText": "Nội dung yêu cầu công việc lấy từ AMIS",
  "sections": []
}
```

### 7.3 `ExtensionSyncResponseDto`

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `resultCode` | enum | Yes | Một trong các code ở section API contract. |
| `jobDescriptionId` | uuid | Conditional | Có khi sync tạo/cập nhật JD. |
| `jobDescriptionVersionId` | uuid | Conditional | Có khi tạo version mới. |
| `jobPostingId` | uuid | Conditional | Có khi tạo/cập nhật posting. |
| `snapshotHash` | string | Yes | Hash dùng để detect snapshot change/versioning, không phải idempotency key chính. |
| `channels` | `ChannelPostingResultDto[]` | Yes | Kết quả từng channel request. |
| `warnings` | object[] | No | Warnings không làm fail request. |

### 7.4 `ChannelPostingResultDto`

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `channel` | enum | Yes | `VCS_PORTAL`, `FACEBOOK`, `TOPCV`, `ITVIEC`, `VIETNAMWORKS`, `LINKEDIN`. |
| `status` | enum | Yes | MVP dùng `PUBLISHED`, `PUBLISH_FAILED`, `NOT_CONFIGURED`; `UPDATED`/`CLOSED` có thể xuất hiện nếu service hiện có hỗ trợ; `MANUAL_REQUIRED` later/not used in MVP. |
| `publishedUrl` | string | No | Chỉ có khi channel trả link hợp lệ. |
| `externalPostingId` | string | No | Chỉ có khi channel/API cung cấp. |
| `message` | string | No | Safe message cho extension UI. |

## 8. Idempotency design

Backend phải chống tạo trùng khi:

- Extension retry vì timeout/network.
- HR bấm confirm nhiều lần.
- Browser reload rồi gửi lại cùng snapshot.
- Extension gửi lại sau khi backend đã xử lý nhưng response trước đó bị mất.

Confirmed primary idempotency identity:

```text
Idempotency-Key
```

Rule:

- `Idempotency-Key` header required cho sync/publish request từ extension.
- `Idempotency-Key` là key chính để chống duplicate/replay.
- Nếu cùng `Idempotency-Key` được gửi lại và request đã xử lý thành công, backend trả lại kết quả trước đó hoặc `resultCode = DUPLICATE_OR_IDEMPOTENT_REPLAY`.
- Nếu cùng `Idempotency-Key` nhưng normalized request body khác, backend trả `409 IDEMPOTENCY_CONFLICT`.
- Header là source chính. Body field `idempotencyKey` chỉ là optional mirror nếu implementation quyết định hỗ trợ; nếu cả hai cùng có thì header ưu tiên.

Snapshot hash vẫn bắt buộc nhưng vai trò đổi thành:

- Detect snapshot AMIS có thay đổi hay không.
- Quyết định tạo JD Version mới.
- Trace/debug safe metadata.
- Không phải idempotency key chính.

Snapshot hash input:

- `snapshot` canonical JSON.
- Loại bỏ volatile metadata như `capturedAt`, extension runtime metadata, request id, UI-only values.
- Không loại bỏ business fields như `title`, `description`, `requirements`, `benefits`, `location`, `deadline`.

Behavior:

| Condition | Backend behavior |
| --- | --- |
| New `Idempotency-Key`, chưa có AMIS external reference | Tạo JD/JD Version/JobPosting mới, lưu external reference, trả `CREATED`. |
| New `Idempotency-Key`, có AMIS external reference và snapshot hash khác | Update JD, tạo JD Version mới theo workflow, cập nhật external reference hash, trả `UPDATED`. |
| Same `Idempotency-Key`, request body giống request đã xử lý | Không tạo duplicate, trả replay result với `DUPLICATE_OR_IDEMPOTENT_REPLAY`. |
| Same `Idempotency-Key`, request body khác | Trả `409 IDEMPOTENCY_CONFLICT`. |
| New `Idempotency-Key`, same AMIS reference và snapshot hash giống bản mới nhất | Không tạo version mới; trả `DUPLICATE_OR_IDEMPOTENT_REPLAY` hoặc response replay theo policy implementation cần ghi rõ trong BE-EXT-04. |
| External AMIS reference map tới nhiều posting | Trả `CONFLICT_REQUIRES_REVIEW`, ghi audit. |

Storage đề xuất:

- `external_references` hoặc `recruitment_external_references` là source of truth cho mapping AMIS -> internal entity.
- Có thể thêm `extension_idempotency_records` nếu cần replay response an toàn theo `Idempotency-Key`.
- Nếu chưa tạo bảng idempotency riêng, BE-EXT-01/BE-EXT-04 phải ghi rõ strategy trước implement.

`extension_idempotency_records` schema tối thiểu đề xuất:

| Field | Type | Note |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `idempotencyKey` | string | Required, unique |
| `sourceSystem` | string | MVP: `AMIS` |
| `requestHash` | string | Hash normalized request |
| `status` | enum | `PROCESSING`, `SUCCEEDED`, `FAILED` |
| `responseData` | jsonb nullable | Safe response data để replay |
| `actorUserId` | uuid | User gọi |
| `createdAt` | timestamp |  |
| `updatedAt` | timestamp |  |

## 9. Domain mapping

Mapping đề xuất từ AMIS snapshot vào Phase 1 domain:

| AMIS/Extension field | Backend target | Note |
| --- | --- | --- |
| `sourceSystem = AMIS` | `external_references.sourceSystem` hoặc `recruitment_external_references.sourceSystem` | External mapping source of truth nằm ở bảng riêng. |
| `amisRecruitmentId` | `external_references.externalId` | Nguồn giá trị: `CẦN KHẢO SÁT AMIS`; unique cùng `sourceSystem + externalEntityType`. |
| `amisUrl` | `external_references.externalUrl` | Domain/path: `CẦN KHẢO SÁT AMIS`; nullable; không dùng làm id chính nếu AMIS có stable id. |
| `snapshot.title` | `JobDescription.title` / `JobPosting.title` | Tên job bắt buộc. |
| `snapshot.description` | JD content/version content | Rich text/sanitized HTML/plain text: `CẦN CONFIRM`. |
| `snapshot.requirements` | JD requirements structured data | Dùng schema tối thiểu đã confirm: required `rawText`, optional structured fields. |
| `snapshot.benefits` | JD/posting benefits metadata | Cần confirm entity field. |
| `snapshot.location` | `JobPosting` location hoặc metadata | Cần inspect current entity before implementation. |
| `snapshot.level` | Level reference hoặc free text | Cần map với `levels` domain nếu dùng reference table. |
| `snapshot.department` | Department/team metadata | Cần confirm backend model. |
| `snapshot.salaryRange` | Compensation metadata | Cần confirm Phase 1 có lưu/display không. |
| `snapshot.deadline` | Posting deadline/closing date | Cần confirm field hiện tại. |
| `snapshot.headcount` | Hiring need/headcount | Cần confirm field hiện tại. |
| `channels[]` | `ChannelPosting` rows | Một row/result cho mỗi channel request. |

Nguyên tắc:

- AMIS snapshot không trở thành source of truth sau khi vào Core.
- External reference AMIS không lưu trực tiếp trên `JobPosting` làm source chính; bảng external reference riêng là source of truth cho mapping AMIS -> internal entity.
- `JobPosting` có thể cache một vài field nếu cần query nhanh, nhưng cache không thay thế bảng external reference.
- Core phải normalize và persist theo model của Phase 1.
- Extension không được gửi raw HTML toàn trang, cookie, token, CV data hoặc candidate PII qua endpoint này.

## 10. Database impact

Impact dự kiến nếu implement:

- Cần thêm bảng/entity external reference riêng:
  - `external_references`
  - hoặc `recruitment_external_references`
  - tên cuối cùng cần align convention backend hiện tại.
- Không recommend lưu trực tiếp `sourceSystem`, `externalRecruitmentId`, `externalUrl`, `lastSnapshotHash`, `lastSyncedAt` trên `JobPosting` làm source chính.
- `JobPosting` có thể cache một vài field nếu cần query nhanh, nhưng mapping source of truth là bảng riêng.
- Schema tối thiểu đề xuất cho external reference:

| Field | Type | Note |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `sourceSystem` | enum/string | MVP: `AMIS` |
| `externalEntityType` | enum/string | MVP: `JOB_POSTING` |
| `externalId` | string | AMIS recruitment id |
| `externalUrl` | string nullable | AMIS URL nếu có |
| `internalEntityType` | enum/string | `JOB_POSTING` |
| `internalEntityId` | uuid | Link tới JobPosting |
| `lastSnapshotHash` | string nullable | Hash snapshot mới nhất |
| `lastIdempotencyKey` | string nullable | Idempotency key mới nhất |
| `lastSyncedAt` | timestamp nullable | Lần sync gần nhất |
| `metadata` | jsonb nullable | Safe metadata only |
| `createdAt` | timestamp |  |
| `updatedAt` | timestamp |  |

- Unique/index đề xuất:
  - Unique: `sourceSystem + externalEntityType + externalId`
  - Index: `internalEntityType + internalEntityId`
  - Optional unique/idempotency index: `sourceSystem + idempotencyKey` nếu có bảng riêng lưu idempotency event.
- `channel_postings` cần lưu trạng thái từng channel theo job posting.
- Channel status MVP cần hỗ trợ `NOT_CONFIGURED`; `MANUAL_REQUIRED` later/not used in MVP.
- Audit log cần lưu actor, action, target ids, source system, result code, safe metadata.

Không tạo migration trong task này. Trước khi implement cần inspect source hiện tại và migration plan đang dùng trong project.

## 11. Channel handling

`VCS_PORTAL`:

- Là channel chính trong MVP.
- Backend có thể auto-publish nếu JD/posting hợp lệ.
- Nếu publish thành công, trả `PUBLISHED` và `publishedUrl` nếu service hiện tại cung cấp.
- Nếu publish fail do validation/business rule, request có thể fail hoặc trả `PUBLISH_FAILED` tùy điểm fail. Cần confirm policy cụ thể.

External channels:

- `FACEBOOK`
- `TOPCV`
- `ITVIEC`
- `VIETNAMWORKS`
- `LINKEDIN`

Policy đề xuất:

- Chưa giả định external channel API/selector/domain tồn tại.
- Chưa tự động publish khi chưa verified/configured.
- Không làm fail toàn bộ request nếu external channel chưa cấu hình.
- Trả per-channel status `NOT_CONFIGURED`.
- Có thể tạo `ChannelPosting` row để HR biết channel chưa cấu hình/API chưa verified.
- `MANUAL_REQUIRED` là later/not used in MVP.

Ghi chú gap source: current source enum có thể chưa có `ITVIEC` và chưa có `NOT_CONFIGURED`; implementation phải bổ sung/normalize theo quyết định đã confirm.

## 12. Audit and security

Security requirements:

- Endpoint yêu cầu JWT Bearer token.
- Chỉ `ADMIN` và `HR` được gọi.
- Không nhận candidate/public token.
- Không nhận hoặc lưu AMIS cookie, AMIS auth token, browser localStorage/sessionStorage dump.
- Không log raw full snapshot nếu snapshot có thể chứa thông tin nhạy cảm.
- Không log raw HTML AMIS page.
- Không log Authorization header.
- Không log CV content/candidate PII qua endpoint này.

Audit events đề xuất:

| Event | When | Metadata an toàn |
| --- | --- | --- |
| `EXTENSION_AMIS_SYNC_REQUESTED` | Bắt đầu request hợp lệ về auth | actor id, role, sourceSystem, external id hash/reference, channels. |
| `EXTENSION_AMIS_VALIDATION_FAILED` | DTO/domain validation fail | field names, safe error code. |
| `EXTENSION_AMIS_SYNC_CREATED` | Tạo mới JD/posting | target ids, snapshotHash. |
| `EXTENSION_AMIS_SYNC_DUPLICATE` | Idempotent duplicate | target ids, snapshotHash. |
| `EXTENSION_AMIS_SYNC_UPDATED` | Tạo version/update posting | target ids, old/new snapshotHash. |
| `EXTENSION_AMIS_PUBLISH_RESULT` | Sau channel publishing | per-channel status, no secret payload. |

## 13. Error handling

Envelope nên tuân thủ Phase 1 API contract và global exception filter hiện có:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Required field is missing.",
    "details": {
      "field": "snapshot.title"
    }
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

Expected errors:

| HTTP | Code | Meaning |
| --- | --- | --- |
| `400` | `VALIDATION_FAILED` | Missing/invalid DTO field, unsupported action, unsupported source system. |
| `401` | `UNAUTHORIZED` | Missing/expired/invalid JWT. |
| `403` | `FORBIDDEN` | Authenticated user lacks `ADMIN`/`HR`. |
| `409` | `IDEMPOTENCY_CONFLICT` | Same idempotency key with different body, or AMIS reference conflict. |
| `409` | `CONFLICT_REQUIRES_REVIEW` | Same AMIS reference maps ambiguously or current posting state cannot be auto-updated. |
| `500` | `INTERNAL_SERVER_ERROR` | Unexpected backend error. Do not expose secret/internal stack to extension. |
| `502/503` | `CHANNEL_PUBLISH_UNAVAILABLE` | Optional if channel publishing dependency is unavailable. |

Business warning không nên là HTTP error:

- External channel not configured.
- External channel API not verified.

Các warning này nên nằm trong `data.warnings` và `data.channels[]`.

## 14. CORS / environment impact

Current backend CORS đang phụ thuộc `FRONTEND_URL` hoặc default local frontend origin. Browser Extension sẽ có origin dạng:

```text
chrome-extension://<extension-id>
```

Impact cần xử lý trước implement:

- Thêm env var cho allowed extension origins, ví dụ `EXTENSION_ALLOWED_ORIGINS`.
- Production không dùng wildcard CORS.
- Local dev extension id có thể khác production extension id.
- Nếu extension gọi backend qua deployed API domain, cần confirm base URL theo environment.
- Nếu dùng cookies thì CORS/credentials phức tạp hơn, nhưng MVP đang nghiêng về JWT Bearer token. Auth/token storage decision vẫn `CẦN CONFIRM`.

Không thay đổi `.env` hoặc `main.ts` trong task tài liệu này.

## 15. Test cases

Các test case cần có khi implement, nhưng task hiện tại không tạo test file và không chạy test.

| Group | Case | Expected |
| --- | --- | --- |
| Auth | No JWT | `401 UNAUTHORIZED`. |
| Auth | Expired JWT | `401 UNAUTHORIZED`. |
| Auth | `INTERVIEWER` role | `403 FORBIDDEN`. |
| Auth | `HR` role | Request được xử lý nếu payload hợp lệ. |
| Auth | `ADMIN` role | Request được xử lý nếu payload hợp lệ. |
| Validation | Missing `Idempotency-Key` | `400 VALIDATION_FAILED` hoặc `400 IDEMPOTENCY_KEY_REQUIRED` theo error code implementation. |
| Validation | Missing `snapshot.title` | `400 VALIDATION_FAILED`. |
| Validation | Missing `snapshot.requirements` | `400 VALIDATION_FAILED` theo MVP block rule. |
| Validation | Missing/empty `snapshot.requirements.rawText` | `400 VALIDATION_FAILED`. |
| Validation | Missing/empty `channels` | `400 VALIDATION_FAILED`. |
| Validation | Unsupported `sourceSystem` | `400 VALIDATION_FAILED`. |
| Validation | Unsupported `action` other than `PUBLISH` | `400 VALIDATION_FAILED` hoặc `501/400` theo policy confirm. |
| Idempotency | Same `Idempotency-Key` + same body replay | Returns `DUPLICATE_OR_IDEMPOTENT_REPLAY`, no duplicate posting/version. |
| Idempotency | Same `Idempotency-Key` + different body | `409 IDEMPOTENCY_CONFLICT`. |
| Idempotency | New `Idempotency-Key` + same AMIS snapshot | No duplicate domain records; behavior must follow BE-EXT-04 policy and be documented before implementation. |
| Versioning | New AMIS job | Returns `CREATED`. |
| Versioning | Same AMIS id + changed hash | Returns `UPDATED`, creates new JD version or updates posting according to confirmed workflow. |
| Channel | `VCS_PORTAL` only | Publishes/records VCS Portal result. |
| Channel | `TOPCV` not configured | Request success with `NOT_CONFIGURED` warning. |
| Channel | Multiple external channels not configured | Request success if Core sync/VCS Portal succeeds; warnings per channel. |
| Audit | Successful sync | Audit event contains actor, target ids, source, result, no raw secrets. |
| Audit | Validation failure | Audit/error log safe; no token/raw HTML/full snapshot. |
| CORS | Extension origin not allowed | Browser blocks request / backend rejects according to CORS config. |
| CORS | Confirmed extension origin allowed | Browser extension can call API with JWT Bearer. |

## 16. Gap / Conflict cần xử lý

1. Current backend source chưa có `ExtensionIntegrationModule`, `ExtensionIntegrationController` hoặc route `/api/extension/amis/job-postings/sync-and-publish`, trong khi một số extension spec trước đó mô tả endpoint như đã có. Cần sửa lại quyết định/spec hoặc implement sau khi confirm.

2. Phase 1 backend specs hiện mô tả AMIS là later integration/extension point. Browser Extension specs lại đề xuất AMIS -> Backend sync/publish path. Cần chốt đây là Phase 1 scope, extension track song song, hay post-Phase 1.

3. User đã chốt MVP dùng `NOT_CONFIGURED` cho channel ngoài chưa configured/API chưa verified; `MANUAL_REQUIRED` là later/not used in MVP. Current source/spec cũ có thể vẫn dùng `MANUAL_REQUIRED`, implementation cần normalize enum/status.

4. User đã chốt bổ sung `ITVIEC` vào channel enum MVP. Current Phase 1/source channel enum có thể chưa có `ITVIEC`, implementation cần bổ sung/normalize.

5. User đã chốt external AMIS reference lưu ở bảng riêng (`external_references` hoặc `recruitment_external_references` theo convention), không lưu trực tiếp trên `JobPosting` làm nguồn chính. Source/schema hiện tại cần migration/design cho bảng riêng này.

6. User đã chốt `Idempotency-Key` là required và là idempotency key chính. Implementation cần quyết định có tạo `extension_idempotency_records` riêng hay lưu replay record bằng cơ chế tương đương.

7. AMIS domain, URL pattern, page selector, API source, stable recruitment id và field mapping đều chưa được khảo sát. Tất cả phần này là `CẦN KHẢO SÁT AMIS`.

8. `requirements` schema tối thiểu đã confirm với required `rawText`; rich text handling, benefits schema, salary/deadline/headcount mapping vẫn chưa được confirm. Không được invent AMIS mapping thật.

9. Auth/token storage và CORS extension origin vẫn pending. Current backend CORS chỉ phục vụ frontend origin. Cần confirm extension id/origin và env config.

10. Existing file numbering trong `docs/recruitment-phase1` đã có file `16_frontend_ui_scope_until_batch_c.md`. File này dùng tên `16_extension_integration_module_specification.md` theo request, nên có duplicate numeric prefix cần chấp nhận hoặc renumber sau.

## 17. Open Questions / Cần confirm

1. Có đưa `extension-integration` vào Phase 1 implementation không, hay chỉ giữ như extension track/post-Phase-1?
2. Endpoint chính thức có phải `POST /api/extension/amis/job-postings/sync-and-publish` không?
3. Tên bảng external reference cuối cùng là `external_references` hay `recruitment_external_references` theo convention backend?
4. Có tạo bảng riêng `extension_idempotency_records` không, hay lưu idempotency replay bằng cơ chế tương đương?
5. Nếu new `Idempotency-Key` gửi cùng AMIS id + same snapshot hash đã sync trước đó, response nên là `DUPLICATE_OR_IDEMPOTENT_REPLAY` hay replay response gần nhất? Cần chốt trước implement.
6. `description` và `benefits` dùng plain text, sanitized HTML hay structured rich text?
7. `department`, `level`, `employmentType`, `location`, `salaryRange`, `deadline`, `headcount` map vào field/entity nào trong source hiện tại?
8. Extension production origin/id là gì để cấu hình CORS?
9. Extension auth dùng login web hiện có, token copy/hand-off, hay auth flow riêng?
10. Khi AMIS snapshot thay đổi sau khi đã published, backend auto update VCS Portal hay tạo draft/version chờ HR review?
11. Nếu VCS Portal publish fail nhưng Core sync thành công, response nên rollback, giữ draft, hay trả partial result?
12. Có cần API read trạng thái sync gần nhất để extension hiển thị `last synced` không?

## 18. Implementation note

Tài liệu này là specification-only.

Không thực hiện trong task này:

- Không tạo backend module.
- Không thêm controller/service/DTO source.
- Không thêm migration.
- Không chỉnh enum.
- Không chỉnh CORS/env.
- Không sửa extension source.
- Không sửa legacy `sessions`, `evaluations`, `export`, `submissions`.
- Không tạo hoặc sửa unit test.

Khi chuyển sang implementation, cần làm theo thứ tự:

1. Confirm các gap/open questions ở section 16-17.
2. Inspect current backend entities/enums/services trước khi thiết kế migration.
3. Implement module adapter mỏng, reuse domain services hiện có.
4. Bảo toàn Phase 1 source of truth ở Recruitment Core.
5. Chạy verification theo project rules sau code change.
