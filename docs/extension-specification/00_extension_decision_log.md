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
| `DEC-BLOCKER-001` | UI mode | Extension dùng UI mode nào | Popup / Side Panel / Injected Panel / Hybrid | Side Panel chính + Popup launcher | Hybrid: Side Panel chính + Popup launcher | `CONFIRMED` | MVP dùng Side Panel chính, Popup làm launcher/trạng thái nhanh |
| `DEC-BLOCKER-002` | Auth flow | Extension lấy JWT/token bằng flow nào | JWT login hiện tại / Google OAuth/SSO / reuse token web app / extension token riêng | JWT login hiện tại | MVP dùng JWT login hiện tại của BE qua `POST /api/auth/login` và `GET /api/auth/me`; không dùng Google OAuth/SSO, không reuse token web app, không dùng extension token riêng trong MVP | `CONFIRMED` | Extension có login/config UI riêng cho HR đăng nhập bằng tài khoản BE |
| `DEC-BLOCKER-003` | Token storage | Token được lưu ở đâu và lifecycle thế nào | `chrome.storage.local` / `chrome.storage.session` / in-memory | `chrome.storage.session` | MVP lưu access token trong `chrome.storage.session`; khi token hết hạn hoặc BE trả `401`, clear token/session auth state, chuyển UI về `AUTH_REQUIRED`, HR đăng nhập lại | `CONFIRMED` | MVP chưa làm refresh token, không dùng `chrome.storage.local`, không lưu token trong AMIS localStorage/DOM/page context |
| `DEC-BLOCKER-004` | BE API domain | API base URL cho local/dev/staging/prod | Env config / settings screen / build-time config | Build-time env config cho MVP | MVP dùng build-time env config cho `BE_API_BASE_URL`; local dev default `http://localhost:3002/api`; staging/prod được cung cấp bởi deployment environment sau | `CONFIRMED` | Staging/prod URL cụ thể là deployment value, không còn là blocker để tạo extension foundation; MVP không có Settings screen cho HR đổi API domain |
| `DEC-BLOCKER-005` | CORS/extension origin | BE cho phép extension gọi trực tiếp thế nào | Allowed origins / extension origin / proxy strategy | Environment-based extension origin allowlist | BE sẽ allow Browser Extension origins qua env/config allowlist, ví dụ `EXTENSION_ALLOWED_ORIGINS=chrome-extension://<id1>,chrome-extension://<id2>`; production chỉ allow explicit `chrome-extension://<production-extension-id>` | `CONFIRMED` | Production extension ID cụ thể là deployment/release value; không wildcard production; không dùng proxy strategy trong MVP trừ khi CORS runtime test thất bại |
| `DEC-BLOCKER-006` | AMIS domain allowlist | AMIS domain nào được extension chạy | Domain thật / tenant domains / wildcard có kiểm soát | Dùng explicit allowlist, không wildcard rộng production | Extension foundation có thể proceed mà chưa có real AMIS host permission; real AMIS detection/capture chỉ implement sau khi khảo sát domain; production phải dùng explicit AMIS domain allowlist và không dùng wildcard rộng | `CONFIRMED` | Không hardcode AMIS domain, URL pattern, selector, internal API hoặc field mapping trước khảo sát; domain/tenant thật chuyển sang Group C |
| `DEC-BLOCKER-007` | AMIS recruitment URL pattern | URL pattern list/create/edit/detail/publish/close | URL thật từ AMIS | Không tự điền | TBD | `PENDING` | `BLOCKER`; `CẦN KHẢO SÁT AMIS` |
| `DEC-BLOCKER-008` | `amisRecruitmentId` source | ID AMIS lấy từ đâu | URL / API response / page state / DOM / data attribute | Không tự điền | TBD | `PENDING` | `BLOCKER` cho idempotency |
| `DEC-BLOCKER-009` | AMIS capture source | Extension capture snapshot từ nguồn nào | AMIS internal API / page state / DOM / manual confirmation / hybrid | Chưa chốt | TBD | `PENDING` | `BLOCKER`; không phụ thuộc internal API nếu chưa được phép |
| `DEC-BLOCKER-010` | Required field mapping | Field AMIS nào map sang field bắt buộc BE | title / description / requirements và field khác nếu BE yêu cầu | Không tự điền | TBD | `PENDING` | `BLOCKER`; `CẦN KHẢO SÁT AMIS FIELD` |
| `DEC-BLOCKER-011` | Rich text transform strategy | Description/requirements/benefits transform thế nào | Safe HTML / plain text / JSON schema | Chưa chốt | TBD | `PENDING` | `BLOCKER` cho payload hợp lệ |
| `DEC-BLOCKER-012` | Default `channels` | Channel nào được chọn mặc định | `VCS_PORTAL` only / nhiều channel / none | `VCS_PORTAL` mặc định | `VCS_PORTAL` mặc định | `CONFIRMED` | DTO field là `channels`; external channels có thể chọn nhưng phải warning `NOT_CONFIGURED` |
| `DEC-BLOCKER-013` | MVP action scope | MVP chỉ support `PUBLISH` hay có `UPDATE`/`CLOSE` | PUBLISH only / PUBLISH+UPDATE / PUBLISH+UPDATE+CLOSE | PUBLISH only | PUBLISH only trong MVP; UPDATE/CLOSE để later | `CONFIRMED` | UPDATE/CLOSE để sau khi publish flow ổn và khảo sát AMIS đủ |

## 4. UI / UX decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-UI-001` | UI mode cuối cùng | Popup / Side Panel / Injected Panel / Hybrid | Side Panel chính + Popup launcher | Hybrid | `CONFIRMED` | Side Panel là UI chính, Popup chỉ làm launcher/trạng thái nhanh |
| `DEC-UI-002` | Có dùng Side Panel làm UI chính không | Yes / No | Yes cho preview JD dài, channel result và confirmation | Yes, Side Panel làm UI chính | `CONFIRMED` | UI chính của MVP |
| `DEC-UI-003` | Popup có chỉ làm launcher không | Launcher only / Full flow / Không dùng popup | Launcher only | Popup launcher only | `CONFIRMED` | Popup không chứa full flow MVP |
| `DEC-UI-004` | Có injected panel trong AMIS page không | MVP không dùng / Dùng sau khảo sát / Dùng ngay | Không dùng trong MVP | Không dùng Injected Panel trong MVP | `CONFIRMED` | Có thể xem lại sau khảo sát CSS/DOM AMIS |
| `DEC-UI-005` | Có badge/status trên AMIS list/detail không | Yes / No / Later | Later | Later, không làm badge/status trong MVP | `CONFIRMED` | Badge/status để later |
| `DEC-UI-006` | Có Settings screen không | Yes / No / Later | Later nếu config có thể build-time/env | Later, chưa làm Settings screen trong MVP nếu chưa cần | `CONFIRMED` | Chỉ làm nếu phát sinh nhu cầu config runtime |
| `DEC-UI-007` | Có cho HR nhập tay field thiếu không | Yes / No, sửa trên AMIS / Later | Block sync và yêu cầu sửa trên AMIS trong MVP | No manual input in MVP; block sync và yêu cầu HR sửa trên AMIS | `CONFIRMED` | Extension không thay AMIS làm nơi nhập nghiệp vụ |
| `DEC-UI-008` | Có show requestId/internal IDs cho HR không | Show cho HR / Chỉ support detail / Không show | Chỉ support detail | TBD | `PENDING` | Không làm UI quá kỹ thuật |
| `DEC-UI-009` | UI copy final cho lỗi/trạng thái | Draft copy từ file 07/09 / Product copy mới | Dùng draft làm baseline, cần user confirm | TBD | `PENDING` | Áp dụng cho validation, auth, duplicate, `NOT_CONFIGURED` |

## 5. Auth / Token / Security decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-AUTH-001` | Auth flow extension | JWT login hiện tại / Google OAuth/SSO / reuse token web app / extension token riêng | JWT login hiện tại | MVP dùng JWT login hiện tại của BE; extension có login/config UI riêng; gọi `POST /api/auth/login` để lấy `accessToken` và `GET /api/auth/me` để verify user/role | `CONFIRMED` | Không dùng Google OAuth/SSO, không reuse token web app, không dùng extension token riêng trong MVP |
| `DEC-AUTH-002` | Token storage | `chrome.storage.local` / `chrome.storage.session` / in-memory | `chrome.storage.session` | MVP lưu access token trong `chrome.storage.session` | `CONFIRMED` | Không dùng `chrome.storage.local`; không lưu token trong AMIS DOM/localStorage/page context; không log token |
| `DEC-AUTH-003` | Token refresh/logout | Không refresh, login lại / refresh token / OAuth refresh / revoke flow | Không refresh, login lại khi hết hạn | Khi token hết hạn hoặc BE trả `401`, extension clear token/session auth state, UI chuyển về `AUTH_REQUIRED`, HR đăng nhập lại | `CONFIRMED` | MVP chưa làm refresh token/logout/revoke flow mới |
| `DEC-AUTH-004` | Debug mode | Off by default / Support-toggle / Build-only | Off by default | Debug mode off by default; chỉ bật trong dev build hoặc support mode nếu được cấu hình rõ | `CONFIRMED` | Không log token/JWT, AMIS cookie/session, full AMIS Job Snapshot, raw HTML, full JD content, PII/contact info nếu chưa có masking rule |
| `DEC-AUTH-005` | Security review trước dev thật | Required / Optional / Later | Required | Security review bắt buộc trước khi implement capture AMIS thật | `CONFIRMED` | Đặc biệt quan trọng trước capture AMIS thật, dùng AMIS internal API, hoặc thay đổi token persistence |
| `DEC-AUTH-006` | Role được gọi sync/publish API | ADMIN/HR only / mở thêm role khác | ADMIN/HR only | Only `ADMIN` and `HR` roles can call the extension sync/publish API; `INTERVIEWER` and other roles are not allowed unless BE contract changes later | `CONFIRMED` | Extension UI/API client handles `401` as `AUTH_REQUIRED`/login lại and `403` as `FORBIDDEN`/không đủ quyền; không mở thêm role riêng trong MVP |
| `DEC-AUTH-007` | Có reuse token từ web app không | Yes / No / Chỉ nếu security review approve | No trong MVP | Không reuse token từ web app trong MVP | `CONFIRMED` | Extension dùng login riêng qua BE auth API để tránh rủi ro boundary giữa web app và extension |

## 6. BE API / Environment decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-BE-001` | Main API endpoint extension gọi | `POST /api/extension/amis/job-postings/sync-and-publish` / endpoint khác | Dùng endpoint extension riêng | `POST /api/extension/amis/job-postings/sync-and-publish` | `CONFIRMED` | Endpoint path đã chốt cho implementation mới; current source chưa có module/route này |
| `DEC-BE-002` | BE API base URL local/dev/staging/prod | Config theo env / settings / build-time | Build-time env config cho MVP | MVP dùng build-time env config cho `BE_API_BASE_URL`; local dev default `http://localhost:3002/api`; staging/prod được cung cấp bởi deployment environment sau | `CONFIRMED` | Staging/prod URL cụ thể là deployment value, không còn là blocker để tạo extension foundation; không hardcode staging/prod domain khi chưa có dữ liệu; Settings screen để `LATER` |
| `DEC-BE-003` | CORS/allowed origins cho extension | Allow extension origin / allow BE host permission / proxy | Environment-based extension origin allowlist | BE will allow Browser Extension origins through environment-based allowlist config, for example `EXTENSION_ALLOWED_ORIGINS=chrome-extension://<id1>,chrome-extension://<id2>` | `CONFIRMED` | Production must allow only explicit `chrome-extension://<production-extension-id>`; no wildcard production; local/dev may allow unpacked extension origin after local extension ID is known; proxy strategy not in MVP unless CORS runtime test fails |
| `DEC-BE-004` | Có cần API get sync status theo `amisRecruitmentId` không | Yes / No / Later | Later cho MVP tối thiểu | Later | `CONFIRMED` | Nếu không có API này, extension không là source of truth |
| `DEC-BE-005` | ResultCode chính thức cho sync/publish | Giữ `OK`/duplicate / thêm `CREATED`,`UPDATED`,`CLOSED` | Cần phân biệt create/update/replay cho UI và audit | `CREATED`, `UPDATED`, `DUPLICATE_OR_IDEMPOTENT_REPLAY` | `CONFIRMED` | Không dùng `OK` làm resultCode chính nữa; `CLOSE` không thuộc MVP |
| `DEC-BE-006` | Có cần API update/close riêng không | Dùng `action` endpoint chính / API riêng | Dùng `action` endpoint chính nếu BE contract đủ | TBD | `PENDING` | Phụ thuộc MVP scope PUBLISH/UPDATE/CLOSE |
| `DEC-BE-007` | Có cần top-level `publicUrl` không | Chỉ `channelPostings[].publishedUrl` / thêm top-level | Chỉ dùng `channelPostings[].publishedUrl` trong MVP | MVP does not require top-level `publicUrl`; UI reads public URL from `channelPostings[].publishedUrl` | `CONFIRMED` | `VCS_PORTAL` may return `publishedUrl`; external channels may return `null` `publishedUrl` with `NOT_CONFIGURED`; no BE response contract change required |
| `DEC-BE-008` | `Idempotency-Key` có bắt buộc không | Optional / Required | Optional/recommended metadata header | `Idempotency-Key` is optional and used only for trace/audit metadata; it is not the primary idempotency key in MVP | `CONFIRMED` | Extension should generate and reuse the same `Idempotency-Key` for the same retry attempt group if possible; BE must not rely on it as primary idempotency key |
| `DEC-BE-009` | Có cần `GET /api/extension/config` không | Yes / No / Later | No config API in MVP; revisit later | MVP does not require `GET /api/extension/config` | `CONFIRMED` | Channel list/default channel can use frontend constants; BE API base URL uses build-time env config; feature flags/config API is later; do not invent this endpoint in MVP |
| `DEC-BE-010` | Error envelope `401/403` parse thế nào | Runtime check / normalize in extension | Parse theo global `ApiExceptionFilter` | `401` -> envelope `UNAUTHORIZED`; `403` -> envelope `FORBIDDEN` | `CONFIRMED` | Source filter trả `{ success:false, error:{ code, message, details }, meta:{ requestId, timestamp } }` |
| `DEC-BE-011` | DTO channel field name | `channels` / old selected-channel field | Cần thống nhất BE contract và extension request | `channels` | `CONFIRMED` | Backend DTO chỉ dùng `channels`; "selected channels" chỉ là UI wording nếu cần |
| `DEC-BE-012` | External AMIS reference storage | Lưu trên `JobPosting` / bảng riêng / hybrid | Bảng riêng giảm coupling domain và hỗ trợ nhiều external systems | Bảng riêng `external_references` hoặc `recruitment_external_references` theo convention backend | `CONFIRMED` | `JobPosting` có thể cache field nếu cần query nhanh, nhưng source of truth external mapping là bảng riêng |
| `DEC-BE-013` | Requirements schema tối thiểu | Raw string / object schema / rich text schema | MVP cần object đơn giản, không bắt extension parse sâu | Object với required `rawText`, optional `sections`, `mustHaveSkills`, `niceToHaveSkills`, `minExperienceYears`, `education`, `languages`, `certifications`, `notes` | `CONFIRMED` | AMIS field source vẫn `CẦN KHẢO SÁT AMIS`; rich text strategy vẫn pending |
| `DEC-BE-014` | Idempotency storage strategy | Bảng riêng / reuse external reference / cache | Reuse existing external reference + snapshotHash strategy | MVP uses existing BE idempotency strategy: `sourceSystem=AMIS` + `amisRecruitmentId`/`externalRecruitmentId` + BE-computed `snapshotHash` from stable JSON of snapshot | `CONFIRMED` | If same AMIS recruitment ID and same `snapshotHash` are submitted again, BE returns `DUPLICATE_OR_IDEMPOTENT_REPLAY`; extension does not compute/send `snapshotHash`; no `extension_idempotency_records` table in MVP |

## FLOW-01. BE Environment & Auth Decisions

### FLOW-01 Source Findings

| Hạng mục | Kết quả từ source | Ảnh hưởng decision |
| --- | --- | --- |
| Auth mechanism | BE dùng JWT Bearer qua `JwtStrategy`; `AuthService.login` ký payload `{ sub, email, role }` và trả `{ accessToken, user }`; Google OAuth endpoints cũng tồn tại. | Group A đã chốt extension MVP dùng JWT login hiện tại của BE; Google OAuth/SSO để ngoài MVP. |
| Login endpoint | `POST /api/auth/login` dùng `LocalAuthGuard`; `GET /api/auth/me` dùng `JwtAuthGuard`; có `GET /api/auth/google` và `GET /api/auth/google/callback`. | Extension MVP dùng `POST /api/auth/login` để lấy `accessToken` và `GET /api/auth/me` để verify user/role. |
| JWT guard | `JwtAuthGuard extends AuthGuard('jwt')`; JWT lấy từ `Authorization: Bearer <token>`; `ignoreExpiration: false`. | Extension phải xử lý no token/expired token như auth required. |
| Role guard | `RolesGuard` đọc metadata `@Roles(...)` và check `requiredRoles.includes(user?.role)`. | Group B đã chốt extension sync/publish API chỉ cho `ADMIN` và `HR`; `INTERVIEWER` và role khác không được phép trong MVP. |
| Allowed roles extension API | Không tìm thấy `ExtensionIntegrationModule`, `ExtensionIntegrationController`, hoặc route `/api/extension/amis/job-postings/sync-and-publish` trong current source tree. Protected `JobPostingsController` hiện dùng `@UseGuards(JwtAuthGuard, RolesGuard)` và `@Roles(UserRole.ADMIN, UserRole.HR)`. | `DEC-AUTH-006` đã `CONFIRMED` theo BE contract decision cho endpoint extension mới: `ADMIN`/`HR` only; UI/API client phải xử lý `401`/`403`. |
| Access token expiry | `JwtModule` dùng `JWT_EXPIRES_IN`, default `15m`; current backend `.env` cũng set `JWT_EXPIRES_IN=15m`. | Extension không hardcode expiry; khi token hết hạn hoặc BE trả `401`, clear session auth state và yêu cầu HR đăng nhập lại. |
| Refresh token | Không thấy endpoint refresh/logout/revoke trong auth controller/service hiện tại; `.env` có `JWT_REFRESH_EXPIRES_IN` nhưng source auth flow chưa dùng. | Group A đã chốt MVP chưa làm refresh token; `DEC-AUTH-003` chuyển `CONFIRMED` theo policy login lại. |
| CORS config | `main.ts` gọi `app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:4000', credentials: true })`. | Group B đã chốt policy BE phải support extension origin allowlist qua env/config như `EXTENSION_ALLOWED_ORIGINS`; production extension ID là deployment/release value. |
| FRONTEND_URL/env | Current backend `.env` set `FRONTEND_URL=http://localhost:4000`; source fallback là `http://localhost:4000`. | Không suy luận extension origin từ `FRONTEND_URL`. |
| Local BE base URL | `main.ts` dùng `PORT || 3000`; current backend `.env` set `PORT=3002`; global prefix là `/api`. | Group A đã chốt local dev default `BE_API_BASE_URL=http://localhost:3002/api`; staging/prod là deployment value, không còn là foundation blocker. |
| 401/403 behavior | Global `ApiExceptionFilter` normalize `401` thành code `UNAUTHORIZED`, message `Authentication is required.`; `403` thành code `FORBIDDEN`, message `You do not have permission to perform this action.` | `DEC-BE-010` có thể `CONFIRMED` theo source. |

### FLOW-01 Recommendation - UPDATED AFTER GROUP B

| Hạng mục | Decision / remaining recommendation | Status |
| --- | --- | --- |
| Auth flow | Extension dùng JWT login hiện tại của BE cho MVP; không dùng Google OAuth/SSO, không reuse token web app, không dùng extension token riêng. | `CONFIRMED` |
| Token storage | MVP lưu access token trong `chrome.storage.session`; khi token hết hạn hoặc BE trả `401`, clear session auth state và yêu cầu HR đăng nhập lại. | `CONFIRMED` |
| BE environment | MVP dùng build-time env config cho `BE_API_BASE_URL`; local dev default `http://localhost:3002/api`; staging/prod được cung cấp bởi deployment environment sau. | `CONFIRMED` |
| CORS | BE will allow Browser Extension origins through env/config allowlist such as `EXTENSION_ALLOWED_ORIGINS`; production allows only explicit extension origin, no wildcard. | `CONFIRMED` |
| Security | Security review required trước khi implement capture AMIS thật; debug mode off by default và không log token/full snapshot/raw HTML/full JD/PII. | `CONFIRMED` |

### FLOW-01 Remaining Questions After Group B

Moved to deployment/release:

1. Extension production ID/origin sẽ được chốt thế nào để BE CORS allow?

Deployment value, not foundation blocker:

1. Staging/prod BE API base URL là gì?

## 7. AMIS Domain / URL / Screen decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-AMIS-001` | AMIS domain allowlist | Domain thật / nhiều domain tenant / wildcard có kiểm soát | Dùng explicit allowlist, không wildcard rộng production | Policy đã chốt: extension chỉ chạy trên AMIS domain allowlist; production chỉ allow domain AMIS thật sau khảo sát; domain/tenant thật vẫn TBD | `PENDING` | Không còn là blocker của extension foundation; chuyển sang Group C - AMIS real detection/capture; vẫn `CẦN KHẢO SÁT AMIS DOMAIN`, tenant pattern và dev/test AMIS nếu có |
| `DEC-AMIS-002` | Recruitment list URL pattern | URL pattern thật | Không tự điền | TBD | `PENDING` | Cần cho detection và optional badge/status |
| `DEC-AMIS-003` | Recruitment create URL pattern | URL pattern thật | Không tự điền | TBD | `PENDING` | Cần nếu capture từ màn create |
| `DEC-AMIS-004` | Recruitment edit URL pattern | URL pattern thật | Không tự điền | TBD | `PENDING` | Cần nếu capture từ màn edit |
| `DEC-AMIS-005` | Recruitment detail URL pattern | URL pattern thật | Không tự điền | TBD | `PENDING` | Cần cho reopen/status flow |
| `DEC-AMIS-006` | Publish action screen/popup | AMIS button / modal / API action / extension button | Không tự điền | TBD | `PENDING` | Cần khảo sát AMIS thật |
| `DEC-AMIS-007` | Close action screen/popup | AMIS button / modal / API action / không trong MVP | Không làm CLOSE trong MVP nếu chưa confirm | TBD | `PENDING` | Phụ thuộc MVP scope |
| `DEC-AMIS-008` | Màn AMIS nào thuộc MVP bắt buộc | Detail only / Edit only / Create+Edit / List+Detail | Chưa chốt | TBD | `PENDING` | Giới hạn để tránh scrape quá rộng |
| `DEC-AMIS-009` | Có nhiều AMIS tenant/domain không | Yes / No / Later | Nếu có nhiều tenant/domain thì phải liệt kê hoặc dùng pattern có kiểm soát sau khi confirm | CẦN CONFIRM: có một domain duy nhất hay nhiều tenant/domain; có môi trường dev/test AMIS riêng hay không | `PENDING` | Không còn là blocker của extension foundation; chuyển sang Group C - AMIS real detection/capture; ảnh hưởng manifest host permissions; không tự bịa AMIS domain hoặc tenant pattern |

## 8. AMIS Capture Source decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-CAPTURE-001` | Có được dùng AMIS internal API không | Yes / No / Chỉ nếu security/legal approve | Chưa chốt | TBD | `PENDING` | Không phụ thuộc internal API nếu chưa được phép |
| `DEC-CAPTURE-002` | Capture source ưu tiên | API / page state / DOM / manual confirmation / hybrid | Khảo sát trước, chọn nguồn ổn định nhất | TBD | `PENDING` | Không tự bịa API/selector/page state |
| `DEC-CAPTURE-003` | Có fallback DOM không | Yes / No / Later | Chỉ sau khi khảo sát selector ổn định | TBD | `PENDING` | DOM dễ vỡ nếu AMIS đổi UI |
| `DEC-CAPTURE-004` | Có versioned adapter không | Yes / No / Later | Yes nếu AMIS có nhiều version/domain | TBD | `PENDING` | Giúp cô lập thay đổi AMIS |
| `DEC-CAPTURE-005` | Trigger chính | Nút AMIS "Đăng tin" / nút extension / cả hai | Nút extension trước, hook AMIS sau khảo sát | MVP dùng nút extension làm trigger chính; chưa hook nút AMIS "Đăng tin" | `CONFIRMED` | Hook AMIS có thể làm sau khi khảo sát AMIS kỹ hơn |
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
| `DEC-FIELD-009` | `contactInfo` có capture không | Capture / không capture / mask only | Không capture trong MVP nếu chưa có policy | Không capture contactInfo/PII trong MVP nếu chưa có policy | `CONFIRMED` | PII/security decision |
| `DEC-FIELD-010` | `questions` có nằm trong MVP không | Yes / No / Later | No trong MVP | TBD | `PENDING` | Tránh mở rộng sang screening flow |
| `DEC-FIELD-011` | Position/department/level/quantity có capture không | Yes / No / Later | Later nếu không bắt buộc BE | TBD | `PENDING` | Cần khảo sát field AMIS thật |

## 10. Rich text / Transform decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-TX-001` | Description giữ safe HTML hay plain text | Safe HTML / plain text | Cần confirm sau khảo sát BE/UI | TBD | `PENDING` | Không log raw HTML |
| `DEC-TX-002` | Requirements transform thành JSON object thế nào | Schema sections/items / raw object / BE schema mới | User đã chốt schema tối thiểu | Required `rawText`; optional `sections`, `mustHaveSkills`, `niceToHaveSkills`, `minExperienceYears`, `education`, `languages`, `certifications`, `notes` | `CONFIRMED` | Extension có thể gửi tối thiểu `{ rawText, sections: [] }`; AMIS source/mapping thật vẫn `CẦN KHẢO SÁT AMIS` |
| `DEC-TX-003` | Benefits transform thế nào | JSON object / array / plain text / không capture | Cần confirm schema | TBD | `PENDING` | Optional nhưng UI preview cần rõ |
| `DEC-TX-004` | Date format | ISO date / raw text / timezone-aware | ISO nếu AMIS dữ liệu đáng tin | TBD | `PENDING` | Không tự parse nếu format chưa khảo sát |
| `DEC-TX-005` | Salary parse hay giữ raw text | Parse structured / raw text / không capture | Raw text hoặc không capture cho MVP nếu chưa khảo sát | TBD | `PENDING` | Tránh sai salary |
| `DEC-TX-006` | Location normalize hay giữ raw text | Normalize / raw text | Raw text trước nếu chưa có taxonomy | TBD | `PENDING` | Normalize cần rule riêng |
| `DEC-TX-007` | Snapshot shape nested hay flatten theo BE hiện tại | Extension flatten / BE nhận nested tương lai | Flatten theo BE hiện tại nếu contract không đổi | TBD | `PENDING` | File 05 đánh dấu API contract cần confirm |
| `DEC-TX-008` | `snapshotHash` do ai tính | BE only / Extension cũng tính để debug | BE only theo source hiện tại | TBD | `PENDING` | Extension không dùng hash làm nguồn quyết định chính |

## 11. Channel decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-CH-001` | Default `channels` | `VCS_PORTAL` / nhiều channel / none | `VCS_PORTAL` default | `VCS_PORTAL` | `CONFIRMED` | DTO field dùng `channels`; UI có thể mô tả là selected channels |
| `DEC-CH-002` | Có cho HR chọn external channels dù BE trả `NOT_CONFIGURED` không | Yes / No / Later | Yes nếu UI warning rõ | Yes, cho HR chọn external channels nhưng hiển thị warning `NOT_CONFIGURED` | `CONFIRMED` | Không fail toàn bộ request |
| `DEC-CH-003` | `VCS_PORTAL` có selected mặc định không | Yes / No | Yes | Yes | `CONFIRMED` | VCS portal là channel auto publish đã có BE |
| `DEC-CH-004` | External channels hiển thị warning thế nào | Inline warning / disabled / selectable with warning | Selectable with warning hoặc disabled cần confirm | Selectable with warning `NOT_CONFIGURED` | `CONFIRMED` | Áp dụng FACEBOOK/TOPCV/ITVIEC/VIETNAMWORKS/LINKEDIN; `MANUAL_REQUIRED` later/not used in MVP |
| `DEC-CH-005` | Có lưu selected channel preference không | Yes / No / Later | Later hoặc chỉ lưu nếu user confirm | TBD | `PENDING` | Không lưu full snapshot kèm preference |
| `DEC-CH-006` | Channel enum extension integration MVP | Có/không `ITVIEC`; có/không `MANUAL`, `OTHER` | User chốt thêm `ITVIEC` | `VCS_PORTAL`, `FACEBOOK`, `TOPCV`, `ITVIEC`, `VIETNAMWORKS`, `LINKEDIN` | `CONFIRMED` | `MANUAL`/`OTHER` không thuộc extension integration MVP channel enum |
| `DEC-CH-007` | Channel status cho external chưa cấu hình/API chưa verify | `NOT_CONFIGURED` / `MANUAL_REQUIRED` | User chốt `NOT_CONFIGURED` | `NOT_CONFIGURED` | `CONFIRMED` | Không dùng `MANUAL_REQUIRED` trong MVP; để later/manual workflow nếu cần |

## 12. MVP Scope decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-MVP-001` | MVP chỉ `PUBLISH` hay có `UPDATE` | PUBLISH only / PUBLISH+UPDATE | PUBLISH only | PUBLISH only trong MVP; UPDATE/CLOSE để later | `CONFIRMED` | UPDATE xử lý sau khi publish flow ổn |
| `DEC-MVP-002` | MVP có `CLOSE` không | Yes / No / Later | Later | PUBLISH only trong MVP; UPDATE/CLOSE để later | `CONFIRMED` | Close flow để later sau khi khảo sát AMIS đủ |
| `DEC-MVP-003` | MVP có badge/status không | Yes / No / Later | Later | Later | `CONFIRMED` | Không làm badge/status trong MVP |
| `DEC-MVP-004` | MVP có last sync result storage không | Yes / No / Minimal only | Minimal only nếu cần UX | Minimal only nếu cần UX, không lưu full snapshot | `CONFIRMED` | Extension storage không là source of truth |
| `DEC-MVP-005` | MVP có get sync status API không | Yes / No / Later | Later | Later | `CONFIRMED` | Nếu chưa có BE endpoint, không bịa endpoint |
| `DEC-MVP-006` | MVP có HR manual field input không | Yes / No / Later | No, yêu cầu sửa trên AMIS | Block sync nếu thiếu required fields; yêu cầu HR sửa trên AMIS; không nhập tay trong extension MVP | `CONFIRMED` | Required fields hiện tại: `amisRecruitmentId`, `action`, `snapshot.title`, `snapshot.description`, `snapshot.requirements.rawText`, `channels` không rỗng |
| `DEC-MVP-007` | Stack extension | TypeScript+React+Vite+MV3 / stack khác | TypeScript + React + Vite + Manifest V3 | TypeScript + React + Vite + Chrome Extension Manifest V3 | `CONFIRMED` | Stack MVP đã chốt trước khi tạo source extension |

## 13. Retry / Error Handling decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-ERR-001` | Retry limit | 0 / 1 / 2 / 3 / configurable | Manual retry first, limit nhỏ | Retry limit = 2 manual retries per sync attempt | `CONFIRMED` | Không retry vô hạn |
| `DEC-ERR-002` | Auto retry hay manual retry | Auto / manual / hybrid | Manual retry cho sync; auto ngắn chỉ cho extraction page-load nếu confirm | Manual retry for sync | `CONFIRMED` | Không auto retry sync |
| `DEC-ERR-003` | Retry network error | Yes / No / manual only | Manual retry | Manual retry for network error | `CONFIRMED` | Cho HR bấm retry thủ công |
| `DEC-ERR-004` | Retry 5xx / `INTERNAL_ERROR` | Yes / No / manual only | Manual retry | Manual retry for 5xx | `CONFIRMED` | Không che lỗi hệ thống kéo dài |
| `DEC-ERR-005` | Xử lý validation error | Block sync / allow edit in extension / redirect AMIS | Block sync, yêu cầu sửa AMIS | Block sync; yêu cầu sửa AMIS | `CONFIRMED` | Không retry `400 VALIDATION_ERROR` |
| `DEC-ERR-006` | Xử lý duplicate replay | Success-like / warning / error | Success-like info, không fatal | Success-like info, không fatal | `CONFIRMED` | BE trả `DUPLICATE_OR_IDEMPOTENT_REPLAY` |
| `DEC-ERR-007` | Xử lý `NOT_CONFIGURED` | Warning / error / manual required | Warning theo channel, không fail toàn request | Warning theo channel, không fail toàn request | `CONFIRMED` | UI cần copy rõ |
| `DEC-ERR-008` | Thiếu optional field có cho HR tiếp tục không | Yes / No / theo field | Cần confirm theo field | TBD | `PENDING` | Required field thì block |
| `DEC-ERR-009` | Có cần state riêng cho `PUBLISH_FAILED` channel không | Yes / No / Later | Later nếu BE trả status này trong MVP | TBD | `PENDING` | File 09 có câu hỏi riêng |

## 14. Logging / Audit / PII decisions

| Decision ID | Nội dung cần chốt | Options | Recommendation nếu có | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `DEC-LOG-001` | Có capture contact info không | Yes / No / mask only | No trong MVP nếu chưa có policy | Không capture contactInfo/PII trong MVP nếu chưa có policy | `CONFIRMED` | PII risk |
| `DEC-LOG-002` | Contact info preview/mask thế nào | Full / masked / hidden | Hidden hoặc masked nếu capture | Không áp dụng trong MVP vì không capture contactInfo/PII | `CONFIRMED` | Cần policy nội bộ trước khi thay đổi |
| `DEC-LOG-003` | Debug log có bật không | Off / support-toggle / build-only | Off by default | Debug mode off by default; chỉ bật trong dev build hoặc support mode nếu được cấu hình rõ | `CONFIRMED` | Không log token/JWT, AMIS cookie/session, full AMIS Job Snapshot, raw HTML, full JD content, PII/contact info nếu chưa có masking rule |
| `DEC-LOG-004` | Support metadata gồm gì | requestId, timestamp, version, state, action, AMIS id, resultCode, channel statuses, error code | Dùng safe metadata từ file 09 | TBD | `PENDING` | Không chứa JD full content |
| `DEC-LOG-005` | Không log full snapshot/token/cookie/raw HTML | Enforce / allow debug exception | Enforce | Không log full snapshot/token/cookie/raw HTML | `CONFIRMED` | Đã thống nhất trong các spec 05/08/09 |
| `DEC-LOG-006` | Có audit client-side event riêng không | Yes / No / Later | Later nếu BE audit đủ | TBD | `PENDING` | Backend audit đã có requested/succeeded/failed |
| `DEC-LOG-007` | Audit metadata có cần `userRole` và per-channel statuses không | Yes / No / BE gap | Chưa chốt | TBD | `PENDING` | File 08 đánh dấu `CẦN CONFIRM / BE GAP` |
| `DEC-LOG-008` | Có field AMIS nào cần exclude khỏi snapshot/log không | Yes / No / cần khảo sát | Cần khảo sát AMIS | TBD | `PENDING` | Không bịa field PII |

## 15. Recommended initial decisions for MVP

Các recommendation đã được user chốt có status `CONFIRMED`. Recommendation còn lại với status `PENDING` vẫn chỉ là gợi ý ban đầu và không phải final decision.

| Decision ID | Recommendation | Lý do | Final decision | Status | Note |
| --- | --- | --- | --- | --- | --- |
| `REC-MVP-001` | UI mode: Side Panel chính + Popup launcher | JD dài, cần preview/channel/status rõ hơn popup đơn thuần | Hybrid: Side Panel chính + Popup launcher | `CONFIRMED` | User đã confirm UI mode MVP |
| `REC-MVP-002` | Stack: TypeScript + React + Vite + Manifest V3 | Phù hợp extension UI hiện đại và type-safe contract | TypeScript + React + Vite + Chrome Extension Manifest V3 | `CONFIRMED` | User đã confirm stack MVP |
| `REC-MVP-003` | Default channel: `VCS_PORTAL` trong `channels` | BE hiện có khả năng publish portal tốt nhất | `VCS_PORTAL` mặc định | `CONFIRMED` | User đã confirm default channel |
| `REC-MVP-004` | External channels: hiển thị nhưng warning `NOT_CONFIGURED` | Không fail toàn request, vẫn minh bạch với HR | Cho HR chọn external channels nhưng hiển thị warning `NOT_CONFIGURED`; không fail toàn request | `CONFIRMED` | User đã confirm channel warning behavior |
| `REC-MVP-005` | MVP scope: PUBLISH only, chưa làm UPDATE/CLOSE | Giảm rủi ro state transition và AMIS close/update capture | PUBLISH only trong MVP; UPDATE/CLOSE để later | `CONFIRMED` | User đã confirm MVP action scope |
| `REC-MVP-006` | Trigger: nút extension trước, hook AMIS "Đăng tin" sau khảo sát | Tránh phụ thuộc DOM/event AMIS quá sớm | MVP dùng nút extension làm trigger chính; chưa hook nút AMIS "Đăng tin" | `CONFIRMED` | User đã confirm trigger MVP |
| `REC-MVP-007` | Missing required field: block sync, yêu cầu HR sửa trên AMIS, chưa nhập tay trong extension | Giữ AMIS là nơi HR thao tác chính | Block sync nếu thiếu required fields; yêu cầu HR sửa trên AMIS; không nhập tay trong extension MVP | `CONFIRMED` | User đã confirm missing required field policy |
| `REC-MVP-008` | Rich text: plain text hoặc safe HTML cần confirm sau khảo sát BE/UI | Chưa đủ dữ liệu về editor AMIS và render BE/UI | TBD | `PENDING` | Cần user confirm |

## 16. Next action after decision log

Sau khi Group A và Group B được chốt, extension foundation/mock flow và BE API client structure có thể bắt đầu mà chưa cần hardcode AMIS domain thật, staging/prod BE domain, hoặc production extension ID.

Bước tiếp theo cho các phần gọi BE/capture AMIS thật là:

1. Khảo sát AMIS domain/screen/API/field.
2. Cập nhật file `04_amis_screen_and_capture_requirement.md` và `05_amis_job_snapshot_mapping.md` bằng dữ liệu AMIS thật.
3. Sau đó mới bắt đầu các phần real AMIS detection/capture theo `10_extension_implementation_task_breakdown.md`.

Top blockers còn lại trước khi gọi BE thật hoặc capture AMIS thật:

1. Deployment/release: production extension ID và local/dev extension ID để điền vào BE CORS allowlist.
2. Runtime verification: test CORS thực tế giữa extension và BE sau khi có extension ID.
3. Runtime verification: test `401`/`403` envelope thực tế để UI parser xử lý đúng.
4. Group C - AMIS survey: AMIS domain allowlist thật, tenant pattern, recruitment URL pattern và `amisRecruitmentId` source.
5. Group C - AMIS capture: AMIS capture source và required field mapping.
6. Group C/D - Transform/scope: rich text transform strategy cho description/requirements/benefits.

## 17. Remaining questions after Group A

Moved to Group C - AMIS survey:

1. AMIS domain HR đang dùng là gì?
2. AMIS có một domain duy nhất hay nhiều tenant domain?
3. Có môi trường dev/test AMIS riêng không?

Resolved by Group B policy; remaining value moved to deployment/release:

1. Extension production ID/origin sẽ được chốt thế nào để BE CORS allow?

Deployment value, not foundation blocker:

1. Staging/prod BE API base URL là gì?

## 18. Remaining questions after Group B

Moved to deployment/release:

1. Production extension ID là gì để cấu hình BE CORS allowlist?
2. Local/dev extension ID sau khi load unpacked là gì nếu muốn test gọi BE thật từ local extension?

Moved to runtime verification:

1. Cần test CORS thực tế giữa extension và BE sau khi có extension ID.
2. Cần test `401`/`403` envelope thực tế để UI parser xử lý đúng.

No longer blockers for MVP:

1. Top-level `publicUrl` không cần.
2. `GET /api/extension/config` không cần.
3. Idempotency table riêng không cần.
