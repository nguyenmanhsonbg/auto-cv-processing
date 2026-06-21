# 06. Database Migration Plan

## 1. Mục tiêu tài liệu

Tài liệu này mô tả kế hoạch migration database cho Recruitment Phase 1.

Tài liệu làm nền cho việc tạo TypeORM migration sau này. Tài liệu này không tạo migration code, không thay đổi database ngay và không sửa entity/controller/service/module hiện có.

Mục tiêu là thêm domain tuyển dụng mới quanh `Application` mà không phá dữ liệu Interview Assistant hiện tại như candidate, interview session, evaluation, export và code submission.

## 2. Migration strategy

| STT | Strategy | Nội dung |
| --- | --- | --- |
| 1 | Dùng `TypeORM migration` | Mọi thay đổi schema Phase 1 nên đi qua TypeORM migration, không dựa vào runtime auto-sync. |
| 2 | Không dùng `synchronize=true` cho môi trường nghiêm túc | Staging/production cần migration-first; `synchronize=true` chỉ phù hợp dev có kiểm soát. |
| 3 | Kiểm soát rủi ro runtime hiện tại | `AppModule` hiện đang bật `synchronize=true`; cần tắt hoặc kiểm soát trong deployment/migration spec sau. |
| 4 | Mỗi migration có `up()` và `down()` | Migration phải có rollback path ở mức schema, không chỉ forward-only. |
| 5 | Additive-first | Ưu tiên tạo bảng mới, thêm nullable column, thêm index an toàn trước; tránh rename/drop ở phase đầu. |
| 6 | Không sửa trực tiếp interview tables nếu không cần | `interview_sessions`, `session_questions`, `evaluations`, `code_submissions`, `export` phải giữ ổn định. |
| 7 | Không xóa dữ liệu cũ | Không drop/rename bảng/field cũ và không viết migration phá dữ liệu hiện có. |
| 8 | Chạy được trên DB có dữ liệu | Migration cần chạy được trên database đã có candidate/session/evaluation/submission. |
| 9 | Pre-check unique constraint mạnh | Constraint unique mới trên dữ liệu có sẵn phải được kiểm tra dữ liệu trước khi add. |
| 10 | Public token chỉ lưu hash | `form_sessions` chỉ lưu `token_hash`, không lưu plain token. |
| 11 | File CV nằm ở storage | DB chỉ lưu metadata/path/hash; file gốc/clean CV nằm ở storage tương ứng. |
| 12 | Tách migration nhỏ theo module | Nên chia migration theo nhóm job/application/CV/mapping/form/AI/audit để dễ review và rollback. |

## 3. Hiện trạng database/source cần lưu ý

| Hiện trạng | Ảnh hưởng đến migration Phase 1 | Hướng xử lý |
| --- | --- | --- |
| Backend hiện dùng `PostgreSQL` + `TypeORM`. | Phase 1 có thể tiếp tục dùng TypeORM migration và FK relational model. | Giữ `PostgreSQL` là DB chính. |
| Runtime `AppModule` đang bật `synchronize=true`. | Runtime có thể tự mutate schema và che lỗi migration thiếu. | Tắt/kiểm soát `synchronize=true` ở staging/production trước khi rollout schema Phase 1. |
| TypeORM CLI datasource `apps/backend/src/config/typeorm.config.ts` dùng `synchronize=false`. | Migration command đã có hướng migration-first. | Dùng datasource này cho migration sau khi build. |
| Docker entrypoint `migrate-and-start.sh` chạy migration trước khi start app. | Deploy có cơ chế chạy migration, nhưng còn xung đột với runtime sync. | Chuẩn hóa strategy: migration chạy trước, app không tự sync ở môi trường nghiêm túc. |
| Docker migration retry dùng `MIGRATION_MAX_ATTEMPTS` và `MIGRATION_RETRY_DELAY_SECONDS`. | Migration startup có retry, nhưng nếu schema lỗi logic thì retry không giải quyết được. | Dùng retry cho DB readiness; vẫn cần migration review/pre-check trước deploy. |
| Migration chuẩn nằm ở `apps/backend/src/migrations`. | Đây là path chính để thêm migration sau này. | Không tạo migration trong task này; khi tạo thật phải dùng đúng path. |
| Có migration scheduling lệch path ở `apps/backend/apps/backend/src/migrations`. | Nếu tắt sync, DB có thể thiếu field scheduling do migration lệch path không chạy. | Chuẩn hóa migration path trong task riêng trước hoặc cùng đợt migration nền. |
| Bảng hiện có: `users`, `candidates`, `candidate_assignees`, `interview_sessions`, `session_questions`, `session_survey_questions`, `anti_cheat_events`, `questions`, `evaluations`, `code_submissions`, `categories`, `sub_categories`, `positions`, `levels`, `ai_prompts`, `ai_model_overrides`. | Migration Phase 1 phải bảo toàn dữ liệu và semantics hiện có. | Add bảng mới và FK từ bảng mới sang bảng cũ, hạn chế alter bảng cũ. |
| Source chưa có bảng `applications`, `job_descriptions`, `job_postings`, `cv_documents`, `mapping_results`, `form_sessions`, `ai_screening_results`, `hr_reviews`, `workflow_events`, `audit_logs`. | Cần tạo domain tuyển dụng mới quanh `applications`. | Tạo bảng mới theo thứ tự FK an toàn. |
| Module `uploads` là route/storage, không có entity/table riêng. | Không có bảng `uploads` để alter. | `cv_documents` lưu metadata/path/hash mới; không coi upload storage cũ là safe CV. |

## 4. New tables

| Table | Module owner | Mục đích | Bắt buộc Phase 1? | Ghi chú |
| --- | --- | --- | --- | --- |
| `job_descriptions` | `job-descriptions` | Lưu JD gốc. | Có | Link `positions`, `levels`, `users`. |
| `job_description_versions` | `job-description-versions` | Snapshot/version JD cho posting/application/mapping. | Có | Unique theo `job_description_id + version_no`. |
| `job_postings` | `job-postings` | Tin tuyển dụng public. | Có | Có `public_slug` unique. |
| `channel_postings` | `channel-publishing` | Trạng thái publish theo kênh. | Có | Có thể `MANUAL_REQUIRED` nếu chưa tích hợp API. |
| `applications` | `applications` | Entity trung tâm workflow tuyển dụng. | Có | Link candidate, posting, JD version. |
| `application_sources` | `channel-ingestion` / `applications` | Nguồn phát sinh application. | Có | Lưu channel/external ID/raw payload. |
| `cv_documents` | `cv-documents` | Metadata/version cho CV original/clean. | Có | Tách rõ quarantine/safe bằng field. |
| `parsed_profiles` | `cv-parsing` | Kết quả parse CV sạch theo application/CV. | Có | Tách khỏi `candidates.parsedProfile` hiện có. |
| `duplicate_checks` | `validation-rate-limit` / `cv-parsing` | Lưu kết quả check trùng application/file/profile. | Có | Hỗ trợ audit duplicate. |
| `mapping_results` | `mapping-results` | Lưu kết quả mapping CV-JD. | Có | Mapping là module nội bộ. |
| `question_sets` | `question-sets` | Bộ câu hỏi pre-screening theo JD/vị trí/level. | Có | Reuse `questions`. |
| `question_set_items` | `question-sets` | Item/snapshot câu hỏi trong set. | Có | Có thể FK `questions.id`. |
| `form_sessions` | `form-sessions` | Phiên public form/token riêng. | Có | Chỉ lưu `token_hash`. |
| `form_answers` | `form-answers` | Câu trả lời pre-screening. | Có | Link form session/application/item. |
| `ai_screening_results` | `ai-screening` | Kết quả AI Screening. | Có | Reuse `ai_prompts`/model infra. |
| `hr_reviews` | `hr-review` | Quyết định HR cuối Phase 1. | Có | Phase 1 dừng tại HR Review. |
| `workflow_events` | `workflow-state` | Timeline transition của `Application.status`. | Có | Ghi mọi transition quan trọng. |
| `audit_logs` | `audit-logs` | Audit nghiệp vụ/kỹ thuật. | Có | Không phụ thuộc ngược domain module. |
| `channel_accounts` | `channel-publishing` / `channel-ingestion` | Config channel account. | Phase 1 optional / later within Phase 1 | Không lưu credential thật trong DB nếu chưa có secret strategy. |
| `channel_conversations` | `bot-conversations` | Hội thoại candidate theo kênh. | Phase 1 optional / later within Phase 1 | Có thể triển khai sau core intake. |
| `channel_messages` | `bot-conversations` | Tin nhắn trong hội thoại channel. | Phase 1 optional / later within Phase 1 | Có thể chứa PII. |
| `bot_knowledge_sources` | `bot-knowledge` | Tri thức bot từ JD/posting/FAQ. | Phase 1 optional / later within Phase 1 | Có thể seed FAQ mẫu nếu có spec. |
| `amis_sync_logs` | `amis-integration` | Log sync AMIS. | Không trong core Phase 1 | Later / extension point nếu Phase 1 dừng tại `HR Review`. |

## 5. Alter existing tables

| Existing table | Thay đổi đề xuất | Nullable? | Rủi ro | Ghi chú |
| --- | --- | --- | --- | --- |
| `users` | Không alter bắt buộc. | N/A | Thấp | Bảng mới dùng FK `created_by_id`, `reviewer_id`, `actor_id` tới `users.id` khi phù hợp. |
| `candidates` | Ưu tiên không alter DB; relation có thể nằm từ `applications.candidate_id`. | N/A | Trung bình nếu thêm unique/column mạnh | Không thêm workflow state vào `candidates`; không bắt buộc thêm column mới. |
| `questions` | Không alter nếu dùng `question_set_items.question_id` FK. | N/A | Thấp | Có thể extend bằng metadata ở spec sau, nhưng không cần cho migration đầu. |
| `positions` | Không alter; dùng FK từ `job_descriptions.position_id`, `question_sets.position_id`. | N/A | Thấp | Reuse catalog. |
| `levels` | Không alter; dùng FK từ `job_descriptions.level_id`, `question_sets.level_id`. | N/A | Thấp | Reuse catalog. |
| `categories` | Không alter. | N/A | Thấp | Reuse taxonomy. |
| `sub_categories` | Không alter. | N/A | Thấp | Reuse taxonomy. |
| `ai_prompts` | Không alter; seed thêm prompt key nếu cần. | N/A | Thấp | Không hardcode prompt trong migration. |
| `ai_model_overrides` | Không alter; có thể seed/insert override theo prompt key nếu cần. | N/A | Thấp | Giữ existing prompt override behavior. |
| `uploads` | Không có table hiện tại. | N/A | N/A | Đây là route/storage; `cv_documents` là metadata mới. |
| `interview_sessions` | Không alter trong Phase 1 intake. | N/A | Cao nếu đụng lifecycle/token | Không dùng `interview_sessions.accessToken` cho form. Link `Application` -> `Session` nếu cần là later. |
| `session_questions` | Không alter. | N/A | Cao nếu đổi semantics active/rating/submission | Pre-screening dùng `question_sets`/`form_answers`, không dùng bảng này. |
| `session_survey_questions` | Không alter. | N/A | Cao nếu reuse sai mục đích | Form Phase 1 dùng bảng riêng. |
| `evaluations` | Không alter. | N/A | Cao nếu trộn BM04 với AI Screening | `ai_screening_results` và `hr_reviews` là bảng mới. |
| `code_submissions` | Không alter. | N/A | Cao nếu đụng code runner/interview | Ngoài scope intake Phase 1. |
| `anti_cheat_events` | Không alter. | N/A | Thấp | Thuộc interview flow hiện tại. |
| `candidate_assignees` | Không alter. | N/A | Thấp | Nếu cần application assignee, tạo field/bảng riêng ở spec sau. |

## 6. Column detail proposal

### 6.1. `job_descriptions`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `title` | `varchar` | Không | N/A | index optional | Tên JD. |
| `position_id` | `uuid` | Có | `null` | FK `positions.id` | Vị trí. |
| `level_id` | `uuid` | Có | `null` | FK `levels.id` | Level. |
| `description` | `text` | Không | N/A | N/A | Mô tả công việc. |
| `requirements` | `jsonb` hoặc `text` | Không | N/A | N/A | Yêu cầu công việc. |
| `benefits` | `jsonb` hoặc `text` | Có | `null` | N/A | Phúc lợi. |
| `status` | `varchar` | Không | `DRAFT` | `JobDescriptionStatus` nếu tách enum | Trạng thái JD. |
| `created_by_id` | `uuid` | Không | N/A | FK `users.id` | Người tạo. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo. |
| `updated_at` | `timestamp` | Không | now | N/A | Thời điểm cập nhật. |

### 6.2. `job_description_versions`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `job_description_id` | `uuid` | Không | N/A | FK `job_descriptions.id` | JD gốc. |
| `version_no` | `int` | Không | N/A | unique with `job_description_id` | Số version. |
| `snapshot` | `jsonb` | Không | N/A | N/A | Snapshot JD. |
| `status` | `varchar` | Không | `ACTIVE` | enum/varchar | Trạng thái version. |
| `created_by_id` | `uuid` | Không | N/A | FK `users.id` | Người tạo version. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo. |

### 6.3. `job_postings`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `job_description_id` | `uuid` | Không | N/A | FK `job_descriptions.id` | JD gốc. |
| `job_description_version_id` | `uuid` | Không | N/A | FK `job_description_versions.id` | JD version public/mapping. |
| `title` | `varchar` | Không | N/A | N/A | Tiêu đề tin. |
| `public_slug` | `varchar` | Không | N/A | unique | Slug public. |
| `status` | `varchar` | Không | `DRAFT` | `JobPostingStatus` | Trạng thái posting. |
| `open_at` | `timestamp` | Có | `null` | N/A | Thời điểm mở nhận hồ sơ. |
| `close_at` | `timestamp` | Có | `null` | N/A | Thời điểm đóng. |
| `created_by_id` | `uuid` | Không | N/A | FK `users.id` | Người tạo. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo. |
| `updated_at` | `timestamp` | Không | now | N/A | Thời điểm cập nhật. |

### 6.4. `channel_postings`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `job_posting_id` | `uuid` | Không | N/A | FK `job_postings.id` | Posting nội bộ. |
| `channel` | `varchar` | Không | N/A | `Channel` | Kênh publish. |
| `external_posting_id` | `varchar` | Có | `null` | unique partial with `channel` nếu có | ID ngoài. |
| `status` | `varchar` | Không | `DRAFT` | `ChannelPostingStatus` | Trạng thái publish. |
| `publish_payload` | `jsonb` | Có | `null` | N/A | Payload gửi channel. |
| `published_url` | `text` | Có | `null` | N/A | URL public ngoài. |
| `last_sync_at` | `timestamp` | Có | `null` | N/A | Lần sync gần nhất. |
| `error_message` | `text` | Có | `null` | N/A | Lỗi publish/sync. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo. |
| `updated_at` | `timestamp` | Không | now | N/A | Thời điểm cập nhật. |

### 6.5. `applications`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `candidate_id` | `uuid` | Không | N/A | FK `candidates.id` | Candidate ứng tuyển. |
| `job_posting_id` | `uuid` | Không | N/A | FK `job_postings.id` | Tin tuyển dụng. |
| `job_description_version_id` | `uuid` | Không | N/A | FK `job_description_versions.id` | JD version dùng cho application/mapping. |
| `source` | `varchar` | Không | N/A | enum/varchar | Nguồn tổng quát. |
| `source_channel` | `varchar` | Có | `null` | `Channel` | Kênh cụ thể. |
| `external_application_id` | `varchar` | Có | `null` | index/unique partial nếu dùng | ID application từ channel. |
| `status` | `varchar` | Không | `APPLICATION_CREATED` | `ApplicationStatus` | Workflow status chính. |
| `current_cv_document_id` | `uuid` | Có | `null` | FK `cv_documents.id` | CV hiện hành. |
| `mapping_status` | `varchar` | Có | `null` | enum/varchar | Status phụ mapping. |
| `form_status` | `varchar` | Có | `null` | enum/varchar | Status phụ form. |
| `ai_screening_status` | `varchar` | Có | `null` | enum/varchar | Status phụ AI. |
| `hr_review_status` | `varchar` | Có | `null` | enum/varchar | Status phụ HR review. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo. |
| `updated_at` | `timestamp` | Không | now | N/A | Thời điểm cập nhật. |

Ghi chú triển khai: có thể tạo FK `applications.current_cv_document_id` sau khi bảng `cv_documents` đã tồn tại để tránh circular dependency trong migration order.

### 6.6. `application_sources`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `application_id` | `uuid` | Không | N/A | FK `applications.id` | Application liên quan. |
| `source_type` | `varchar` | Không | N/A | `ApplicationSourceType` | Loại nguồn. |
| `channel` | `varchar` | Có | `null` | `Channel` | Kênh nếu có. |
| `external_lead_id` | `varchar` | Có | `null` | index optional | Lead ID ngoài. |
| `external_application_id` | `varchar` | Có | `null` | unique partial with `channel` nếu có | Application ID ngoài. |
| `raw_payload` | `jsonb` | Có | `null` | N/A | Payload gốc từ kênh. |
| `received_at` | `timestamp` | Không | now | N/A | Thời điểm nhận. |

### 6.7. `cv_documents`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `application_id` | `uuid` | Không | N/A | FK `applications.id` | Application sở hữu CV. |
| `candidate_id` | `uuid` | Không | N/A | FK `candidates.id` | Candidate liên quan. |
| `document_type` | `varchar` | Không | N/A | `CvDocumentType` | `ORIGINAL` hoặc `CLEAN`. |
| `version_no` | `int` | Không | N/A | unique group | Version CV trong application. |
| `original_file_name` | `varchar` | Không | N/A | N/A | Tên file upload. |
| `mime_type` | `varchar` | Không | N/A | N/A | MIME type. |
| `file_size` | `bigint` hoặc `int` | Không | N/A | N/A | Kích thước file. |
| `original_file_hash` | `varchar` | Có | `null` | index | Hash file gốc. |
| `clean_file_hash` | `varchar` | Có | `null` | index | Hash file sạch. |
| `storage_zone` | `varchar` | Không | N/A | `StorageZone` | `QUARANTINE` hoặc `SAFE`. |
| `storage_path` | `text` | Không | N/A | N/A | Path/key file trong storage. |
| `scan_status` | `varchar` | Không | `PENDING` | `CvScanStatus` | Trạng thái scan. |
| `sanitize_status` | `varchar` | Không | `PENDING` | `CvSanitizeStatus` | Trạng thái sanitize. |
| `parse_status` | `varchar` | Không | `PENDING` | `CvParseStatus` | Trạng thái parse. |
| `is_current` | `boolean` | Không | `false` | partial index optional | CV hiện hành của application. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo. |

### 6.8. `parsed_profiles`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `application_id` | `uuid` | Không | N/A | FK `applications.id` | Application liên quan. |
| `cv_document_id` | `uuid` | Không | N/A | FK `cv_documents.id` | Clean CV được parse. |
| `candidate_id` | `uuid` | Không | N/A | FK `candidates.id` | Candidate liên quan. |
| `parsed_data` | `jsonb` | Không | N/A | N/A | Kết quả parse. |
| `normalized_text_hash` | `varchar` | Có | `null` | index | Hash text normalize. |
| `parser_version` | `varchar` | Có | `null` | N/A | Version parser/prompt. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm parse. |

### 6.9. `duplicate_checks`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `application_id` | `uuid` | Không | N/A | FK `applications.id` | Application được check. |
| `check_type` | `varchar` | Không | N/A | `DuplicateCheckType` | Loại check. |
| `status` | `varchar` | Không | N/A | `DuplicateCheckStatus` | Kết quả check. |
| `matched_entity_type` | `varchar` | Có | `null` | N/A | Loại entity match. |
| `matched_entity_id` | `uuid` hoặc `varchar` | Có | `null` | N/A | ID entity match. |
| `score` | `numeric` | Có | `null` | N/A | Điểm similarity. |
| `details` | `jsonb` | Có | `null` | N/A | Evidence/details. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm check. |

### 6.10. `mapping_results`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `application_id` | `uuid` | Không | N/A | FK `applications.id` | Application được mapping. |
| `job_description_version_id` | `uuid` | Không | N/A | FK `job_description_versions.id` | JD version. |
| `clean_cv_document_id` | `uuid` | Không | N/A | FK `cv_documents.id` | Clean CV input. |
| `parsed_profile_id` | `uuid` | Có | `null` | FK `parsed_profiles.id` | Parsed profile input. |
| `score` | `numeric` | Không | N/A | N/A | Điểm mapping. |
| `strengths` | `jsonb` | Có | `null` | N/A | Điểm mạnh. |
| `gaps` | `jsonb` | Có | `null` | N/A | Khoảng thiếu. |
| `recommendation` | `varchar` | Không | N/A | `MappingRecommendation` | Recommendation. |
| `status` | `varchar` | Không | N/A | `MappingStatus` | Trạng thái mapping. |
| `model_version` | `varchar` | Có | `null` | N/A | Version rule/model/prompt. |
| `evidence` | `jsonb` | Có | `null` | N/A | Evidence mapping. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo result. |

### 6.11. `question_sets`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `job_description_id` | `uuid` | Có | `null` | FK `job_descriptions.id` | JD gốc. |
| `job_description_version_id` | `uuid` | Có | `null` | FK `job_description_versions.id` | JD version. |
| `name` | `varchar` | Không | N/A | N/A | Tên bộ câu hỏi. |
| `position_id` | `uuid` | Có | `null` | FK `positions.id` | Position context. |
| `level_id` | `uuid` | Có | `null` | FK `levels.id` | Level context. |
| `status` | `varchar` | Không | `DRAFT` | `QuestionSetStatus` | Trạng thái set. |
| `created_by_id` | `uuid` | Không | N/A | FK `users.id` | Người tạo. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo. |
| `updated_at` | `timestamp` | Không | now | N/A | Thời điểm cập nhật. |

### 6.12. `question_set_items`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `question_set_id` | `uuid` | Không | N/A | FK `question_sets.id` | Bộ câu hỏi. |
| `question_id` | `uuid` | Có | `null` | FK `questions.id` | Question bank nếu reuse. |
| `question_text_snapshot` | `text` | Không | N/A | N/A | Snapshot câu hỏi. |
| `question_type` | `varchar` | Không | N/A | enum/varchar | Loại câu hỏi. |
| `order_index` | `int` | Không | `0` | index optional | Thứ tự. |
| `required` | `boolean` | Không | `true` | N/A | Có bắt buộc không. |
| `metadata` | `jsonb` | Có | `null` | N/A | Option/validation phụ. |

### 6.13. `form_sessions`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `application_id` | `uuid` | Không | N/A | FK `applications.id` | Application nhận form. |
| `question_set_id` | `uuid` | Không | N/A | FK `question_sets.id` | Bộ câu hỏi. |
| `token_hash` | `varchar` | Không | N/A | unique | Hash token public. |
| `status` | `varchar` | Không | `CREATED` | `FormSessionStatus` | Trạng thái form. |
| `expires_at` | `timestamp` | Không | N/A | index optional | Hạn form. |
| `sent_at` | `timestamp` | Có | `null` | N/A | Thời điểm gửi. |
| `opened_at` | `timestamp` | Có | `null` | N/A | Thời điểm mở. |
| `submitted_at` | `timestamp` | Có | `null` | N/A | Thời điểm submit. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo. |

### 6.14. `form_answers`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `form_session_id` | `uuid` | Không | N/A | FK `form_sessions.id` | Form session. |
| `application_id` | `uuid` | Không | N/A | FK `applications.id` | Application liên quan. |
| `question_set_item_id` | `uuid` | Không | N/A | FK `question_set_items.id` | Câu hỏi. |
| `answer` | `jsonb` hoặc `text` | Không | N/A | N/A | Câu trả lời. |
| `answered_at` | `timestamp` | Không | now | N/A | Thời điểm trả lời. |

### 6.15. `ai_screening_results`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `application_id` | `uuid` | Không | N/A | FK `applications.id` | Application được screening. |
| `mapping_result_id` | `uuid` | Không | N/A | FK `mapping_results.id` | Mapping input. |
| `form_session_id` | `uuid` | Không | N/A | FK `form_sessions.id` | Form input. |
| `final_score` | `numeric` | Có | `null` | N/A | Điểm tổng hợp. |
| `recommendation` | `varchar` | Không | N/A | enum/varchar | Recommendation AI. |
| `summary` | `text` | Có | `null` | N/A | Tóm tắt. |
| `strengths` | `jsonb` | Có | `null` | N/A | Điểm mạnh. |
| `gaps` | `jsonb` | Có | `null` | N/A | Khoảng thiếu. |
| `risks` | `jsonb` | Có | `null` | N/A | Rủi ro. |
| `status` | `varchar` | Không | N/A | `AiScreeningStatus` | Trạng thái AI Screening. |
| `model` | `varchar` | Có | `null` | N/A | Model dùng. |
| `prompt_version` | `varchar` | Có | `null` | N/A | Prompt/version. |
| `raw_result` | `jsonb` | Có | `null` | N/A | Raw AI output. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo result. |

### 6.16. `hr_reviews`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `application_id` | `uuid` | Không | N/A | FK `applications.id` | Application được review. |
| `reviewer_id` | `uuid` | Không | N/A | FK `users.id` | HR/reviewer. |
| `decision` | `varchar` | Không | N/A | `HrReviewDecisionType` | Quyết định HR. |
| `comment` | `text` | Có | `null` | N/A | Ghi chú. |
| `reason_codes` | `jsonb` | Có | `null` | N/A | Mã lý do. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm quyết định. |

### 6.17. `workflow_events`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `application_id` | `uuid` | Không | N/A | FK `applications.id` | Application liên quan. |
| `from_status` | `varchar` | Có | `null` | `ApplicationStatus` | Trạng thái trước. |
| `to_status` | `varchar` | Không | N/A | `ApplicationStatus` | Trạng thái sau. |
| `event_type` | `varchar` | Không | N/A | N/A | Loại event. |
| `actor_type` | `varchar` | Không | N/A | N/A | Loại actor. |
| `actor_id` | `uuid` hoặc `varchar` | Có | `null` | N/A | Actor ID. |
| `metadata` | `jsonb` | Có | `null` | N/A | Metadata. |
| `created_at` | `timestamp` | Không | now | index with `application_id` | Thời điểm event. |

### 6.18. `audit_logs`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `actor_type` | `varchar` | Không | N/A | N/A | Loại actor. |
| `actor_id` | `uuid` hoặc `varchar` | Có | `null` | N/A | Actor ID. |
| `action` | `varchar` | Không | N/A | index optional | Hành động. |
| `object_type` | `varchar` | Không | N/A | index with `object_id` | Loại object. |
| `object_id` | `uuid` hoặc `varchar` | Có | `null` | index with `object_type` | Object ID. |
| `application_id` | `uuid` | Có | `null` | FK `applications.id` | Application liên quan. |
| `metadata` | `jsonb` | Có | `null` | N/A | Metadata audit. |
| `ip_address` | `varchar` | Có | `null` | N/A | IP request. |
| `user_agent` | `text` | Có | `null` | N/A | User agent. |
| `created_at` | `timestamp` | Không | now | index | Thời điểm audit. |

### 6.19. `channel_accounts`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `channel` | `varchar` | Không | N/A | `Channel` | Kênh. |
| `name` | `varchar` | Không | N/A | unique/index with `channel` | Tên account/config. |
| `config` | `jsonb` | Không | `{}` | N/A | Config không chứa secret thô. |
| `status` | `varchar` | Không | `ACTIVE` | enum/varchar | Trạng thái. |
| `created_by_id` | `uuid` | Có | `null` | FK `users.id` | Người tạo config. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo. |
| `updated_at` | `timestamp` | Không | now | N/A | Thời điểm cập nhật. |

### 6.20. `channel_conversations`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `channel` | `varchar` | Không | N/A | `Channel` | Kênh hội thoại. |
| `external_conversation_id` | `varchar` | Không | N/A | unique with `channel` | ID hội thoại ngoài. |
| `candidate_id` | `uuid` | Có | `null` | FK `candidates.id` | Candidate nếu match. |
| `application_id` | `uuid` | Có | `null` | FK `applications.id` | Application nếu match. |
| `job_posting_id` | `uuid` | Có | `null` | FK `job_postings.id` | Posting liên quan. |
| `status` | `varchar` | Không | `OPEN` | `ConversationStatus` | Trạng thái hội thoại. |
| `last_message_at` | `timestamp` | Có | `null` | index optional | Tin cuối. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo. |
| `updated_at` | `timestamp` | Không | now | N/A | Thời điểm cập nhật. |

### 6.21. `channel_messages`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `conversation_id` | `uuid` | Không | N/A | FK `channel_conversations.id` | Hội thoại. |
| `direction` | `varchar` | Không | N/A | `MessageDirection` | Inbound/outbound. |
| `sender_type` | `varchar` | Không | N/A | enum/varchar | Candidate/bot/HR/system. |
| `message_type` | `varchar` | Không | `TEXT` | enum/varchar | Text/file/link/event. |
| `content` | `text` | Có | `null` | N/A | Nội dung text. |
| `raw_payload` | `jsonb` | Có | `null` | N/A | Payload gốc. |
| `created_at` | `timestamp` | Không | now | index with `conversation_id` | Thời điểm tin nhắn. |

### 6.22. `bot_knowledge_sources`

| Column | Type đề xuất | Nullable? | Default | Enum/Constraint | Mô tả |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | Không | generated | PK | Khóa chính. |
| `source_type` | `varchar` | Không | N/A | enum/varchar | `JOB_DESCRIPTION`, `JOB_POSTING`, `FAQ`, `POLICY`. |
| `job_description_id` | `uuid` | Có | `null` | FK `job_descriptions.id` | JD liên quan. |
| `job_posting_id` | `uuid` | Có | `null` | FK `job_postings.id` | Posting liên quan. |
| `title` | `varchar` | Không | N/A | N/A | Tiêu đề knowledge. |
| `content` | `text` hoặc `jsonb` | Không | N/A | N/A | Nội dung. |
| `status` | `varchar` | Không | `ACTIVE` | `BotKnowledgeStatus` | Trạng thái. |
| `created_at` | `timestamp` | Không | now | N/A | Thời điểm tạo. |
| `updated_at` | `timestamp` | Không | now | N/A | Thời điểm cập nhật. |

## 7. FK relationships

| From table.column | To table.column | On delete đề xuất | Ghi chú |
| --- | --- | --- | --- |
| `job_descriptions.created_by_id` | `users.id` | `RESTRICT` | Giữ lịch sử người tạo. |
| `job_descriptions.position_id` | `positions.id` | `SET NULL` | Cho phép giữ JD nếu position bị ngừng dùng. |
| `job_descriptions.level_id` | `levels.id` | `SET NULL` | Cho phép giữ JD nếu level bị ngừng dùng. |
| `job_description_versions.job_description_id` | `job_descriptions.id` | `RESTRICT` | Không xóa JD khi có version. |
| `job_description_versions.created_by_id` | `users.id` | `RESTRICT` | Giữ actor tạo version. |
| `job_postings.job_description_id` | `job_descriptions.id` | `RESTRICT` | Không xóa JD khi có posting. |
| `job_postings.job_description_version_id` | `job_description_versions.id` | `RESTRICT` | Posting bám version. |
| `job_postings.created_by_id` | `users.id` | `RESTRICT` | Giữ actor tạo posting. |
| `channel_postings.job_posting_id` | `job_postings.id` | `RESTRICT` | Không mất lịch sử publish. |
| `applications.candidate_id` | `candidates.id` | `RESTRICT` | Không xóa candidate khi có application. |
| `applications.job_posting_id` | `job_postings.id` | `RESTRICT` | Không xóa posting khi có application. |
| `applications.job_description_version_id` | `job_description_versions.id` | `RESTRICT` | Giữ JD version cho mapping/audit. |
| `applications.current_cv_document_id` | `cv_documents.id` | `SET NULL` | Add sau khi `cv_documents` có sẵn; tránh FK vòng khi tạo bảng. |
| `application_sources.application_id` | `applications.id` | `RESTRICT` | Giữ nguồn application. |
| `cv_documents.application_id` | `applications.id` | `RESTRICT` | Không mất CV metadata. |
| `cv_documents.candidate_id` | `candidates.id` | `RESTRICT` | Giữ liên kết candidate. |
| `parsed_profiles.application_id` | `applications.id` | `RESTRICT` | Gắn parsed profile với application. |
| `parsed_profiles.cv_document_id` | `cv_documents.id` | `RESTRICT` | Parse bám clean CV. |
| `parsed_profiles.candidate_id` | `candidates.id` | `RESTRICT` | Giữ liên kết candidate. |
| `duplicate_checks.application_id` | `applications.id` | `RESTRICT` | Giữ audit duplicate. |
| `mapping_results.application_id` | `applications.id` | `RESTRICT` | Không mất kết quả mapping. |
| `mapping_results.job_description_version_id` | `job_description_versions.id` | `RESTRICT` | Mapping bám JD version. |
| `mapping_results.clean_cv_document_id` | `cv_documents.id` | `RESTRICT` | Chỉ dùng clean CV. |
| `mapping_results.parsed_profile_id` | `parsed_profiles.id` | `SET NULL` | Giữ mapping nếu parsed profile bị chỉnh policy. |
| `question_sets.job_description_id` | `job_descriptions.id` | `SET NULL` | Cho phép question set template. |
| `question_sets.job_description_version_id` | `job_description_versions.id` | `SET NULL` | Cho phép set generic theo position/level. |
| `question_sets.position_id` | `positions.id` | `SET NULL` | Catalog có thể thay đổi. |
| `question_sets.level_id` | `levels.id` | `SET NULL` | Catalog có thể thay đổi. |
| `question_sets.created_by_id` | `users.id` | `RESTRICT` | Giữ actor tạo. |
| `question_set_items.question_set_id` | `question_sets.id` | `CASCADE` | Child detail thuần của question set. |
| `question_set_items.question_id` | `questions.id` | `SET NULL` | Giữ snapshot nếu question bị xóa/disable. |
| `form_sessions.application_id` | `applications.id` | `RESTRICT` | Không mất lịch sử form. |
| `form_sessions.question_set_id` | `question_sets.id` | `RESTRICT` | Form cần biết schema câu hỏi. |
| `form_answers.form_session_id` | `form_sessions.id` | `RESTRICT` | Không mất answers. |
| `form_answers.application_id` | `applications.id` | `RESTRICT` | Gắn answer với application. |
| `form_answers.question_set_item_id` | `question_set_items.id` | `RESTRICT` | Giữ item snapshot. |
| `ai_screening_results.application_id` | `applications.id` | `RESTRICT` | Không mất AI result. |
| `ai_screening_results.mapping_result_id` | `mapping_results.id` | `RESTRICT` | AI dựa mapping. |
| `ai_screening_results.form_session_id` | `form_sessions.id` | `RESTRICT` | AI dựa form. |
| `hr_reviews.application_id` | `applications.id` | `RESTRICT` | HR decision bám application. |
| `hr_reviews.reviewer_id` | `users.id` | `RESTRICT` | Reviewer là user nội bộ. |
| `workflow_events.application_id` | `applications.id` | `RESTRICT` | Không mất timeline. |
| `audit_logs.application_id` | `applications.id` | `SET NULL` | Cho phép audit chung hoặc audit object bị archive. |
| `channel_accounts.created_by_id` | `users.id` | `SET NULL` | Config vẫn tồn tại nếu user không còn. |
| `channel_conversations.candidate_id` | `candidates.id` | `SET NULL` | Conversation có thể chưa match hoặc candidate bị xử lý theo policy. |
| `channel_conversations.application_id` | `applications.id` | `SET NULL` | Conversation có thể tồn tại trước application. |
| `channel_conversations.job_posting_id` | `job_postings.id` | `SET NULL` | Conversation có thể không gắn posting. |
| `channel_messages.conversation_id` | `channel_conversations.id` | `RESTRICT` hoặc `CASCADE` | Cần cân nhắc audit/retention trước khi cascade. |
| `bot_knowledge_sources.job_description_id` | `job_descriptions.id` | `SET NULL` | Knowledge có thể generic. |
| `bot_knowledge_sources.job_posting_id` | `job_postings.id` | `SET NULL` | Knowledge có thể generic. |

Ghi chú: Với dữ liệu nghiệp vụ/audit, ưu tiên `RESTRICT` hoặc `SET NULL` hơn `CASCADE`. Không cascade xóa `Application` nếu đã có CV/mapping/form/AI/HR/audit quan trọng.

## 8. Indexes / Unique constraints

| Table | Index/Constraint | Column(s) | Unique? | Mục đích | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `users` | existing unique | `email` | Có | Identity/login user. | Đã có, giữ nguyên. |
| `candidates` | candidate email check | `email` | Chưa chốt | Dedupe candidate. | Source hiện tại nullable không unique; pre-check trước khi add unique/partial unique. |
| `job_postings` | public slug unique | `public_slug` | Có | Public URL. | Required. |
| `job_description_versions` | version unique | `job_description_id`, `version_no` | Có | Không trùng version. | Required. |
| `job_postings` | status index | `status` | Không | Dashboard/filter. | Required. |
| `channel_postings` | channel per posting | `job_posting_id`, `channel` | Có hoặc Không | Tránh duplicate record cùng kênh/posting nếu policy 1 channel 1 posting. | Chốt theo integration. |
| `channel_postings` | external posting unique | `channel`, `external_posting_id` | Có, partial | Idempotency publish/sync. | Chỉ khi external ID đáng tin. |
| `applications` | status index | `status` | Không | Work queue. | Required. |
| `applications` | candidate index | `candidate_id` | Không | Lịch sử ứng tuyển. | Required. |
| `applications` | posting index | `job_posting_id` | Không | Lọc theo job. | Required. |
| `applications` | JD version index | `job_description_version_id` | Không | Mapping/report. | Required. |
| `applications` | duplicate prevention | `candidate_id`, `job_posting_id` | Có hoặc partial | Một active application/candidate/posting. | Cần chốt rule upload lại/overwrite. |
| `application_sources` | external application unique | `channel`, `external_application_id` | Có, partial | Idempotency ingestion. | Chỉ khi external ID đáng tin. |
| `application_sources` | lead index | `external_lead_id` | Không | Tìm lead. | Optional. |
| `cv_documents` | application index | `application_id` | Không | CV versions. | Required. |
| `cv_documents` | candidate index | `candidate_id` | Không | CV theo candidate. | Required. |
| `cv_documents` | original hash index | `original_file_hash` | Không | Detect file trùng. | Required. |
| `cv_documents` | clean hash index | `clean_file_hash` | Không | Detect clean CV trùng. | Required. |
| `cv_documents` | version unique | `application_id`, `version_no`, `document_type` | Có | Versioning theo type. | Nếu tách original/clean bằng record. |
| `cv_documents` | current partial index | `application_id`, `is_current` | Không/partial | Truy vấn CV hiện hành. | Nếu DB hỗ trợ partial index. |
| `parsed_profiles` | application index | `application_id` | Không | Query parsed profile. | Required. |
| `parsed_profiles` | CV index | `cv_document_id` | Không | Trace parse theo CV. | Required. |
| `parsed_profiles` | text hash index | `normalized_text_hash` | Không | Profile duplicate. | Required. |
| `duplicate_checks` | application index | `application_id` | Không | Duplicate history. | Required. |
| `duplicate_checks` | type/status index | `check_type`, `status` | Không | Work queue/review duplicate. | Required. |
| `mapping_results` | application index | `application_id` | Không | Query mapping. | Required. |
| `mapping_results` | idempotency unique | `application_id`, `clean_cv_document_id`, `job_description_version_id` | Có, partial | Không chạy trùng mapping success. | Có thể partial theo `status='MAPPING_DONE'`. |
| `form_sessions` | token unique | `token_hash` | Có | Lookup token an toàn. | Required. |
| `form_sessions` | application index | `application_id` | Không | Query form theo application. | Required. |
| `form_sessions` | active session index | `application_id`, `question_set_id`, `status` | Không | Tránh nhiều active form. | Required. |
| `form_answers` | one answer per item | `form_session_id`, `question_set_item_id` | Có | Tránh submit trùng một câu. | Nếu answer versioning không cần. |
| `ai_screening_results` | application index | `application_id` | Không | Query AI result. | Required. |
| `ai_screening_results` | idempotency unique | `application_id`, `mapping_result_id`, `form_session_id` | Có, partial | Không chạy trùng AI success. | Có thể partial theo status done. |
| `hr_reviews` | application index | `application_id` | Không | Review history. | Required. |
| `hr_reviews` | timeline index | `application_id`, `created_at` | Không | Latest decision. | Required. |
| `workflow_events` | timeline index | `application_id`, `created_at` | Không | State timeline. | Required. |
| `audit_logs` | application audit index | `application_id`, `created_at` | Không | Audit theo application. | Required. |
| `audit_logs` | actor audit index | `actor_type`, `actor_id`, `created_at` | Không | Audit theo actor. | Required. |
| `audit_logs` | object audit index | `object_type`, `object_id` | Không | Audit theo object. | Required. |
| `channel_accounts` | account key | `channel`, `name` | Có hoặc Không | Tránh config trùng. | Chốt theo multi-account support. |
| `channel_conversations` | external conversation unique | `channel`, `external_conversation_id` | Có | Idempotency hội thoại. | Required nếu dùng bot/channel. |
| `channel_messages` | conversation timeline | `conversation_id`, `created_at` | Không | Lấy messages theo hội thoại. | Required nếu dùng bot/channel. |
| `bot_knowledge_sources` | source lookup | `source_type`, `job_description_id`, `job_posting_id` | Không | Tìm knowledge theo nguồn. | Required nếu dùng bot. |

Ghi chú triển khai: nếu check trùng application theo email/SĐT + JD thay vì `candidate_id`, cần thêm normalized contact fields trên `applications` hoặc xử lý bằng `duplicate_checks`/service logic; không tự add unique sai khi chưa có policy.

## 9. Enum proposal

| Enum | Giá trị đề xuất | Dùng ở bảng/cột |
| --- | --- | --- |
| `ApplicationStatus` | `APPLICATION_CREATED`, `APPLICATION_VALIDATING`, `APPLICATION_REJECTED_INVALID`, `APPLICATION_DUPLICATE_CHECKING`, `APPLICATION_DUPLICATE_FOUND`, `APPLICATION_OVERWRITTEN`, `APPLICATION_REJECTED_RATE_LIMIT`, `CV_UPLOADED`, `CV_STORED_QUARANTINE`, `CV_SCAN_REQUESTED`, `CV_SCAN_PASSED`, `CV_SCAN_FAILED`, `CV_REJECTED_MALWARE`, `CV_SANITIZING`, `CV_SANITIZED`, `CV_SANITIZE_FAILED`, `CV_PARSED`, `CV_PARSE_FAILED`, `PROFILE_DUPLICATE_CHECKED`, `PROFILE_DUPLICATE_NEEDS_REVIEW`, `MAPPING_REQUESTED`, `MAPPING_DONE`, `MAPPING_FAILED`, `MAPPING_REJECTED`, `ELIGIBLE_FOR_FORM`, `FORM_SESSION_CREATED`, `FORM_SENT`, `FORM_OPENED`, `FORM_SUBMITTED`, `FORM_EXPIRED`, `AI_SCREENING_REQUESTED`, `AI_SCREENING_DONE`, `AI_SCREENING_FAILED`, `WAITING_HR_REVIEW`, `HR_APPROVED`, `HR_REJECTED`, `HR_REQUESTED_MORE_INFO`, `TALENT_POOL` | `applications.status`, `workflow_events.from_status`, `workflow_events.to_status` |
| `JobPostingStatus` | `DRAFT`, `PUBLISHING`, `PUBLISHED`, `PUBLISH_FAILED`, `MANUAL_REQUIRED`, `CLOSED` | `job_postings.status`, possibly `channel_postings.status` |
| `Channel` | `VCS_PORTAL`, `FACEBOOK`, `LINKEDIN`, `TOPCV`, `VIETNAMWORKS`, `MANUAL`, `OTHER` | `channel_postings.channel`, `application_sources.channel`, `channel_accounts.channel`, `channel_conversations.channel` |
| `ChannelPostingStatus` | `DRAFT`, `PUBLISHING`, `PUBLISHED`, `PUBLISH_FAILED`, `MANUAL_REQUIRED`, `CLOSED` | `channel_postings.status` |
| `ApplicationSourceType` | `PORTAL`, `CHANNEL`, `MANUAL_IMPORT`, `WEBHOOK`, `EMAIL_PARSE`, `OTHER` | `application_sources.source_type`, `applications.source` |
| `CvDocumentType` | `ORIGINAL`, `CLEAN` | `cv_documents.document_type` |
| `StorageZone` | `QUARANTINE`, `SAFE` | `cv_documents.storage_zone` |
| `CvScanStatus` | `PENDING`, `SCANNING`, `PASSED`, `FAILED`, `REJECTED_MALWARE` | `cv_documents.scan_status` |
| `CvSanitizeStatus` | `PENDING`, `SANITIZING`, `SANITIZED`, `FAILED` | `cv_documents.sanitize_status` |
| `CvParseStatus` | `PENDING`, `PARSING`, `PARSED`, `FAILED` | `cv_documents.parse_status` |
| `DuplicateCheckType` | `APPLICATION_EMAIL_PHONE_JD`, `CV_FILE_HASH`, `PARSED_PROFILE` | `duplicate_checks.check_type` |
| `DuplicateCheckStatus` | `PASSED`, `DUPLICATE_FOUND`, `NEEDS_REVIEW`, `FAILED` | `duplicate_checks.status` |
| `MappingStatus` | `REQUESTED`, `DONE`, `FAILED`, `REJECTED` | `mapping_results.status`, `applications.mapping_status` |
| `MappingRecommendation` | `PASS`, `REJECT`, `TALENT_POOL`, `NEEDS_REVIEW` | `mapping_results.recommendation` |
| `QuestionSetStatus` | `DRAFT`, `ACTIVE`, `ARCHIVED` | `question_sets.status` |
| `FormSessionStatus` | `CREATED`, `SENT`, `OPENED`, `SUBMITTED`, `EXPIRED`, `CANCELLED` | `form_sessions.status`, `applications.form_status` |
| `AiScreeningStatus` | `REQUESTED`, `DONE`, `FAILED` | `ai_screening_results.status`, `applications.ai_screening_status` |
| `HrReviewDecisionType` | `APPROVE`, `REJECT`, `REQUEST_MORE_INFO`, `TALENT_POOL` | `hr_reviews.decision`, `applications.hr_review_status` |

Ghi chú CV status:

- `CV_SCAN_FAILED` là lỗi kỹ thuật/timeout của scanner và phải tách khỏi `CV_REJECTED_MALWARE` cũng như `CV_SANITIZE_FAILED`.
- `cv_documents.scan_status = FAILED` map lên workflow state `CV_SCAN_FAILED`.
- `CV_PARSE_FAILED` biểu diễn clean CV parse lỗi/text rỗng và block mapping tự động cho đến khi có parsed profile hợp lệ.
| `ConversationStatus` | `OPEN`, `CLOSED`, `HANDOFF`, `ARCHIVED` | `channel_conversations.status` |
| `MessageDirection` | `INBOUND`, `OUTBOUND` | `channel_messages.direction` |
| `BotKnowledgeStatus` | `DRAFT`, `ACTIVE`, `INACTIVE`, `ARCHIVED` | `bot_knowledge_sources.status` |

Ghi chú triển khai: lựa chọn giữa PostgreSQL enum và `varchar` + check constraint sẽ được chốt khi viết migration thực tế. Với enum còn thay đổi nhiều ở Phase 1, `varchar` + check/application validation có thể giảm rủi ro migration enum.

## 10. Seed data

| Seed item | Có cần trong Phase 1? | Nội dung seed | Ghi chú |
| --- | --- | --- | --- |
| Prompt `map_cv_to_jd` | Có | Prompt key cho mapping CV-JD nội bộ. | Seed vào `ai_prompts` nếu dùng AI prompt infra cho mapping. |
| Prompt `ai_screening` / `final_screening_recommendation` | Có | Prompt key cho AI Screening sau form. | Cần output schema ở spec AI sau. |
| Channel config mặc định | Có nếu bật channel modules | `VCS_PORTAL`, `FACEBOOK`, `LINKEDIN`, `TOPCV`, `VIETNAMWORKS`. | Không seed credential thật. |
| Bot knowledge FAQ mẫu | Optional | FAQ mẫu theo JD/posting/quy trình tuyển dụng. | Chỉ seed nếu bot candidate care nằm trong scope implement sớm. |
| Application status enum | Không cần seed nếu dùng enum/varchar | N/A | Status là code/config, không seed dữ liệu nghiệp vụ. |
| Question set mẫu | Optional | Bộ câu hỏi mẫu theo JD/vị trí/level. | Có thể để HR cấu hình thủ công. |
| Email template form/reminder | Có nếu có notification spec | Template gửi form, reminder, thông báo HR. | Không chứa secret. |
| Default threshold mapping | Có nếu có config | Threshold theo position/level/JD. | Nếu chưa có bảng config, ghi trong app config/env trước. |

Không seed dữ liệu thật của ứng viên, không seed token và không seed credential/API key thật của channel. Credential/API key phải lấy từ env/secret/config an toàn.

## 11. Migration order

1. Chuẩn hóa migration setup và ghi chú tắt/kiểm soát `synchronize=true` cho môi trường nghiêm túc.
2. Tạo bảng Job/JD: `job_descriptions`, `job_description_versions`, `job_postings`.
3. Tạo bảng channel posting/config: `channel_accounts`, `channel_postings`.
4. Tạo bảng `applications`, `application_sources`, tạm hoãn FK `applications.current_cv_document_id` nếu cần tránh vòng FK.
5. Tạo bảng CV/parse/duplicate: `cv_documents`, `parsed_profiles`, `duplicate_checks`.
6. Add FK `applications.current_cv_document_id` nếu dùng field này.
7. Tạo bảng mapping: `mapping_results`.
8. Tạo bảng question set/form: `question_sets`, `question_set_items`, `form_sessions`, `form_answers`.
9. Tạo bảng AI/HR: `ai_screening_results`, `hr_reviews`.
10. Tạo bảng workflow/audit: `workflow_events`, `audit_logs`.
11. Tạo bảng channel conversation/bot: `channel_conversations`, `channel_messages`, `bot_knowledge_sources`.
12. Add indexes/unique constraints theo từng nhóm, ưu tiên sau khi bảng đã tạo.
13. Seed prompt/channel defaults nếu cần.

Ghi chú:

| Chủ đề | Ghi chú |
| --- | --- |
| Migration granularity | Có thể tách nhiều migration nhỏ theo module để dễ review và revert. |
| Unique constraint | Constraint unique trên dữ liệu hiện có cần pre-check và cleanup trước. |
| FK vòng | Không tạo FK vòng trong cùng bước nếu gây lỗi migration order. |
| Channel/bot | Nếu MVP tối giản, channel/bot tables có thể nằm ở migration sau trong Phase 1. |

## 12. Rollback note

Mỗi migration phải có `up()` và `down()`. `down()` phải drop theo thứ tự ngược lại FK dependency.

Không rollback production bằng cách xóa dữ liệu nếu chưa có backup và approval. Với môi trường dev có thể drop bảng mới, nhưng production rollback cần strategy riêng.

| Migration type | Rollback hướng dẫn | Rủi ro |
| --- | --- | --- |
| Create table mới | Drop bảng theo thứ tự ngược FK. | Mất dữ liệu mới nếu đã có traffic production. |
| Add FK/index | Drop FK/index trước khi drop bảng/column. | Lock table hoặc fail nếu object name không ổn định. |
| Add nullable column vào bảng cũ | Có thể drop column nếu chưa có dữ liệu phụ thuộc. | Mất dữ liệu nếu column đã dùng trong runtime. |
| Add unique constraint | Drop constraint/index. | Nếu app dựa vào constraint, rollback có thể cho duplicate mới. |
| Seed prompt/channel config | Remove theo key cố định. | Không xóa dữ liệu user tự tạo hoặc customized. |
| Enum/check constraint | Drop constraint hoặc migrate value về varchar trước khi drop enum. | PostgreSQL enum rollback thường khó nếu đã có dữ liệu. |

## 13. Data migration / Backfill note

| Backfill item | Có cần ngay? | Cách xử lý đề xuất |
| --- | --- | --- |
| Candidate hiện có -> `Application` | Không | Không tự động tạo `Application` nếu chưa có job/JD/posting tương ứng. |
| Existing `resumeUrl/profileXlsxUrl` -> `cv_documents` | Không | Không tự động chuyển nếu chưa có application context. |
| Candidate -> job/application mapping | Không ngay | Nếu sau này backfill, cần mapping candidate -> job/application rõ ràng và audit. |
| Existing sessions/evaluations | Không | Giữ nguyên `interview_sessions`, `evaluations`, `session_questions`, `code_submissions`. |
| Existing AI prompts | Có thể | Giữ nguyên prompt cũ, chỉ seed thêm prompt key mới như `map_cv_to_jd`, `ai_screening`. |
| Existing uploaded files | Không | Giữ ở upload storage hiện tại; không tự động coi là safe CV. |
| Existing candidate parsedProfile | Không ngay | Có thể tham khảo nếu HR tạo application thủ công sau này, nhưng `ParsedProfile` Phase 1 nên gắn application/CV version. |
| Existing category/position/level/question seed | Không | Reuse catalog hiện có, không reset dữ liệu customized. |

## 14. Risk và nguyên tắc không phá dữ liệu hiện tại

| Risk | Ảnh hưởng | Mitigation |
| --- | --- | --- |
| `synchronize=true` có thể tự thay đổi schema. | Schema production/staging có thể lệch migration. | Tắt/kiểm soát trước khi rollout migration Phase 1. |
| Migration path/config chưa đồng nhất. | Migration scheduling lệch path có thể không chạy khi sync tắt. | Chuẩn hóa path và kiểm tra migration history trước Phase 1. |
| Unique constraint mới có thể fail nếu dữ liệu cũ trùng. | Migration fail hoặc lock table. | Pre-check dữ liệu, cleanup hoặc dùng partial/index thường trước. |
| FK mới vào bảng cũ có thể fail nếu backfill sai. | Migration fail hoặc orphan data. | Additive-first, không backfill khi chưa có mapping rõ. |
| Phá dữ liệu `candidates`. | Mất hồ sơ ứng viên hiện có. | Không alter mạnh, không unique email vội, không move CV cũ tự động. |
| Phá dữ liệu `interview_sessions`. | Interview flow/public token bị ảnh hưởng. | Không alter trong Phase 1 intake. |
| Phá dữ liệu `evaluations`. | BM04/evaluation hiện tại sai lệch. | Không dùng `evaluations` cho AI Screening Phase 1. |
| Phá flow `export` BM04. | Export Excel lỗi. | Không đổi schema evaluation/session phục vụ export. |
| Phá `code_submissions`. | Coding/interview submission bị ảnh hưởng. | Không alter bảng này. |
| Dùng CV upload cũ như CV sạch. | Rủi ro bảo mật vì chưa scan/sanitize. | Chỉ CV qua `cv_documents` + scan/sanitize mới là clean CV. |
| Token form lưu plain text. | Rủi ro leak public form token. | Chỉ lưu `token_hash`. |
| Channel raw payload chứa PII. | Rủi ro privacy/security. | Audit/security spec sau cần retention, masking, access control. |
| File hash/index thay malware scan. | Có thể bỏ lọt file độc. | Hash chỉ phục vụ duplicate/idempotency, không thay scan. |
| FK/Index lớn gây lock. | Migration downtime. | Tách migration nhỏ, chạy ngoài giờ cao điểm, cân nhắc concurrent index nếu cần. |

## 15. Conflict / Assumption

| Vấn đề | File liên quan | Cách xử lý |
| --- | --- | --- |
| `candidates.email` có unique hay không | Source `CandidateEntity`, `04_domain_model_and_relationships.md`, `backend-specification.md` | Source hiện tại `email` nullable không unique. Plan chỉ đề xuất pre-check và cân nhắc index/partial unique sau cleanup. |
| Có nên alter `candidates` để thêm relation field hay chỉ FK từ `applications` | `03_module_extension_plan.md`, `04_domain_model_and_relationships.md` | DB chỉ cần `applications.candidate_id` FK. Relation one-to-many ở code later không bắt buộc alter bảng `candidates`. |
| `CvDocument` lưu original/clean cùng record hay tách document type | `04_domain_model_and_relationships.md` | Migration plan đề xuất `document_type`, `storage_zone` để tách rõ domain; implementation sau quyết định một record hai path hay hai record theo type. |
| `Application.status` dùng PostgreSQL enum hay varchar | `04_domain_model_and_relationships.md`, `05_workflow_state_machine.md` | Plan ghi enum proposal nhưng chưa chốt SQL enum. Assumption: cân nhắc `varchar` + validation/check để dễ thay đổi trong Phase 1. |
| `applications(candidate_id, job_posting_id)` unique có phù hợp rule upload lại không | `04_domain_model_and_relationships.md`, `05_workflow_state_machine.md` | Cần chốt policy một active application/candidate/posting. Upload lại nên tạo CV version mới, không tạo application mới nếu unique được bật. |
| AMIS có cần bảng sync trong Phase 1 hay later | `02_target_architecture_phase1.md`, `03_module_extension_plan.md` | AMIS là later / extension point sau `HR Review`; `amis_sync_logs` không thuộc core migration Phase 1. |
| Channel/bot tables có bắt buộc migration ngay hay optional | `02_target_architecture_phase1.md`, `03_module_extension_plan.md` | Architecture có multi-channel/bot, nhưng MVP có thể đánh dấu channel/bot là Phase 1 optional/later within Phase 1 nếu core intake cần ưu tiên. |
| Migration scheduling lệch path xử lý ở đâu | `00_source_baseline_analysis.md`, `backend-specification.md` | Ghi là precondition/risk; không sửa trong tài liệu này. Task riêng cần chuẩn hóa path trước khi rollout nghiêm túc. |

Không phát hiện conflict ảnh hưởng trực tiếp đến database migration plan ở mức specification. Các điểm còn mở được ghi nhận là assumption để xử lý khi viết migration thực tế.

## 16. Kết luận

Database migration Phase 1 nên đi theo hướng additive-first, dùng TypeORM migration có `up/down`, không dựa vào `synchronize=true`. Các bảng mới cần xoay quanh `applications` làm trung tâm, liên kết tới candidate, JD/job posting, CV document, mapping, form, AI screening, HR review, workflow event và audit log. Migration phải bảo toàn dữ liệu candidate/session/evaluation hiện có.
