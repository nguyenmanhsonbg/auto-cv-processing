# 00. Extension Decision Log

## 1. Mục tiêu tài liệu

File này tổng hợp các decision cần chốt trước khi bắt đầu dev Browser Extension thật cho VCS Recruitment / HRM CV.

Decision log này được gom từ toàn bộ bộ specification hiện tại:

- `01_extension_context_and_scope.md`
- `02_extension_architecture.md`
- `03_extension_user_flow_hr_posting.md`
- `04_amis_screen_and_capture_requirement.md`
- `05_amis_job_snapshot_mapping.md`
- `06_extension_backend_api_contract.md`
- `07_extension_ui_specification.md`
- `08_extension_auth_security_audit.md`
- `09_extension_state_and_error_handling.md`
- `10_extension_implementation_task_breakdown.md`

File này không implement code, không sửa backend, không tạo source extension, không tự bịa AMIS domain, URL, selector, API hoặc field mapping.

## 2. Decision status convention

| Status | Ý nghĩa |
| --- | --- |
| `PENDING` | Chưa được user/product/security/engineering chốt. Không được coi recommendation là final decision. |
| `CONFIRMED` | Đã có quyết định rõ trong source/spec hoặc đã được user chốt. |

Quy ước blocker:

- Nếu decision có note `BLOCKER`, chưa được dev phần tương ứng.
- Nếu decision cần dữ liệu AMIS thật, phải chờ khảo sát AMIS trước khi implement.
- Nếu decision có recommendation, recommendation chỉ là gợi ý ban đầu và không được xem là final decision.

## 3. Critical blockers before development

| Decision ID | Blocker | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DEC-BLOCKER-001` | UI mode | Extension dùng UI mode nào | Popup / Side Panel / Injected Panel / Hybrid | Side Panel chính + Popup launcher | TBD | `PENDING` | `BLOCKER` cho layout, permission và message flow |
| `DEC-BLOCKER-002` | Auth flow | Extension lấy JWT/token bằng flow nào | JWT login hiện tại / Google OAuth/SSO / reuse token web app / extension token riêng | Chưa chốt | TBD | `PENDING` | `BLOCKER` cho BE call |
| `DEC-BLOCKER-003` | Token storage | Token được lưu ở đâu và lifecycle thế nào | `chrome.storage.local` / `chrome.storage.session` / in-memory | Chưa chốt | TBD | `PENDING` | `BLOCKER` cho auth persistence |
| `DEC-BLOCKER-004` | BE API domain | API base URL cho local/dev/staging/prod | Env config / settings screen / build-time config | Chưa chốt | TBD | `PENDING` | `BLOCKER` cho API client |
| `DEC-BLOCKER-005` | CORS/extension origin | BE cho phép extension gọi trực tiếp thế nào | Allowed origins / extension origin / proxy strategy | Chưa chốt | TBD | `PENDING` | `BLOCKER`; BE hiện chủ yếu theo `FRONTEND_URL` |
| `DEC-BLOCKER-006` | AMIS domain allowlist | AMIS domain nào được extension chạy | Domain thật / tenant domains / wildcard có kiểm soát | Không tự điền | TBD | `PENDING` | `BLOCKER`; `CẦN KHẢO SÁT AMIS DOMAIN` |
| `DEC-BLOCKER-007` | AMIS recruitment URL pattern | URL pattern list/create/edit/detail/publish/close | URL thật từ AMIS | Không tự điền | TBD | `PENDING` | `BLOCKER`; `CẦN KHẢO SÁT AMIS` |
| `DEC-BLOCKER-008` | `amisRecruitmentId` source | ID AMIS lấy từ đâu | URL / API response / page state / DOM / data attribute | Không tự điền | TBD | `PENDING` | `BLOCKER` cho idempotency |
| `DEC-BLOCKER-009` | AMIS capture source | Extension capture snapshot từ nguồn nào | AMIS internal API / page state / DOM / manual confirmation / hybrid | Chưa chốt | TBD | `PENDING` | `BLOCKER`; không phụ thuộc internal API nếu chưa được phép |
| `DEC-BLOCKER-010` | Required field mapping | Field AMIS nào map sang field bắt buộc BE | title / description / requirements và field khác nếu BE yêu cầu | Không tự điền | TBD | `PENDING` | `BLOCKER`; `CẦN KHẢO SÁT AMIS FIELD` |
| `DEC-BLOCKER-011` | Rich text transform strategy | Description/requirements/benefits transform thế nào | Safe HTML / plain text / JSON schema | Chưa chốt | TBD | `PENDING` | `BLOCKER` cho payload hợp lệ |
| `DEC-BLOCKER-012` | Default selected channels | Channel nào được chọn mặc định | `VCS_PORTAL` only / nhiều channel / none | `VCS_PORTAL` selected mặc định | TBD | `PENDING` | `BLOCKER` cho channel UI |
| `DEC-BLOCKER-013` | MVP action scope | MVP chỉ support `PUBLISH` hay có `UPDATE`/`CLOSE` | PUBLISH only / PUBLISH+UPDATE / PUBLISH+UPDATE+CLOSE | PUBLISH only | TBD | `PENDING` | `BLOCKER` cho UI state và API action |

## 4. UI / UX decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-UI-001` | UI mode cuối cùng | Popup / Side Panel / Injected Panel / Hybrid | Side Panel chính + Popup launcher | TBD | `PENDING` | Không chốt UI final khi chưa confirm |
| `DEC-UI-002` | Có dùng Side Panel làm UI chính không | Yes / No | Yes cho preview JD dài, channel result và confirmation | TBD | `PENDING` | Cần xác nhận browser target và permission `sidePanel` |
| `DEC-UI-003` | Popup có chỉ làm launcher không | Launcher only / Full flow / Không dùng popup | Launcher only | TBD | `PENDING` | Popup full flow có rủi ro không đủ không gian |
| `DEC-UI-004` | Có injected panel trong AMIS page không | MVP không dùng / Dùng sau khảo sát / Dùng ngay | Không dùng trong MVP | TBD | `PENDING` | Cần khảo sát CSS/DOM AMIS nếu muốn inject |
| `DEC-UI-005` | Có badge/status trên AMIS list/detail không | Yes / No / Later | Later | TBD | `PENDING` | Phụ thuộc AMIS screen và API get status/last sync |
| `DEC-UI-006` | Có Settings screen không | Yes / No / Later | Later nếu config có thể build-time/env | TBD | `PENDING` | Cần nếu HR/support đổi BE URL hoặc debug mode |
| `DEC-UI-007` | Có cho HR nhập tay field thiếu không | Yes / No, sửa trên AMIS / Later | Block sync và yêu cầu sửa trên AMIS trong MVP | TBD | `PENDING` | Tránh extension trở thành nơi nhập nghiệp vụ |
| `DEC-UI-008` | Có show requestId/internal IDs cho HR không | Show cho HR / Chỉ support detail / Không show | Chỉ support detail | TBD | `PENDING` | Không làm UI quá kỹ thuật |
| `DEC-UI-009` | UI copy final cho lỗi/trạng thái | Draft copy từ file 07/09 / Product copy mới | Dùng draft làm baseline, cần user confirm | TBD | `PENDING` | Áp dụng cho validation, auth, duplicate, `NOT_CONFIGURED` |

## 5. Auth / Token / Security decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-AUTH-001` | Auth flow extension | JWT login hiện tại / Google OAuth/SSO / reuse token web app / extension token riêng | Chưa chốt | TBD | `PENDING` | BE hiện có JWT auth APIs, nhưng extension flow chưa chốt |
| `DEC-AUTH-002` | Token storage | `chrome.storage.local` / `chrome.storage.session` / in-memory | Chưa chốt | TBD | `PENDING` | Không lưu token trong AMIS DOM/localStorage |
| `DEC-AUTH-003` | Token refresh/logout | Không refresh, login lại / refresh token / OAuth refresh / revoke flow | Chưa chốt | TBD | `PENDING` | Source hiện thấy access token; refresh flow cần kiểm tra/chốt |
| `DEC-AUTH-004` | Debug mode | Off by default / Support-toggle / Build-only | Off by default | TBD | `PENDING` | Debug không được log token/full snapshot/raw HTML |
| `DEC-AUTH-005` | Security review trước dev thật | Required / Optional / Later | Required trước AMIS/API capture thật | TBD | `PENDING` | Đặc biệt nếu dùng AMIS internal API hoặc persistent token |
| `DEC-AUTH-006` | Role được gọi sync/publish API | ADMIN/HR only / mở thêm role khác | ADMIN/HR only | ADMIN/HR only | `CONFIRMED` | Đã có trong BE contract: JWT + role `ADMIN` hoặc `HR` |
| `DEC-AUTH-007` | Có reuse token từ web app không | Yes / No / Chỉ nếu security review approve | Chưa chốt | TBD | `PENDING` | Có rủi ro boundary giữa web app và extension |

## 6. BE API / Environment decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-BE-001` | Main API endpoint extension gọi | `POST /api/extension/amis/job-postings/sync-and-publish` / endpoint khác | Dùng endpoint hiện có | `POST /api/extension/amis/job-postings/sync-and-publish` | `CONFIRMED` | Theo file 06 và source backend hiện tại |
| `DEC-BE-002` | BE API base URL local/dev/staging/prod | Config theo env / settings / build-time | Chưa chốt | TBD | `PENDING` | Không tự điền domain |
| `DEC-BE-003` | CORS/allowed origins cho extension | Allow extension origin / allow BE host permission / proxy | Chưa chốt | TBD | `PENDING` | BE hiện CORS theo `FRONTEND_URL`; extension origin cần confirm |
| `DEC-BE-004` | Có cần API get sync status theo `amisRecruitmentId` không | Yes / No / Later | Later cho MVP tối thiểu | TBD | `PENDING` | Nếu không có API này, extension không là source of truth |
| `DEC-BE-005` | Có cần `resultCode` chi tiết hơn `OK` không | Giữ `OK`/duplicate / thêm `CREATED`,`UPDATED`,`CLOSED` | Chưa chốt | TBD | `PENDING` | BE gap nếu UI cần phân biệt rõ create/update/close |
| `DEC-BE-006` | Có cần API update/close riêng không | Dùng `action` endpoint chính / API riêng | Dùng `action` endpoint chính nếu BE contract đủ | TBD | `PENDING` | Phụ thuộc MVP scope PUBLISH/UPDATE/CLOSE |
| `DEC-BE-007` | Có cần top-level `publicUrl` không | Chỉ `channelPostings[].publishedUrl` / thêm top-level | Chưa chốt | TBD | `PENDING` | Hiện response channel có `publishedUrl` |
| `DEC-BE-008` | `Idempotency-Key` có bắt buộc không | Optional / Required | Optional theo BE hiện tại | TBD | `PENDING` | BE idempotency chính bằng AMIS id + snapshot hash |
| `DEC-BE-009` | Có cần `GET /api/extension/config` không | Yes / No / Later | Later | TBD | `PENDING` | Có thể hữu ích cho channel/default/feature flags |
| `DEC-BE-010` | Error envelope `401/403` parse thế nào | Runtime check / normalize in extension | Cần kiểm tra runtime trước parser chặt | TBD | `PENDING` | File 06 đánh dấu `CẦN KIỂM TRA RUNTIME` |

## 7. AMIS Domain / URL / Screen decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-AMIS-001` | AMIS domain allowlist | Domain thật / nhiều domain tenant / wildcard có kiểm soát | Không tự điền | TBD | `PENDING` | `CẦN KHẢO SÁT AMIS DOMAIN` |
| `DEC-AMIS-002` | Recruitment list URL pattern | URL pattern thật | Không tự điền | TBD | `PENDING` | Cần cho detection và optional badge/status |
| `DEC-AMIS-003` | Recruitment create URL pattern | URL pattern thật | Không tự điền | TBD | `PENDING` | Cần nếu capture từ màn create |
| `DEC-AMIS-004` | Recruitment edit URL pattern | URL pattern thật | Không tự điền | TBD | `PENDING` | Cần nếu capture từ màn edit |
| `DEC-AMIS-005` | Recruitment detail URL pattern | URL pattern thật | Không tự điền | TBD | `PENDING` | Cần cho reopen/status flow |
| `DEC-AMIS-006` | Publish action screen/popup | AMIS button / modal / API action / extension button | Không tự điền | TBD | `PENDING` | Cần khảo sát AMIS thật |
| `DEC-AMIS-007` | Close action screen/popup | AMIS button / modal / API action / không trong MVP | Không làm CLOSE trong MVP nếu chưa confirm | TBD | `PENDING` | Phụ thuộc MVP scope |
| `DEC-AMIS-008` | Màn AMIS nào thuộc MVP bắt buộc | Detail only / Edit only / Create+Edit / List+Detail | Chưa chốt | TBD | `PENDING` | Giới hạn để tránh scrape quá rộng |
| `DEC-AMIS-009` | Có nhiều AMIS tenant/domain không | Yes / No / Later | Chưa chốt | TBD | `PENDING` | Ảnh hưởng manifest host permissions |

## 8. AMIS Capture Source decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-CAPTURE-001` | Có được dùng AMIS internal API không | Yes / No / Chỉ nếu security/legal approve | Chưa chốt | TBD | `PENDING` | Không phụ thuộc internal API nếu chưa được phép |
| `DEC-CAPTURE-002` | Capture source ưu tiên | API / page state / DOM / manual confirmation / hybrid | Khảo sát trước, chọn nguồn ổn định nhất | TBD | `PENDING` | Không tự bịa API/selector/page state |
| `DEC-CAPTURE-003` | Có fallback DOM không | Yes / No / Later | Chỉ sau khi khảo sát selector ổn định | TBD | `PENDING` | DOM dễ vỡ nếu AMIS đổi UI |
| `DEC-CAPTURE-004` | Có versioned adapter không | Yes / No / Later | Yes nếu AMIS có nhiều version/domain | TBD | `PENDING` | Giúp cô lập thay đổi AMIS |
| `DEC-CAPTURE-005` | Trigger chính | Nút AMIS "Đăng tin" / nút extension / cả hai | Nút extension trước, hook AMIS sau khảo sát | TBD | `PENDING` | Hook AMIS có rủi ro phụ thuộc DOM/event |
| `DEC-CAPTURE-006` | Có manual confirmation như fallback capture không | Yes / No / Later | Yes ở mức preview/confirm, không thay AMIS nhập liệu | TBD | `PENDING` | Manual field input riêng vẫn cần confirm |

## 9. AMIS Field Mapping decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-FIELD-001` | `amisRecruitmentId` lấy từ đâu | URL / API response / page state / DOM / data attribute | Không tự điền | TBD | `PENDING` | Quan trọng cho idempotency |
| `DEC-FIELD-002` | `title` lấy từ đâu | AMIS field/selector/API thật | Không tự điền | TBD | `PENDING` | Required theo BE contract |
| `DEC-FIELD-003` | `description` lấy từ đâu | AMIS field/selector/API thật | Không tự điền | TBD | `PENDING` | Required theo BE contract hiện tại |
| `DEC-FIELD-004` | `requirements` lấy từ đâu | AMIS field/selector/API thật | Không tự điền | TBD | `PENDING` | Required và cần JSON object transform |
| `DEC-FIELD-005` | `benefits` lấy từ đâu | AMIS field/selector/API thật / không capture | Không tự điền | TBD | `PENDING` | Optional nhưng cần mapping nếu preview |
| `DEC-FIELD-006` | `location` lấy từ đâu | AMIS field/selector/API thật / không capture | Không tự điền | TBD | `PENDING` | Optional theo mapping spec |
| `DEC-FIELD-007` | `deadline` lấy từ đâu | AMIS field/selector/API thật / không capture | Không tự điền | TBD | `PENDING` | Cần date format strategy |
| `DEC-FIELD-008` | `salaryRange` có capture không | Capture parsed / capture raw / không capture MVP | Chưa chốt | TBD | `PENDING` | Có thể chứa format khó parse |
| `DEC-FIELD-009` | `contactInfo` có capture không | Capture / không capture / mask only | Không capture trong MVP nếu chưa có policy | TBD | `PENDING` | PII/security decision |
| `DEC-FIELD-010` | `questions` có nằm trong MVP không | Yes / No / Later | No trong MVP | TBD | `PENDING` | Tránh mở rộng sang screening flow |
| `DEC-FIELD-011` | Position/department/level/quantity có capture không | Yes / No / Later | Later nếu không bắt buộc BE | TBD | `PENDING` | Cần khảo sát field AMIS thật |

## 10. Rich text / Transform decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-TX-001` | Description giữ safe HTML hay plain text | Safe HTML / plain text | Cần confirm sau khảo sát BE/UI | TBD | `PENDING` | Không log raw HTML |
| `DEC-TX-002` | Requirements transform thành JSON object thế nào | Schema sections/items / raw object / BE schema mới | Cần confirm schema | TBD | `PENDING` | BE hiện yêu cầu object, không gửi plain string |
| `DEC-TX-003` | Benefits transform thế nào | JSON object / array / plain text / không capture | Cần confirm schema | TBD | `PENDING` | Optional nhưng UI preview cần rõ |
| `DEC-TX-004` | Date format | ISO date / raw text / timezone-aware | ISO nếu AMIS dữ liệu đáng tin | TBD | `PENDING` | Không tự parse nếu format chưa khảo sát |
| `DEC-TX-005` | Salary parse hay giữ raw text | Parse structured / raw text / không capture | Raw text hoặc không capture cho MVP nếu chưa khảo sát | TBD | `PENDING` | Tránh sai salary |
| `DEC-TX-006` | Location normalize hay giữ raw text | Normalize / raw text | Raw text trước nếu chưa có taxonomy | TBD | `PENDING` | Normalize cần rule riêng |
| `DEC-TX-007` | Snapshot shape nested hay flatten theo BE hiện tại | Extension flatten / BE nhận nested tương lai | Flatten theo BE hiện tại nếu contract không đổi | TBD | `PENDING` | File 05 đánh dấu API contract cần confirm |
| `DEC-TX-008` | `snapshotHash` do ai tính | BE only / Extension cũng tính để debug | BE only theo source hiện tại | TBD | `PENDING` | Extension không dùng hash làm nguồn quyết định chính |

## 11. Channel decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-CH-001` | Default selected channels | `VCS_PORTAL` / nhiều channel / none | `VCS_PORTAL` selected mặc định | TBD | `PENDING` | Non-portal hiện có thể `NOT_CONFIGURED` |
| `DEC-CH-002` | Có cho HR chọn external channels dù BE trả `NOT_CONFIGURED` không | Yes / No / Later | Yes nếu UI warning rõ | TBD | `PENDING` | Không fail toàn bộ request |
| `DEC-CH-003` | `VCS_PORTAL` có selected mặc định không | Yes / No | Yes | TBD | `PENDING` | VCS portal là channel auto publish đã có BE |
| `DEC-CH-004` | External channels hiển thị warning thế nào | Inline warning / disabled / selectable with warning | Selectable with warning hoặc disabled cần confirm | TBD | `PENDING` | Áp dụng FACEBOOK/TOPCV/ITVIEC/VIETNAMWORKS/LINKEDIN |
| `DEC-CH-005` | Có lưu selected channel preference không | Yes / No / Later | Later hoặc chỉ lưu nếu user confirm | TBD | `PENDING` | Không lưu full snapshot kèm preference |

## 12. MVP Scope decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-MVP-001` | MVP chỉ `PUBLISH` hay có `UPDATE` | PUBLISH only / PUBLISH+UPDATE | PUBLISH only | TBD | `PENDING` | UPDATE có thể xử lý sau khi publish path ổn |
| `DEC-MVP-002` | MVP có `CLOSE` không | Yes / No / Later | Later | TBD | `PENDING` | Close flow cần khảo sát AMIS và state transition |
| `DEC-MVP-003` | MVP có badge/status không | Yes / No / Later | Later | TBD | `PENDING` | Không block sync/publish MVP |
| `DEC-MVP-004` | MVP có last sync result storage không | Yes / No / Minimal only | Minimal only nếu cần UX | TBD | `PENDING` | Không lưu full snapshot/JD |
| `DEC-MVP-005` | MVP có get sync status API không | Yes / No / Later | Later | TBD | `PENDING` | Nếu chưa có BE endpoint, không bịa endpoint |
| `DEC-MVP-006` | MVP có HR manual field input không | Yes / No / Later | No, yêu cầu sửa trên AMIS | TBD | `PENDING` | Extension không thay AMIS làm nơi nhập nghiệp vụ |
| `DEC-MVP-007` | Stack extension | TypeScript+React+Vite+MV3 / stack khác | TypeScript + React + Vite + Manifest V3 | TBD | `PENDING` | Cần confirm trước tạo source extension |

## 13. Retry / Error Handling decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-ERR-001` | Retry limit | 0 / 1 / 2 / 3 / configurable | Manual retry first, limit nhỏ | TBD | `PENDING` | Không retry vô hạn |
| `DEC-ERR-002` | Auto retry hay manual retry | Auto / manual / hybrid | Manual retry cho sync; auto ngắn chỉ cho extraction page-load nếu confirm | TBD | `PENDING` | Giữ nguyên request intent khi retry sync |
| `DEC-ERR-003` | Retry network error | Yes / No / manual only | Manual retry | TBD | `PENDING` | Cần reuse requestId/idempotency context nếu có |
| `DEC-ERR-004` | Retry 5xx / `INTERNAL_ERROR` | Yes / No / manual only | Manual retry | TBD | `PENDING` | Không che lỗi hệ thống kéo dài |
| `DEC-ERR-005` | Xử lý validation error | Block sync / allow edit in extension / redirect AMIS | Block sync, yêu cầu sửa AMIS | TBD | `PENDING` | Không retry `400 VALIDATION_ERROR` |
| `DEC-ERR-006` | Xử lý duplicate replay | Success-like / warning / error | Success-like info, không fatal | TBD | `PENDING` | BE trả `DUPLICATE_OR_IDEMPOTENT_REPLAY` |
| `DEC-ERR-007` | Xử lý `NOT_CONFIGURED` | Warning / error / manual required | Warning theo channel, không fail toàn request | TBD | `PENDING` | UI cần copy rõ |
| `DEC-ERR-008` | Thiếu optional field có cho HR tiếp tục không | Yes / No / theo field | Cần confirm theo field | TBD | `PENDING` | Required field thì block |
| `DEC-ERR-009` | Có cần state riêng cho `PUBLISH_FAILED` channel không | Yes / No / Later | Later nếu BE trả status này trong MVP | TBD | `PENDING` | File 09 có câu hỏi riêng |

## 14. Logging / Audit / PII decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-LOG-001` | Có capture contact info không | Yes / No / mask only | No trong MVP nếu chưa có policy | TBD | `PENDING` | PII risk |
| `DEC-LOG-002` | Contact info preview/mask thế nào | Full / masked / hidden | Hidden hoặc masked nếu capture | TBD | `PENDING` | Cần policy nội bộ |
| `DEC-LOG-003` | Debug log có bật không | Off / support-toggle / build-only | Off by default | TBD | `PENDING` | Không log token/full snapshot/raw HTML |
| `DEC-LOG-004` | Support metadata gồm gì | requestId, timestamp, version, state, action, AMIS id, resultCode, channel statuses, error code | Dùng safe metadata từ file 09 | TBD | `PENDING` | Không chứa JD full content |
| `DEC-LOG-005` | Không log full snapshot/token/cookie/raw HTML | Enforce / allow debug exception | Enforce | Enforce | `CONFIRMED` | Đã thống nhất trong các spec 05/08/09 |
| `DEC-LOG-006` | Có audit client-side event riêng không | Yes / No / Later | Later nếu BE audit đủ | TBD | `PENDING` | Backend audit đã có requested/succeeded/failed |
| `DEC-LOG-007` | Audit metadata có cần `userRole` và per-channel statuses không | Yes / No / BE gap | Chưa chốt | TBD | `PENDING` | File 08 đánh dấu `CẦN CONFIRM / BE GAP` |
| `DEC-LOG-008` | Có field AMIS nào cần exclude khỏi snapshot/log không | Yes / No / cần khảo sát | Cần khảo sát AMIS | TBD | `PENDING` | Không bịa field PII |

## 15. Recommended initial decisions for MVP - CẦN USER CONFIRM

Các recommendation dưới đây chỉ là gợi ý ban đầu để mở khóa MVP. Chúng không phải final decision.

| Decision ID | Recommendation | Lý do | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- |
| `REC-MVP-001` | UI mode: Side Panel chính + Popup launcher | JD dài, cần preview/channel/status rõ hơn popup đơn thuần | TBD | `PENDING` | Cần user confirm |
| `REC-MVP-002` | Stack: TypeScript + React + Vite + Manifest V3 | Phù hợp extension UI hiện đại và type-safe contract | TBD | `PENDING` | Cần user confirm |
| `REC-MVP-003` | Default channel: `VCS_PORTAL` selected mặc định | BE hiện có khả năng publish portal tốt nhất | TBD | `PENDING` | Cần user confirm |
| `REC-MVP-004` | External channels: hiển thị nhưng warning `NOT_CONFIGURED` | Không fail toàn request, vẫn minh bạch với HR | TBD | `PENDING` | Cần user confirm |
| `REC-MVP-005` | MVP scope: PUBLISH only, chưa làm UPDATE/CLOSE | Giảm rủi ro state transition và AMIS close/update capture | TBD | `PENDING` | Cần user confirm |
| `REC-MVP-006` | Trigger: nút extension trước, hook AMIS "Đăng tin" sau khảo sát | Tránh phụ thuộc DOM/event AMIS quá sớm | TBD | `PENDING` | Cần user confirm |
| `REC-MVP-007` | Missing required field: block sync, yêu cầu HR sửa trên AMIS, chưa nhập tay trong extension | Giữ AMIS là nơi HR thao tác chính | TBD | `PENDING` | Cần user confirm |
| `REC-MVP-008` | Rich text: plain text hoặc safe HTML cần confirm sau khảo sát BE/UI | Chưa đủ dữ liệu về editor AMIS và render BE/UI | TBD | `PENDING` | Cần user confirm |

## 16. Next action after decision log

Sau khi user confirm các decision critical, bước tiếp theo là:

1. Khảo sát AMIS domain/screen/API/field.
2. Cập nhật file `04_amis_screen_and_capture_requirement.md` và `05_amis_job_snapshot_mapping.md` bằng dữ liệu AMIS thật.
3. Sau đó mới bắt đầu `EXT-B0` / `EXT-B1` implementation theo `10_extension_implementation_task_breakdown.md`.

Top decisions cần confirm đầu tiên:

1. UI mode và stack extension.
2. Auth flow, token storage, logout/refresh và security review.
3. BE API domain + CORS/extension origin.
4. AMIS domain allowlist + recruitment URL pattern + `amisRecruitmentId` source.
5. AMIS capture source + required field mapping.
6. Default channels và MVP scope PUBLISH/UPDATE/CLOSE.
