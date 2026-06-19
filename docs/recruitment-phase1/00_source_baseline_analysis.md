# 00. Source Baseline Analysis - Recruitment Phase 1

## 1. Mục tiêu tài liệu

Tài liệu này ghi nhận hiện trạng source backend trước khi extend hệ thống thành Recruitment Core Backend Phase 1.

Đây là baseline kỹ thuật của source hiện tại, không phải tài liệu implement. Nội dung bên dưới chỉ phản ánh những gì đọc được từ source, package/config và các file liên quan tại thời điểm phân tích. Các file spec tiếp theo về module, database, API và workflow nên dựa trên baseline này để tránh làm lệch hoặc phá flow interview hiện có.

## 2. Source path đã phân tích

Source root đã phân tích:

```text
C:\Users\nguye\Downloads\auto cv\interview-assistant-master
```

| STT | Path | Tồn tại? | Vai trò | Ghi chú |
| --- | ---- | -------- | ------- | ------- |
| 1 | `apps/backend/src` | Có | Source backend NestJS | Chứa module, controller, service, entity, migrations, assets seed. |
| 2 | `apps/backend/src/main.ts` | Có | Bootstrap runtime | Global prefix, Swagger, CORS, Helmet, ValidationPipe, session middleware. |
| 3 | `apps/backend/src/app.module.ts` | Có | Root backend module | Import tất cả module chính, TypeORM, throttler. |
| 4 | `apps/backend/src/config/typeorm.config.ts` | Có | TypeORM CLI DataSource | Dùng cho migration command, `synchronize: false`. |
| 5 | `apps/backend/src/migrations` | Có | Migration chính | Có 2 migration trong đúng path. |
| 6 | `apps/backend/apps/backend/src/migrations` | Có nhưng lệch vị trí | Migration bị đặt sai root | Có `1776308195039-AddSchedulingFieldsToSession.ts`, không nằm trong `src/migrations`. |
| 7 | `apps/backend/package.json` | Có | Backend dependencies/scripts | NestJS, TypeORM, Claude SDK, file parser, Socket.IO, Telegram, Swagger. |
| 8 | `apps/backend/.env.example` | Có | Env sample | DB, JWT, upload, OAuth, Claude, Telegram. |
| 9 | `docker-compose.yml` | Có | Local/container runtime | Postgres, backend, frontend, volumes upload và pgdata. |
| 10 | `Dockerfile` | Có | Multi-stage build | Backend/frontend build, migration-and-start entrypoint. |
| 11 | `packages/shared/src/types` | Có | Shared TypeScript types | User, candidate, session, question, evaluation, submission, websocket events. |
| 12 | `apps/backend/src/auth` | Có | Auth/users/roles | JWT, local login, Google OAuth, user admin endpoints. |
| 13 | `apps/backend/src/candidates` | Có | Candidate profile và CV upload | CRUD, assignment, upload/parse/AI enrich, re-analyze. |
| 14 | `apps/backend/src/file-parser` | Có | File parser | PDF, DOCX, XLSX parser. |
| 15 | `apps/backend/src/ai` | Có | AI subsystem | Claude calls, prompt DB, model overrides, AI evaluation/survey. |
| 16 | `apps/backend/src/sessions` | Có | Interview session flow | Protected interviewer APIs và public candidate token APIs. |
| 17 | `apps/backend/src/notification` | Có | Interview reminder | Telegram + cron scheduler. |
| 18 | `apps/backend/src/websocket` | Có | Realtime/anti-cheat events | Socket.IO gateway. |

### Source gaps / Missing paths

| STT | Path / Module | Trạng thái | Ghi chú |
| --- | ------------- | ---------- | ------- |
| 1 | `apps/backend/src/applications` | Không tồn tại | Chưa có entity/module `Application` làm trung tâm recruitment flow. |
| 2 | `apps/backend/src/jobs` hoặc `job-descriptions` | Không tồn tại | Chưa có job/JD/job posting module. |
| 3 | `apps/backend/src/cv-documents` | Không tồn tại | Chưa có CV document version entity. |
| 4 | `apps/backend/src/cv-sanitization` | Không tồn tại | Chưa có quarantine/safe CV/malware scan pipeline. |
| 5 | `apps/backend/src/mapping` hoặc `mapping-results` | Không tồn tại | Chưa có CV-JD mapping module. |
| 6 | `apps/backend/src/form-sessions` hoặc `form-answers` | Không tồn tại | Chưa có pre-screening form session độc lập với interview session. |
| 7 | `apps/backend/src/audit-logs` | Không tồn tại | Chưa có audit log chính thức. |
| 8 | `apps/backend/src/channel-*` | Không tồn tại | Chưa có channel publishing/ingestion/bot module. |
| 9 | `apps/backend/src/notification/*.controller.ts` | Không tồn tại | Notification hiện chỉ là service/scheduler, không có API quản trị notification. |
| 10 | `apps/backend/src/migrations/1776308195039-AddSchedulingFieldsToSession.ts` | Không tồn tại ở đúng path | File có tồn tại nhưng nằm lệch ở `apps/backend/apps/backend/src/migrations`. |

## 3. Tổng quan source hiện tại

Backend hiện tại là hệ thống Interview Assistant phục vụ quản lý ứng viên, upload CV/profile, tạo interview session, chọn/ngân hàng câu hỏi, public candidate interview flow, chấm/evaluation BM04, export Excel và realtime interview monitoring.

| Hạng mục | Hiện trạng |
| -------- | ---------- |
| Tech stack | TypeScript, NestJS 10, pnpm workspace, Turbo, PostgreSQL, TypeORM. |
| Framework chính | NestJS với controller/service/module pattern. |
| Database | PostgreSQL. Docker compose dùng `postgres:14-alpine`. |
| ORM | TypeORM với `autoLoadEntities: true`. |
| Auth mechanism | Passport local + JWT bearer, Google OAuth 2.0, bcrypt password hash, role guard. |
| Role | `ADMIN`, `INTERVIEWER`, `HR`. |
| AI provider | Anthropic Claude qua `@anthropic-ai/claude-agent-sdk` và `@anthropic-ai/sdk`. |
| Realtime | Socket.IO qua `@nestjs/websockets` và `@nestjs/platform-socket.io`. |
| Upload/parser | Multer disk storage, PDF/DOCX/XLSX parser, AI enrich profile. |
| Notification | Telegram bot + `node-cron` scheduler cho interview reminder. |
| Monorepo | pnpm workspace gồm `apps/backend`, `apps/frontend`, `packages/shared`. |

## 4. Runtime, config và bootstrap

Bootstrap nằm ở `apps/backend/src/main.ts`.

Runtime chính:

| Hạng mục | Hiện trạng |
| -------- | ---------- |
| Global API prefix | `api`. |
| Swagger | `api/docs`, title `Interview Assistant API`, bearer auth enabled. |
| CORS | Origin từ `FRONTEND_URL`, fallback trong code là `http://localhost:4000`. `.env.example` dùng `http://localhost:3001`. |
| Helmet | Có `app.use(helmet())`. |
| ValidationPipe | Có global pipe, `whitelist: true`, `transform: true`, implicit conversion enabled. |
| Session/OAuth | `express-session` dùng `JWT_SECRET`, cookie secure khi production, `sameSite: strict`, maxAge 60s cho OAuth handshake. |
| Required env | `JWT_SECRET` bắt buộc, thiếu sẽ throw ở bootstrap. |
| Throttling | Global `ThrottlerGuard`, default 5000 requests/minute. Login override 5 requests/minute. |
| Database connection | `DATABASE_URL` từ env, TypeORM Postgres. |
| TypeORM runtime | `autoLoadEntities: true`, `synchronize: true`, `ssl: false`, pool config. |
| TypeORM migration config | `apps/backend/src/config/typeorm.config.ts`, entities `../**/*.entity`, migrations `../migrations`, `synchronize: false`. |
| Docker | Backend target chạy `migrate-and-start.sh`, sau migration thì `node dist/main`. |
| Docker volumes | `uploads:/app/uploads`, `pgdata:/var/lib/postgresql/data`. |

Biến môi trường quan trọng:

| Env | Vai trò | Ghi chú |
| --- | ------ | ------- |
| `DATABASE_URL` | PostgreSQL connection string | Dùng trong runtime và migration datasource. |
| `JWT_SECRET` | JWT signing và session secret | Required ở bootstrap. |
| `JWT_EXPIRES_IN` | JWT expiry | Dùng trong auth module/config. |
| `JWT_REFRESH_EXPIRES_IN` | Refresh expiry sample | Chưa thấy refresh token route/flow trong controller. |
| `PORT` | Backend port | Default 3000. |
| `UPLOAD_DIR` | Disk upload directory | Default `./uploads`. |
| `OPEN_REGISTRATION` | Registration flag sample | Có `RegisterDto` và service method, nhưng chưa thấy public register endpoint. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Google OAuth | Callback default trong strategy là `http://localhost:3002/api/auth/google/callback`. |
| `FRONTEND_URL` | CORS và OAuth redirect | Code fallback `4000`, env sample `3001`, docker frontend `3001`. |
| `ADMIN_EMAILS` | Auto-create admin on first Google login | Comma-separated. |
| `ANTHROPIC_API_KEY` | Claude AI credential | Dùng bởi Claude SDK/CLI environment. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_IDS` | Telegram notifications | Nếu thiếu thì notification disabled. |

Rủi ro nổi bật: runtime đang bật `synchronize: true` trong `AppModule`, trong khi migration datasource để `synchronize: false` và Docker có chạy migration trước start. Production nên dùng migration làm nguồn thay đổi schema, không nên để runtime tự sync vì có thể thay đổi schema ngoài kiểm soát hoặc che mất migration bị thiếu.

## 5. Module hiện có

| STT | Module / Area | Path thực tế | Vai trò hiện tại | Có thể tận dụng cho Recruitment Phase 1? | Ghi chú |
| --- | ------------- | ------------ | ---------------- | ---------------------------------------- | ------- |
| 1 | Auth / Users / Roles | `apps/backend/src/auth` | Login email/password, Google OAuth, user admin CRUD, JWT/role guard. | Có | Reuse làm identity/role nền, cần bổ sung policy cho public apply/webhook/audit. |
| 2 | Candidates | `apps/backend/src/candidates` | Candidate CRUD, ownership/assignee scope, upload/re-analyze profile. | Có, nhưng không nên làm flow center | Candidate nên giữ là hồ sơ ứng viên chung, Phase 1 thêm `Application`. |
| 3 | Uploads | `apps/backend/src/candidates`, `apps/backend/src/uploads` | Upload CV/profile và download uploaded file. | Reuse một phần | Cần tách storage/security/version/quarantine. |
| 4 | File Parser | `apps/backend/src/file-parser` | Parse PDF, DOCX, XLSX, extract basic info. | Reuse with minor change | Cần chuẩn hóa parser contract và thêm `.xls` hoặc bỏ accept `.xls`. |
| 5 | AI Service | `apps/backend/src/ai/ai.service.ts` | Enrich CV, direct file analysis, suggest questions/survey/evaluation/anomaly. | Reuse with minor change | Thêm prompt key cho CV-JD mapping, AI screening, final recommendation. |
| 6 | AI Prompts / Model Overrides | `apps/backend/src/ai` | DB prompt rows, seed defaults, admin APIs, model overrides. | Có | Good extension point cho prompt mới. |
| 7 | Questions | `apps/backend/src/questions` | Question bank, seed YAML, CRUD/admin, filter by category/level/type. | Có | Có thể reuse cho pre-screening question set nếu bổ sung taxonomy/metadata. |
| 8 | Categories / Subcategories | `apps/backend/src/categories` | Dynamic category/subcategory seed và admin CRUD. | Có | Có thể reuse để group question/mapping signals. |
| 9 | Positions | `apps/backend/src/positions` | Position seed/admin CRUD. | Reuse with minor change | Hiện là danh mục tên position, chưa phải JD/job. |
| 10 | Levels | `apps/backend/src/levels` | Level seed/admin CRUD, orderIndex hierarchy. | Có | Có thể reuse target level và screening level. |
| 11 | Sessions | `apps/backend/src/sessions` | Interview session lifecycle, candidate access token, survey, active questions. | Not used directly in early Phase 1 | Nên giữ cho phase sau, tránh sửa mạnh. |
| 12 | Session Questions | `apps/backend/src/sessions/entities/session-question.entity.ts` | Link session-question, answer/note/rating/submissions. | Not used directly in Phase 1 | Không nên dùng cho Application pre-screening nếu chưa vào interview flow. |
| 13 | Survey | `apps/backend/src/sessions` | AI diagnostic survey per interview session. | Reuse conceptually | Phase 1 nên tạo `form-sessions` riêng nếu là pre-screening apply flow. |
| 14 | Evaluations | `apps/backend/src/evaluations` | BM04 evaluation, AI summary/evaluation suggestion. | Sau HR Review | Có thể reuse sau khi Application chuyển sang interview/evaluation stage. |
| 15 | Export | `apps/backend/src/export` | Export BM04 Excel from evaluation/session/candidate. | Later phase | Hiện export interview evaluation, chưa export recruitment pipeline. |
| 16 | Notifications | `apps/backend/src/notification` | Telegram interview reminder scheduler. | Reuse limited | Cần extension cho email/form/channel/bot notification. |
| 17 | WebSocket Gateway | `apps/backend/src/websocket` | Interview realtime, upload/analyze/evaluation/survey events, anti-cheat. | Reuse limited | Có thể reuse progress events, nhưng application ingestion có thể cần event model khác. |
| 18 | Submissions / Code Runner | `apps/backend/src/submissions` | JS/TS code execution in VM sandbox, async result. | Not used in Phase 1 | Giữ nguyên cho interview coding flow. |
| 19 | Database / TypeORM config | `apps/backend/src/app.module.ts`, `apps/backend/src/config` | Runtime DB và migration datasource. | Có | Cần chuyển production sang migration-first. |
| 20 | Migrations | `apps/backend/src/migrations`, lệch path migration scheduling | Schema changes | Cần chỉnh quy trình trước implement | Có migration lệch path và runtime sync đang che gap. |

## 6. Entity/Data model hiện có

| STT | Entity/Table | Path entity | Vai trò hiện tại | Field chính | Quan hệ chính | Ghi chú khi extend |
| --- | ------------ | ----------- | ---------------- | ----------- | ------------- | ------------------ |
| 1 | `users` | `auth/entities/user.entity.ts` | User nội bộ | `id`, `email`, `name`, `password`, `role`, timestamps | Candidate creator/assignees, session creator, evaluation evaluator | Giữ nguyên; bổ sung policy/audit ngoài entity nếu cần. |
| 2 | `candidates` | `candidates/entities/candidate.entity.ts` | Hồ sơ ứng viên chung | `name`, `slug`, `email`, `phone`, `birthYear`, `position`, `level`, `resumeUrl`, `profileXlsxUrl`, `parsedProfile`, `analyzeStatus`, `createdById` | One-to-many sessions, many-to-one creator, many-to-many assignees | Reuse, nhưng không biến thành trung tâm recruitment. `Application` nên link candidate. |
| 3 | `candidate_assignees` | Join table trong `CandidateEntity` | Mapping candidate-user assignees | `candidateId`, `userId` | Candidate many-to-many User | Có thể reuse cho ownership visibility, cần cân nhắc application-level assignee. |
| 4 | `interview_sessions` | `sessions/entities/session.entity.ts` | Interview session | `candidateId`, `createdById`, `status`, `accessToken`, `slug`, `templatePosition`, `targetLevel`, `scheduledAt`, `meetingPlatform`, `meetingLink`, `sequentialMode`, `candidateViewEnabled`, `categoryRatings`, survey flags | Candidate, User, session questions | Giữ nguyên cho interview flow. Phase 1 chỉ link từ Application ở giai đoạn sau nếu cần. |
| 5 | `session_questions` | `sessions/entities/session-question.entity.ts` | Câu hỏi trong session | `sessionId`, `questionId`, `orderIndex`, `isActive`, `candidateAnswer`, `interviewerNote`, `rating`, `answeredAt` | Session, Question, CodeSubmissions | Không nên sửa mạnh trong Phase 1. |
| 6 | `session_survey_questions` | `sessions/entities/session-survey-question.entity.ts` | Survey chẩn đoán trong session | `sessionId`, `question`, `category`, `subcategory`, `purpose`, `choices`, `answer`, `orderIndex` | Session | Concept có thể tham khảo, nhưng pre-screening nên có form entity riêng. |
| 7 | `anti_cheat_events` | `sessions/entities/anti-cheat-event.entity.ts` | Ghi tab hidden/copy/multi-device | `sessionId`, `type`, `metadata`, `createdAt` | Session | Giữ cho interview. Không thay audit log recruitment. |
| 8 | `questions` | `questions/entities/question.entity.ts` | Question bank | `category`, `subcategory`, `competencyType`, `text`, `difficulty`, `targetLevels`, `type`, options/test cases/starter code/architecture, `code`, active/customized flags | Linked by session questions | Reuse cho question bank/pre-screening, có thể cần metadata source/usage. |
| 9 | `evaluations` | `evaluations/entities/evaluation.entity.ts` | BM04 evaluation | `sessionId`, `evaluatorId`, HR fields, technical/soft/personality ratings, result, AI summary/suggestion/status | Session, User | Reuse sau interview/HR review; không dùng làm AI screening result của Application. |
| 10 | `code_submissions` | `submissions/entities/code-submission.entity.ts` | Candidate code submission | `sessionQuestionId`, `language`, `code`, `status`, `results`, `aiEvaluation`, `submittedAt` | SessionQuestion | Không dùng trong recruitment intake Phase 1. |
| 11 | `categories` | `categories/entities/category.entity.ts` | Category taxonomy | `name`, `displayName`, `description`, `orderIndex`, `isCustomized`, `positions` | Logical parent for subcategories via `categoryId` | Reuse; hiện không có explicit FK relation trong entity. |
| 12 | `sub_categories` | `categories/entities/sub-category.entity.ts` | Subcategory taxonomy | `categoryId`, `name`, `orderIndex`, `competencyType`, `isCustomized` | Category by ID only | Reuse; nếu mở rộng nên cân nhắc relation/constraints. |
| 13 | `positions` | `positions/entities/position.entity.ts` | Position catalog | `name`, `description`, `isActive`, `isCustomized` | Session can resolve by `positionId` at create time only | Reuse as catalog, không đủ thay thế Job/JD. |
| 14 | `levels` | `levels/entities/level.entity.ts` | Level catalog | `name`, `displayName`, `orderIndex`, `isActive`, `isCustomized` | Used by session/question filtering | Reuse as level taxonomy. |
| 15 | `ai_prompts` | `ai/entities/ai-prompt.entity.ts` | Prompt config DB | `key`, `name`, `description`, `systemPrompt`, `model`, active/customized flags | Used by AiService | Good extension point. Thêm prompt keys mới thay vì hardcode. |
| 16 | `ai_model_overrides` | `ai/entities/ai-model-override.entity.ts` | Per-prompt model override | `promptKey`, `model` | Used by AiService prompt resolution | Reuse. |

Entity chưa có và cần thêm mới cho Recruitment Phase 1: `applications`, `jobs/job_descriptions`, `job_postings`, `cv_documents`, `mapping_results`, `form_sessions`, `form_answers`, `ai_screening_results`, `hr_reviews`, `workflow_state_history`, `audit_logs`, channel/webhook/bot related tables.

## 7. API hiện có

| STT | Controller | Path controller | Base path | Method/Path chính | Auth/Role | Vai trò | Có dùng lại cho Phase 1? |
| --- | ---------- | --------------- | --------- | ----------------- | --------- | ------- | ------------------------ |
| 1 | AuthController | `auth/auth.controller.ts` | `/api/auth` | `POST /login`, `GET /me`, `GET /users/assignable`, `GET/POST/PUT/DELETE /users`, `GET /google`, `GET /google/callback` | Login throttled; user management ADMIN; Google via Passport | Auth/user management | Reuse. |
| 2 | CandidatesController | `candidates/candidates.controller.ts` | `/api/candidates` | CRUD, `PATCH /:idOrSlug/assign`, `POST /:idOrSlug/analyze`, `POST /upload`, `POST /backfill-slugs` | Class JWT; delete/backfill role guarded; most methods scope by owner/admin | Candidate profile and upload | Reuse candidate profile, not central application flow. |
| 3 | UploadsController | `uploads/uploads.controller.ts` | `/api/uploads` | `GET /:filename` | JWT + Roles ADMIN/INTERVIEWER/HR | Download uploaded file | Reuse only after stronger file access rules. |
| 4 | SessionsController | `sessions/sessions.controller.ts` | `/api/sessions` | Protected CRUD, survey, activate questions, candidate view, anti-cheat/client-info | JWT; mutating interview controls ADMIN/INTERVIEWER, create/update includes HR | Interview session orchestration | Preserve; avoid modifying for Phase 1 intake. |
| 5 | Public Candidate Session APIs | `sessions/sessions.controller.ts` | `/api/sessions/access/:token` | `GET /`, `POST /submit`, `POST /complete`, submissions, survey answers | Public token; only GET has explicit throttle 5000/min | Candidate public interview access | Pattern useful, but Phase 1 form token should be separate. |
| 6 | QuestionsController | `questions/questions.controller.ts` | `/api/questions` | CRUD, list filters, seed/reset | JWT; mutations ADMIN | Question bank | Reuse. |
| 7 | CategoriesController | `categories/categories.controller.ts` | `/api/categories`, `/api/sub-categories` | CRUD, seed/reset, filter categories by position | JWT; mutations ADMIN | Taxonomy | Reuse. |
| 8 | PositionsController | `positions/positions.controller.ts` | `/api/positions` | List, create/update/delete/reset/seed | JWT; mutations ADMIN | Position catalog | Reuse as catalog, add Job/JD separately. |
| 9 | LevelsController | `levels/levels.controller.ts` | `/api/levels` | List, create/update/delete/reset | JWT; mutations ADMIN | Level catalog | Reuse. |
| 10 | EvaluationsController | `evaluations/evaluations.controller.ts` | `/api/evaluations` | Create/list/get/update/delete, AI summary, AI evaluation | JWT; mutations/AI ADMIN/INTERVIEWER | Interview evaluation | Reuse after screening/interview handoff. |
| 11 | ExportController | `export/export.controller.ts` | `/api/export` | `GET /:sessionId` | JWT | Export BM04 Excel | Later phase. |
| 12 | SubmissionsController | `submissions/submissions.controller.ts` | `/api/submissions` | `POST /`, `GET /`, `GET /:id` | JWT | Interviewer/admin code submissions | Not needed for Phase 1 intake. |
| 13 | AI PromptsController | `ai/ai-prompts.controller.ts` | `/api/ai-prompts` | `GET /models`, list, update prompt, seed defaults | JWT + ADMIN | Prompt management | Reuse. |
| 14 | AI Model OverridesController | `ai/ai-model-overrides.controller.ts` | `/api/ai-model-overrides` | models, list, upsert/delete/reset override | JWT + ADMIN | Per-prompt model selection | Reuse. |

## 8. Upload và File Parser hiện tại

Endpoint upload chính:

| Hạng mục | Hiện trạng |
| -------- | ---------- |
| Endpoint | `POST /api/candidates/upload`. |
| Auth | Class-level `JwtAuthGuard`; không có `RolesGuard` riêng trên upload. |
| Multipart field | `files`, tối đa 20 files do `FilesInterceptor('files', 20)`. |
| File size | 20MB/file trong Multer; PDF parser cũng check 20MB. |
| Accepted MIME | PDF, DOCX, `application/vnd.ms-excel`, XLSX. |
| Storage | Disk storage qua Multer, destination `UPLOAD_DIR` hoặc `./uploads`, filename `Date.now-random.ext`. |
| Public URL lưu DB | `/uploads/{filename}` trong `resumeUrl` hoặc `profileXlsxUrl`. |
| Download | `GET /api/uploads/:filename`, role ADMIN/INTERVIEWER/HR, block path traversal. |

Parser:

| File type | Parser | Hiện trạng |
| --------- | ------ | ---------- |
| PDF | `pdf-parse` | Extract text, reject empty text with error, regex email/phone/skills. |
| DOCX | `mammoth.extractRawText` | Extract raw text, regex email/phone/skills. |
| XLSX | `exceljs` | Read sheet `Template` nếu có, fallback first sheet, extract labels tiếng Việt/English như họ tên, SĐT, email, kinh nghiệm, techstack, kiến trúc, level, birth year, education, company; build `rawText`. |
| XLS | Không hỗ trợ trong `FileParserService` | MIME được accept nhưng parser switch không có `.xls`. |

Upload flow:

1. Parse từng file mới và emit `UPLOAD_PROGRESS` nếu có `socketId`.
2. Nếu upload vào candidate có sẵn, đọc thêm file complementary đang lưu để AI thấy đủ CV + XLSX.
3. Merge raw text và regex fields.
4. Nếu text extraction fail hoàn toàn, thử `AiService.analyzeFileDirectly` với PDF/DOCX.
5. Gọi `AiService.enrichParsedProfile`.
6. Upsert một candidate theo `candidateId` hoặc email extracted.

Khoảng thiếu so với CV processing Phase 1:

| Gap | Hiện trạng |
| --- | ---------- |
| Quarantine storage | Chưa có. File được lưu thẳng vào upload storage dùng chung. |
| Clean CV / safe CV version | Chưa có. |
| Malware scan | Chưa có. |
| CV document version entity | Chưa có. Candidate chỉ có `resumeUrl`, `profileXlsxUrl`, `parsedProfile`. |
| Application-centric upload | Chưa có. Upload xoay quanh `Candidate`, không xoay quanh `Application`. |
| File ownership download | Download chỉ check role và filename traversal, chưa check candidate/application ownership. |
| Idempotent upload/import | Chưa có job/import idempotency key. Upsert dựa vào email hoặc candidateId. |
| Parser contract | Chưa có explicit versioned parser result contract. |
| `.xls` | Được accept theo MIME nhưng parser không support extension `.xls`. |

## 9. AI subsystem hiện tại

AI provider/library:

| Hạng mục | Hiện trạng |
| -------- | ---------- |
| Provider | Claude/Anthropic. |
| Library | `@anthropic-ai/claude-agent-sdk`, thêm `@anthropic-ai/sdk`; Docker backend cài global `@anthropic-ai/claude-code`. |
| Prompt defaults | `apps/backend/src/assets/seed/ai-prompts.yaml`. |
| Prompt DB | `ai_prompts`, seed/update/reset qua `AiPromptsService`. |
| Model override | `ai_model_overrides`, key theo `promptKey`, ưu tiên override > prompt row > default. |
| Cache | `AiService` cache prompt/model theo key trong memory; admin update/reset clear cache. |
| JSON parsing | `extractJson` strip code fence rồi `JSON.parse`. Không có schema validator. |

Prompt keys hiện có:

| Prompt key | Mục đích hiện tại |
| ---------- | ----------------- |
| `enrich_profile` | Enrich CV/profile thành JSON profile. |
| `suggest_questions` | Suggest questions từ candidate profile + level/position. |
| `evaluation_summary` | Generate summary cho evaluation. |
| `evaluate_session` | Suggest BM04 ratings từ transcript/session/survey. |
| `generate_survey_questions` | Generate diagnostic survey questions. |
| `suggest_questions_from_survey` | Suggest interview questions từ survey answers. |
| `suggest_next_question` | Suggest next question dựa trên rated/unrated questions. |
| `detect_profile_anomalies` | Detect anomaly/risk trong profile. |

AI methods hiện có:

| Method | Reuse cho Phase 1 |
| ------ | ----------------- |
| `enrichParsedProfile` | Reuse cho CV parsing/enrich. Cần contract JSON chặt hơn và idempotency. |
| `analyzeFileDirectly` | Reuse fallback cho PDF/DOCX image/parse fail, nhưng cần sandbox/security review. |
| `detectProfileAnomalies` | Có thể reuse thành risk signals trong screening. |
| `suggestQuestions`, `suggestQuestionsFromSurvey` | Reuse sau khi tạo question set/pre-screening. |
| `generateSurveyQuestions` | Concept reuse, nhưng entity form nên tách khỏi interview session. |
| `generateEvaluationSummary`, `generateAiEvaluation` | Reuse sau interview/HR review, không phải first-pass screening. |
| `suggestNextQuestion` | Giữ cho interview flow. |

Cần bổ sung cho Recruitment Phase 1:

- Prompt `map_cv_to_jd` hoặc tương đương.
- Prompt `ai_screening` / `final_screening_recommendation`.
- JSON output contract có schema/version, confidence, evidence, missing fields, decision reasons.
- Error handling phân biệt provider failure, parse failure, schema invalid, retryable/non-retryable.
- Idempotency theo `applicationId`, `cvDocumentId`, `jobDescriptionVersion`.
- Lưu AI request/result metadata để audit và replay.

## 10. Interview/session/evaluation hiện tại

Interview flow hiện tại:

| Flow | Hiện trạng |
| ---- | ---------- |
| Tạo session | `POST /api/sessions`, cần `candidateId`, sinh `accessToken` và `slug`, resolve `positionId` nếu có. |
| Question assignment | HR auto-assign theo position categories + target level; non-HR dùng `questionIds`. |
| Survey | Auto-generate survey sau create session; có protected APIs để generate/get/save/suggest/activate; public APIs để candidate get/submit answers. |
| Public candidate access | `GET /api/sessions/access/:token`, chỉ trả active questions, auto-start khi survey đã trả lời hoặc không có survey. |
| Active question | Interviewer activate/deactivate/force/bulk/reactivate, candidate view toggle. |
| Candidate answer | `POST /api/sessions/access/:token/submit` ghi answer vào active session question. |
| Code submission | Public token endpoint tạo submission, validate session question active; service chạy JS/TS trong Node `vm` sandbox. |
| Evaluation | `evaluations` CRUD, default ratings từ categories/subcategories, AI summary và AI evaluation. |
| Export Excel | `GET /api/export/:sessionId`, fill BM04 Excel template bằng JSZip. |
| Realtime | Socket.IO events cho typing, code, answer, activation, survey, eval, upload/analyze progress. |
| Anti-cheat | WebSocket ghi tab hidden, copy attempt, multi-device detected. |

Phase 1 chưa cần động tới:

- Code runner/submissions.
- Active question orchestration.
- Candidate public interview token flow.
- BM04 export internals.
- Session question/evaluation schema.

Có thể tận dụng sau HR Review:

- Tạo session từ Application khi HR approve.
- Reuse candidate profile, parsed profile, question bank, levels/positions.
- Reuse evaluation/export khi Application đi vào interview evaluation.

Cần tránh sửa mạnh:

- `interview_sessions`, `session_questions`, `sessions.service.ts` public token behavior.
- WebSocket anti-cheat and active-question events.
- BM04 evaluation/export mapping.

## 11. Notification/WebSocket hiện tại

Notification hiện tại:

| Hạng mục | Hiện trạng |
| -------- | ---------- |
| Provider | Telegram bot qua `node-telegram-bot-api`. |
| Config | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_IDS`. |
| Scheduler | `node-cron`, chạy mỗi phút. |
| Trigger | Query session có `scheduledAt` trong khoảng 5-6 phút tới. |
| Dedup | In-memory `Set<string> notifiedSessionIds`. |
| Cleanup | Clear set khi size > 1000; comment nói tránh memory leak nhưng `oneHourAgo` không được dùng. |
| Scope | Interview reminder, chưa phải notification platform tổng quát. |

WebSocket hiện tại:

| Hạng mục | Hiện trạng |
| -------- | ---------- |
| Gateway | `InterviewWebSocketGateway`, namespace `/`. |
| Room | `session:{sessionId}`. |
| Candidate connection | Cần `sessionId`, `role=candidate`, `accessToken`; async validate token-session pair. |
| Interviewer connection | Join room, track interviewer map, emit `interviewers:updated`. |
| In-memory state | Candidate socket map, interviewer map. |
| Anti-cheat | Multi-device kicks old candidate socket, records `MULTI_DEVICE_DETECTED`; tab hidden/copy attempt saved to DB. |
| Main events | Activation/deactivation, candidate typing/code/answer/architecture, survey generation/suggestion, evaluation AI, upload/analyze progress, code execution completed. |

Khả năng reuse cho Recruitment Phase 1:

- Reuse progress event style cho CV processing hoặc AI screening nếu cần realtime dashboard.
- Không nên reuse trực tiếp session room model cho application ingestion/form/channel, vì hiện model bám interview session.
- Notification cần mở rộng provider và persistence nếu dùng cho email/form/channel/bot.

## 12. Security và role hiện tại

| Hạng mục | Hiện trạng |
| -------- | ---------- |
| Role hiện tại | `ADMIN`, `INTERVIEWER`, `HR`. |
| Guard | `JwtAuthGuard`, `RolesGuard`, `LocalAuthGuard`, Google `AuthGuard('google')`, global `ThrottlerGuard`. |
| Auth | JWT bearer, local password, Google OAuth. |
| Password | bcrypt hash. |
| Public token | `interview_sessions.accessToken`, nanoid 24, unique, used for candidate public APIs. |
| Upload download | Role-gated download by filename; path traversal blocked. |
| Rate limit | Global 5000/min; login 5/min; public `GET /sessions/access/:token` 5000/min; public submit/complete/submissions/survey answers rely on global limit. |

Endpoint/role observations:

| Area | Observation |
| ---- | ----------- |
| Auth users | Admin-only CRUD for users; assignable users visible to any authenticated user. |
| Candidates | Controller class has JWT only. Create/update/assign/analyze/upload available to authenticated users, with service-level scope for candidate access where applicable. |
| Sessions | Create/update allow ADMIN/INTERVIEWER/HR; delete and question controls are ADMIN/INTERVIEWER. HR list/read hides questions in some paths. |
| Questions/categories/positions/levels | Read for authenticated users, mutation mostly ADMIN. |
| Evaluations | Read all evaluations for authenticated users; create/update/delete/AI actions ADMIN/INTERVIEWER. |
| Upload download | Any ADMIN/INTERVIEWER/HR can fetch any upload filename if known; no candidate/application ownership check. |
| Public token APIs | No JWT, no captcha, no per-token strict rate limit, token grants access to active interview actions. |

Điểm cần chú ý khi extend:

- Candidate apply public endpoint cần rate limit thấp hơn, captcha/bot detection nếu public internet.
- Form session token nên tách khỏi interview access token.
- Channel webhook cần signature verification/replay protection.
- File upload cần malware scan, quarantine, safe-file serving, file ownership.
- Audit log cần ghi actor, action, object, source channel, AI decision.
- Public endpoints cần idempotency để tránh duplicate application.

## 13. Rủi ro kỹ thuật hiện tại

| STT | Rủi ro | Mô tả | Ảnh hưởng đến Phase 1 | Đề xuất xử lý |
| --- | ------ | ----- | --------------------- | ------------- |
| 1 | Runtime `synchronize=true` | `AppModule` bật TypeORM synchronize trong runtime. | Có thể tự mutate schema và che lỗi migration, rủi ro production. | Tắt synchronize cho production; dùng migration-first. |
| 2 | Migration path/config không đồng nhất | DataSource dùng `src/migrations`, nhưng có migration scheduling nằm lệch trong `apps/backend/apps/backend/src/migrations`. | Schema production có thể thiếu `scheduledAt`, `meetingPlatform`, `meetingLink` nếu sync tắt. | Di chuyển/chuẩn hóa migration path trong spec/migration plan sau, không sửa ở baseline. |
| 3 | Upload `.xls` accepted nhưng parser không support | Multer accept `application/vnd.ms-excel`, `FileParserService` không có case `.xls`. | CV upload `.xls` có thể fail parse hoặc tạo trải nghiệm không ổn định. | Bỏ accept `.xls` hoặc thêm parser/conversion trong CV processing spec. |
| 4 | Session question param dễ nhầm | Route `DELETE /sessions/:id/questions/:questionId` gọi service `removeQuestion(sessionId, sessionQuestionId)`; `reactivate-question` body `questionId` cũng dùng như session question id. | Dễ implement nhầm khi extend UI/API. | Spec tiếp theo nên chuẩn hóa naming `sessionQuestionId`. |
| 5 | Role guard chưa đồng nhất theo business intent | Một số candidate/upload APIs chỉ JWT, không role guard; read evaluations cho mọi authenticated user. | Phase 1 cần rõ role HR/recruiter/interviewer/admin. | Lập authorization matrix trước implement. |
| 6 | Public endpoints rate limit cao | Global 5000/min và nhiều public submit endpoint không có throttle override. | Public apply/form/channel có nguy cơ abuse. | Thêm stricter throttling, captcha, idempotency, webhook signature. |
| 7 | Notification scheduler lưu state memory | `notifiedSessionIds` chỉ memory, clear khi >1000, không bền vững multi-instance. | Không phù hợp production notification workflow. | Dùng DB/Redis notification log nếu mở rộng. |
| 8 | File storage chưa quarantine/safe split | Upload lưu thẳng vào shared disk, download theo filename. | Không đủ an toàn cho public CV intake. | Thiết kế quarantine, scan, clean copy, signed access. |
| 9 | AI JSON parse chưa có schema validator | `JSON.parse` sau strip fence; không validate version/shape. | Mapping/screening dễ fail hoặc lưu output sai schema. | Dùng schema validator và persisted error state. |
| 10 | AI direct file read cần security review | Claude Agent SDK được gọi với Read tool và bypass permission trong direct analysis. | Cần đảm bảo chỉ đọc file upload hợp lệ. | Chỉ cho phép path nằm trong upload/quarantine, validate ownership. |
| 11 | Env mismatch frontend URL | Code fallback CORS `4000`, env sample/frontend Docker `3001`, Google callback default `3002`. | Dễ lỗi OAuth/CORS ở môi trường mới. | Chuẩn hóa env matrix trong deployment spec. |
| 12 | Register/env không khớp route | `.env.example` có `OPEN_REGISTRATION`, service có `register`, nhưng controller không expose register endpoint. | Dễ hiểu nhầm capability khi thiết kế user onboarding. | Ghi rõ auth behavior trong API contract. |
| 13 | Encoding/comment tiếng Việt | Source đọc bằng UTF-8 ổn, có nhiều comment/text tiếng Việt; pasted request ban đầu bị mojibake khi đọc default PowerShell. | Tài liệu/spec cần thống nhất UTF-8. | Lưu docs UTF-8 và tránh tool đọc default legacy encoding. |

## 14. Khả năng reuse cho Recruitment Phase 1

| Existing capability | Reuse level | Cách tận dụng | Cần bổ sung |
| ------------------- | ----------- | ------------- | ----------- |
| Auth/User/Role | Reuse with minor change | Dùng user/role/JWT/OAuth hiện có cho internal users. | Authorization matrix, audit, public/webhook auth. |
| Candidate management | Reuse with minor change | Giữ Candidate là reusable profile. | Thêm `Application` link candidate-job-source. |
| CV upload | Refactor required | Tận dụng parser/upload flow hiện có làm service nền. | Application-centric upload, quarantine, malware scan, versioning. |
| File parser | Reuse with minor change | Reuse PDF/DOCX/XLSX extraction. | `.xls` handling, parser result contract, error states. |
| AI enrich profile | Reuse with minor change | Reuse `enrich_profile`, anomaly detection. | Schema validation, idempotency, persisted AI run metadata. |
| Question bank | Reuse with minor change | Dùng cho pre-screening/interview questions. | Gắn usage type, question set/form mapping nếu cần. |
| Position/Level | Reuse with minor change | Dùng catalog và level hierarchy. | Job/JD versioning, posting metadata. |
| Session survey | Refactor required | Tham khảo concept diagnostic survey. | Tạo form-session/form-answer riêng cho recruitment intake. |
| Evaluation | Not used in Phase 1 | Giữ cho interview/evaluation sau HR review. | Link Application -> Session/Evaluation ở phase sau. |
| Notification | Refactor required | Reuse Telegram/service pattern nếu cần. | Provider abstraction, templates, delivery log, email/bot/channel. |
| Export | Not used in Phase 1 | Giữ BM04 export. | Recruitment pipeline export nếu yêu cầu sau. |
| WebSocket | Reuse with minor change | Reuse progress events cho upload/AI dashboard. | Room/event model cho application/job/process. |
| Upload download | Refactor required | Có thể giữ route serving nội bộ. | Ownership checks, signed URLs, safe file serving. |

## 15. Các module mới cần thêm cho Recruitment Phase 1

| Module | Có source hiện tại tương tự không? | Cần tạo mới hay extend? | Ghi chú |
| ------ | ---------------------------------- | ----------------------- | ------- |
| `jobs` / `job-descriptions` | Có `positions` tương tự catalog | Tạo mới | `positions` không đủ thay thế JD/version/requirements. |
| `job-postings` | Không | Tạo mới | Quản lý posting public/internal, trạng thái publish. |
| `channel-publishing` | Không | Tạo mới | Publish job lên channel, lưu payload/status. |
| `channel-candidate-ingestion` | Không | Tạo mới | Nhận candidate/application từ channel/webhook/form. |
| `channel-bot` | Có Telegram notification rất hạn chế | Tạo mới hoặc extension riêng | Telegram hiện chỉ send reminder, chưa có bot ingestion. |
| `applications` | Không | Tạo mới | Entity trung tâm Phase 1, link candidate, job, source, status. |
| `cv-documents` | Candidate có `resumeUrl/profileXlsxUrl` | Tạo mới | Versioned CV, original/quarantine/clean file refs. |
| `cv-sanitization` | Không | Tạo mới | Malware scan, clean copy, safe text extraction. |
| `mapping` | Không | Tạo mới | Orchestrate CV-JD mapping job. |
| `mapping-results` | Không | Tạo mới | Persist score/evidence/gaps per application/JD version. |
| Question-bank extension | Có `questions/categories/levels` | Extend | Thêm usage type/pre-screening set nếu cần. |
| `form-sessions` | Có session survey tương tự concept | Tạo mới | Không reuse interview session token cho apply form. |
| `form-answers` | Có `session_survey_questions.answer` | Tạo mới | Answers phải link application/form schema. |
| `ai-screening` | Có AI service/prompt infra | Tạo mới + reuse AI infra | Prompt/result contract riêng. |
| `hr-review` | Có evaluations | Tạo mới | HR review khác BM04 interview evaluation. |
| `workflow-state` | Có `SessionStatus` | Tạo mới | Application workflow state/history riêng. |
| `audit-logs` | Anti-cheat events có một phần | Tạo mới | Audit business/security actions. |
| notifications extension | Có notification service | Extend/refactor | Thêm provider/templates/delivery log. |
| `amis-integration` | Không | Có thể để sau Phase 1 | Nếu Phase 1 chưa sync, chỉ giữ extension point. |

## 16. Extension points đề xuất

- Không biến `Candidate` thành trung tâm flow. Candidate hiện đang là hồ sơ ứng viên dùng chung, đã có upload/session relations và ownership logic.
- Thêm `Application` làm entity trung tâm cho Recruitment Phase 1, link `candidateId`, `jobId`, source channel, workflow status, current CV document, mapping/screening result.
- Giữ `Candidate` là hồ sơ ứng viên dùng chung, có thể deduplicate theo email/phone nhưng không gắn trực tiếp mọi trạng thái tuyển dụng vào Candidate.
- CV upload mới nên đi qua `Application` và tạo `CvDocument` version trước, sau đó mới update candidate profile nếu cần.
- Source upload/parse hiện tại có thể refactor về service dùng chung ở phase implement, nhưng baseline này không sửa code.
- AI service hiện tại nên được reuse bằng prompt key mới, không hardcode prompt trong module mới.
- Question bank hiện tại có thể reuse cho pre-screening question set bằng metadata/usage mapping.
- Session/evaluation hiện tại giữ lại cho phase sau, chỉ tạo link từ Application sang Session khi candidate được chuyển sang interview.
- Notification nên thêm abstraction mới thay vì gắn thêm quá nhiều logic vào Telegram reminder scheduler.
- Public endpoints mới cần token/captcha/rate-limit/idempotency riêng, không dùng lại `interview_sessions.accessToken`.

## 17. Kết luận baseline

Source hiện tại phù hợp để extend thành Recruitment Core Backend Phase 1 ở mức có nền tảng tốt: NestJS module structure rõ, Postgres/TypeORM sẵn, auth/role có sẵn, candidate profile và CV parsing/AI enrichment đã tồn tại, question bank/taxonomy/level/position có thể reuse, AI prompt/model override là extension point tốt.

Những phần có thể reuse:

- Auth/User/Role.
- Candidate profile, assignee/ownership scope.
- File parser PDF/DOCX/XLSX và AI enrich profile.
- AI prompt/model override infrastructure.
- Question bank, categories/subcategories, levels, positions.
- Một phần WebSocket progress event pattern.

Những phần bắt buộc cần thêm mới:

- `Application` làm trung tâm recruitment flow.
- Job/JD/job posting.
- CV document versioning, quarantine/safe storage, malware scan.
- CV-JD mapping và mapping results.
- AI screening result và HR review.
- Form session/form answer cho pre-screening/apply.
- Workflow state/history và audit log.
- Channel publishing/ingestion/bot.

Rủi ro cần xử lý trước khi implement:

- Tắt/kiểm soát `synchronize=true` trước production.
- Chuẩn hóa migration path, đặc biệt migration scheduling đang nằm lệch.
- Quyết định `.xls` support hoặc remove khỏi accept list.
- Thiết kế file security trước public apply.
- Thiết kế authorization matrix cho HR/recruiter/interviewer/admin.
- Thiết kế AI JSON schema/idempotency/audit.
- Tách public form token khỏi interview access token.

Khuyến nghị tiếp theo là tạo các file spec chi tiết:

- Domain model.
- Workflow state.
- Migration plan.
- API contract.
- CV processing.
- Mapping.
- Form.
- AI screening.
- HR review.
- Channel posting/bot.

## 18. Output sau khi hoàn thành

File baseline đã được tạo tại:

```text
C:\Users\nguye\Downloads\auto cv\interview-assistant-master\docs\recruitment-phase1\00_source_baseline_analysis.md
```

Tóm tắt các phát hiện chính:

1. Backend là NestJS + TypeORM + PostgreSQL trong pnpm/turbo monorepo.
2. Runtime có `synchronize: true`, trong khi migration datasource để `synchronize: false`.
3. Có migration lệch vị trí dưới `apps/backend/apps/backend/src/migrations`.
4. Candidate/CV upload/AI enrich đã có, nhưng chưa có `Application`, `CvDocument`, quarantine, malware scan hoặc safe CV.
5. Upload accept `.xls` theo MIME nhưng parser chỉ support `.pdf`, `.docx`, `.xlsx`.
6. AI subsystem đã có prompt DB/model override và nhiều prompt key hữu ích cho extension.
7. Interview/session/evaluation flow hiện tại khá đầy đủ và nên giữ ổn định trong Phase 1.
8. Notification hiện tại chỉ là Telegram interview reminder, chưa phải notification platform cho recruitment.
9. Public candidate interview token đã có, nhưng form/apply public endpoint nên thiết kế token/rate limit riêng.
10. Không implement code, không tạo migration, không sửa entity/controller/service hiện có trong task baseline này.
