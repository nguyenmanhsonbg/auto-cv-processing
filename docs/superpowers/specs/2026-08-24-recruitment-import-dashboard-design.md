# Recruitment Import and Dashboard Data Design

## Goal

Cho phép HR import dữ liệu tuyển dụng lịch sử từ một workbook `.xlsx` chuẩn và
hiển thị các biểu đồ Pipeline bằng dữ liệu thật từ database.

## Scope

Phase này bao gồm:

- Workbook import cho `candidates`, `applications`, `interview_rounds`, `offers`.
- Validate toàn bộ workbook trước khi ghi dữ liệu.
- Ghi dữ liệu trong một transaction và có thể chạy lại theo các khóa bên ngoài.
- API dashboard trả các aggregate có thể suy ra từ schema hiện tại.
- Frontend adapter nối các aggregate vào các chart Pipeline.

Growth và Quota không nằm trong phase này vì database hiện chưa có nguồn chuẩn
cho headcount, target định biên, nghỉ việc, ngân sách lương và probation.

## Workbook contract

Workbook phải có đúng bốn sheet, tên không phân biệt hoa thường:

### `candidates`

| Column | Required | Meaning |
|---|---:|---|
| `candidate_key` | yes | Khóa ổn định trong workbook |
| `name` | yes | Họ tên |
| `email` | no | Email; dùng để match candidate đã có |
| `phone` | no | Điện thoại; dùng để match candidate đã có |
| `birth_year` | no | Năm sinh |
| `position` | no | Vị trí |
| `level` | no | Giá trị thuộc `CandidateLevel` |

### `applications`

| Column | Required | Meaning |
|---|---:|---|
| `application_key` | yes | Khóa ổn định trong workbook |
| `candidate_key` | yes | Tham chiếu `candidates.candidate_key` |
| `job_posting_id` | yes | UUID của job posting đã tồn tại |
| `external_application_id` | no | Mã từ ATS/nguồn ngoài |
| `source_channel` | no | Giá trị thuộc `RecruitmentChannel`, mặc định `MANUAL` |
| `current_stage` | no | Giá trị thuộc `ApplicationStage`, mặc định `APPLIED` |
| `assigned_recruiter_id` | no | UUID user phụ trách |
| `offer_status` | no | Giá trị thuộc `OfferStatus` |
| `hired_at` | no | ISO date-time; bắt buộc nếu stage là `HIRED` |
| `created_at` | no | ISO date-time lịch sử |

### `interview_rounds`

| Column | Required | Meaning |
|---|---:|---|
| `application_key` | yes | Tham chiếu `applications.application_key` |
| `round_type` | yes | `INTERVIEW_1` hoặc `INTERVIEW_2` |
| `external_round_id` | no | Mã vòng từ ATS/AMIS; dùng để upsert |
| `scheduled_at` | no | ISO date-time |
| `started_at` | no | ISO date-time |
| `completed_at` | no | ISO date-time |
| `result` | no | `PASS`, `FAIL`, `NO_SHOW`, `PENDING` |
| `overall_grade` | no | `EXCELLENT`, `GOOD`, `AVERAGE`, `POOR` |
| `scores_json` | no | JSON object điểm |
| `summary` | no | Ghi chú |

### `offers`

| Column | Required | Meaning |
|---|---:|---|
| `application_key` | yes | Tham chiếu `applications.application_key` |
| `version` | no | Version offer, mặc định tăng từ version cuối |
| `external_offer_id` | no | Mã offer từ ATS; dùng để upsert |
| `status` | yes | Giá trị thuộc `OfferStatus` |
| `job_title` | yes | Job title trong offer |
| `department` | no | Đơn vị |
| `level` | no | Level trong offer |
| `gross_salary` | no | Số tiền |
| `start_date` | no | `YYYY-MM-DD` |
| `contract_type` | no | Giá trị thuộc `ContractType` |
| `work_location` | no | Địa điểm |
| `sent_at` | no | ISO date-time |
| `responded_at` | no | ISO date-time |
| `expires_at` | no | ISO date-time |
| `notes` | no | Ghi chú |

`job_posting_id`, candidate identifiers, recruiter identifiers và các enum
không được tự tạo trong quá trình import. Row lỗi phải chỉ rõ sheet, row và
column; workbook lỗi không được ghi một phần.

## Data flow

```text
XLSX upload
  -> parse four sheets
  -> validate headers, references, UUIDs, enums, dates
  -> transaction: upsert candidates -> applications -> interview rounds -> offers
  -> synchronize application stage/status from imported interview/offer state
  -> dashboard aggregate API
  -> frontend adapter -> charts
```

## Dashboard contract

Giữ nguyên các field API pipeline hiện có để không phá client cũ. Bổ sung
`monthlyTrend.interviewed`, `positions`, `recruiters`, `departments`, `sourcing`,
`quality`, `levelHired`, `sla`, `normRadar`, `offerStatus`, `tthByDepartment`,
`channels`. Các field không có nguồn dữ liệu chuẩn trả mảng rỗng, không trả số
giả.

Các aggregate sử dụng:

- Pipeline/stage: `applications.currentStage`.
- Channel: `applications.sourceChannel`.
- Level: `candidates.level` của application hired.
- Interview quality/SLA: `interview_rounds.result`, `overallGrade`,
  `scheduledAt`, `completedAt`.
- Offer: `offers.status`, `sentAt`, `respondedAt`, `department`, `level`.
- TTH: `applications.createdAt`, `hiredAt`, final interview `completedAt`,
  latest offer `sentAt`.
- Recruiter: `assignedRecruiterId` và user name.

Target/định biên không được suy diễn. `positions` và department rate chỉ xuất
giá trị actual khi không có target; UI hiển thị trạng thái thiếu target thay vì
vẽ target giả.

## Error handling and security

- Import chỉ dành cho `ADMIN` và `HR`.
- Dashboard chỉ dành cho user đã đăng nhập.
- Dùng `BadRequestException` cho workbook invalid, reference thiếu hoặc enum
  sai, theo convention của repository.
- Import upsert theo external keys nhưng không xóa record nào.

## Verification

Theo quy định repository: không tạo/sửa test file, không build/lint/launch app.
Sau mỗi code change chạy `pnpm typecheck`, đọc log hot-reload, gọi API bằng
`curl` và kiểm tra UI qua frontend đang chạy.
