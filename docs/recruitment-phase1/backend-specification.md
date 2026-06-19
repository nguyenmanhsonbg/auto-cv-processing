# Backend Specification - Interview Assistant

Ngày lập: 2026-06-15  
Phạm vi đọc source: `apps/backend/src`, `apps/backend/package.json`, `apps/backend/.env.example`, `docker-compose.yml`, `Dockerfile`, `packages/shared/src/types`.

## 1. Tổng quan

Backend là ứng dụng NestJS dùng TypeScript, TypeORM và PostgreSQL cho hệ thống hỗ trợ phỏng vấn kỹ thuật. Hệ thống quản lý ứng viên, ngân hàng câu hỏi, phiên phỏng vấn, câu trả lời, chấm điểm, đánh giá BM04, export Excel, realtime interview tracking qua Socket.IO và các tác vụ AI dùng Claude.

Base API:

- Global prefix: `/api`
- Swagger UI: `/api/docs`
- WebSocket namespace: `/`
- Upload file download: `/api/uploads/:filename`

Các nhóm chức năng chính:

- Xác thực bằng email/password, JWT và Google OAuth.
- Quản trị user theo role `ADMIN`, `INTERVIEWER`, `HR`.
- Upload CV/profile, parse PDF/DOCX/XLSX, enrich profile bằng AI.
- Quản lý candidates có slug, owner và assignees.
- Quản lý positions, levels, categories, subcategories và question bank.
- Tạo session phỏng vấn, quản lý câu hỏi active/inactive, survey, anti-cheat, candidate public access token.
- Nhận code submission, chạy test case JavaScript/TypeScript trong sandbox.
- Tạo evaluation, gợi ý AI summary và AI BM04 ratings.
- Export evaluation ra file Excel theo template BM04.
- Gửi notification Telegram trước lịch phỏng vấn.

## 2. Runtime và cấu hình

### 2.1 Bootstrap

File: `apps/backend/src/main.ts`

- `JWT_SECRET` là bắt buộc. App throw error nếu thiếu.
- Dùng `helmet()`.
- Dùng `express-session` cho OAuth state verification:
  - `secret = JWT_SECRET`
  - cookie secure khi `NODE_ENV=production`
  - `httpOnly=true`, `sameSite=strict`, `maxAge=60s`
- CORS:
  - `origin = FRONTEND_URL || http://localhost:4000`
  - `credentials=true`
- Global validation:
  - `whitelist=true`
  - `transform=true`
  - `enableImplicitConversion=true`
- Swagger có bearer auth.

### 2.2 Database

Runtime TypeORM trong `AppModule`:

- DB: PostgreSQL qua `DATABASE_URL`
- `autoLoadEntities=true`
- `synchronize=true`
- SSL tắt
- Pool:
  - `max=5`
  - `min=1`
  - `idleTimeoutMillis=30000`
  - `connectionTimeoutMillis=5000`
  - keepalive bật

CLI TypeORM config trong `src/config/typeorm.config.ts`:

- `entities = dist/src/**/*.entity{.ts,.js}` tương ứng `__dirname + '/../**/*.entity{.ts,.js}'`
- `migrations = dist/src/migrations/*{.ts,.js}`
- `synchronize=false`

Lưu ý vận hành: Docker entrypoint chạy migration trước khi start app, nhưng runtime app lại bật `synchronize=true`.

### 2.3 Environment variables

Từ `.env.example` và source:

| Biến | Mục đích |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret ký JWT và session cookie |
| `JWT_EXPIRES_IN` | Thời hạn access token, mặc định 15m trong AuthModule |
| `PORT` | Port backend, mặc định 3000 |
| `UPLOAD_DIR` | Thư mục lưu upload, mặc định `./uploads` |
| `DEFAULT_ADMIN_EMAIL` | Email admin seed khi app start |
| `DEFAULT_ADMIN_PASSWORD` | Password admin seed |
| `DEFAULT_ADMIN_NAME` | Tên admin seed |
| `GOOGLE_CLIENT_ID` | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `GOOGLE_CALLBACK_URL` | Callback URL Google OAuth |
| `FRONTEND_URL` | CORS origin và OAuth redirect target |
| `ADMIN_EMAILS` | Danh sách email tự tạo admin khi login Google lần đầu |
| `ANTHROPIC_API_KEY` | Cấu hình AI theo `.env.example`; source dùng Claude Agent SDK |
| `TELEGRAM_BOT_TOKEN` | Token Telegram bot |
| `TELEGRAM_ADMIN_CHAT_IDS` | Chat IDs nhận notification |
| `MIGRATION_MAX_ATTEMPTS` | Số lần retry migration trong Docker entrypoint |
| `MIGRATION_RETRY_DELAY_SECONDS` | Delay giữa các lần retry migration |

### 2.4 Docker

`docker-compose.yml` gồm:

- `postgres`: PostgreSQL 14 Alpine, host port `5433`, DB `interview_assistant`.
- `backend`: build target `backend`, container port `3000`, volume `uploads`.
- `frontend`: build target `frontend`, host port `3001`.

`Dockerfile`:

- Build bằng pnpm workspace.
- Backend production image cài global `@anthropic-ai/claude-code`.
- Copy `dist`, shared package, `public/templates` và `migrate-and-start.sh`.
- Entry command: `./migrate-and-start.sh`.

## 3. Auth, role và security

### 3.1 Roles

Từ `packages/shared/src/types/user.ts`:

- `ADMIN`
- `INTERVIEWER`
- `HR`

### 3.2 Auth strategy

- Local strategy dùng email/password.
- Password hash bằng `bcryptjs`.
- JWT payload: `{ sub, email, role }`.
- JWT strategy map `sub` thành `req.user.id`.
- Google strategy dùng `passport-google-oauth20`.

### 3.3 Role guard

`RolesGuard` đọc metadata từ decorator `@Roles(...)`. Nếu route không có required roles thì chỉ cần các guard khác cho phép.

### 3.4 Seed default admin

`AuthService.onModuleInit()` gọi `seedDefaultAdmin()`:

- Nếu `DEFAULT_ADMIN_EMAIL` và `DEFAULT_ADMIN_PASSWORD` có giá trị, app tạo user admin nếu email chưa tồn tại.
- User được tạo có role `ADMIN`.

### 3.5 Google login

Luồng Google:

1. `/api/auth/google` redirect sang Google.
2. `/api/auth/google/callback` nhận profile.
3. Nếu email đã tồn tại trong DB, issue JWT.
4. Nếu email nằm trong `ADMIN_EMAILS`, tự tạo user `ADMIN`.
5. Nếu không, trả lỗi unauthorized.

## 4. Data model

### 4.1 `users`

Entity: `UserEntity`

| Field | Ghi chú |
| --- | --- |
| `id` | UUID |
| `email` | unique |
| `name` | string |
| `password` | hash |
| `role` | enum `UserRole`, default `INTERVIEWER` |
| `createdAt`, `updatedAt` | timestamps |

### 4.2 `candidates`

Entity: `CandidateEntity`

| Field | Ghi chú |
| --- | --- |
| `id` | UUID |
| `name` | bắt buộc |
| `slug` | unique, nullable cho dữ liệu cũ |
| `email`, `phone`, `birthYear` | nullable |
| `position` | default `Backend Developer` |
| `level` | enum `CandidateLevel`, default `ENTRY` |
| `resumeUrl`, `profileXlsxUrl` | path file upload |
| `parsedProfile` | JSONB profile enrich từ parser/AI |
| `analyzeStatus` | `idle` hoặc `analyzing` |
| `createdById` | owner user id, nullable |
| `createdBy` | many-to-one users |
| `assignees` | many-to-many users qua `candidate_assignees` |
| `sessions` | one-to-many interview sessions |
| `createdAt`, `updatedAt` | timestamps |

Candidate visibility:

- Admin thấy tất cả.
- Non-admin chỉ thấy candidate do mình tạo, candidate được assign, hoặc candidate legacy có `createdById = null`.

### 4.3 `interview_sessions`

Entity: `SessionEntity`

| Field | Ghi chú |
| --- | --- |
| `id` | UUID |
| `candidateId` | FK candidate |
| `createdById` | FK user |
| `status` | `DRAFT`, `IN_PROGRESS`, `COMPLETED`, `EVALUATED` |
| `accessToken` | unique public token cho candidate |
| `slug` | unique nullable |
| `templatePosition` | default `Backend Developer` |
| `targetLevel` | default `ENTRY` |
| `scheduledAt` | nullable timestamp |
| `meetingPlatform` | `MS_TEAMS` hoặc `GOOGLE_MEET` |
| `meetingLink` | nullable |
| `sequentialMode` | candidate thấy tuần tự từng câu |
| `candidateViewEnabled` | khóa/mở quyền xem câu hỏi đã active |
| `questions` | one-to-many session questions |
| `categoryRatings` | JSONB, key dạng `CATEGORY::Subcategory` |
| `startedAt`, `completedAt` | nullable |
| `surveyActivatedAt` | nullable |
| `isSurveyGenerating` | boolean |
| `isSurveySuggestGenerating` | boolean |
| `surveySuggestions` | JSONB danh sách `{ questionId, reasoning }` |
| `createdAt`, `updatedAt` | timestamps |

### 4.4 `session_questions`

Entity: `SessionQuestionEntity`

| Field | Ghi chú |
| --- | --- |
| `id` | UUID |
| `sessionId` | FK session, cascade delete |
| `questionId` | FK question |
| `orderIndex` | thứ tự câu hỏi |
| `isActive` | candidate chỉ nhận câu active |
| `activatedAt` | nullable |
| `candidateAnswer` | text nullable |
| `interviewerNote` | text nullable |
| `rating` | number nullable |
| `answeredAt` | nullable |
| `submissions` | one-to-many code submissions |

### 4.5 `session_survey_questions`

Entity: `SessionSurveyQuestionEntity`

| Field | Ghi chú |
| --- | --- |
| `id` | UUID |
| `sessionId` | FK session, cascade delete |
| `question` | text |
| `category` | category code |
| `subcategory` | nullable |
| `purpose` | mô tả mục đích câu hỏi |
| `choices` | JSONB array |
| `answer` | nullable |
| `orderIndex` | int |
| `createdAt` | timestamp |

### 4.6 `anti_cheat_events`

Entity: `AntiCheatEventEntity`

| Field | Ghi chú |
| --- | --- |
| `id` | UUID |
| `sessionId` | FK session, cascade delete |
| `type` | `TAB_HIDDEN`, `COPY_ATTEMPT`, `MULTI_DEVICE_DETECTED` |
| `metadata` | JSONB nullable |
| `createdAt` | timestamp |

### 4.7 `questions`

Entity: `QuestionEntity`

| Field | Ghi chú |
| --- | --- |
| `id` | UUID |
| `category` | dynamic category code |
| `subcategory` | string |
| `competencyType` | `KNOWLEDGE`, `SKILL`, `ADDITIONAL`, `PERSONALITY` |
| `text` | nội dung câu hỏi |
| `difficulty` | default 1 |
| `targetLevels` | text array |
| `type` | `OPEN_ENDED`, `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `CODING`, `SCENARIO`, `ARCHITECTURE` |
| `options`, `correctAnswers` | JSONB nullable |
| `expectedAnswer`, `scoringGuide` | text nullable |
| `testCases`, `hiddenTestCases` | JSONB nullable |
| `timeLimit`, `memoryLimit` | nullable |
| `starterCode` | JSONB nullable |
| `architectureTemplate` | JSONB nullable |
| `code` | unique nullable seed code, ví dụ `Q001` |
| `isActive` | default true |
| `isCustomized` | default false |
| `createdAt`, `updatedAt` | timestamps |

### 4.8 `evaluations`

Entity: `EvaluationEntity`

| Field | Ghi chú |
| --- | --- |
| `id` | UUID |
| `sessionId` | unique, one evaluation per session |
| `evaluatorId` | FK user |
| `hrEvaluation` | JSONB |
| `technicalRatings` | JSONB array |
| `softSkillRatings` | JSONB array |
| `zoneResult`, `zoneExplanation` | nullable |
| `finalLevel`, `finalZone`, `finalSubZone` | nullable |
| `personalityRatings` | JSONB array |
| `expectedSalary`, `noticePeriod` | nullable |
| `plannedAssignment`, `jobDescription` | text nullable |
| `overallResult` | `PASS`, `FAIL`, `PENDING` |
| `overallNotes` | text nullable |
| `aiSummary` | text nullable |
| `aiEvaluationSuggestion` | JSONB nullable |
| `aiAnalysisStatus` | `analyzing`, `completed`, `failed`, nullable |
| `createdAt`, `updatedAt` | timestamps |

### 4.9 `code_submissions`

Entity: `CodeSubmissionEntity`

| Field | Ghi chú |
| --- | --- |
| `id` | UUID |
| `sessionQuestionId` | FK session question, cascade delete |
| `language` | string |
| `code` | text |
| `status` | `PENDING`, `RUNNING`, `PASSED`, `PARTIAL`, `FAILED`, `TIMEOUT`, `ERROR` |
| `results` | JSONB nullable |
| `aiEvaluation` | JSONB nullable |
| `submittedAt` | timestamp |

### 4.10 Master data và AI config

| Table | Entity | Ghi chú |
| --- | --- | --- |
| `categories` | `CategoryEntity` | `name`, `displayName`, `description`, `orderIndex`, `isCustomized`, `positions` |
| `sub_categories` | `SubCategoryEntity` | `categoryId`, `name`, `orderIndex`, `competencyType`, `isCustomized` |
| `positions` | `PositionEntity` | `name`, `description`, `isActive`, `isCustomized` |
| `levels` | `LevelEntity` | `name`, `displayName`, `orderIndex`, `isActive`, `isCustomized` |
| `ai_prompts` | `AiPromptEntity` | prompt theo `key`, `systemPrompt`, `model`, `isActive`, `isCustomized` |
| `ai_model_overrides` | `AiModelOverrideEntity` | override model theo `promptKey` |

## 5. API specification

Tất cả route dưới đây có prefix `/api`.

### 5.1 Auth

Controller: `AuthController`, path `/auth`

| Method | Path | Auth | Role | Mục đích |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/login` | LocalAuthGuard | Public | Login bằng email/password, throttle 5 request/phút |
| `GET` | `/auth/me` | JWT | Any | Lấy profile user hiện tại |
| `GET` | `/auth/users/assignable` | JWT | Any | Danh sách user cho dropdown assign |
| `GET` | `/auth/users` | JWT | `ADMIN` | List users phân trang, filter `search`, `role`, sort |
| `POST` | `/auth/users` | JWT | `ADMIN` | Tạo user mới |
| `PUT` | `/auth/users/:id` | JWT | `ADMIN` | Update name/role |
| `DELETE` | `/auth/users/:id` | JWT | `ADMIN` | Xóa user |
| `GET` | `/auth/google` | Google OAuth | Public | Redirect sang Google OAuth |
| `GET` | `/auth/google/callback` | Google OAuth | Public | Callback, redirect frontend kèm token |

Request chính:

- `LoginDto`: `email`, `password`.
- `CreateUserDto`: `email`, `name`, optional `role`.
- `UpdateUserDto`: optional `name`, `role`.

Response login:

```json
{
  "accessToken": "jwt",
  "user": { "id": "uuid", "email": "user@example.com", "role": "ADMIN", "name": "Admin" }
}
```

### 5.2 Candidates

Controller: `CandidatesController`, path `/candidates`, class-level `JwtAuthGuard`.

| Method | Path | Auth | Role | Mục đích |
| --- | --- | --- | --- | --- |
| `POST` | `/candidates` | JWT | Any | Tạo candidate thủ công |
| `GET` | `/candidates` | JWT | Any | List candidates phân trang |
| `GET` | `/candidates/:idOrSlug` | JWT | Any có quyền xem | Lấy candidate bằng UUID hoặc slug |
| `PUT` | `/candidates/:idOrSlug` | JWT | Any có quyền xem | Update candidate |
| `PATCH` | `/candidates/:idOrSlug/assign` | JWT | Creator hoặc admin theo service | Set assignees |
| `DELETE` | `/candidates/:idOrSlug` | JWT | `ADMIN`, `INTERVIEWER` | Xóa candidate nếu không còn session FK |
| `POST` | `/candidates/:idOrSlug/analyze` | JWT | Any có quyền xem | Re-analyze candidate từ file đã lưu |
| `POST` | `/candidates/upload` | JWT | Any | Upload nhiều file profile/CV, parse và upsert candidate |
| `POST` | `/candidates/backfill-slugs` | JWT | `ADMIN` | Backfill slug cho candidate cũ |

Query list:

- `page`, `limit`, `search`, `level`, `sortBy`, `sortOrder`.
- `level` hỗ trợ nhiều value dạng comma-separated trong service.

Upload:

- Field multipart: `files[]`, optional `socketId`, optional `candidateId`.
- Multer storage lưu vào `UPLOAD_DIR || ./uploads`.
- Limit: 20MB mỗi file.
- MIME allowed: PDF, DOCX, XLS, XLSX.
- Parser thực tế hỗ trợ `.pdf`, `.docx`, `.xlsx`; `.xls` có thể qua MIME filter nhưng parser không có case `.xls`.
- Nếu có `candidateId`, update candidate đó và kéo thêm file bổ sung đã lưu nếu upload thiếu loại CV/XLSX.
- Nếu không có `candidateId`, upsert theo email extract được; nếu không có email thì tạo mới.
- AI enrichment chạy một lần trên raw text đã merge.
- Có fallback `analyzeFileDirectly` cho PDF/DOCX khi extract text thất bại.
- Emit progress qua WebSocket tới `socketId` bằng event `candidate:upload_progress`.

Re-analyze:

- Parse lại `resumeUrl` và `profileXlsxUrl`.
- Merge raw text và regex fields.
- Gọi `enrichParsedProfile` và `detectProfileAnomalies`.
- Update `parsedProfile`.
- Emit event `candidate:analyze_progress`.

### 5.3 Sessions

Controller: `SessionsController`, path `/sessions`.

#### Protected routes

| Method | Path | Auth | Role | Mục đích |
| --- | --- | --- | --- | --- |
| `GET` | `/sessions/:id/client-info` | JWT | Any | Lấy IP/user-agent candidate đang connect |
| `GET` | `/sessions/:id/anticheat` | JWT | Any | Lấy anti-cheat events |
| `POST` | `/sessions` | JWT | `ADMIN`, `INTERVIEWER`, `HR` | Tạo interview session |
| `GET` | `/sessions` | JWT | Any | List sessions phân trang |
| `GET` | `/sessions/:id` | JWT | Any có quyền xem | Lấy session bằng UUID hoặc slug |
| `PUT` | `/sessions/:id` | JWT | `ADMIN`, `INTERVIEWER`, `HR` | Update session |
| `PATCH` | `/sessions/:id` | JWT | `ADMIN`, `INTERVIEWER`, `HR` | Partial update session |
| `DELETE` | `/sessions/:id` | JWT | `ADMIN`, `INTERVIEWER` | Xóa session |
| `POST` | `/sessions/:id/suggest-next-question` | JWT | `ADMIN`, `INTERVIEWER` | AI gợi ý câu tiếp theo |
| `POST` | `/sessions/:id/activate-questions` | JWT | `ADMIN`, `INTERVIEWER` | Active một nhóm session questions |
| `POST` | `/sessions/:id/survey/generate` | JWT | `ADMIN`, `INTERVIEWER` | Generate survey bằng AI |
| `GET` | `/sessions/:id/survey` | JWT | `ADMIN`, `INTERVIEWER` | Lấy survey questions |
| `PATCH` | `/sessions/:id/survey` | JWT | `ADMIN`, `INTERVIEWER` | Lưu survey answers do interviewer nhập |
| `POST` | `/sessions/:id/suggest-from-survey` | JWT | `ADMIN`, `INTERVIEWER` | AI gợi ý question từ profile và survey |
| `POST` | `/sessions/:id/activate-from-survey` | JWT | `ADMIN`, `INTERVIEWER` | Active/add questions từ survey suggestion |
| `POST` | `/sessions/:id/questions` | JWT | `ADMIN`, `INTERVIEWER` | Add questions vào session |
| `DELETE` | `/sessions/:id/questions/:questionId` | JWT | `ADMIN`, `INTERVIEWER` | Remove session question |
| `POST` | `/sessions/:id/activate-next` | JWT | `ADMIN`, `INTERVIEWER` | Active câu inactive tiếp theo |
| `POST` | `/sessions/:id/activate-next-category` | JWT | `ADMIN`, `INTERVIEWER` | Chuyển sang category tiếp theo |
| `PATCH` | `/sessions/:id/questions/:sqId` | JWT | `ADMIN`, `INTERVIEWER` | Update note/rating/active cho session question |
| `POST` | `/sessions/:id/force-activate-question` | JWT | `ADMIN`, `INTERVIEWER` | Force active một session question |
| `POST` | `/sessions/:id/bulk-toggle-questions` | JWT | `ADMIN`, `INTERVIEWER` | Bulk active/deactive session questions |
| `PATCH` | `/sessions/:id/candidate-view` | JWT | `ADMIN`, `INTERVIEWER` | Bật/tắt quyền candidate xem câu hỏi |
| `POST` | `/sessions/:id/reactivate-question` | JWT | `ADMIN`, `INTERVIEWER` | Re-active session question |

`SessionIdentifierPipe` chấp nhận UUID hoặc slug-like string.

Query list:

- `page`, `limit`, `search`, `status`, `targetLevel`, `sortBy`, `sortOrder`.
- `status` và `targetLevel` hỗ trợ comma-separated.

Create session body:

- `candidateId` bắt buộc.
- Optional: `targetLevel`, `templatePosition`, `positionId`, `questionIds`, `sequentialMode`, `scheduledAt`, `meetingPlatform`, `meetingLink`.
- Nếu có `positionId`, service resolve tên position và ưu tiên hơn `templatePosition`.
- Service tạo `accessToken = nanoid(24)` và slug theo `{candidate-name}-interview-{YYYY-MM-DD}-{short-id}`.
- Service default thực tế:
  - `status = DRAFT`
  - `sequentialMode = dto.sequentialMode ?? true`
  - `candidateViewEnabled = false`

HR create behavior:

- HR không truyền questionIds trực tiếp.
- Service tự lấy categories phù hợp với position.
- Level hierarchy: target level bao gồm current level và các level thấp hơn theo `orderIndex`.
- Fetch active questions theo category và applicable levels.
- Tạo session questions nhưng trả response không kèm question details cho HR.

Non-HR create behavior:

- Nếu body có `questionIds`, tạo session questions theo thứ tự input.

Survey behavior:

- Sau khi tạo session, service fire-and-forget `generateSurvey(sessionId)`.
- Survey generation thay thế survey cũ của session.
- Candidate submit survey answers qua public token.
- Nếu session còn `DRAFT` và tất cả survey questions đã answered, service auto chuyển session sang `IN_PROGRESS`, set `startedAt`, rồi fire-and-forget `suggestQuestionsFromSurvey`.

Question activation behavior:

- `/activate-questions`: body `{ questionIds: string[] }`, nhưng implementation update `session_questions.id IN (...)`; do đó giá trị thực tế cần là `sessionQuestionId`, không phải `question entity id`.
- `/activate-from-survey`: body `{ questionIds: string[] }` dùng `question entity id`; nếu question chưa link vào session thì tạo mới, nếu đã link thì active.
- `/questions/:questionId`: path tên `questionId`, nhưng service remove theo `sessionQuestionId`.
- `/reactivate-question`: body `{ questionId: string }`, nhưng service nhận như `sessionQuestionId`.
- `/force-activate-question`: body `{ sqId: string }`.

#### Public candidate routes

| Method | Path | Auth | Mục đích |
| --- | --- | --- | --- |
| `GET` | `/sessions/access/:token` | Public token | Candidate lấy session/questions active |
| `POST` | `/sessions/access/:token/submit` | Public token | Candidate submit answer |
| `POST` | `/sessions/access/:token/complete` | Public token | Candidate complete session |
| `POST` | `/sessions/access/:token/submissions` | Public token | Candidate submit code |
| `GET` | `/sessions/access/:token/submissions/:submissionId` | Public token | Poll submission status |
| `GET` | `/sessions/access/:token/survey` | Public token | Candidate lấy survey |
| `PATCH` | `/sessions/access/:token/survey/answers` | Public token | Candidate submit survey answers |

Candidate response intentionally hides:

- candidate info
- createdBy
- categoryRatings
- `correctAnswers`
- `expectedAnswer`
- `scoringGuide`
- `hiddenTestCases`
- `interviewerNote`
- `rating`
- submissions

Candidate `findByToken` behavior:

- Chỉ load session questions đang `isActive=true`.
- Nếu `candidateViewEnabled=false`, trả `questions=[]`.
- Nếu `sequentialMode=true`, chỉ expose câu chưa answered hiện tại và các câu đã answered.
- Nếu session `DRAFT`:
  - Auto start nếu không có survey questions.
  - Hoặc auto start nếu có survey nhưng tất cả đã answered.

### 5.4 Questions

Controller: `QuestionsController`, path `/questions`, class-level JWT.

| Method | Path | Auth | Role | Mục đích |
| --- | --- | --- | --- | --- |
| `POST` | `/questions` | JWT | `ADMIN` | Tạo question |
| `GET` | `/questions` | JWT | Any | List questions phân trang |
| `GET` | `/questions/:id` | JWT | Any | Lấy question |
| `PUT` | `/questions/:id` | JWT | `ADMIN` | Update question, set `isCustomized=true` |
| `DELETE` | `/questions/:id` | JWT | `ADMIN` | Xóa question |
| `POST` | `/questions/:id/reset` | JWT | `ADMIN` | Reset một question về seed nếu tìm được |
| `POST` | `/questions/seed` | JWT | `ADMIN` | Seed question bank từ YAML |

Query list:

- `page`, `limit`, `search`, `category`, `subcategory`, `targetLevel`, `type`, `isActive`, `sortBy`, `sortOrder`.
- `category`, `subcategory`, `targetLevel`, `type` có xử lý comma-separated trong service.
- `limit` tối đa 2000.

Question DTO:

- Required: `category`, `subcategory`, `text`.
- Optional: `difficulty`, `targetLevels`, `type`, `competencyType`, `options`, `correctAnswers`, `expectedAnswer`, `scoringGuide`, `testCases`, `hiddenTestCases`, `timeLimit`, `memoryLimit`, `starterCode`, `architectureTemplate`.

### 5.5 Categories và subcategories

Controller: `CategoriesController`, path root, class-level JWT.

| Method | Path | Auth | Role | Mục đích |
| --- | --- | --- | --- | --- |
| `GET` | `/categories` | JWT | Any | List categories, optional `position` |
| `POST` | `/categories` | JWT | `ADMIN` | Tạo category |
| `PUT` | `/categories/:id` | JWT | `ADMIN` | Update category, set customized |
| `DELETE` | `/categories/:id` | JWT | `ADMIN` | Xóa category và subcategories |
| `POST` | `/categories/:id/reset` | JWT | `ADMIN` | Reset category về seed |
| `POST` | `/categories/seed` | JWT | `ADMIN` | Seed default categories/subcategories |
| `GET` | `/sub-categories` | JWT | Any | List subcategories, optional `categoryId` |
| `POST` | `/sub-categories` | JWT | `ADMIN` | Tạo subcategory |
| `PUT` | `/sub-categories/:id` | JWT | `ADMIN` | Update subcategory |
| `DELETE` | `/sub-categories/:id` | JWT | `ADMIN` | Xóa subcategory |
| `POST` | `/sub-categories/:id/reset` | JWT | `ADMIN` | Reset subcategory về seed |

Category position filter:

- `positions=null` hoặc empty nghĩa là category hiển thị cho mọi position.
- Nếu có positions, category chỉ hiển thị khi includes position truyền vào.

### 5.6 Positions

Controller: `PositionsController`, path `/positions`, class-level JWT.

| Method | Path | Auth | Role | Mục đích |
| --- | --- | --- | --- | --- |
| `GET` | `/positions` | JWT | Any | List positions phân trang |
| `POST` | `/positions` | JWT | `ADMIN` | Tạo position |
| `PUT` | `/positions/:id` | JWT | `ADMIN` | Update position, set customized |
| `DELETE` | `/positions/:id` | JWT | `ADMIN` | Xóa position |
| `POST` | `/positions/:id/reset` | JWT | `ADMIN` | Reset customized flag |
| `POST` | `/positions/seed` | JWT | `ADMIN` | Seed positions |

Query list:

- `page`, `limit`, `search`, `status`, `sortBy`, `sortOrder`.
- `status=ACTIVE` map thành `isActive=true`; `INACTIVE` map thành `false`.

### 5.7 Levels

Controller: `LevelsController`, path `/levels`, class-level JWT.

| Method | Path | Auth | Role | Mục đích |
| --- | --- | --- | --- | --- |
| `GET` | `/levels` | JWT | Any | List levels phân trang |
| `POST` | `/levels` | JWT | `ADMIN` | Tạo level |
| `PUT` | `/levels/:id` | JWT | `ADMIN` | Update level, set customized |
| `DELETE` | `/levels/:id` | JWT | `ADMIN` | Xóa level |
| `POST` | `/levels/:id/reset` | JWT | `ADMIN` | Reset level về seed |

Query tương tự positions.

### 5.8 Evaluations

Controller: `EvaluationsController`, path `/evaluations`, class-level JWT.

| Method | Path | Auth | Role | Mục đích |
| --- | --- | --- | --- | --- |
| `POST` | `/evaluations` | JWT | `ADMIN`, `INTERVIEWER` | Tạo evaluation cho session |
| `GET` | `/evaluations` | JWT | Any | List evaluations |
| `GET` | `/evaluations/by-session/:sessionId` | JWT | Any | Lấy evaluation theo session |
| `GET` | `/evaluations/:id` | JWT | Any | Lấy evaluation |
| `PUT` | `/evaluations/:id` | JWT | `ADMIN`, `INTERVIEWER` | Update evaluation |
| `DELETE` | `/evaluations/:id` | JWT | `ADMIN`, `INTERVIEWER` | Xóa evaluation |
| `POST` | `/evaluations/:id/generate-ai-summary` | JWT | `ADMIN`, `INTERVIEWER` | Generate AI summary |
| `POST` | `/evaluations/:id/generate-ai-evaluation` | JWT | `ADMIN`, `INTERVIEWER` | AI gợi ý BM04 ratings và persist vào evaluation |

Create behavior:

- Mỗi session chỉ có một evaluation do `sessionId` unique.
- Nếu client không truyền `technicalRatings`, service tạo default từ toàn bộ subcategories ngoài `SOFT_SKILL`, `PERSONALITY`.
- Nếu client không truyền `softSkillRatings`, service tạo default từ soft skill subcategories.

AI evaluation behavior:

- Load session, candidate, questions, question details.
- Load survey answers nếu có.
- Gọi AI để gợi ý ratings, personality ratings, overall, summary, final level/zone.
- Persist trực tiếp các gợi ý vào evaluation.
- Emit WebSocket:
  - `eval:analyzing`
  - `eval:analysis_ready`
- `aiAnalysisStatus` chuyển `analyzing`, `completed` hoặc `failed`.

### 5.9 Submissions

Controller: `SubmissionsController`, path `/submissions`, class-level JWT.

| Method | Path | Auth | Role | Mục đích |
| --- | --- | --- | --- | --- |
| `POST` | `/submissions` | JWT | Any trong source | Submit code |
| `GET` | `/submissions` | JWT | Any | List submissions, optional `sessionQuestionId` |
| `GET` | `/submissions/:id` | JWT | Any | Lấy submission |

Lưu ý: Swagger summary ghi "interviewer/admin only", nhưng source chỉ áp dụng `JwtAuthGuard`, chưa có `RolesGuard`.

Submission behavior:

- Supported languages: `javascript`, `typescript`.
- `create()` lưu record trạng thái `PENDING`, rồi async `runCode(id)`.
- Runner dùng Node `vm` với context hạn chế, không expose `require`, `process`, filesystem hoặc child process.
- Mỗi test case inject biến `INPUT` và chạy code.
- Timeout hiện hardcode 5000ms trong `runInSandbox`; chưa dùng `QuestionEntity.timeLimit`.
- Chỉ dùng `question.testCases`; `hiddenTestCases` chưa được runner dùng.
- Status:
  - tất cả passed: `PASSED`
  - một phần passed: `PARTIAL`
  - không passed: `FAILED`
  - không có test cases: `PASSED`
- Sau khi chạy xong emit `code:execution_completed`.

### 5.10 Export

Controller: `ExportController`, path `/export`.

| Method | Path | Auth | Role | Mục đích |
| --- | --- | --- | --- | --- |
| `GET` | `/export/:sessionId` | JWT | Any trong source | Export evaluation Excel |

Export behavior:

- Cần evaluation tồn tại theo `sessionId`.
- Load session cùng candidate và session questions.
- Dùng template: `public/templates/output_template_v2.xlsx`.
- Dùng `JSZip` chỉnh XML worksheet trực tiếp.
- Fill candidate/session/evaluation/rating vào sheet template.
- Mở rộng row cho các section KNL/SKILL/ADDITIONAL nếu số rating vượt row template.
- Trả response content type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Filename: `evaluation_{sessionId}.xlsx`.

### 5.11 Uploads

Controller: `UploadsController`, path `/uploads`.

| Method | Path | Auth | Role | Mục đích |
| --- | --- | --- | --- | --- |
| `GET` | `/uploads/:filename` | JWT | `ADMIN`, `INTERVIEWER`, `HR` | Download file đã upload |

Security:

- Chặn path traversal bằng regex: không cho `/`, `\`, `..`.
- File path resolve từ `UPLOAD_DIR` hoặc `process.cwd()/uploads`.
- Nếu sendFile lỗi thì trả `BadRequestException('File not found')`.

### 5.12 AI prompts và model overrides

Controller: `AiPromptsController`, path `/ai-prompts`, class-level JWT + `ADMIN`.

| Method | Path | Mục đích |
| --- | --- |
| `GET` | `/ai-prompts/models` | List available Claude model keys |
| `GET` | `/ai-prompts` | List prompts phân trang |
| `PUT` | `/ai-prompts/:id` | Update prompt, clear AI prompt cache |
| `POST` | `/ai-prompts/seed` | Reset all prompts về built-in defaults, clear cache |

Controller: `AiModelOverridesController`, path `/ai-model-overrides`, class-level JWT + `ADMIN`.

| Method | Path | Mục đích |
| --- | --- |
| `GET` | `/ai-model-overrides/models` | List available Claude model keys |
| `GET` | `/ai-model-overrides` | List prompts cùng current override |
| `PUT` | `/ai-model-overrides/:promptKey` | Upsert model override |
| `DELETE` | `/ai-model-overrides/:promptKey` | Remove override |
| `POST` | `/ai-model-overrides/reset` | Clear all overrides |

Available model keys trong source:

- `claude-opus-4`
- `claude-opus-4.5`
- `claude-opus-4.6`
- `claude-sonnet-4`
- `claude-sonnet-4.5`
- `claude-sonnet-4.6`
- `claude-sonnet-3.5`
- `claude-haiku-4`
- `claude-haiku-4.5`
- `claude-haiku-3.5`

Prompt keys mặc định:

- `enrich_profile`
- `suggest_questions`
- `evaluation_summary`
- `evaluate_session`
- `generate_survey_questions`
- `suggest_questions_from_survey`
- `suggest_next_question`
- `detect_profile_anomalies`

## 6. WebSocket specification

Gateway: `InterviewWebSocketGateway`

Connection query:

- `sessionId`: bắt buộc để join room.
- `role`: `candidate` hoặc `interviewer`.
- Candidate cần thêm `accessToken`; gateway validate async bằng `{ id: sessionId, accessToken }`.
- Interviewer có thể truyền `name`, `email`.

Room:

- Mỗi session dùng room `session:{sessionId}`.

Candidate connection behavior:

- Gateway chỉ cho một candidate socket/device active mỗi session.
- Nếu candidate khác join, socket cũ nhận `candidate:session_kicked`, bị disconnect.
- Ghi anti-cheat event `MULTI_DEVICE_DETECTED`.
- Broadcast `candidate:multi_device_detected`.
- Lưu `ip`, `userAgent`, `connectedAt` trong memory map.

Interviewer behavior:

- Track interviewer sockets theo session.
- Broadcast `interviewers:updated` khi join/disconnect.
- Late joiner nhận lại event generating nếu session đang `isSurveyGenerating` hoặc `isSurveySuggestGenerating`.

Inbound subscribed events:

| Event | Payload chính | Behavior |
| --- | --- | --- |
| `session:join` | `{ sessionId, role, name, email }` | Join room, late role assignment cho interviewer |
| `candidate:typing` | `{ sessionId, sessionQuestionId, text }` | Relay tới room |
| `candidate:code_changed` | `{ sessionId, sessionQuestionId, code, language }` | Relay tới room |
| `candidate:answer_submitted` | `{ sessionId, sessionQuestionId, answer }` | Relay tới room |
| `candidate:architecture_changed` | `{ sessionId, sessionQuestionId, architecture }` | Relay tới room |
| `candidate:question_changed` | `{ sessionId, sessionQuestionId }` | Relay tới room |
| `candidate:tab_hidden` | `{ sessionId }` | Lưu anti-cheat event, broadcast count |
| `candidate:copy_attempt` | `{ sessionId }` | Lưu anti-cheat event, broadcast count |

Outbound helper events:

- `interviewer:questions_activated`
- `interviewer:questions_deactivated`
- `interviewer:candidate_view_toggled`
- `code:execution_completed`
- `survey:generating`
- `survey:generated`
- `survey:generate_failed`
- `survey:activated`
- `session:next_question_generating`
- `session:next_question_suggested`
- `survey:suggest_generating`
- `survey:suggest_ready`
- `survey:suggest_failed`
- `eval:summary_generating`
- `eval:summary_ready`
- `eval:analyzing`
- `eval:analysis_ready`
- `candidate:analyze_progress`
- `candidate:upload_progress`

## 7. AI subsystem

Service: `AiService`

AI provider:

- Dùng `@anthropic-ai/claude-agent-sdk` qua `query(...)`.
- `callClaude()` dùng:
  - `tools=[]`
  - `permissionMode='bypassPermissions'`
  - `allowDangerouslySkipPermissions=true`
  - `persistSession=false`
  - `maxTurns=1`
- `analyzeFileDirectly()` dùng tool `Read`, `maxTurns=5`.

Prompt resolution:

1. Check in-memory cache theo prompt key.
2. Load active prompt từ `ai_prompts`.
3. Load override từ `ai_model_overrides`.
4. Fallback về `PROMPT_DEFAULTS`.
5. Resolve shorthand model `haiku`, `sonnet`, `opus` hoặc exact key.

Methods:

| Method | Mục đích | Failure behavior |
| --- | --- | --- |
| `enrichParsedProfile` | Parse CV raw text thành `ParsedProfile` | Return `null` |
| `analyzeFileDirectly` | Fallback đọc PDF/DOCX trực tiếp | Return `null` |
| `suggestQuestions` | Gợi ý questions từ profile | Return `[]` |
| `generateEvaluationSummary` | Tạo summary tiếng Việt | Throw `InternalServerErrorException` |
| `generateSurveyQuestions` | Tạo diagnostic survey | Return `[]` |
| `suggestQuestionsFromSurvey` | Gợi ý questions từ profile + survey | Return `[]` |
| `suggestNextQuestion` | Gợi ý câu tiếp theo | Return `null` |
| `generateAiEvaluation` | Gợi ý BM04 ratings | Throw `InternalServerErrorException` |
| `detectProfileAnomalies` | Phát hiện bất thường profile | Return `null` |

JSON parsing:

- `extractJson()` strip markdown fence ```json nếu có, sau đó `JSON.parse`.

## 8. File parser

Service: `FileParserService`

Supported extensions:

- `.pdf`: `pdf-parse`, reject file > 20MB, extract raw text, basic email/phone/skills.
- `.docx`: `mammoth.extractRawText`, extract raw text, basic email/phone/skills.
- `.xlsx`: `exceljs`, ưu tiên worksheet `Template`, nếu không có dùng first worksheet.

XLSX parser:

- Extract một số field theo label tiếng Việt/không dấu:
  - name
  - phone
  - email
  - experienceByLanguage
  - techstack
  - architecture
  - scale
  - xlsxLevel
  - birthYear
  - xlsxEducation
  - xlsxCompanies
- Build `rawText` từ các field đã extract để đưa vào AI như text corpus.

Basic text parser:

- Email regex.
- Phone regex Vietnam format.
- Detect tech keywords như JavaScript, TypeScript, Python, Java, Go, Node.js, React, NestJS, Docker, Kubernetes, AWS, PostgreSQL, Redis, Kafka, GraphQL, Microservices, Git.

## 9. Seed data

Seed tự chạy khi module init:

- `QuestionsService.onModuleInit()` seed `questions.yaml`.
- `CategoriesService.onModuleInit()` seed `categories.yaml`.
- `PositionsService.onModuleInit()` seed `positions.yaml`.
- `LevelsService.onModuleInit()` seed `levels.yaml`.
- `AiPromptsService.onModuleInit()` seed built-in `PROMPT_DEFAULTS`.

Quy tắc seed:

- Nếu record chưa tồn tại thì tạo mới.
- Nếu record tồn tại và `isCustomized=false`, update theo seed.
- Nếu `isCustomized=true`, giữ chỉnh sửa của admin.

Dữ liệu seed chính:

- Levels: `ENTRY`, `EXPERIENCED`, `SENIOR`, `SPECIALIST`.
- Positions: Backend, Frontend, Fullstack, DevOps, QA, Mobile iOS/Android, Data Engineer, Security Engineer.
- Categories:
  - `BACKEND_MUST`
  - `BACKEND_SHOULD`
  - `SOFT_SKILL`
  - `PERSONALITY`
- Question bank: 250 câu trong `questions.yaml`.

## 10. Notification scheduler

Module: `NotificationModule`

Components:

- `NotificationService`
- `SchedulerService`

Behavior:

- `SchedulerService` chạy cron mỗi phút.
- Tìm sessions có `scheduledAt` trong khoảng 5 đến 6 phút từ hiện tại.
- Gửi Telegram notification tới `TELEGRAM_ADMIN_CHAT_IDS`.
- Cache session đã notify trong memory bằng `Set`.
- Nếu set > 1000 thì clear cache để tránh memory leak.

Telegram message gồm:

- Candidate name.
- Position.
- Level.
- Scheduled time theo timezone `Asia/Ho_Chi_Minh`.
- Meeting link.

Nếu thiếu token/chat IDs, notification bị disable và chỉ log warning.

## 11. Migration

Migration chuẩn trong `apps/backend/src/migrations`:

- `1743724800000-RenameQuestionCategoryToBackend`
  - Đổi `questions.category` từ enum sang varchar.
  - Rename `TECHNICAL_MUST` thành `BACKEND_MUST`.
  - Rename `TECHNICAL_SHOULD` thành `BACKEND_SHOULD`.
  - Update `categories`.
  - Update key trong `interview_sessions.categoryRatings`.
- `1744893600000-AddSlugToSession`
  - Add `slug` vào `interview_sessions`.
  - Backfill slug từ candidate name + createdAt + accessToken.
  - Tạo unique index.

Lưu ý: source có thêm file migration scheduling ở `apps/backend/apps/backend/src/migrations/1776308195039-AddSchedulingFieldsToSession.ts`, nhưng đường dẫn này không nằm trong `apps/backend/src/migrations` và không khớp include trong TypeORM config hiện tại.

## 12. Luồng nghiệp vụ chính

### 12.1 Upload và enrich candidate

1. User JWT upload PDF/DOCX/XLSX vào `/api/candidates/upload`.
2. Backend lưu file vào `UPLOAD_DIR`.
3. Parser extract raw text và regex fields.
4. Nếu update candidate cũ, backend đọc thêm file bổ sung đã lưu để AI thấy đủ CV + XLSX.
5. Backend gọi AI `enrich_profile`.
6. Nếu không extract được text, backend thử `analyzeFileDirectly`.
7. Backend upsert candidate:
   - Theo `candidateId` nếu có.
   - Nếu không có `candidateId`, theo email extract được.
   - Nếu không có email hoặc chưa tồn tại, tạo candidate mới.
8. Emit upload progress qua WebSocket.

### 12.2 Tạo session phỏng vấn

1. User `ADMIN`, `INTERVIEWER` hoặc `HR` gọi `/api/sessions`.
2. Backend tạo access token và session slug.
3. Resolve position bằng `positionId` nếu có.
4. Với HR:
   - Auto assign question bank theo position categories và target level hierarchy.
   - Trả session không kèm questions.
5. Với non-HR:
   - Nếu có `questionIds`, tạo session questions theo input.
6. Backend auto-generate survey bằng AI trong background.
7. Session khởi đầu `DRAFT`, candidate view bị khóa (`candidateViewEnabled=false`).

### 12.3 Candidate làm survey và phỏng vấn

1. Candidate truy cập bằng `/api/sessions/access/:token`.
2. Nếu session còn draft:
   - Nếu chưa có survey hoặc survey đã answered hết, auto start.
   - Nếu survey còn unanswered, giữ draft.
3. Candidate lấy survey qua `/access/:token/survey`.
4. Candidate submit survey answers.
5. Nếu survey answered hết và session draft, backend auto start và gợi ý câu hỏi từ survey.
6. Interviewer activate questions hoặc enable candidate view.
7. Candidate submit answers/code.
8. Candidate complete session qua `/complete`.

### 12.4 Interviewer điều phối realtime

1. Interviewer connect socket với `sessionId`, role `interviewer`.
2. Candidate connect socket với `sessionId`, role `candidate`, `accessToken`.
3. Gateway relay typing/code/answer/architecture changes.
4. Interviewer active/deactive questions qua REST; gateway emit events để frontend cập nhật.
5. Anti-cheat events được ghi khi candidate hide tab, copy attempt hoặc multi-device.

### 12.5 Evaluation và export

1. Interviewer/Admin tạo evaluation cho session.
2. Evaluation default ratings lấy từ categories/subcategories.
3. Có thể generate AI summary.
4. Có thể generate full AI evaluation; backend persist suggestion vào evaluation.
5. Export Excel qua `/api/export/:sessionId`.

## 13. Lưu ý kỹ thuật và rủi ro hiện tại

- `TypeOrmModule` runtime đang `synchronize=true` trong khi Docker vẫn chạy migrations. Cần thống nhất strategy production.
- File migration scheduling nằm sai cây thư mục (`apps/backend/apps/backend/src/migrations`) so với TypeORM config.
- `.env.example` có `OPEN_REGISTRATION`, `AuthService.register()` tồn tại, nhưng không có endpoint register trong `AuthController`.
- `CreateSessionDto` mô tả `sequentialMode` default false, nhưng service tạo session dùng `dto.sequentialMode ?? true`.
- Session create luôn set `candidateViewEnabled=false`, nên candidate chưa thấy câu hỏi đến khi interviewer mở view.
- Một số tên param/body của session question dễ gây nhầm:
  - `/activate-questions` body `questionIds` thực tế được xử lý như `sessionQuestionIds`.
  - `/questions/:questionId` thực tế remove theo `sessionQuestionId`.
  - `/reactivate-question` body `questionId` thực tế là `sessionQuestionId`.
- `SubmissionsController` summary ghi interviewer/admin only, nhưng source chưa có `RolesGuard`.
- Code runner chỉ chạy JavaScript/TypeScript, chưa chạy hidden test cases, chưa dùng `timeLimit` và `memoryLimit` của question.
- Upload MIME filter cho phép `.xls`, nhưng `FileParserService.parseFile()` chưa support extension `.xls`.
- Candidate public session response đã che đáp án đúng và scoring guide, đây là behavior intentional.
- Notification scheduler lưu trạng thái đã notify trong memory, không bền vững qua restart/multi-instance.
- Một số comment/chuỗi trong source hiển thị mojibake khi đọc bằng terminal, nên cần kiểm tra encoding nếu chỉnh sửa text tiếng Việt trong source.

