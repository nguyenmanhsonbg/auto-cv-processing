# 01. Extension Context and Scope

## 1. Mục tiêu tài liệu

Tài liệu này mô tả bối cảnh, phạm vi và nguyên tắc thiết kế ban đầu cho Browser Extension kết nối AMIS với BE CV / Recruitment Core.

Mục tiêu của extension trong MVP là hỗ trợ HR đang thao tác trên AMIS có thể capture dữ liệu tin tuyển dụng / JD từ AMIS, xem preview, xác nhận, sau đó trigger BE CV đồng bộ Job Description, Job Posting và trạng thái publish theo channel.

Tài liệu này không chốt chi tiết kỹ thuật phụ thuộc vào AMIS UI, AMIS URL, DOM selector, internal API, field mapping hoặc flow thao tác HR khi chưa có khảo sát thực tế. Các phần đó được đánh dấu rõ là `CẦN KHẢO SÁT AMIS` hoặc `CẦN CONFIRM`.

## 2. Bối cảnh kiến trúc

AMIS là nền tảng HR thao tác chính. HR tiếp tục tạo, chỉnh sửa và quản lý tin tuyển dụng trên AMIS theo quy trình hiện hành.

Browser Extension là lớp hỗ trợ nằm trên trình duyệt của HR. Extension không thay thế AMIS, không ghi DB trực tiếp và không xử lý nghiệp vụ nặng. Extension chỉ capture dữ liệu từ ngữ cảnh AMIS, hiển thị preview để HR xác nhận, rồi gọi BE CV / Recruitment Core.

BE CV / Recruitment Core là backend source of truth cho dữ liệu tuyển dụng nội bộ của hệ thống CV. Backend chịu trách nhiệm lưu dữ liệu, audit, idempotency, versioning JD, JobPosting và điều phối publish theo channel.

Các recruitment channels như VCS Portal, Facebook, TopCV, ITviec, VietnamWorks và LinkedIn là nơi tin tuyển dụng có thể được publish hoặc cần HR thao tác thủ công. Trong MVP, VCS Portal đã có khả năng publish qua backend; các channel chưa verify không làm fail request và được tracking bằng trạng thái `NOT_CONFIGURED`.

Luồng tổng quan:

```text
AMIS -> Browser Extension -> BE CV / Recruitment Core -> Recruitment Channels
```

## 3. Vai trò các thành phần

| Thành phần | Vai trò | Ghi chú |
| --- | --- | --- |
| AMIS | Nơi HR thao tác chính với tin tuyển dụng / JD. | `CẦN KHẢO SÁT AMIS`: chưa chốt URL, màn hình, field, selector, API nội bộ hoặc flow thao tác cụ thể. |
| Browser Extension | Capture dữ liệu AMIS, hiển thị preview, nhận xác nhận từ HR và gọi BE CV. | Không xử lý nghiệp vụ nặng, không ghi DB trực tiếp, không tự publish trực tiếp ra external channel trong MVP. |
| BE CV / Recruitment Core | Source of truth cho JD, JD Version, JobPosting, ChannelPosting, audit và idempotency. | Đã có API foundation nhận AMIS Job Snapshot và điều phối trạng thái publish theo channel. |
| VCS Portal | Channel public job nội bộ có thể publish qua backend. | Backend trả public URL khi publish `VCS_PORTAL`. |
| External channels | Facebook, TopCV, ITviec, VietnamWorks, LinkedIn hoặc channel khác. | MVP chưa verify API publish; backend tạo `ChannelPosting` với `NOT_CONFIGURED` và không fail toàn bộ request. |
| HR | Người thao tác trên AMIS, xem preview trên extension và xác nhận sync/publish. | `CẦN CONFIRM`: quyền, flow xác nhận, default channel và cách xử lý lỗi cần chốt thêm. |

## 4. Scope MVP

MVP của Browser Extension bao gồm:

1. HR thao tác với tin tuyển dụng trên AMIS.
2. Extension phát hiện hoặc được HR kích hoạt từ ngữ cảnh AMIS hiện tại.
3. Extension lấy AMIS Job Snapshot ở mức dữ liệu cần thiết để backend tạo hoặc cập nhật JD / JobPosting.
4. Extension hiển thị preview để HR kiểm tra trước khi gửi.
5. HR chọn action phù hợp: `PUBLISH`, `UPDATE` hoặc `CLOSE`.
6. HR chọn một hoặc nhiều recruitment channels.
7. Extension gọi BE CV / Recruitment Core bằng JWT hợp lệ.
8. Backend sync JobDescription, JobDescriptionVersion và JobPosting.
9. Backend xử lý idempotency theo `sourceSystem=AMIS + amisRecruitmentId + snapshotHash`.
10. Backend publish `VCS_PORTAL` theo khả năng hiện có và trả public URL.
11. Backend tạo `ChannelPosting` cho các channel được chọn.
12. Các channel chưa verify như `FACEBOOK`, `TOPCV`, `ITVIEC`, `VIETNAMWORKS`, `LINKEDIN` trả `NOT_CONFIGURED` thay vì làm fail toàn bộ request.
13. Backend ghi audit/sync log an toàn, không lưu full payload nhạy cảm trong audit metadata.

Các chi tiết sau thuộc phạm vi MVP nhưng chưa được chốt ở tài liệu này:

| Nội dung | Trạng thái |
| --- | --- |
| AMIS screen / URL nơi extension hoạt động | `CẦN KHẢO SÁT AMIS` |
| Cách lấy `amisRecruitmentId` | `CẦN KHẢO SÁT AMIS` |
| AMIS field mapping sang snapshot backend | `CẦN KHẢO SÁT AMIS` |
| Trigger extension: popup, side panel, content script button hoặc context action | `CẦN CONFIRM` |
| Default selected channels trong MVP | `CẦN CONFIRM` |
| UX preview và copy lỗi cho HR | `CẦN CONFIRM` |

## 5. Non-scope

Browser Extension không làm các việc sau trong MVP:

- Không tự đăng trực tiếp lên Facebook, TopCV, ITviec, VietnamWorks hoặc LinkedIn.
- Không tự gọi API publish của external channel khi chưa có xác minh chính sách và credential.
- Không xử lý CV.
- Không mapping CV-JD.
- Không xử lý Form, AI Screening hoặc HR Review.
- Không ghi DB, object storage hoặc MinIO trực tiếp.
- Không thay thế AMIS.
- Không thay thế BE CV / Recruitment Core.
- Không tự quyết định business workflow thay backend.
- Không automation trái policy của AMIS hoặc recruitment channel.
- Không thao tác sâu vào interview/evaluation flow cũ.
- Không sửa hoặc phụ thuộc vào legacy modules như `sessions`, `evaluations`, `export`, `submissions`.

## 6. Luồng tổng quan

Text flow MVP:

```text
1. HR mở màn hình tin tuyển dụng trên AMIS.
2. HR kích hoạt extension hoặc extension hiển thị entry point phù hợp.
3. Extension capture AMIS Job Snapshot từ ngữ cảnh hiện tại.
4. Extension hiển thị preview để HR kiểm tra title, description, requirements, benefits và channel.
5. HR xác nhận action và selected channels.
6. Extension gọi:
   POST /api/extension/amis/job-postings/sync-and-publish
7. BE CV validate JWT, role HR/Admin, payload và idempotency.
8. BE CV tạo hoặc cập nhật:
   AMIS Job Snapshot -> JobDescription -> JobDescriptionVersion -> JobPosting -> ChannelPosting
9. BE CV publish VCS Portal nếu channel được chọn và trạng thái hợp lệ.
10. BE CV tạo trạng thái `NOT_CONFIGURED` cho channel ngoài chưa verify.
11. BE CV trả kết quả cho extension.
12. Extension hiển thị kết quả sync/publish cho HR.
```

Các bước liên quan đến cách extension nhận diện màn hình AMIS, lấy dữ liệu AMIS và map field AMIS đều là `CẦN KHẢO SÁT AMIS`.

## 7. Nguyên tắc thiết kế extension

- HR confirmation first: extension phải hiển thị preview và yêu cầu HR xác nhận trước khi gọi backend để sync/publish.
- BE as source of truth: backend là nơi quyết định dữ liệu cuối cùng, trạng thái publish, idempotency, audit và business rule.
- Capture / preview / trigger only: extension chỉ capture dữ liệu, preview và trigger API backend; không xử lý nghiệp vụ nặng.
- Idempotency: extension phải truyền cùng `amisRecruitmentId` và snapshot nhất quán để backend có thể chống duplicate.
- Auditability: extension nên propagate `X-Request-Id`, `Idempotency-Key`, `X-Extension-Version` nếu có.
- Safe logging: extension không được log full payload chứa PII hoặc nội dung nhạy cảm ở client log; backend audit cũng không lưu full payload trong metadata.
- Least AMIS assumption: mọi chi tiết về AMIS UI, selector, field, URL, internal API và flow HR phải được khảo sát trước khi chốt.
- Backend API only: extension chỉ gọi BE CV / Recruitment Core, không ghi DB trực tiếp và không tự điều phối channel publishing.
- Graceful degradation: channel chưa verify không làm hỏng toàn bộ flow; backend trả trạng thái cần cấu hình hoặc xử lý thủ công.
- Security first: extension phải dùng cơ chế auth được backend chấp nhận và chỉ cho HR/Admin thao tác. Cơ chế đăng nhập cụ thể của extension là `CẦN CONFIRM`.

## 8. Backend foundation đã có

Backend foundation hiện có các behavior sau:

- API foundation nhận AMIS Job Snapshot từ extension.
- Endpoint chính:

```text
POST /api/extension/amis/job-postings/sync-and-publish
```

- API cần JWT và chỉ role `ADMIN` hoặc `HR` được gọi.
- Backend nhận và propagate metadata như `X-Request-Id`, `Idempotency-Key`, `X-Extension-Version` nếu extension gửi.
- Backend hỗ trợ idempotency theo `sourceSystem=AMIS + amisRecruitmentId + snapshotHash`.
- Nếu gửi lại cùng AMIS recruitment id và snapshot hash, backend trả `resultCode: DUPLICATE_OR_IDEMPOTENT_REPLAY` và không duplicate JobDescription, JobDescriptionVersion hoặc JobPosting.
- Nếu snapshot thay đổi, backend update JobDescription và tạo một JobDescriptionVersion active mới.
- Backend lưu AMIS external reference trên JobPosting, gồm source system, external recruitment id, external URL, snapshot hash và thời điểm sync gần nhất.
- Backend map AMIS Job Snapshot sang JobDescription, JobDescriptionVersion, JobPosting và ChannelPosting.
- `VCS_PORTAL` được publish theo public job endpoint hiện có và trả public URL.
- Các channel chưa verify như `FACEBOOK`, `TOPCV`, `ITVIEC`, `VIETNAMWORKS`, `LINKEDIN` tạo `ChannelPosting` với `NOT_CONFIGURED` và không làm fail request.
- Backend ghi audit/sync log cho requested, succeeded và failed events.
- Backend không lưu full request payload chứa nội dung nhạy cảm trong audit metadata.

## 9. Các file specification tiếp theo

Các file specification dự kiến cần tạo sau tài liệu này:

- `02_extension_architecture.md`
- `03_extension_user_flow_hr_posting.md`
- `04_amis_screen_and_capture_requirement.md`
- `05_amis_job_snapshot_mapping.md`
- `06_extension_backend_api_contract.md`
- `07_extension_ui_specification.md`
- `08_extension_auth_security_audit.md`
- `09_extension_state_and_error_handling.md`
- `10_extension_implementation_task_breakdown.md`

Ghi chú:

- `04_amis_screen_and_capture_requirement.md` phải dựa trên khảo sát AMIS thực tế.
- `05_amis_job_snapshot_mapping.md` không được chốt field mapping nếu chưa có dữ liệu AMIS thực tế.
- `07_extension_ui_specification.md` cần confirm extension dùng popup, side panel hay UI pattern khác.
- `08_extension_auth_security_audit.md` cần confirm cơ chế extension lấy và refresh JWT.

## 10. Open Questions / Cần confirm

Các câu hỏi cần confirm trước khi tạo các file specification tiếp theo:

1. AMIS URL hoặc domain môi trường mà HR đang dùng là gì? `CẦN KHẢO SÁT AMIS`
2. Màn hình AMIS cụ thể nơi HR tạo/chỉnh sửa/đăng tin tuyển dụng là màn hình nào? `CẦN KHẢO SÁT AMIS`
3. HR thao tác đăng tin trên AMIS theo flow nào? `CẦN KHẢO SÁT AMIS`
4. AMIS có internal API nào được gọi khi HR lưu, cập nhật hoặc đăng tin tuyển dụng không? `CẦN KHẢO SÁT AMIS`
5. Có được phép dựa vào AMIS internal API không, hay extension chỉ được đọc DOM/UI? `CẦN CONFIRM`
6. `amisRecruitmentId` lấy từ URL, DOM, API response, data attribute hay nguồn khác? `CẦN KHẢO SÁT AMIS`
7. Field nào trên AMIS tương ứng với `snapshot.title`? `CẦN KHẢO SÁT AMIS`
8. Field nào trên AMIS tương ứng với `snapshot.description`? `CẦN KHẢO SÁT AMIS`
9. Field nào trên AMIS tương ứng với `snapshot.requirements`? `CẦN KHẢO SÁT AMIS`
10. Field nào trên AMIS tương ứng với `snapshot.benefits`? `CẦN KHẢO SÁT AMIS`
11. AMIS có dữ liệu channel publish sẵn trên màn hình không, hay extension tự cho HR chọn channel? `CẦN KHẢO SÁT AMIS`
12. Extension nên dùng popup, side panel, injected panel hay button trong AMIS page? `CẦN CONFIRM`
13. Extension login bằng JWT BE qua UI riêng, reuse token từ web app, hay cơ chế khác? `CẦN CONFIRM`
14. JWT refresh / expiry trong extension xử lý như thế nào? `CẦN CONFIRM`
15. Channel nào được chọn mặc định trong MVP? `CẦN CONFIRM`
16. Khi backend trả `NOT_CONFIGURED`, extension nên hiển thị copy và action nào cho HR? `CẦN CONFIRM`
17. Có cần extension lưu local draft/last preview trên browser không? `CẦN CONFIRM`
18. Có yêu cầu audit client-side event riêng ngoài backend audit không? `CẦN CONFIRM`
19. Có policy bảo mật nội bộ nào cho extension khi đọc nội dung JD trên AMIS không? `CẦN CONFIRM`
20. Có cần support nhiều tenant / nhiều môi trường AMIS không? `CẦN CONFIRM`
