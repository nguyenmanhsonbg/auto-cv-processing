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

Current source finding:

| Hạng mục | Current source / decision | Ghi chú |
| --- | --- | --- |
| Module | Chưa thấy `ExtensionIntegrationModule` trong current source | Backend module cần implement mới nếu bắt đầu batch backend. |
| Controller | Chưa thấy `ExtensionIntegrationController` hoặc route extension | Endpoint path đã được user chốt nhưng chưa có source hiện tại. |
| Endpoint chính | `POST /api/extension/amis/job-postings/sync-and-publish` | Confirmed target endpoint for implementation. |
| Auth | JWT + role guard hiện có | Endpoint mới phải dùng convention auth/role hiện có. |
| Role | `ADMIN`, `HR` | Target role rule cho endpoint mới; auth flow extension vẫn pending. |
| Headers | `Idempotency-Key` required; `X-Request-Id`, `X-Extension-Version` recommended | `Idempotency-Key` là key chính, không chỉ metadata/audit. |
| Actions | MVP chỉ `PUBLISH` | `UPDATE`/`CLOSE` later. |
| Channels | `VCS_PORTAL`, `FACEBOOK`, `TOPCV`, `ITVIEC`, `VIETNAMWORKS`, `LINKEDIN` | Official extension integration MVP enum. |
| Result code | `CREATED`, `UPDATED`, `DUPLICATE_OR_IDEMPOTENT_REPLAY` | `OK` không còn là resultCode chính. |
| Channel status | `PUBLISHED`, `PUBLISH_FAILED`, `NOT_CONFIGURED`, optional `UPDATED`/`CLOSED` if service supports | `MANUAL_REQUIRED` later/not used in MVP. |
| External channels chưa verify | Trả `NOT_CONFIGURED`, `errorCode: CHANNEL_NOT_CONFIGURED`, không fail toàn bộ request | Áp dụng cho channel ngoài `VCS_PORTAL` trong MVP. |
| External AMIS reference | Bảng riêng `external_references` hoặc `recruitment_external_references` | Không lưu trực tiếp trên `JobPosting` làm source chính. |
| Snapshot hash | BE tự tính bằng SHA-256 trên stable JSON stringify của `snapshot` | Dùng change detection/versioning; không phải idempotency key chính. |

Phần vẫn chưa xác định đầy đủ:

- Extension auth flow cụ thể dùng login hiện tại, Google OAuth, reuse web app token hay cơ chế riêng: `CẦN CONFIRM AUTH FLOW`.
- Token/JWT lưu ở đâu trong extension: `CẦN CONFIRM`.
- API get sync status theo `amisRecruitmentId`: chưa thấy trong source, `CẦN CONFIRM`.
- Error envelope runtime cho endpoint mới cần kiểm tra sau khi implement nếu UI parser cần chốt tuyệt đối.

## 4. API list for Extension MVP

| API | Method | Path | Auth | Purpose | Status |
| --- | --- | --- | --- | --- | --- |
| Sync and publish AMIS job | POST | `/api/extension/amis/job-postings/sync-and-publish` | HR/Admin JWT | Gửi AMIS Job Snapshot để BE sync JD/JD Version/JobPosting và tạo ChannelPosting | Confirmed target / not implemented in current source |
| Get AMIS sync status | GET | `CẦN KIỂM TRA SOURCE` | HR/Admin JWT? | Extension xem trạng thái khi HR mở lại AMIS job | Optional / chưa thấy endpoint trong source |
| Auth/login for extension | POST | `CẦN CONFIRM AUTH FLOW` | Public/JWT? | Lấy token cho extension | Có auth API chung trong BE, nhưng extension flow chưa chốt |

Existing auth APIs trong backend:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`

Việc extension có dùng các API này trực tiếp hay cần flow riêng là `CẦN CONFIRM AUTH FLOW`.

## 5. Main API: Sync and Publish AMIS Job

Endpoint target đã confirm:

```text
POST /api/extension/amis/job-postings/sync-and-publish
```

Contract:

| Hạng mục | Giá trị |
| --- | --- |
| Method | `POST` |
| Path | `/api/extension/amis/job-postings/sync-and-publish` |
| Controller | `ExtensionIntegrationController` target |
| Service method | `syncAndPublishAmisJobPosting` target |
| Auth | `Authorization: Bearer <JWT>` |
| Role | `ADMIN` hoặc `HR` |
| Request body | `SyncAmisJobPostingDto` |
| Response body | Envelope `{ success, data, meta }` |
| Result code | `CREATED`, `UPDATED`, `DUPLICATE_OR_IDEMPOTENT_REPLAY` |
| Error code từ service | `VALIDATION_ERROR`, `INVALID_STATE_TRANSITION`, `INTERNAL_ERROR` |
| Channel error code trong response | `CHANNEL_NOT_CONFIGURED` |

Side effects:

- Tạo mới hoặc cập nhật `JobDescription`.
- Tạo `JobDescriptionVersion` active mới khi snapshot thay đổi.
- Tạo hoặc cập nhật `JobPosting`.
- Lưu external reference AMIS ở bảng riêng `external_references` hoặc `recruitment_external_references`.
- Tạo hoặc cập nhật `ChannelPosting` cho từng `channels[]`.
- Publish trạng thái `VCS_PORTAL` theo public job endpoint hiện có.
- Ghi audit logs cho sync/publish requested/succeeded/failed.

## 6. Required headers

| Header | Required? | Purpose | Status |
| --- | ---: | --- | --- |
| `Authorization: Bearer <token>` | Yes | Auth HR/Admin | Confirmed by `JwtAuthGuard` + `RolesGuard` |
| `X-Request-Id` | No / Recommended | Trace request | Optional theo source |
| `Idempotency-Key` | Yes | Primary idempotency key | Required for extension sync/publish |
| `X-Extension-Version` | No / Recommended | Debug compatibility | Optional theo source |

Header behavior:

- Controller mới phải đọc `x-request-id`, `idempotency-key`, `x-extension-version`.
- Missing `Idempotency-Key` phải trả 400.
- Response `meta` trả lại `requestId`, `idempotencyKey`, `extensionVersion` nếu có.
- Audit metadata lưu `requestId`, `extensionVersion`, `hasIdempotencyKey` và `idempotencyKeyHash`.
- Không lưu raw `Idempotency-Key` trong audit metadata.

## 7. Request body contract

Request body target:

```json
{
  "amisRecruitmentId": "AMIS-REQ-2026-0001",
  "amisUrl": "CẦN KHẢO SÁT AMIS",
  "action": "PUBLISH",
  "idempotencyKey": "optional-body-mirror-if-supported",
  "snapshot": {
    "title": "Senior Backend Developer",
    "description": "Build and operate recruitment services.",
    "requirements": {
      "rawText": "NestJS, PostgreSQL, system design.",
      "sections": []
    }
  },
  "channels": ["VCS_PORTAL", "TOPCV"]
}
```

Field contract:

| Field | Type | Required? | Source validation | Note |
| --- | --- | ---: | --- | --- |
| `amisRecruitmentId` | string | Yes | `requireText` | Trim, non-empty. Dùng làm external recruitment id. |
| `amisUrl` | string | No | `optionalText` | Nếu gửi thì phải là string; empty thành `null`. |
| `action` | enum | Yes | `PUBLISH` | MVP chỉ `PUBLISH`; `UPDATE`/`CLOSE` later. |
| `idempotencyKey` | string | No/conditional | Optional body mirror | Header `Idempotency-Key` vẫn required và ưu tiên nếu body cũng có. |
| `snapshot` | JSON object | Yes | Must be object | Không được là array/null. |
| `snapshot.title` | string | Yes | `requireText` | Trim, non-empty. |
| `snapshot.description` | string | Yes | `requireText` | Trim, non-empty. |
| `snapshot.requirements` | JSON object | Yes | Must be object; `rawText` required | Không nhận plain string. |
| `snapshot.requirements.rawText` | string | Yes | Trim, non-empty | Minimum valid requirements payload. |
| `snapshot.benefits` | JSON object/null | No | Nếu có thì must be object | `undefined` hoặc `null` được normalize thành `null`. |
| Other `snapshot.*` fields | unknown | No | Preserved | BE giữ qua spread trong normalized snapshot, đưa vào hash và version snapshot. Contract field mapping chi tiết vẫn theo file 05. |
| `channels` | array enum | Yes | Array không rỗng, enum hợp lệ | Duplicate channel được dedupe. |

Allowed `action`:

| Value | Meaning |
| --- | --- |
| `PUBLISH` | Sync snapshot và publish/prepare channel posting. |
| `UPDATE` | Later / not in MVP. |
| `CLOSE` | Later / not in MVP. |

Allowed `channels`:

```text
VCS_PORTAL, FACEBOOK, TOPCV, ITVIEC, VIETNAMWORKS, LINKEDIN
```

Lưu ý quan trọng:

- `snapshot.requirements` phải là JSON object, không phải string.
- `snapshot.requirements.rawText` required, non-empty string.
- `snapshot.benefits` nếu có cũng phải là JSON object.
- Field AMIS thật mapping vào snapshot vẫn là `CẦN KHẢO SÁT AMIS`.
- Logical nested snapshot trong file 05 chưa phải wire contract hiện tại; wire contract hiện tại là flat object bên trong `snapshot`.

## 8. Response body contract

Response envelope target:

```json
{
  "success": true,
  "data": {
    "resultCode": "CREATED",
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
    "idempotencyKey": "required-idempotency-key",
    "extensionVersion": "optional-extension-version"
  }
}
```

`data` fields:

| Field | Type | Meaning | Status |
| --- | --- | --- | --- |
| `resultCode` | string | `CREATED`, `UPDATED`, `DUPLICATE_OR_IDEMPOTENT_REPLAY` | Confirmed |
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
| `externalPostingId` | string/null | Với `VCS_PORTAL`, target có thể set bằng `jobPostingId`. |
| `errorCode` | string/null | Hiện chỉ map `CHANNEL_NOT_CONFIGURED` hoặc `null`. |
| `manualActionRequired` | boolean | `true` khi status là `NOT_CONFIGURED`; `MANUAL_REQUIRED` later/not used in MVP. |
| `lastSyncAt` | ISO datetime/null | Lần sync channel gần nhất. |

BE gap nếu UI cần:

- Không có top-level `publicUrl`.
- Không có endpoint get sync status trong source hiện tại.
- Không có human-readable manual instruction cho từng external channel.

## 9. Result code handling

Result code chính thức:

| BE `data.resultCode` | Meaning | Extension behavior |
| --- | --- | --- |
| `CREATED` | AMIS job mới, backend tạo JD/JD Version/JobPosting mới | Hiển thị sync/publish thành công cho job mới. |
| `UPDATED` | AMIS job đã tồn tại, snapshot thay đổi, backend update JD và tạo JD Version mới | Hiển thị đã cập nhật nội dung tuyển dụng. |
| `DUPLICATE_OR_IDEMPOTENT_REPLAY` | Replay cùng `Idempotency-Key` hoặc cùng request đã xử lý, không tạo duplicate | Hiển thị đã xử lý/đồng bộ trước đó. Không coi là lỗi nghiêm trọng. |

Không dùng `OK` làm resultCode chính nữa, trừ khi ghi chú backward compatibility cho response cũ.

## 10. Channel result handling

Channel status MVP:

```text
PUBLISHED, PUBLISH_FAILED, NOT_CONFIGURED
```

`UPDATED`/`CLOSED` có thể xuất hiện nếu service hiện có hỗ trợ update/close later, nhưng không phải MVP action chính. `MANUAL_REQUIRED` là later/not used in MVP.

Mapping UI behavior:

| Channel status | Meaning theo target contract | UI behavior |
| --- | --- | --- |
| `PUBLISHED` | `VCS_PORTAL` được publish khi action không phải `UPDATE`/`CLOSE` | Hiển thị thành công, show `publishedUrl` nếu có. |
| `UPDATED` | `VCS_PORTAL` được cập nhật khi action là `UPDATE` | Hiển thị đã cập nhật public job. |
| `CLOSED` | Channel posting được đóng khi action là `CLOSE` | Hiển thị đã đóng. |
| `NOT_CONFIGURED` | Channel chưa được cấu hình/verify trong BE | Hiển thị channel chưa cấu hình, không fail toàn bộ request. |
| `MANUAL_REQUIRED` | Later / not used in MVP | Không dùng trong MVP response chính; nếu BE cũ trả status này thì UI có thể fallback như manual/later state. |
| `PUBLISH_FAILED` | Đăng lỗi | Hiển thị lỗi + retry nếu BE hỗ trợ. Chưa thấy branch tạo status này trong AMIS extension service hiện tại. |
| `PUBLISHING` | Đang publish | Có thể hiển thị pending nếu BE trả trong tương lai. |
| `DRAFT` | Draft channel posting | Không nên là trạng thái thành công cuối cùng trong UI nếu xuất hiện. |

Channel behavior thật:

- `VCS_PORTAL`: set `externalPostingId = jobPostingId`, set `publishedUrl`, status `PUBLISHED` hoặc `UPDATED` nếu update flow được implement.
- Non-`VCS_PORTAL`: set status `NOT_CONFIGURED`, `publishedUrl = null`, `errorCode = CHANNEL_NOT_CONFIGURED`.
- `CLOSE`: later/not in MVP.

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
| `400` | `IDEMPOTENCY_KEY_REQUIRED` | Thiếu required `Idempotency-Key` | Hiển thị lỗi request/config, không retry cho tới khi client gửi key. |
| `400` | `INVALID_STATE_TRANSITION` | State không hợp lệ, ví dụ close job chưa sync hoặc update job đã closed | Hiển thị lỗi trạng thái, yêu cầu HR kiểm tra job/status. |
| `400` | `CHANNEL_NOT_CONFIGURED` | Code có thể tồn tại nhưng MVP nên trả trong channel result, không throw toàn request | Không coi là request failure nếu nằm trong `channelPostings[].errorCode`. |
| `401` | Nest default / `Unauthorized` | Chưa authenticated hoặc JWT invalid/expired | Yêu cầu login lại. Envelope có thể khác custom service error. |
| `403` | Nest default / `Forbidden` | User không có role `ADMIN` hoặc `HR` | Hiển thị không đủ quyền. |
| `500` | `INTERNAL_ERROR` | Lỗi không bắt được khi sync | Hiển thị lỗi hệ thống an toàn, cho retry có kiểm soát. |
| Network error | N/A | Timeout, offline, CORS, BE unreachable | Cho retry, giữ nguyên intent/idempotency metadata nếu có. |

Lưu ý:

- `DUPLICATE_OR_IDEMPOTENT_REPLAY` là success response theo target contract, không phải HTTP error.
- Same `Idempotency-Key` nhưng different request body nên trả `409 IDEMPOTENCY_CONFLICT` nếu idempotency store được implement.
- Auth error envelope cần test thực tế nếu UI cần parse chính xác: `CẦN KIỂM TRA SOURCE/RUNTIME`.

## 12. Idempotency and retry behavior

Idempotency behavior target:

- `Idempotency-Key` header required và là key chính.
- BE tìm/replay idempotency record bằng `Idempotency-Key`.
- Nếu same `Idempotency-Key` và request hash giống request đã xử lý:
  - Không tạo JD/JD Version/JobPosting/ChannelPosting mới.
  - Trả `resultCode: DUPLICATE_OR_IDEMPOTENT_REPLAY` hoặc responseData đã lưu.
- Nếu same `Idempotency-Key` nhưng request hash khác:
  - Trả `409 IDEMPOTENCY_CONFLICT`.
- BE tìm external reference bằng `sourceSystem = AMIS`, `externalEntityType = JOB_POSTING`, `externalId = amisRecruitmentId`.
- BE tự tính `snapshotHash = sha256(stableStringify(snapshot))`.
- Nếu chưa có external reference:
  - Tạo `JobDescription`, version 1 và `JobPosting`.
  - Lưu mapping ở `external_references` hoặc `recruitment_external_references`.
  - Trả `resultCode: CREATED`, `snapshotChanged: true`.
- Nếu đã có external reference và snapshot hash thay đổi:
  - Update `JobDescription`.
  - Supersede active `JobDescriptionVersion` cũ nếu workflow dùng active/superseded.
  - Tạo `JobDescriptionVersion` active mới.
  - Update `JobPosting` với version mới.
  - Update external reference `lastSnapshotHash`, `lastIdempotencyKey`, `lastSyncedAt`.
  - Trả `resultCode: UPDATED`, `snapshotChanged: true`.
- Nếu đã có external reference và snapshot hash không đổi với new `Idempotency-Key`:
  - Không tạo duplicate.
  - Trả `DUPLICATE_OR_IDEMPOTENT_REPLAY` hoặc replay response gần nhất theo BE-EXT-04 policy.

Concurrency/retry safety:

- BE có thể dùng transaction/advisory lock theo `Idempotency-Key` hoặc AMIS external id để tránh concurrent duplicate.
- Extension phải giữ cùng `Idempotency-Key` khi retry cùng sync attempt.
- New `Idempotency-Key` + same AMIS snapshot phải không tạo duplicate domain records; exact response policy cần ghi trong BE-EXT-04.

Snapshot hash owner:

- Theo target contract, BE là bên tính `snapshotHash`.
- Extension không cần gửi `snapshotHash` trong request hiện tại.
- Nếu sau này muốn extension cũng tính hash để preview/debug, cần chốt canonical rule với BE: `CẦN CONFIRM`.

## 13. Auth and permission contract

Auth/permission target:

- Endpoint yêu cầu JWT Bearer token.
- Endpoint chỉ cho role `ADMIN` hoặc `HR`.
- Controller nên lấy actor từ `req.user.id`, `req.user.email`, `req.user.role`.
- Service nên kiểm tra user còn tồn tại trong DB trước khi sync nếu convention hiện tại làm như vậy.

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

Audit behavior target:

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
- `externalId` hoặc `amisRecruitmentId`
- `action`
- `channels`
- `snapshotHash`
- `resultCode`
- `snapshotChanged`
- internal IDs
- `channelCount`
- `errorCode` khi failed

Audit không lưu full request payload hoặc full snapshot trong metadata. Nếu `JobDescriptionVersion.snapshot` lưu `amisSnapshot` để phục vụ versioning/audit nghiệp vụ, extension vẫn không nên gửi field thừa hoặc PII không cần thiết.

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

Ví dụ minh họa theo target contract:

```bash
curl -X POST "http://localhost:3002/api/extension/amis/job-postings/sync-and-publish" \
  -H "Authorization: Bearer <HR_OR_ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: ext-demo-20260627-001" \
  -H "Idempotency-Key: amis-demo-001-publish" \
  -H "X-Extension-Version: 0.0.0-demo" \
  -d '{
    "amisRecruitmentId": "AMIS-DEMO-001",
    "amisUrl": "CẦN KHẢO SÁT AMIS",
    "action": "PUBLISH",
    "snapshot": {
      "title": "Backend Developer",
      "description": "Build backend services.",
      "requirements": {
        "rawText": "Experience with Node.js and PostgreSQL.",
        "sections": []
      },
      "benefits": {
        "summary": "Competitive benefits."
      }
    },
    "channels": ["VCS_PORTAL", "TOPCV"]
  }'
```

Success response minh họa:

```json
{
  "success": true,
  "data": {
    "resultCode": "CREATED",
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

Missing idempotency key minh họa:

```json
{
  "code": "IDEMPOTENCY_KEY_REQUIRED",
  "message": "Idempotency-Key header is required"
}
```

## 17. Contract gaps

Các gap cần xử lý trước khi dev extension:

- Auth flow chính thức của extension: `CẦN CONFIRM AUTH FLOW`.
- Token storage policy trong browser extension: `CẦN CONFIRM`.
- BE API domain/env config cho extension: `CẦN CONFIRM`.
- AMIS domain và URL pattern: `CẦN KHẢO SÁT AMIS`.
- Field mapping AMIS thật sang `snapshot`: `CẦN KHẢO SÁT AMIS`.
- Rich text strategy cho `description`/`benefits`: `CẦN CONFIRM`.
- Tên bảng external reference cuối cùng: `external_references` hay `recruitment_external_references` theo convention backend.
- Có tạo bảng riêng `extension_idempotency_records` không, hay dùng cơ chế tương đương.
- New `Idempotency-Key` + same AMIS snapshot đã sync trước đó trả replay response hay `DUPLICATE_OR_IDEMPOTENT_REPLAY`: cần chốt trong BE-EXT-04.
- Error envelope runtime cho `401/403`: `CẦN KIỂM TRA RUNTIME`.
- API get sync status theo `amisRecruitmentId`: chưa có trong source.
- Retry policy extension: `CẦN CONFIRM`.
- Manual instruction cho channel `NOT_CONFIGURED`: `CẦN CONFIRM UI COPY`.

## 18. Open Questions / Cần confirm

1. Extension auth dùng JWT login hiện tại, Google OAuth/SSO, reuse token web app hay cơ chế riêng? `CẦN CONFIRM AUTH FLOW`
2. Token/JWT có được lưu trong `chrome.storage` không, và storage nào được phép dùng? `CẦN CONFIRM`
3. BE API domain/env config cho extension là gì? `CẦN CONFIRM`
4. AMIS domain và AMIS recruitment URL pattern chính xác là gì? `CẦN KHẢO SÁT AMIS`
5. `amisRecruitmentId` lấy từ đâu trong AMIS? `CẦN KHẢO SÁT AMIS`
6. Field AMIS nào map sang `snapshot.title`, `snapshot.description`, `snapshot.requirements`, `snapshot.benefits`? `CẦN KHẢO SÁT AMIS`
7. Benefits transform thành JSON object theo schema nào? `CẦN CONFIRM`
8. Rich text giữ HTML an toàn hay convert plain text? `CẦN CONFIRM`
9. Tên bảng external reference cuối cùng là `external_references` hay `recruitment_external_references`? `CẦN CONFIRM BACKEND CONVENTION`
10. Có tạo bảng riêng `extension_idempotency_records` không? `CẦN CONFIRM IMPLEMENTATION`
11. Có cần top-level `publicUrl` ngoài `channelPostings[].publishedUrl` không? `CẦN CONFIRM`
12. Extension retry policy khi network timeout là gì? `CẦN CONFIRM`
13. Có cần API get sync status theo `amisRecruitmentId` không? `CẦN CONFIRM`
14. Có cần API update/close riêng hay dùng `action` trong endpoint chính là đủ? `LATER / CẦN CONFIRM`
15. UI copy cho `NOT_CONFIGURED`, duplicate replay, validation error, 401/403 là gì? `CẦN CONFIRM UI COPY`
