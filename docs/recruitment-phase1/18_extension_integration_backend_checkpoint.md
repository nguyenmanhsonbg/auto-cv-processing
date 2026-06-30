# 18. Extension Integration Backend Checkpoint

## 1. Mục tiêu checkpoint

Checkpoint này lưu lại trạng thái backend `extension-integration` sau khi hoàn thành các batch foundation, trước khi chuyển sang xây Browser Extension.

Mục tiêu là ghi rõ phần backend đã hoàn thiện, phần chưa làm, endpoint hiện tại đang behave thế nào, contract đã chốt, và các batch backend sẽ tiếp tục sau khi quay lại.

## 2. Backend implementation status hiện tại

| Batch | Tên batch | Status | Ghi chú |
| --- | --- | --- | --- |
| `BE-EXT-00` | Source Verification & Conflict Resolution | DONE | Đã xác minh thiếu module/endpoint cũ, đã chốt conflict. |
| `BE-EXT-01` | Database / Entity Readiness | DONE | Đã tạo external reference và idempotency records. |
| `BE-EXT-02` | DTO / Enum / Contract | DONE | Đã tạo DTO/enums, dùng `channels`. |
| `BE-EXT-03` | Module / Controller Foundation | DONE | Đã có endpoint thật, guard/header validation. |
| `BE-EXT-04` | Stable Snapshot Hash & Idempotency Foundation | DONE | Đã có hash util và idempotency service foundation. |
| `BE-EXT-05` | Domain Mapping Orchestration | NOT_STARTED | Tạm dừng để xây extension trước. |
| `BE-EXT-06` | Channel Posting Behavior | NOT_STARTED | Chưa làm. |
| `BE-EXT-07` | Audit / Safe Metadata | NOT_STARTED | Chưa làm. |
| `BE-EXT-08` | Response / Error Handling | NOT_STARTED | Chưa làm success response thật. |
| `BE-EXT-09` | CORS / Environment Gap | LATER | Auth/token/CORS production để sau. |
| `BE-EXT-10` | Tests / Verification | PARTIAL | Chưa test runtime endpoint sync success vì chưa có nghiệp vụ thật. |

## 3. Files backend đã tạo/sửa

### BE-EXT-01 / BE-EXT-02

- `apps/backend/src/recruitment-common/enums/recruitment.enum.ts`
- `apps/backend/src/extension-integration/enums/extension-integration.enum.ts`
- `apps/backend/src/extension-integration/dto/sync-amis-job-posting.dto.ts`
- `apps/backend/src/extension-integration/dto/extension-sync-response.dto.ts`
- `apps/backend/src/extension-integration/entities/recruitment-external-reference.entity.ts`
- `apps/backend/src/extension-integration/entities/extension-idempotency-record.entity.ts`
- `apps/backend/src/migrations/1782717683118-CreateExtensionIntegrationReadiness.ts`

### BE-EXT-03

- `apps/backend/src/extension-integration/extension-integration.module.ts`
- `apps/backend/src/extension-integration/extension-integration.controller.ts`
- `apps/backend/src/extension-integration/extension-integration.service.ts`
- `apps/backend/src/app.module.ts`

### BE-EXT-04

- `apps/backend/src/extension-integration/utils/stable-json.util.ts`
- `apps/backend/src/extension-integration/utils/hash.util.ts`
- `apps/backend/src/extension-integration/utils/index.ts`
- `apps/backend/src/extension-integration/extension-idempotency.service.ts`
- `apps/backend/src/extension-integration/extension-integration.service.ts`
- `apps/backend/src/extension-integration/extension-integration.module.ts`

## 4. Contract đã chốt

### Request field

- Dùng `channels`.
- Không dùng `selectedChannels`.

### Channel enum MVP

- `VCS_PORTAL`
- `FACEBOOK`
- `TOPCV`
- `ITVIEC`
- `VIETNAMWORKS`
- `LINKEDIN`

### Channel status MVP

- Dùng `NOT_CONFIGURED`.
- Không dùng `MANUAL_REQUIRED` trong MVP.

### Result code chính thức

- `CREATED`
- `UPDATED`
- `DUPLICATE_OR_IDEMPOTENT_REPLAY`
- `OK` chỉ là backward compatibility note, không phải resultCode chính.

### Idempotency

- Header `Idempotency-Key` là bắt buộc.
- `Idempotency-Key` là primary idempotency key.
- Same key + same request replay: không duplicate.
- Same key + different body: conflict.
- `snapshotHash` chỉ dùng cho change detection/versioning, không phải idempotency key chính.

### External reference

- AMIS external reference lưu ở bảng riêng.
- Không lưu trực tiếp trên `JobPosting` làm source of truth.

### Requirements schema MVP

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

Validation tối thiểu:

- `requirements` là object.
- `requirements.rawText` required, non-empty.
- Các field còn lại optional.

## 5. Endpoint hiện tại

Route thật:

```http
POST /api/extension/amis/job-postings/sync-and-publish
```

Route calculation:

- Global prefix: `/api`
- Controller prefix: `extension/amis/job-postings`
- Method path: `sync-and-publish`

Auth/role hiện tại:

- Dùng `JwtAuthGuard`.
- Dùng `RolesGuard`.
- Allowed roles:
  - `ADMIN`
  - `HR`
- `INTERVIEWER` bị chặn 403.

Header:

- `Idempotency-Key`: required.
- `X-Request-Id`: optional.
- `X-Extension-Version`: optional.

## 6. Behavior hiện tại của endpoint

Hiện tại endpoint đã có foundation nhưng chưa xử lý nghiệp vụ thật.

Expected hiện tại:

- Không token -> 401.
- Role không hợp lệ -> 403.
- Thiếu/blank `Idempotency-Key` -> 400 với code `IDEMPOTENCY_KEY_REQUIRED`.
- Payload invalid -> 400.
- Payload valid + role `ADMIN`/`HR` -> service compute `requestHash` và `snapshotHash`, sau đó throw `EXTENSION_INTEGRATION_NOT_IMPLEMENTED`.

Chưa làm:

- Chưa ghi idempotency record từ public endpoint.
- Chưa tạo JD.
- Chưa tạo JD Version.
- Chưa tạo JobPosting.
- Chưa tạo ChannelPosting.
- Chưa publish VCS Portal.
- Chưa ghi audit.
- Chưa trả `CREATED`/`UPDATED`/`DUPLICATE_OR_IDEMPOTENT_REPLAY` từ endpoint thật.

## 7. Hash / idempotency foundation đã có

- `stableStringify()` đã có.
- `sha256Hex()` đã có.
- `createExtensionRequestHash()` đã có.
- `createAmisSnapshotHash()` đã có.
- `ExtensionIdempotencyService` đã có:
  - `findByKey`
  - `createProcessingRecord`
  - `assertKeyCanBeUsed`
  - `markSucceeded`
  - `markFailed`

Conflict codes đã có:

- `IDEMPOTENCY_KEY_CONFLICT`
- `IDEMPOTENCY_REQUEST_IN_PROGRESS`
- `IDEMPOTENCY_REQUEST_FAILED_RETRY_WITH_NEW_KEY`

## 8. Việc backend còn lại sau khi quay lại

1. `BE-EXT-05`: Domain Mapping Orchestration.
2. `BE-EXT-06`: Channel Posting Behavior.
3. `BE-EXT-07`: Audit / Safe Metadata.
4. `BE-EXT-08`: Response / Error Handling thật.
5. `BE-EXT-09`: CORS/env cho extension origin.
6. `BE-EXT-10`: Test/runtime verification.

## 9. Lưu ý cho giai đoạn xây extension

- Extension có thể bắt đầu scaffold, UI, state machine, DTO mapping, API client.
- Extension không được kỳ vọng endpoint trả success thật ở thời điểm này.
- Extension API client phải handle được lỗi `EXTENSION_INTEGRATION_NOT_IMPLEMENTED`.
- Trong lúc backend chưa xong, extension có thể dùng mock response hoặc dev mode.
- Extension phải dùng field `channels`, không dùng `selectedChannels`.
- Extension phải gửi header `Idempotency-Key`.
- Extension phải chuẩn bị payload `requirements.rawText`.
- Extension chưa được bịa AMIS selector/API/URL nếu chưa khảo sát.
- Extension MVP trigger dùng nút extension, chưa hook nút AMIS “Đăng tin”.

## 10. Open blockers trước khi extension gọi backend thật

- Auth flow extension.
- Token storage.
- BE API domain.
- CORS extension origin.
- AMIS domain allowlist.
- AMIS URL pattern.
- `amisRecruitmentId` source.
- AMIS capture source.
- AMIS field mapping.
- Rich text transform.
- Backend `BE-EXT-05` đến `BE-EXT-08` chưa xong.

## 11. Update task breakdown status

Task breakdown hiện được cập nhật ở `docs/recruitment-phase1/17_extension_integration_implementation_task_breakdown.md` với trạng thái:

- `BE-EXT-01`: DONE
- `BE-EXT-02`: DONE
- `BE-EXT-03`: DONE
- `BE-EXT-04`: DONE
- `BE-EXT-05+`: NOT_STARTED / LATER
