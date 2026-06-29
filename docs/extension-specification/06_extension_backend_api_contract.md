# 06. Extension Backend API Contract

## 1. Mục tiêu tài liệu

Tài liệu này định nghĩa API contract giữa Browser Extension và BE CV / Recruitment Core cho MVP đồng bộ AMIS Job Snapshot.

Mục tiêu là giúp extension biết endpoint nào cần gọi, method, auth/header, request body, response body, result code, channel status, error response và retry/idempotency behavior. Tài liệu này chỉ ghi nhận contract theo source backend hiện tại và các phần còn thiếu cần confirm; không implement code, không tạo source extension và không sửa backend.

## 2. API contract principles

- Extension chỉ gọi BE CV / Recruitment Core API.
- Extension không gọi DB, MinIO, object storage hoặc external recruitment channel API trực tiếp.
- BE là nơi validate chính, xử lý idempotency, versioning JD, JobPosting, ChannelPosting, audit và publish.
- Extension chỉ gửi request sau khi HR đã xem preview và xác nhận.
- Request không chứa dữ liệu không cần thiết cho job posting.
- Extension và BE không log full snapshot, full JD payload, token hoặc dữ liệu nhạy cảm.
- API phải có auth/role phù hợp.
- API phải hỗ trợ replay/retry an toàn, không tạo duplicate khi snapshot không đổi.
- Các chi tiết chưa thấy trong source hoặc chưa được chốt phải ghi `CẦN CONFIRM` hoặc `CẦN KIỂM TRA SOURCE`.

## 3. Backend source inspection summary

Source backend hiện tại có module riêng cho AMIS extension integration:

| Hạng mục | Source / behavior thật | Ghi chú |
| --- | --- | --- |
| Module | `ExtensionIntegrationModule` | Import trong `apps/backend/src/app.module.ts`, module nằm ở `apps/backend/src/extension-integration`. |
| Controller | `ExtensionIntegrationController` | `@Controller('extension/amis/job-postings')`. Global prefix trong `main.ts` là `/api`. |
| Service | `ExtensionIntegrationService` | Xử lý normalize request, hash snapshot, idempotency, JD/JD Version/JobPosting/ChannelPosting và audit. |
| DTO | `SyncAmisJobPostingDto` | Field DTO đang dùng `unknown` + `@Allow()`, validation chính nằm trong service. |
| Endpoint chính | `POST /api/extension/amis/job-postings/sync-and-publish` | Đã implement trong source. |
| Auth | `JwtAuthGuard`, `RolesGuard` | Controller dùng `@UseGuards(JwtAuthGuard, RolesGuard)`. |
| Role | `ADMIN`, `HR` | Controller dùng `@Roles(UserRole.ADMIN, UserRole.HR)`. |
| Headers | `X-Request-Id`, `Idempotency-Key`, `X-Extension-Version` | Optional theo Swagger/source; được đưa vào response `meta` và audit metadata. |
| Actions | `PUBLISH`, `UPDATE`, `CLOSE` | Enum `AmisJobPostingAction`. |
| Channels | `VCS_PORTAL`, `FACEBOOK`, `ITVIEC`, `LINKEDIN`, `TOPCV`, `VIETNAMWORKS`, `MANUAL`, `OTHER` | Enum `RecruitmentChannel`. |
| Result code | `OK`, `DUPLICATE_OR_IDEMPOTENT_REPLAY` | Source không trả riêng `CREATED` hoặc `UPDATED`. |
| Channel status | `DRAFT`, `PUBLISHING`, `PUBLISHED`, `PUBLISH_FAILED`, `MANUAL_REQUIRED`, `NOT_CONFIGURED`, `UPDATED`, `CLOSED` | Enum `ChannelPostingStatus`. |
| VCS Portal | Tạo `publishedUrl` dạng `/api/public/job-postings/:slug` hoặc absolute URL nếu có host | Channel `VCS_PORTAL` trả `PUBLISHED` hoặc `UPDATED`. |
| External channels chưa verify | Trả `NOT_CONFIGURED`, `errorCode: CHANNEL_NOT_CONFIGURED`, không fail toàn bộ request | Áp dụng cho channel không phải `VCS_PORTAL` trong logic hiện tại. |
| Audit | Ghi requested/succeeded/failed events với metadata an toàn | Không lưu full snapshot trong audit metadata. |
| Snapshot hash | BE tự tính bằng SHA-256 trên stable JSON stringify của `snapshot` | `Idempotency-Key` chưa tham gia logic idempotency chính; chỉ được hash vào audit metadata. |

Phần chưa xác định đầy đủ từ source:

- Extension auth flow cụ thể dùng login hiện tại, Google OAuth, reuse web app token hay cơ chế riêng: `CẦN CONFIRM AUTH FLOW`.
- Token/JWT lưu ở đâu trong extension: `CẦN CONFIRM`.
- API get sync status theo `amisRecruitmentId`: chưa thấy trong source, `CẦN CONFIRM`.
- Error envelope chung cho toàn bộ backend: source endpoint có custom body cho lỗi service, auth guard dùng Nest default; cần test thực tế nếu muốn chốt UI parsing tuyệt đối.

## 4. API list for Extension MVP

| API | Method | Path | Auth | Purpose | Status |
| --- | --- | --- | --- | --- | --- |
| Sync and publish AMIS job | POST | `/api/extension/amis/job-postings/sync-and-publish` | HR/Admin JWT | Gửi AMIS Job Snapshot để BE sync JD/JD Version/JobPosting và tạo ChannelPosting | Implemented |
| Get AMIS sync status | GET | `CẦN KIỂM TRA SOURCE` | HR/Admin JWT? | Extension xem trạng thái khi HR mở lại AMIS job | Optional / chưa thấy endpoint trong source |
| Auth/login for extension | POST | `CẦN CONFIRM AUTH FLOW` | Public/JWT? | Lấy token cho extension | Có auth API chung trong BE, nhưng extension flow chưa chốt |

Existing auth APIs trong backend:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`

Việc extension có dùng các API này trực tiếp hay cần flow riêng là `CẦN CONFIRM AUTH FLOW`.

## 5. Main API: Sync and Publish AMIS Job

Endpoint thật từ source:

```text
POST /api/extension/amis/job-postings/sync-and-publish
```

Contract:

| Hạng mục | Giá trị |
| --- | --- |
| Method | `POST` |
| Path | `/api/extension/amis/job-postings/sync-and-publish` |
| Controller | `ExtensionIntegrationController` |
| Service method | `syncAndPublishAmisJobPosting` |
| Auth | `Authorization: Bearer <JWT>` |
| Role | `ADMIN` hoặc `HR` |
| Request body | `SyncAmisJobPostingDto` |
| Response body | Envelope `{ success, data, meta }` |
| Result code thật | `OK`, `DUPLICATE_OR_IDEMPOTENT_REPLAY` |
| Error code từ service | `VALIDATION_ERROR`, `INVALID_STATE_TRANSITION`, `INTERNAL_ERROR` |
| Channel error code trong response | `CHANNEL_NOT_CONFIGURED` |

Side effects:

- Tạo mới hoặc cập nhật `JobDescription`.
- Tạo `JobDescriptionVersion` active mới khi snapshot thay đổi.
- Tạo hoặc cập nhật `JobPosting`.
- Lưu external reference AMIS trên `JobPosting`: `sourceSystem`, `externalRecruitmentId`, `externalUrl`, `lastSnapshotHash`, `lastSyncedAt`.
- Tạo hoặc cập nhật `ChannelPosting` cho từng selected channel.
- Publish trạng thái `VCS_PORTAL` theo public job endpoint hiện có.
- Ghi audit logs cho sync/publish requested/succeeded/failed.

## 6. Required headers

| Header | Required? | Purpose | Status |
| --- | ---: | --- | --- |
| `Authorization: Bearer <token>` | Yes | Auth HR/Admin | Confirmed by `JwtAuthGuard` + `RolesGuard` |
| `X-Request-Id` | No / Recommended | Trace request | Optional theo source |
| `Idempotency-Key` | No / Recommended | Retry metadata/audit | Optional theo source; chưa dùng làm idempotency key chính |
| `X-Extension-Version` | No / Recommended | Debug compatibility | Optional theo source |

Header behavior thật:

- Controller đọc `x-request-id`, `idempotency-key`, `x-extension-version`.
- Response `meta` trả lại `requestId`, `idempotencyKey`, `extensionVersion` nếu có.
- Audit metadata lưu `requestId`, `extensionVersion`, `hasIdempotencyKey` và `idempotencyKeyHash`.
- Không lưu raw `Idempotency-Key` trong audit metadata.

## 7. Request body contract

Request body hiện tại theo DTO/service:

```json
{
  "amisRecruitmentId": "AMIS-REQ-2026-0001",
  "amisUrl": "https://amis.example/recruitment/jobs/AMIS-REQ-2026-0001",
  "action": "PUBLISH",
  "snapshot": {
    "title": "Senior Backend Developer",
    "description": "Build and operate recruitment services.",
    "requirements": {
      "skills": ["NestJS", "PostgreSQL"]
    },
    "benefits": {
      "summary": "Competitive compensation and growth opportunities."
    }
  },
  "selectedChannels": ["VCS_PORTAL", "TOPCV"]
}
```

Field contract:

| Field | Type | Required? | Source validation | Note |
| --- | --- | ---: | --- | --- |
| `amisRecruitmentId` | string | Yes | `requireText` | Trim, non-empty. Dùng làm external recruitment id. |
| `amisUrl` | string | No | `optionalText` | Nếu gửi thì phải là string; empty thành `null`. |
| `action` | enum | Yes | `PUBLISH`, `UPDATE`, `CLOSE` | Field bắt buộc. |
| `snapshot` | JSON object | Yes | Must be object | Không được là array/null. |
| `snapshot.title` | string | Yes | `requireText` | Trim, non-empty. |
| `snapshot.description` | string | Yes | `requireText` | Trim, non-empty. |
| `snapshot.requirements` | JSON object | Yes | Must be object | Không nhận plain string theo source hiện tại. |
| `snapshot.benefits` | JSON object/null | No | Nếu có thì must be object | `undefined` hoặc `null` được normalize thành `null`. |
| Other `snapshot.*` fields | unknown | No | Preserved | BE giữ qua spread trong normalized snapshot, đưa vào hash và version snapshot. Contract field mapping chi tiết vẫn theo file 05. |
| `selectedChannels` | array enum | Yes | Array không rỗng | Duplicate channel được dedupe. |

Allowed `action`:

| Value | Meaning |
| --- | --- |
| `PUBLISH` | Sync snapshot và publish/prepare channel posting. |
| `UPDATE` | Sync snapshot thay đổi và update channel posting nếu có. |
| `CLOSE` | Đóng posting/channel posting đã sync trước đó. |

Allowed `selectedChannels` theo source:

```text
VCS_PORTAL, FACEBOOK, ITVIEC, LINKEDIN, TOPCV, VIETNAMWORKS, MANUAL, OTHER
```

Lưu ý quan trọng:

- `snapshot.requirements` hiện phải là JSON object, không phải string.
- `snapshot.benefits` nếu có cũng phải là JSON object.
- Field AMIS thật mapping vào snapshot vẫn là `CẦN KHẢO SÁT AMIS`.
- Logical nested snapshot trong file 05 chưa phải wire contract hiện tại; wire contract hiện tại là flat object bên trong `snapshot`.

## 8. Response body contract

Response envelope thật từ controller:

```json
{
  "success": true,
  "data": {
    "resultCode": "OK",
    "jobDescriptionId": "uuid",
    "jobDescriptionVersionId": "uuid",
    "jobPostingId": "uuid",
    "amisRecruitmentId": "AMIS-REQ-2026-0001",
    "snapshotChanged": true,
    "channelPostings": [
      {
        "channelPostingId": "uuid",
        "channel": "VCS_PORTAL",
        "status": "PUBLISHED",
        "publishedUrl": "http://localhost:3002/api/public/job-postings/senior-backend-developer",
        "externalPostingId": "uuid",
        "errorCode": null,
        "manualActionRequired": false,
        "lastSyncAt": "2026-06-27T00:00:00.000Z"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-06-27T00:00:00.000Z",
    "requestId": "optional-request-id",
    "idempotencyKey": "optional-idempotency-key",
    "extensionVersion": "optional-extension-version"
  }
}
```

`data` fields:

| Field | Type | Meaning | Status |
| --- | --- | --- | --- |
| `resultCode` | string | `OK` hoặc `DUPLICATE_OR_IDEMPOTENT_REPLAY` | Confirmed |
| `jobDescriptionId` | uuid/string | JD nội bộ | Confirmed |
| `jobDescriptionVersionId` | uuid/string | JD version active sau sync | Confirmed |
| `jobPostingId` | uuid/string | JobPosting nội bộ | Confirmed |
| `amisRecruitmentId` | string | ID tin từ AMIS | Confirmed |
| `snapshotChanged` | boolean | Snapshot có thay đổi so với lần sync trước không | Confirmed |
| `channelPostings` | array | Kết quả từng channel | Confirmed |
| `publicUrl` | string | URL VCS Portal nếu có | BE không trả top-level field này; dùng `channelPostings[].publishedUrl` |

`channelPostings[]` fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `channelPostingId` | uuid/string | ID ChannelPosting nội bộ. |
| `channel` | enum | Channel được xử lý. |
| `status` | enum | Trạng thái channel posting. |
| `publishedUrl` | string/null | URL public nếu có, chủ yếu cho `VCS_PORTAL`. |
| `externalPostingId` | string/null | Với `VCS_PORTAL`, source hiện set bằng `jobPostingId`. |
| `errorCode` | string/null | Hiện chỉ map `CHANNEL_NOT_CONFIGURED` hoặc `null`. |
| `manualActionRequired` | boolean | `true` khi status là `MANUAL_REQUIRED` hoặc `NOT_CONFIGURED`. |
| `lastSyncAt` | ISO datetime/null | Lần sync channel gần nhất. |

BE gap nếu UI cần:

- Không có `created`/`updated` result code riêng.
- Không có top-level `publicUrl`.
- Không có endpoint get sync status trong source hiện tại.
- Không có human-readable manual instruction cho từng external channel.

## 9. Result code handling

Result code thật từ source:

| BE `data.resultCode` | Meaning | Extension behavior |
| --- | --- | --- |
| `OK` | Snapshot mới hoặc snapshot thay đổi, hoặc action hợp lệ đã được xử lý | Hiển thị sync thành công; dùng `snapshotChanged`, `action` và `channelPostings` để viết copy chính xác hơn. |
| `DUPLICATE_OR_IDEMPOTENT_REPLAY` | Snapshot hash không đổi với posting AMIS đã sync trước đó | Hiển thị đã đồng bộ trước đó, không tạo duplicate JD/JD Version/JobPosting. Không coi là lỗi nghiêm trọng. |

Các code `CREATED`, `UPDATED`, `FAILED` không phải result code thật trong source hiện tại. Nếu extension cần phân biệt new vs update ở UI, cần BE bổ sung field hoặc UI suy luận có kiểm soát: `CẦN CONFIRM / BE GAP`.

## 10. Channel result handling

Channel status enum thật từ source:

```text
DRAFT, PUBLISHING, PUBLISHED, PUBLISH_FAILED, MANUAL_REQUIRED, NOT_CONFIGURED, UPDATED, CLOSED
```

Mapping UI behavior:

| Channel status | Meaning theo source hiện tại | UI behavior |
| --- | --- | --- |
| `PUBLISHED` | `VCS_PORTAL` được publish khi action không phải `UPDATE`/`CLOSE` | Hiển thị thành công, show `publishedUrl` nếu có. |
| `UPDATED` | `VCS_PORTAL` được cập nhật khi action là `UPDATE` | Hiển thị đã cập nhật public job. |
| `CLOSED` | Channel posting được đóng khi action là `CLOSE` | Hiển thị đã đóng. |
| `NOT_CONFIGURED` | Channel chưa được cấu hình/verify trong BE | Hiển thị channel chưa cấu hình, không fail toàn bộ request. |
| `MANUAL_REQUIRED` | Cần thao tác thủ công | Hiển thị cần thao tác thủ công nếu BE trả status này. Trong logic hiện tại channel response thường dùng `NOT_CONFIGURED` cho non-portal channels. |
| `PUBLISH_FAILED` | Đăng lỗi | Hiển thị lỗi + retry nếu BE hỗ trợ. Chưa thấy branch tạo status này trong AMIS extension service hiện tại. |
| `PUBLISHING` | Đang publish | Có thể hiển thị pending nếu BE trả trong tương lai. |
| `DRAFT` | Draft channel posting | Không nên là trạng thái thành công cuối cùng trong UI nếu xuất hiện. |

Channel behavior thật:

- `VCS_PORTAL`: set `externalPostingId = jobPostingId`, set `publishedUrl`, status `PUBLISHED` hoặc `UPDATED`.
- Non-`VCS_PORTAL`: set status `NOT_CONFIGURED`, `publishedUrl = null`, `errorCode = CHANNEL_NOT_CONFIGURED`.
- `CLOSE`: tất cả selected channel postings trong request được set `CLOSED`.

## 11. Error response contract

Lỗi từ service dùng `BadRequestException` hoặc `InternalServerErrorException` với body dạng object:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "snapshot.title is required",
  "details": {}
}
```

`details` là optional.

Error handling table:

| HTTP status | Error code | Meaning | Extension behavior |
| --- | --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Payload/action/channel/snapshot không hợp lệ | Hiển thị field/copy an toàn, cho HR sửa rồi retry. |
| `400` | `INVALID_STATE_TRANSITION` | State không hợp lệ, ví dụ close job chưa sync hoặc update job đã closed | Hiển thị lỗi trạng thái, yêu cầu HR kiểm tra job/status. |
| `400` | `CHANNEL_NOT_CONFIGURED` | Code có trong type nhưng source hiện trả trong channel result, không throw toàn request | Không coi là request failure nếu nằm trong `channelPostings[].errorCode`. |
| `401` | Nest default / `Unauthorized` | Chưa authenticated hoặc JWT invalid/expired | Yêu cầu login lại. Envelope có thể khác custom service error. |
| `403` | Nest default / `Forbidden` | User không có role `ADMIN` hoặc `HR` | Hiển thị không đủ quyền. |
| `500` | `INTERNAL_ERROR` | Lỗi không bắt được khi sync | Hiển thị lỗi hệ thống an toàn, cho retry có kiểm soát. |
| Network error | N/A | Timeout, offline, CORS, BE unreachable | Cho retry, giữ nguyên intent/idempotency metadata nếu có. |

Lưu ý:

- `DUPLICATE_OR_IDEMPOTENT_REPLAY` trong source là success response, không phải HTTP error.
- Source hiện không dùng HTTP `409` cho invalid state hoặc duplicate.
- Auth error envelope cần test thực tế nếu UI cần parse chính xác: `CẦN KIỂM TRA SOURCE/RUNTIME`.

## 12. Idempotency and retry behavior

Idempotency behavior thật trong BE:

- BE tìm existing `JobPosting` bằng `sourceSystem = AMIS` và `externalRecruitmentId = amisRecruitmentId`.
- BE tự tính `snapshotHash = sha256(stableStringify(snapshot))`.
- Nếu existing posting có `lastSnapshotHash` bằng hash mới:
  - Không tạo JD mới.
  - Không tạo JD Version mới.
  - Không tạo JobPosting mới.
  - Cập nhật `externalUrl` và `lastSyncedAt`.
  - Trả `resultCode: DUPLICATE_OR_IDEMPOTENT_REPLAY`, `snapshotChanged: false`.
- Nếu snapshot hash thay đổi:
  - Update `JobDescription`.
  - Supersede active `JobDescriptionVersion` cũ.
  - Tạo `JobDescriptionVersion` active mới.
  - Update `JobPosting` với version/hash mới.
  - Trả `resultCode: OK`, `snapshotChanged: true`.
- Nếu chưa có posting:
  - Tạo `JobDescription`, version 1 và `JobPosting`.
  - Trả `resultCode: OK`, `snapshotChanged: true`.

Concurrency/retry safety:

- BE dùng PostgreSQL advisory lock theo key `extension-amis:${amisRecruitmentId}` trong transaction.
- `Idempotency-Key` header optional và chưa quyết định idempotency chính.
- Extension có thể retry an toàn với cùng `amisRecruitmentId` và cùng snapshot.
- Nếu retry sau network error, extension nên giữ cùng `Idempotency-Key` nếu đã sinh ra để trace/audit dễ hơn, dù BE hiện không dùng header đó để quyết định duplicate.

Snapshot hash owner:

- Theo source hiện tại, BE là bên tính `snapshotHash`.
- Extension không cần gửi `snapshotHash` trong request hiện tại.
- Nếu sau này muốn extension cũng tính hash để preview/debug, cần chốt canonical rule với BE: `CẦN CONFIRM`.

## 13. Auth and permission contract

Auth/permission theo source endpoint:

- Endpoint yêu cầu JWT Bearer token.
- Endpoint chỉ cho role `ADMIN` hoặc `HR`.
- Controller lấy actor từ `req.user.id`, `req.user.email`, `req.user.role`.
- Service kiểm tra user còn tồn tại trong DB trước khi sync.

Auth flow chưa chốt cho extension:

| Nội dung | Trạng thái |
| --- | --- |
| Extension dùng `POST /api/auth/login` trực tiếp hay không | `CẦN CONFIRM AUTH FLOW` |
| Extension reuse token từ web app hay không | `CẦN CONFIRM AUTH FLOW` |
| Extension dùng Google OAuth/SSO hay không | `CẦN CONFIRM AUTH FLOW` |
| Token/JWT lưu trong `chrome.storage.local`, `chrome.storage.session` hay chỉ memory | `CẦN CONFIRM` |
| Refresh token/expiry trong extension | `CẦN CONFIRM` |
| Logout/revoke token từ extension | `CẦN CONFIRM` |

Không tự quyết định token storage trong file này.

## 14. Security and audit notes

Security notes:

- Extension không gửi token hoặc secret của external channels.
- Extension không gọi external channel API trực tiếp.
- Extension không gửi full AMIS page content.
- Extension không log full snapshot/JD/token.
- BE không expose internal stack trace cho extension trong custom internal error.
- Request cần actor HR/Admin từ JWT.
- Header trace nên được gửi nếu extension có thể sinh: `X-Request-Id`, `Idempotency-Key`, `X-Extension-Version`.

Audit behavior thật:

| Event | Khi nào ghi |
| --- | --- |
| `EXTENSION_AMIS_SYNC_REQUESTED` | Sau khi request normalize thành công. |
| `EXTENSION_AMIS_PUBLISH_REQUESTED` | Sau khi normalize thành công và action là `PUBLISH`. |
| `EXTENSION_AMIS_SYNC_SUCCEEDED` | Sau transaction sync thành công. |
| `EXTENSION_AMIS_PUBLISH_SUCCEEDED` | Sau transaction thành công và action là `PUBLISH`. |
| `EXTENSION_AMIS_SYNC_FAILED` | Khi service throw error. |
| `EXTENSION_AMIS_PUBLISH_FAILED` | Khi action đã normalize là `PUBLISH` và service throw error. |

Audit metadata an toàn hiện gồm:

- `requestId`
- `extensionVersion`
- `hasIdempotencyKey`
- `idempotencyKeyHash`
- `sourceSystem`
- `externalRecruitmentId`
- `action`
- `selectedChannels`
- `snapshotHash`
- `resultCode`
- `snapshotChanged`
- internal IDs
- `channelCount`
- `errorCode` khi failed

Audit không lưu full request payload hoặc full snapshot trong metadata. Tuy nhiên `JobDescriptionVersion.snapshot` có lưu `amisSnapshot` để phục vụ versioning/audit nghiệp vụ; extension vẫn không nên gửi field thừa hoặc PII không cần thiết.

## 15. Optional / future APIs

Các API dưới đây chưa thấy implement cho extension, chỉ là candidate later:

| API | Purpose | Status |
| --- | --- | --- |
| `GET /api/extension/amis/job-postings/:amisRecruitmentId/status` | Lấy trạng thái sync khi HR mở lại AMIS job | LATER / `CẦN CONFIRM` |
| `POST /api/extension/amis/job-postings/sync-only` | Chỉ sync JD/JD Version/JobPosting, không publish | LATER / `CẦN CONFIRM` |
| `POST /api/extension/amis/job-postings/close` | API close riêng thay vì dùng action `CLOSE` trong endpoint chính | LATER / `CẦN CONFIRM` |
| `GET /api/extension/amis/job-postings/:amisRecruitmentId/channels` | Lấy channel posting result | LATER / `CẦN CONFIRM` |
| `GET /api/extension/config` | Lấy channel list/defaults, BE base config, feature flags | LATER / `CẦN CONFIRM` |
| `GET /api/extension/amis/job-postings/:amisRecruitmentId/public-url` | Lấy public job URL | LATER / `CẦN CONFIRM` |

Không coi các API này là implemented contract cho MVP nếu chưa có source.

## 16. Example requests and responses

Ví dụ minh họa - cần đối chiếu source BE nếu DTO thay đổi:

```bash
curl -X POST "http://localhost:3002/api/extension/amis/job-postings/sync-and-publish" \
  -H "Authorization: Bearer <HR_OR_ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: ext-demo-20260627-001" \
  -H "Idempotency-Key: amis-demo-001-publish" \
  -H "X-Extension-Version: 0.0.0-demo" \
  -d '{
    "amisRecruitmentId": "AMIS-DEMO-001",
    "amisUrl": "https://amis.example/recruitment/demo",
    "action": "PUBLISH",
    "snapshot": {
      "title": "Backend Developer",
      "description": "Build backend services.",
      "requirements": {
        "summary": "Experience with Node.js and PostgreSQL."
      },
      "benefits": {
        "summary": "Competitive benefits."
      }
    },
    "selectedChannels": ["VCS_PORTAL", "TOPCV"]
  }'
```

Success response minh họa:

```json
{
  "success": true,
  "data": {
    "resultCode": "OK",
    "jobDescriptionId": "00000000-0000-0000-0000-000000000001",
    "jobDescriptionVersionId": "00000000-0000-0000-0000-000000000002",
    "jobPostingId": "00000000-0000-0000-0000-000000000003",
    "amisRecruitmentId": "AMIS-DEMO-001",
    "snapshotChanged": true,
    "channelPostings": [
      {
        "channelPostingId": "00000000-0000-0000-0000-000000000004",
        "channel": "VCS_PORTAL",
        "status": "PUBLISHED",
        "publishedUrl": "http://localhost:3002/api/public/job-postings/backend-developer",
        "externalPostingId": "00000000-0000-0000-0000-000000000003",
        "errorCode": null,
        "manualActionRequired": false,
        "lastSyncAt": "2026-06-27T00:00:00.000Z"
      },
      {
        "channelPostingId": "00000000-0000-0000-0000-000000000005",
        "channel": "TOPCV",
        "status": "NOT_CONFIGURED",
        "publishedUrl": null,
        "externalPostingId": null,
        "errorCode": "CHANNEL_NOT_CONFIGURED",
        "manualActionRequired": true,
        "lastSyncAt": "2026-06-27T00:00:00.000Z"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-06-27T00:00:00.000Z",
    "requestId": "ext-demo-20260627-001",
    "idempotencyKey": "amis-demo-001-publish",
    "extensionVersion": "0.0.0-demo"
  }
}
```

Duplicate replay response minh họa:

```json
{
  "success": true,
  "data": {
    "resultCode": "DUPLICATE_OR_IDEMPOTENT_REPLAY",
    "jobDescriptionId": "00000000-0000-0000-0000-000000000001",
    "jobDescriptionVersionId": "00000000-0000-0000-0000-000000000002",
    "jobPostingId": "00000000-0000-0000-0000-000000000003",
    "amisRecruitmentId": "AMIS-DEMO-001",
    "snapshotChanged": false,
    "channelPostings": [
      {
        "channelPostingId": "00000000-0000-0000-0000-000000000004",
        "channel": "VCS_PORTAL",
        "status": "PUBLISHED",
        "publishedUrl": "http://localhost:3002/api/public/job-postings/backend-developer",
        "externalPostingId": "00000000-0000-0000-0000-000000000003",
        "errorCode": null,
        "manualActionRequired": false,
        "lastSyncAt": "2026-06-27T00:00:00.000Z"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-06-27T00:00:00.000Z"
  }
}
```

Validation error minh họa:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "snapshot.requirements must be a JSON object"
}
```

## 17. Contract gaps

Các gap cần xử lý trước khi dev extension:

- Auth flow chính thức của extension: `CẦN CONFIRM AUTH FLOW`.
- Token storage policy trong browser extension: `CẦN CONFIRM`.
- BE API domain/env config cho extension: `CẦN CONFIRM`.
- AMIS domain và URL pattern: `CẦN KHẢO SÁT AMIS`.
- Field mapping AMIS thật sang `snapshot`: `CẦN KHẢO SÁT AMIS`.
- `snapshot.requirements` hiện là JSON object; nếu extension capture rich text string thì cần transform rule: `CẦN CONFIRM`.
- Result code hiện chỉ có `OK` và duplicate replay; nếu UI cần `CREATED/UPDATED/CLOSED` rõ ràng thì cần BE bổ sung hoặc spec UI xử lý khác: `CẦN CONFIRM / BE GAP`.
- `Idempotency-Key` có bắt buộc không: hiện không bắt buộc và không dùng làm idempotency chính.
- Error envelope runtime cho `401/403`: `CẦN KIỂM TRA RUNTIME`.
- API get sync status theo `amisRecruitmentId`: chưa có trong source.
- Retry policy extension: `CẦN CONFIRM`.
- Default selected channels: `CẦN CONFIRM`.
- Manual instruction cho channel `NOT_CONFIGURED`: `CẦN CONFIRM UI COPY`.

## 18. Open Questions / Cần confirm

1. Extension auth dùng JWT login hiện tại, Google OAuth/SSO, reuse token web app hay cơ chế riêng? `CẦN CONFIRM AUTH FLOW`
2. Token/JWT có được lưu trong `chrome.storage` không, và storage nào được phép dùng? `CẦN CONFIRM`
3. BE API domain/env config cho extension là gì? `CẦN CONFIRM`
4. AMIS domain và AMIS recruitment URL pattern chính xác là gì? `CẦN KHẢO SÁT AMIS`
5. `amisRecruitmentId` lấy từ đâu trong AMIS? `CẦN KHẢO SÁT AMIS`
6. Field AMIS nào map sang `snapshot.title`, `snapshot.description`, `snapshot.requirements`, `snapshot.benefits`? `CẦN KHẢO SÁT AMIS`
7. Extension sẽ transform `requirements` và `benefits` thành JSON object theo schema nào? `CẦN CONFIRM`
8. Rich text giữ HTML an toàn hay convert plain text? `CẦN CONFIRM`
9. Có cần BE trả result code chi tiết hơn `OK`, ví dụ `CREATED`, `UPDATED`, `CLOSED` không? `CẦN CONFIRM / BE GAP`
10. Có cần top-level `publicUrl` ngoài `channelPostings[].publishedUrl` không? `CẦN CONFIRM`
11. `Idempotency-Key` header có nên bắt buộc với extension không? `CẦN CONFIRM`
12. Extension retry policy khi network timeout là gì? `CẦN CONFIRM`
13. Có cần API get sync status theo `amisRecruitmentId` không? `CẦN CONFIRM`
14. Có cần API update/close riêng hay dùng `action` trong endpoint chính là đủ? `CẦN CONFIRM`
15. Default selected channels trong MVP là gì? `CẦN CONFIRM`
16. UI copy cho `NOT_CONFIGURED`, duplicate replay, validation error, 401/403 là gì? `CẦN CONFIRM UI COPY`
