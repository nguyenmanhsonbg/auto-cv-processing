# 05. AMIS Job Snapshot Mapping

## 1. Mục tiêu tài liệu

Tài liệu này định nghĩa contract dữ liệu `AmisJobSnapshot` mà Browser Extension sẽ tạo từ AMIS để preview cho HR và gửi về BE CV / Recruitment Core.

File này tập trung vào shape dữ liệu, nhóm field bắt buộc/tùy chọn, mapping dự kiến, transform rule, validation rule trước khi HR confirm/sync, preview fields và logging rule. File này không chốt AMIS field source, selector, URL, API request/response hoặc mapping thật khi chưa có khảo sát AMIS.

Ghi chú quan trọng:

- Đây là mapping contract ở mức expected/pending.
- Wire API payload chính thức giữa Extension và BE sẽ được chốt chi tiết trong `06_extension_backend_api_contract.md`.
- Theo BE hiện tại, endpoint AMIS sync đang nhận payload gồm `amisRecruitmentId`, `amisUrl`, `action`, `snapshot` và `selectedChannels`; trong đó `snapshot.title`, `snapshot.description`, `snapshot.requirements` là required theo validation hiện tại.

## 2. Mapping principles

Nguyên tắc mapping:

- AMIS là nguồn thao tác của HR.
- Extension chỉ capture dữ liệu, không quyết định nghiệp vụ cuối.
- BE CV / Recruitment Core là nơi validate chính, xử lý idempotency, versioning, publish và audit.
- Extension phải preview dữ liệu cho HR xác nhận trước khi gửi.
- Mapping không được phụ thuộc field AMIS chưa khảo sát.
- Mapping không được tự bịa field AMIS, DOM selector, API endpoint hoặc response payload.
- Nếu không xác định được field bắt buộc, extension phải block sync hoặc yêu cầu HR xác nhận theo rule được confirm.
- Extension không log full snapshot.
- Extension không đưa PII không cần thiết vào preview/log.
- Field nào chưa có nguồn AMIS thật phải ghi `CẦN KHẢO SÁT AMIS`.
- Quyết định sản phẩm/kỹ thuật chưa chốt phải ghi `CẦN CONFIRM`.

## 3. `AmisJobSnapshot` contract dự kiến

Đây là logical snapshot contract ở mức specification, chưa phải mapping AMIS thật và chưa nhất thiết là wire payload cuối cùng.

```json
{
  "identity": {
    "sourceSystem": "AMIS",
    "amisRecruitmentId": "CẦN KHẢO SÁT AMIS",
    "amisUrl": "CẦN KHẢO SÁT AMIS"
  },
  "basicInfo": {
    "title": "CẦN KHẢO SÁT AMIS",
    "position": "CẦN KHẢO SÁT AMIS",
    "department": "CẦN KHẢO SÁT AMIS",
    "level": "CẦN KHẢO SÁT AMIS",
    "quantity": "CẦN KHẢO SÁT AMIS"
  },
  "jobContent": {
    "description": "CẦN KHẢO SÁT AMIS",
    "requirements": "CẦN KHẢO SÁT AMIS",
    "benefits": "CẦN KHẢO SÁT AMIS"
  },
  "workInfo": {
    "location": "CẦN KHẢO SÁT AMIS",
    "workingMode": "CẦN KHẢO SÁT AMIS",
    "salaryRange": "CẦN KHẢO SÁT AMIS",
    "deadline": "CẦN KHẢO SÁT AMIS"
  },
  "contactInfo": {
    "contactName": "CẦN KHẢO SÁT AMIS",
    "contactEmail": "CẦN KHẢO SÁT AMIS",
    "contactPhone": "CẦN KHẢO SÁT AMIS"
  },
  "questions": {
    "applicationQuestions": "CẦN KHẢO SÁT AMIS"
  },
  "metadata": {
    "capturedAt": "ISO datetime",
    "captureSource": "API | PAGE_STATE | DOM | MANUAL_CONFIRMATION | CẦN CONFIRM",
    "extensionVersion": "CẦN CONFIRM",
    "snapshotHash": "BE hoặc Extension? CẦN CONFIRM"
  }
}
```

Contract notes:

- `identity.sourceSystem` luôn là `AMIS` ở logical snapshot level.
- Theo BE hiện tại, `sourceSystem=AMIS` đang được backend xử lý như external reference, không nhất thiết extension phải gửi trong `snapshot`. Cần chốt wire contract ở file 06.
- `metadata.capturedAt` hữu ích cho debug/preview nhưng không nên đưa vào snapshot hash nếu extension là bên tính hash.
- Các field chưa khảo sát phải giữ `CẦN KHẢO SÁT AMIS`.

## 4. Required vs optional fields

Phân loại theo BE hiện tại và nhu cầu publish dự kiến:

| Snapshot field | Required for BE sync? | Required for VCS Portal publish? | Required for external channels? | Status |
| --- | ---: | ---: | ---: | --- |
| `identity.amisRecruitmentId` | Yes | Yes | Yes | `CẦN KHẢO SÁT AMIS` |
| `identity.amisUrl` | Optional theo BE hiện tại / Recommended | Recommended | Recommended | `CẦN KHẢO SÁT AMIS` |
| `basicInfo.title` | Yes theo BE hiện tại | Yes | Yes | `CẦN KHẢO SÁT AMIS` |
| `jobContent.description` | Yes theo BE hiện tại | Yes | Yes | `CẦN KHẢO SÁT AMIS` |
| `jobContent.requirements` | Yes theo BE hiện tại | Yes | Yes | `CẦN KHẢO SÁT AMIS` |
| `jobContent.benefits` | Optional theo BE hiện tại | Recommended | Recommended | `CẦN KHẢO SÁT AMIS` |
| `basicInfo.position` | `CẦN CONFIRM` | Recommended | Recommended | `CẦN KHẢO SÁT AMIS` |
| `basicInfo.department` | `CẦN CONFIRM` | Optional / Recommended | Channel-specific | `CẦN KHẢO SÁT AMIS` |
| `basicInfo.level` | `CẦN CONFIRM` | Recommended | Recommended | `CẦN KHẢO SÁT AMIS` |
| `basicInfo.quantity` | `CẦN CONFIRM` | Optional / Recommended | Channel-specific | `CẦN KHẢO SÁT AMIS` |
| `workInfo.location` | `CẦN CONFIRM` | Yes / Recommended | Yes / Channel-specific | `CẦN KHẢO SÁT AMIS` |
| `workInfo.deadline` | `CẦN CONFIRM` | Recommended | Recommended | `CẦN KHẢO SÁT AMIS` |
| `workInfo.salaryRange` | Optional / `CẦN CONFIRM` | Optional | Channel-specific | `CẦN KHẢO SÁT AMIS` |
| `contactInfo` | Optional / `CẦN CONFIRM` | Optional | Optional / Channel-specific | `CẦN KHẢO SÁT AMIS` |
| `questions.applicationQuestions` | Later / `CẦN CONFIRM` | Optional | Channel-specific | `CẦN KHẢO SÁT AMIS` |

Theo BE hiện tại:

- `amisRecruitmentId` required.
- `snapshot.title` required.
- `snapshot.description` required.
- `snapshot.requirements` required và phải là JSON object.
- `selectedChannels` required và không được rỗng.
- `amisUrl` optional.
- `snapshot.benefits` optional và nếu có phải là JSON object.

## 5. AMIS field mapping table

Mapping table ở trạng thái pending. Không tự điền AMIS field thật.

| AMIS UI Field | AMIS API Field | DOM Selector | Snapshot Field | Transform Rule | Required? | Status |
| --- | --- | --- | --- | --- | ---: | --- |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `identity.amisRecruitmentId` | trim/string | Yes | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `identity.amisUrl` | trim URL string | Optional / Recommended | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `basicInfo.title` | trim text | Yes | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `basicInfo.position` | trim label/value | `CẦN CONFIRM` | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `basicInfo.department` | trim label/value | `CẦN CONFIRM` | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `basicInfo.level` | trim label/value | `CẦN CONFIRM` | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `basicInfo.quantity` | parse integer | `CẦN CONFIRM` | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `jobContent.description` | HTML to safe HTML/plain text - `CẦN CONFIRM` | Yes | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `jobContent.requirements` | HTML to safe HTML/plain text - `CẦN CONFIRM` | Yes | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `jobContent.benefits` | HTML to safe HTML/plain text - `CẦN CONFIRM` | Optional | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `workInfo.location` | normalize location - `CẦN CONFIRM` | `CẦN CONFIRM` | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `workInfo.workingMode` | trim label/value | `CẦN CONFIRM` | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `workInfo.salaryRange` | keep raw string or parse min/max - `CẦN CONFIRM` | Optional / `CẦN CONFIRM` | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `workInfo.deadline` | convert to ISO date | `CẦN CONFIRM` | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `contactInfo.contactName` | trim text, mask in logs | Optional / `CẦN CONFIRM` | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `contactInfo.contactEmail` | validate email, mask in logs | Optional / `CẦN CONFIRM` | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `contactInfo.contactPhone` | validate phone, mask in logs | Optional / `CẦN CONFIRM` | Pending |
| `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `CẦN KHẢO SÁT AMIS` | `questions.applicationQuestions` | snapshot question text/type/options | Later / `CẦN CONFIRM` | Pending |

## 6. Transform rules

| Data type | Transform rule | Status |
| --- | --- | --- |
| Text | trim, collapse whitespace | Proposed |
| Rich text / HTML | sanitize or convert to safe HTML/plain text | `CẦN CONFIRM` |
| Date | normalize to ISO date | Proposed |
| Salary | keep raw string or parse min/max | `CẦN CONFIRM` |
| Location | keep raw text or normalize province/address | `CẦN CONFIRM` |
| Dropdown | capture label and value if available | `CẦN KHẢO SÁT AMIS` |
| Multi-select | array of labels/values | `CẦN KHẢO SÁT AMIS` |
| Quantity | parse integer | Proposed |
| Phone/email | validate format, mask in log | Proposed |
| Questions | snapshot question text/type/options | `CẦN CONFIRM SCOPE` |
| URL | trim, preserve original AMIS URL if available | Proposed / `CẦN KHẢO SÁT AMIS` |

Transform notes:

- Transform should preserve enough source content for HR preview.
- Transform should not invent missing values.
- Transform should not include volatile metadata in idempotency hash unless owner/rule is confirmed.
- Rich text handling must be confirmed before implementation because backend/public portal may need either safe HTML or plain text.

## 7. Validation rules before HR confirmation

Extension pre-preview validation should check:

- Có `amisRecruitmentId`.
- Có title.
- Có description nếu required.
- Có requirements nếu required.
- Deadline/date format hợp lệ nếu có.
- Quantity là số hợp lệ nếu có.
- Email/phone format hợp lệ nếu contactInfo được capture.
- Selected channels không rỗng.
- Snapshot không chứa field rõ ràng không cần thiết hoặc nhạy cảm theo rule đã confirm.

Theo BE hiện tại, extension nên coi các field sau là required trước khi gọi BE:

- `amisRecruitmentId`.
- `snapshot.title`.
- `snapshot.description`.
- `snapshot.requirements`.
- `selectedChannels`.

Validation principles:

- Validation ở extension chỉ là sơ bộ.
- BE vẫn validate chính.
- Nếu field required thiếu, extension phải hiển thị missing field và không gọi BE cho tới khi HR chỉnh hoặc rule nhập tay được chốt.
- Nếu rule "HR nhập tay field thiếu" chưa chốt, trạng thái là `CẦN CONFIRM`.

## 8. Preview fields for HR

Extension nên hiển thị cho HR các field sau trong preview:

- AMIS Recruitment ID.
- AMIS URL nếu lấy được.
- Title.
- Position.
- Department.
- Level.
- Quantity.
- Location.
- Working mode.
- Deadline.
- Salary range nếu có.
- Description summary.
- Requirements summary.
- Benefits summary.
- Contact info nếu được phép.
- Selected channels.
- Missing fields.
- Capture source.
- Capture warnings.
- Snapshot changed/replay result sau khi gọi BE.

PII / sensitive handling:

- Contact email/phone/name chỉ hiển thị nếu thật sự cần cho HR xác nhận. `CẦN CONFIRM`
- Contact info không được log full.
- Nếu field AMIS chứa PII không cần thiết cho job posting, không đưa vào snapshot. `CẦN KHẢO SÁT AMIS`

## 9. Sensitive data and logging rule

Logging rules:

- Không log full JD snapshot.
- Không log token/JWT.
- Không log full contact info nếu không cần.
- Không log PII không cần thiết.
- Không log full AMIS response/request payload.
- Không log raw rich text nếu chứa dữ liệu nhạy cảm.
- Audit metadata chỉ lưu hash, id, source, action, result, channel status và request metadata an toàn.
- Nếu cần debug, chỉ log field presence, length, hash, requestId, action và safe error code.

Masking candidates:

| Data | Preview | Client log | Audit metadata |
| --- | --- | --- | --- |
| `amisRecruitmentId` | Show | Safe to log if not sensitive | Safe |
| `amisUrl` | Show if useful | Avoid full URL if it contains sensitive query | Store only if safe / `CẦN CONFIRM` |
| Title | Show | Length/hash only | Hash/length only |
| Description/requirements/benefits | Show summary/full preview as needed | No full content | No full content |
| Contact email/phone/name | `CẦN CONFIRM` | Mask | Mask/no full value |
| JWT/token | Never show | Never log | Never store |

## 10. Snapshot hash rule

Snapshot hash dùng cho idempotency đã được BE hỗ trợ.

Hiện trạng:

- Theo BE hiện tại, backend tự normalize/hash snapshot để xử lý idempotency.
- Extension vẫn có thể gửi `Idempotency-Key` header cho request metadata/retry safety nếu UI flow cần.

Pending decision:

`CẦN CONFIRM: snapshotHash owner là BE hay Extension`

Nếu Extension tính hash:

- Phải dùng canonical JSON/stable key order.
- Không đưa volatile metadata như `capturedAt`, UI state, requestId hoặc extension runtime state vào hash.
- Cần chốt exact field set để tránh mismatch với BE.
- Cần chốt encoding, null/undefined handling và array ordering.

Nếu BE tính hash:

- Extension chỉ gửi snapshot.
- BE tự hash theo canonical rule hiện có.
- Extension hiển thị `snapshotChanged`/`DUPLICATE_OR_IDEMPOTENT_REPLAY` dựa trên response BE.

## 11. Mapping examples

Ví dụ minh họa - không phải AMIS thật:

```json
{
  "identity": {
    "sourceSystem": "AMIS",
    "amisRecruitmentId": "AMIS-DEMO-001",
    "amisUrl": "https://amis.example/recruitment/demo"
  },
  "basicInfo": {
    "title": "Backend Developer",
    "position": "Backend Developer"
  },
  "jobContent": {
    "description": "Build backend services.",
    "requirements": {
      "summary": "Experience with Node.js and PostgreSQL."
    },
    "benefits": {
      "summary": "Competitive benefits."
    }
  },
  "metadata": {
    "capturedAt": "2026-01-01T00:00:00.000Z",
    "captureSource": "DOM",
    "extensionVersion": "0.0.0-demo"
  }
}
```

Wire payload minh họa theo BE hiện tại - không phải AMIS thật:

```json
{
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
  "selectedChannels": ["VCS_PORTAL"]
}
```

Không dùng URL/field/selector thật nếu chưa có khảo sát AMIS.

## 12. Mapping gaps / Cần khảo sát

Các gap cần user cung cấp hoặc khảo sát:

- AMIS field thực tế cho title.
- AMIS field thực tế cho description.
- AMIS field thực tế cho requirements.
- AMIS field thực tế cho benefits.
- AMIS field thực tế cho position, department, level và quantity.
- AMIS field thực tế cho location, working mode, salary và deadline.
- Nguồn lấy `amisRecruitmentId`.
- Nguồn lấy `amisUrl` ổn định.
- AMIS API response sample.
- DOM selector nếu dùng DOM.
- Page state source nếu có.
- Rich text editor structure.
- Date/salary/location format.
- Contact info có nên capture không.
- Questions có nằm trong MVP không.
- Field nào cần exclude khỏi snapshot vì PII hoặc không cần cho job posting.

## 13. Relationship với các file khác

- File `04_amis_screen_and_capture_requirement.md` định nghĩa yêu cầu khảo sát AMIS.
- File này định nghĩa mapping contract và pending mapping table.
- File `06_extension_backend_api_contract.md` sẽ định nghĩa API contract Extension ↔ BE dựa trên snapshot contract này.
- File `07_extension_ui_specification.md` sẽ định nghĩa UI preview dựa trên preview fields.
- File `08_extension_auth_security_audit.md` sẽ chốt auth, token storage, permission và audit/security handling.
- Nếu AMIS khảo sát thay đổi, file này phải được update trước khi dev capture logic.

## 14. Open Questions / Cần confirm

1. BE hiện yêu cầu field nào bắt buộc trong snapshot ngoài `title`, `description`, `requirements` theo validation hiện tại? `CẦN CONFIRM`
2. `snapshotHash` do BE tính hay Extension tính? `CẦN CONFIRM`
3. `amisRecruitmentId` lấy từ đâu? `CẦN KHẢO SÁT AMIS`
4. AMIS field nào map sang `title`? `CẦN KHẢO SÁT AMIS`
5. AMIS field nào map sang `description`? `CẦN KHẢO SÁT AMIS`
6. AMIS field nào map sang `requirements`? `CẦN KHẢO SÁT AMIS`
7. AMIS field nào map sang `benefits`? `CẦN KHẢO SÁT AMIS`
8. AMIS field nào map sang `location`? `CẦN KHẢO SÁT AMIS`
9. AMIS field nào map sang `deadline`? `CẦN KHẢO SÁT AMIS`
10. Có capture salary không? `CẦN CONFIRM`
11. Có capture contact info không? `CẦN CONFIRM`
12. Có capture application questions/pre-screening questions trong MVP không? `CẦN CONFIRM`
13. Nếu thiếu field required, extension block sync hay cho HR nhập tay? `CẦN CONFIRM`
14. Rich text giữ HTML hay convert plain text? `CẦN CONFIRM`
15. Có field nào chứa PII cần loại khỏi preview/log không? `CẦN KHẢO SÁT AMIS`
16. Logical nested snapshot có cần flatten sang BE payload hiện tại ở extension hay BE sẽ nhận nested shape trong tương lai? `CẦN CONFIRM API CONTRACT`
