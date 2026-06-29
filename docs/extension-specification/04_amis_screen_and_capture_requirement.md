# 04. AMIS Screen and Capture Requirement

## 1. Mục tiêu tài liệu

Tài liệu này xác định yêu cầu khảo sát AMIS để Browser Extension có thể nhận diện màn hình tuyển dụng, lấy dữ liệu JD/tin tuyển dụng và trigger sync về BE CV / Recruitment Core.

File này là capture requirement và survey template, không phải implementation. File này không chốt AMIS URL, DOM selector, internal API, request payload, response payload hoặc field mapping khi chưa có bằng chứng khảo sát AMIS thực tế.

Mục tiêu cụ thể:

- Xác định các màn AMIS cần khảo sát cho MVP và các giai đoạn sau.
- Xác định thông tin cần thu thập trên từng màn: URL pattern, action, nút, field, API, DOM selector và page state.
- Xác định thứ tự ưu tiên nguồn dữ liệu: AMIS internal API / page state / DOM / manual confirmation.
- Xác định yêu cầu tìm nguồn `amisRecruitmentId`.
- Xác định cách khảo sát detect create/edit/detail/publish/close.
- Chuẩn bị input cho file `05_amis_job_snapshot_mapping.md`.

## 2. Nguyên tắc khảo sát AMIS

Nguyên tắc bắt buộc:

- Không tự giả định cấu trúc AMIS.
- Không phụ thuộc DOM selector nếu chưa khảo sát.
- Không phụ thuộc AMIS internal API nếu chưa xác minh hợp lệ.
- Không tự bịa URL, API endpoint, request payload, response payload hoặc field mapping.
- Mọi field lấy được phải hiển thị preview cho HR xác nhận.
- Nếu field bắt buộc thiếu, extension không được auto sync/publish.
- Nếu dữ liệu không đủ tin cậy, extension phải cảnh báo HR và chờ xác nhận hoặc block sync tùy rule được confirm.

Ưu tiên nguồn dữ liệu, nếu được phép:

1. AMIS API response/request nếu hợp lệ, được phép sử dụng và ổn định.
2. Page state / embedded data nếu có và ổn định.
3. DOM/input selector nếu không có nguồn tốt hơn.
4. Manual HR confirmation nếu field không chắc chắn.

`CẦN CONFIRM: Có được phép phụ thuộc AMIS internal API không?`

## 3. AMIS screens cần khảo sát

| AMIS Screen | Mục đích | MVP required? | Trạng thái khảo sát |
| --- | --- | ---: | --- |
| Recruitment list | Xem danh sách tin, có thể hiển thị sync status/badge nếu sau này cần | Optional / `CẦN CONFIRM` | `CẦN KHẢO SÁT AMIS` |
| Recruitment create | HR tạo tin tuyển dụng | Required | `CẦN KHẢO SÁT AMIS` |
| Recruitment edit | HR chỉnh sửa tin tuyển dụng | Required nếu support update | `CẦN CONFIRM UPDATE FLOW` |
| Recruitment detail | HR xem chi tiết tin, có thể sync lại/status | Required nếu extension sync từ detail | `CẦN CONFIRM` |
| Recruitment publish action | HR bấm đăng tin | Required | `CẦN KHẢO SÁT AMIS` |
| Recruitment close action | HR đóng tin | Optional / later | `CẦN CONFIRM CLOSE FLOW` |

Không tự điền URL cụ thể. AMIS URL cho từng màn: `CẦN KHẢO SÁT AMIS URL`.

## 4. Survey template cho từng màn AMIS

Template này dùng để thu thập dữ liệu khảo sát thực tế trước khi viết capture logic hoặc mapping.

### 4.1. Screen: Recruitment list

| Hạng mục | Thông tin cần cung cấp |
| --- | --- |
| Screen name | `CẦN KHẢO SÁT AMIS` |
| AMIS URL pattern | `CẦN KHẢO SÁT AMIS` |
| Screenshot | `CẦN KHẢO SÁT AMIS` |
| HR action trên màn | `CẦN KHẢO SÁT AMIS` |
| Các tab/section | `CẦN KHẢO SÁT AMIS` |
| Các nút chính | `CẦN KHẢO SÁT AMIS` |
| Field hiển thị | `CẦN KHẢO SÁT AMIS` |
| Field bắt buộc trên AMIS | `CẦN KHẢO SÁT AMIS` |
| Network API liên quan | `CẦN KHẢO SÁT AMIS` |
| Có recruitment/job id không | `CẦN KHẢO SÁT AMIS` |
| Có thể detect bằng URL không | `CẦN KHẢO SÁT AMIS` |
| Có thể detect bằng DOM marker không | `CẦN KHẢO SÁT AMIS` |

### 4.2. Screen: Recruitment create

| Hạng mục | Thông tin cần cung cấp |
| --- | --- |
| Screen name | `CẦN KHẢO SÁT AMIS` |
| AMIS URL pattern | `CẦN KHẢO SÁT AMIS` |
| Screenshot | `CẦN KHẢO SÁT AMIS` |
| HR action trên màn | `CẦN KHẢO SÁT AMIS` |
| Các tab/section | `CẦN KHẢO SÁT AMIS` |
| Các nút chính | `CẦN KHẢO SÁT AMIS` |
| Field hiển thị | `CẦN KHẢO SÁT AMIS` |
| Field bắt buộc trên AMIS | `CẦN KHẢO SÁT AMIS` |
| Network API liên quan | `CẦN KHẢO SÁT AMIS` |
| Có recruitment/job id không | `CẦN KHẢO SÁT AMIS` |
| Có thể detect bằng URL không | `CẦN KHẢO SÁT AMIS` |
| Có thể detect bằng DOM marker không | `CẦN KHẢO SÁT AMIS` |

### 4.3. Screen: Recruitment edit

| Hạng mục | Thông tin cần cung cấp |
| --- | --- |
| Screen name | `CẦN KHẢO SÁT AMIS` |
| AMIS URL pattern | `CẦN KHẢO SÁT AMIS` |
| Screenshot | `CẦN KHẢO SÁT AMIS` |
| HR action trên màn | `CẦN KHẢO SÁT AMIS` |
| Các tab/section | `CẦN KHẢO SÁT AMIS` |
| Các nút chính | `CẦN KHẢO SÁT AMIS` |
| Field hiển thị | `CẦN KHẢO SÁT AMIS` |
| Field bắt buộc trên AMIS | `CẦN KHẢO SÁT AMIS` |
| Network API liên quan | `CẦN KHẢO SÁT AMIS` |
| Có recruitment/job id không | `CẦN KHẢO SÁT AMIS` |
| Có thể detect bằng URL không | `CẦN KHẢO SÁT AMIS` |
| Có thể detect bằng DOM marker không | `CẦN KHẢO SÁT AMIS` |

### 4.4. Screen: Recruitment detail

| Hạng mục | Thông tin cần cung cấp |
| --- | --- |
| Screen name | `CẦN KHẢO SÁT AMIS` |
| AMIS URL pattern | `CẦN KHẢO SÁT AMIS` |
| Screenshot | `CẦN KHẢO SÁT AMIS` |
| HR action trên màn | `CẦN KHẢO SÁT AMIS` |
| Các tab/section | `CẦN KHẢO SÁT AMIS` |
| Các nút chính | `CẦN KHẢO SÁT AMIS` |
| Field hiển thị | `CẦN KHẢO SÁT AMIS` |
| Field bắt buộc trên AMIS | `CẦN KHẢO SÁT AMIS` |
| Network API liên quan | `CẦN KHẢO SÁT AMIS` |
| Có recruitment/job id không | `CẦN KHẢO SÁT AMIS` |
| Có thể detect bằng URL không | `CẦN KHẢO SÁT AMIS` |
| Có thể detect bằng DOM marker không | `CẦN KHẢO SÁT AMIS` |

### 4.5. Screen/action: Recruitment publish action

| Hạng mục | Thông tin cần cung cấp |
| --- | --- |
| Screen name | `CẦN KHẢO SÁT AMIS` |
| AMIS URL pattern | `CẦN KHẢO SÁT AMIS` |
| Screenshot | `CẦN KHẢO SÁT AMIS` |
| HR action trên màn | `CẦN KHẢO SÁT AMIS` |
| Các tab/section | `CẦN KHẢO SÁT AMIS` |
| Các nút chính | `CẦN KHẢO SÁT AMIS` |
| Field hiển thị | `CẦN KHẢO SÁT AMIS` |
| Field bắt buộc trên AMIS | `CẦN KHẢO SÁT AMIS` |
| Network API liên quan | `CẦN KHẢO SÁT AMIS` |
| Có recruitment/job id không | `CẦN KHẢO SÁT AMIS` |
| Có thể detect bằng URL không | `CẦN KHẢO SÁT AMIS` |
| Có thể detect bằng DOM marker không | `CẦN KHẢO SÁT AMIS` |

### 4.6. Screen/action: Recruitment close action

| Hạng mục | Thông tin cần cung cấp |
| --- | --- |
| Screen name | `CẦN KHẢO SÁT AMIS` |
| AMIS URL pattern | `CẦN KHẢO SÁT AMIS` |
| Screenshot | `CẦN KHẢO SÁT AMIS` |
| HR action trên màn | `CẦN KHẢO SÁT AMIS` |
| Các tab/section | `CẦN KHẢO SÁT AMIS` |
| Các nút chính | `CẦN KHẢO SÁT AMIS` |
| Field hiển thị | `CẦN KHẢO SÁT AMIS` |
| Field bắt buộc trên AMIS | `CẦN KHẢO SÁT AMIS` |
| Network API liên quan | `CẦN KHẢO SÁT AMIS` |
| Có recruitment/job id không | `CẦN KHẢO SÁT AMIS` |
| Có thể detect bằng URL không | `CẦN KHẢO SÁT AMIS` |
| Có thể detect bằng DOM marker không | `CẦN KHẢO SÁT AMIS` |

## 5. Capture source priority

### 5.1. AMIS internal API capture

Yêu cầu khảo sát:

- Cần khảo sát bằng DevTools Network.
- Cần xác định API create/update/detail/publish/close.
- Cần xem request/response có đủ JD snapshot không.
- Cần xác định `amisRecruitmentId` nằm ở đâu.
- Cần xác định API có ổn định và được phép sử dụng làm nguồn capture không.
- Cần xác định dữ liệu có bị phân trang, lazy-load, multi-step hoặc phụ thuộc quyền HR không.
- Không chốt dùng API nếu chưa confirm.

`CẦN CONFIRM: Có được phép phụ thuộc AMIS internal API không?`

### 5.2. Page state capture

Yêu cầu khảo sát:

- Kiểm tra AMIS có render dữ liệu vào global state, script tag, local storage, session storage hoặc frontend store không.
- Xác định page state có đủ `amisRecruitmentId`, title, description, requirements và các field cần preview không.
- Xác định page state có thay đổi theo create/edit/detail/publish flow không.
- Xác định page state có ổn định giữa reload, tab change hoặc lazy-load không.

`CẦN KHẢO SÁT AMIS PAGE STATE`

### 5.3. DOM capture

Yêu cầu khảo sát:

- Chỉ dùng nếu API/page state không khả dụng hoặc không được phép.
- Cần selector cho từng field.
- Cần xử lý input, textarea, rich text editor, dropdown, autocomplete, modal, tab lazy-load và field ẩn theo quyền.
- Cần xác định field nào đang hiển thị nhưng chưa load thật.
- Cần xác định cách đọc rich text editor an toàn, không lấy markup thừa nếu không cần.
- DOM selector có rủi ro hỏng khi AMIS đổi UI.

`CẦN KHẢO SÁT AMIS DOM SELECTOR`

### 5.4. Manual HR confirmation

Manual confirmation là fallback khi extension không thể chắc chắn dữ liệu capture.

- Extension phải hiển thị preview cho HR xác nhận trước khi gọi BE.
- Field không chắc chắn phải được đánh dấu trong preview.
- Nếu field bắt buộc thiếu, extension không được auto sync/publish.
- Việc cho HR nhập tay field thiếu trong extension là `CẦN CONFIRM`.

## 6. AMIS action detection requirement

| Action | Mục đích | MVP? | Cần khảo sát |
| --- | --- | ---: | --- |
| Page opened | Detect HR đang ở màn tuyển dụng | Yes | URL/DOM marker |
| Create/edit data changed | Biết có dữ liệu để extract | Yes | DOM/API/page state |
| Publish clicked | Trigger preview/sync flow | `CẦN CONFIRM TRIGGER` | Button/API |
| Manual extension sync clicked | Cho HR chủ động sync | `CẦN CONFIRM` | Extension UI |
| Update clicked | Sync snapshot mới | Optional / `CẦN CONFIRM` | Button/API |
| Close clicked | Đóng tin/channel | Optional / later | Button/API |

Không tự chốt trigger chính là nút AMIS hay nút extension. Trigger strategy chính thức: `CẦN CONFIRM TRIGGER`.

## 7. Required AMIS data for Job Snapshot

| Data group | Field dự kiến | Required for BE? | AMIS source |
| --- | --- | ---: | --- |
| Identity | `amisRecruitmentId`, `amisUrl` | Yes | `CẦN KHẢO SÁT AMIS` |
| Basic info | title, position, department, level, quantity | `CẦN CONFIRM` | `CẦN KHẢO SÁT AMIS` |
| Job content | description, requirements, benefits | Yes / `CẦN CONFIRM` | `CẦN KHẢO SÁT AMIS` |
| Work info | location, workingMode, salaryRange, deadline | `CẦN CONFIRM` | `CẦN KHẢO SÁT AMIS` |
| Contact | contactInfo, email, phone | Optional / `CẦN CONFIRM` | `CẦN KHẢO SÁT AMIS` |
| Questions | application questions / pre-screening questions | Later / `CẦN CONFIRM` | `CẦN KHẢO SÁT AMIS` |

Không chốt mapping cuối cùng trong file này. Mapping chi tiết sẽ nằm ở `05_amis_job_snapshot_mapping.md`.

## 8. `amisRecruitmentId` discovery requirement

`amisRecruitmentId` là bắt buộc để BE idempotency hoạt động theo `sourceSystem=AMIS + amisRecruitmentId + snapshotHash`.

Các nơi cần khảo sát để lấy `amisRecruitmentId`:

- URL path/query.
- API response create/detail/publish.
- DOM hidden field.
- Page state.
- Data attribute.
- AMIS object id trong request payload.

Yêu cầu:

- Cần user cung cấp bằng chứng từ khảo sát AMIS cho nguồn lấy ID.
- Nếu có nhiều loại ID, cần xác định ID nào ổn định cho cùng một tin tuyển dụng.
- Nếu ID thay đổi giữa draft/publish/detail, cần ghi rõ behavior. `CẦN KHẢO SÁT AMIS`
- Nếu không lấy được `amisRecruitmentId`, extension không nên sync/publish.

## 9. AMIS Network API survey checklist

| Flow | Method | URL | Request payload | Response payload | Có ID? | Có full JD? | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create recruitment | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` |  |
| Update recruitment | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` |  |
| Get detail | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` |  |
| Publish | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` |  |
| Close | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` | `CẦN KHẢO SÁT` |  |

Survey notes cần bổ sung khi có dữ liệu:

- API có cần auth/cookie AMIS không.
- API có rate limit hoặc CSRF token không.
- API có trả field nhạy cảm không.
- API có được phép dùng từ extension không. `CẦN CONFIRM`
- API có ổn định giữa môi trường AMIS không. `CẦN KHẢO SÁT AMIS`

## 10. DOM selector survey checklist

| Field | Selector | Element type | Required? | Extraction note | Status |
| --- | --- | --- | ---: | --- | --- |
| Title | `CẦN KHẢO SÁT` | input/text | Yes |  | `CẦN KHẢO SÁT` |
| Description | `CẦN KHẢO SÁT` | rich text/editor | Yes |  | `CẦN KHẢO SÁT` |
| Requirements | `CẦN KHẢO SÁT` | rich text/editor | Yes |  | `CẦN KHẢO SÁT` |
| Benefits | `CẦN KHẢO SÁT` | rich text/editor | Optional |  | `CẦN KHẢO SÁT` |
| Position | `CẦN KHẢO SÁT` | dropdown/text | `CẦN CONFIRM` |  | `CẦN KHẢO SÁT` |
| Department | `CẦN KHẢO SÁT` | dropdown/text | `CẦN CONFIRM` |  | `CẦN KHẢO SÁT` |
| Level | `CẦN KHẢO SÁT` | dropdown/text | `CẦN CONFIRM` |  | `CẦN KHẢO SÁT` |
| Quantity | `CẦN KHẢO SÁT` | input/number | `CẦN CONFIRM` |  | `CẦN KHẢO SÁT` |
| Location | `CẦN KHẢO SÁT` | dropdown/text | `CẦN CONFIRM` |  | `CẦN KHẢO SÁT` |
| Working mode | `CẦN KHẢO SÁT` | dropdown/text | `CẦN CONFIRM` |  | `CẦN KHẢO SÁT` |
| Salary range | `CẦN KHẢO SÁT` | input/range/text | `CẦN CONFIRM` |  | `CẦN KHẢO SÁT` |
| Deadline | `CẦN KHẢO SÁT` | date picker | `CẦN CONFIRM` |  | `CẦN KHẢO SÁT` |
| Publish button | `CẦN KHẢO SÁT` | button | `CẦN CONFIRM TRIGGER` |  | `CẦN KHẢO SÁT` |
| Close button | `CẦN KHẢO SÁT` | button | Optional / later |  | `CẦN KHẢO SÁT` |

Không tự điền selector trong file này.

## 11. Reliability and risk assessment

Rủi ro:

- AMIS đổi UI làm hỏng DOM capture.
- AMIS đổi API làm hỏng API capture.
- Rich text editor khó extract chuẩn.
- Dropdown/autocomplete/lazy tab chưa load làm thiếu field.
- Field bị ẩn theo quyền/tài khoản.
- Multi-step publish làm trigger sai.
- Draft/create flow có thể chưa có `amisRecruitmentId`.
- Detail/edit/publish có thể dùng các ID khác nhau. `CẦN KHẢO SÁT AMIS`
- Duplicate sync nếu HR bấm nhiều lần, dù BE đã có idempotency.
- Capture nhầm dữ liệu từ tab/modal không active.
- Log client vô tình chứa nội dung JD nhạy cảm nếu không kiểm soát.

Mitigation:

- HR preview/confirm bắt buộc.
- Missing field warning.
- Snapshot hash/idempotency ở BE.
- Versioned capture adapter theo AMIS screen version nếu cần.
- Log lỗi an toàn, không log full JD payload.
- Không lưu full snapshot lâu dài nếu không cần.
- Không gọi BE khi không có `amisRecruitmentId`.
- Không tự publish nếu detection hoặc extraction chưa đáng tin cậy.

## 12. Output của khảo sát AMIS

Sau khi khảo sát AMIS, cần có các output:

- Danh sách AMIS URL pattern.
- Danh sách màn hỗ trợ MVP.
- Nguồn lấy `amisRecruitmentId`.
- Nguồn lấy từng field.
- Network API mẫu nếu có.
- DOM selector mẫu nếu cần.
- Page state source nếu có.
- Trigger strategy được confirm.
- Danh sách field có thể capture.
- Danh sách field không thể capture hoặc chỉ capture không đáng tin cậy.
- Danh sách field cần HR nhập tay hoặc xác nhận thủ công nếu được chốt.
- Danh sách quyết định cần cập nhật sang file mapping/API/UI.

## 13. Relationship với file tiếp theo

File này chỉ định nghĩa capture requirement và survey template.

File `05_amis_job_snapshot_mapping.md` sẽ dùng output khảo sát để map AMIS field sang BE snapshot.

Nếu chưa có dữ liệu khảo sát, file `05_amis_job_snapshot_mapping.md` chỉ được tạo với placeholder và các marker `CẦN KHẢO SÁT AMIS` / `CẦN CONFIRM`; không được tự bịa field mapping.

## 14. Open Questions / Cần confirm

1. AMIS domain chính xác là gì? `CẦN KHẢO SÁT AMIS`
2. AMIS recruitment URL pattern là gì? `CẦN KHẢO SÁT AMIS`
3. Màn nào thuộc MVP bắt buộc? `CẦN CONFIRM`
4. HR trigger bằng nút AMIS, nút extension hay cả hai? `CẦN CONFIRM TRIGGER`
5. Có được dùng AMIS internal API làm nguồn capture không? `CẦN CONFIRM`
6. `amisRecruitmentId` lấy từ đâu? `CẦN KHẢO SÁT AMIS`
7. Field nào bắt buộc cho BE? `CẦN CONFIRM`
8. Có cần support update trong MVP không? `CẦN CONFIRM UPDATE FLOW`
9. Có cần support close trong MVP không? `CẦN CONFIRM CLOSE FLOW`
10. Có cần badge/status trên list/detail AMIS không? `CẦN CONFIRM`
11. Có cần lưu last sync result trong extension không? `CẦN CONFIRM`
12. Khi không đọc được field, extension block sync hay cho HR nhập tay? `CẦN CONFIRM`
13. Có field nào trên AMIS chứa PII cần loại khỏi preview/log không? `CẦN KHẢO SÁT AMIS`
14. Có nhiều môi trường AMIS/domain theo tenant không? `CẦN CONFIRM`
15. Có policy nội bộ nào cấm extension đọc DOM/API AMIS không? `CẦN CONFIRM`
