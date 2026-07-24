# Auth Bearer Token Specification

## 1. Muc tieu

Tai lieu nay mo ta auth hien tai cua he thong theo huong su dung Bearer token.

Pham vi:

- Backend NestJS auth module, JWT guard, role guard, Google OAuth, refresh token.
- Frontend React auth storage, request header, auto refresh, logout.
- Browser extension auth storage va Bearer request contract.
- Cac public token flow khong phai Bearer token de tranh nham lan.

Ngay cap nhat: 2026-07-24.

## 2. Source code lien quan

| Thanh phan | File chinh | Vai tro |
| --- | --- | --- |
| Auth module | `apps/backend/src/auth/auth.module.ts` | Cau hinh Passport, JWT, UserEntity, RefreshTokenEntity. |
| Auth controller | `apps/backend/src/auth/auth.controller.ts` | Login, refresh, logout, profile, user management, Google OAuth. |
| Auth service | `apps/backend/src/auth/auth.service.ts` | Validate password, issue JWT, rotate refresh token, seed user, Google user validation. |
| JWT strategy | `apps/backend/src/auth/strategies/jwt.strategy.ts` | Doc `Authorization: Bearer <token>`, verify JWT signature/expiry. |
| Local strategy | `apps/backend/src/auth/strategies/local.strategy.ts` | Login bang email/password. |
| Google strategy | `apps/backend/src/auth/strategies/google.strategy.ts` | Google OAuth email/profile. |
| Guards | `apps/backend/src/auth/guards/*.ts` | `JwtAuthGuard`, `LocalAuthGuard`, `RolesGuard`. |
| Role decorator | `apps/backend/src/auth/decorators/roles.decorator.ts` | Gan metadata role cho endpoint. |
| User entity | `apps/backend/src/auth/entities/user.entity.ts` | User noi bo: email, name, password hash, role. |
| Refresh token entity | `apps/backend/src/auth/entities/refresh-token.entity.ts` | Luu hash cua refresh token va trang thai revoke/replace. |
| Backend bootstrap | `apps/backend/src/main.ts` | Bat buoc `JWT_SECRET`, CORS, session cookie OAuth, Swagger Bearer auth. |
| Frontend API client | `apps/frontend/src/lib/api-client.ts` | Gan Bearer token, auto refresh khi 401, retry request. |
| Frontend auth layout | `apps/frontend/src/app/layouts/InterviewerLayout.tsx` | Load token tu `localStorage`, goi `/auth/me`, logout. |
| Login page | `apps/frontend/src/pages/auth/LoginPage.tsx` | Google login va password login. |
| Google callback page | `apps/frontend/src/pages/auth/GoogleCallbackPage.tsx` | Lay token tu query string va luu vao client. |
| Extension API client | `apps/extension/src/api-client.ts` | Gan Bearer token, refresh khi 401, gui `X-Extension-Instance-Id`. |
| Extension auth store | `apps/extension/src/auth-store.ts` | Luu token trong `chrome.storage.session`. |

## 3. Actor va auth boundary

| Actor | Auth mechanism | Ghi chu |
| --- | --- | --- |
| `ADMIN` | JWT Bearer access token + refresh token | Co quyen quan tri user, cau hinh reference data, AI prompts/models, recruitment va extension. |
| `HR` | JWT Bearer access token + refresh token | Co quyen recruitment, job description/posting, application, CV, form session, extension integration. |
| `INTERVIEWER` | JWT Bearer access token + refresh token | Co quyen interview workspace; mot so recruitment catalog read endpoint duoc mo. |
| Candidate interview | Public session `accessToken` trong URL/path/query | Khong dung JWT Bearer. Token nam tren `SessionEntity.accessToken`, sinh bang `nanoid(24)`. |
| Candidate questionnaire form | Public `form_...` token trong URL | Khong dung JWT Bearer. Backend chi luu SHA-256 hash cua form token. |
| Public job applicant | Public job posting/apply endpoints | Khong bat buoc JWT Bearer. Public apply dung rate limit va idempotency. |
| Browser extension | JWT Bearer cua user `ADMIN`/`HR` | Reuse `/auth/login`, `/auth/refresh`, `/auth/me`; sau login dang ky extension instance. |

Ket luan boundary:

- Bearer token chi la auth chinh cho user noi bo va extension.
- Candidate session token va public form token la capability token rieng, khong phai JWT, khong gui trong `Authorization`.

## 4. Token types

### 4.1. Access token

Access token la JWT duoc ky bang `JWT_SECRET`.

Payload hien tai:

```json
{
  "sub": "<user.id>",
  "email": "<user.email>",
  "role": "ADMIN | HR | INTERVIEWER"
}
```

Transport:

```http
Authorization: Bearer <accessToken>
```

Config:

| Config | Default trong code | Ghi chu |
| --- | --- | --- |
| `JWT_SECRET` | Bat buoc | App throw error khi bootstrap neu thieu. |
| `JWT_EXPIRES_IN` | `15m` | Dung trong `JwtModule.signOptions.expiresIn`. |

Validate:

- `JwtStrategy` doc token bang `ExtractJwt.fromAuthHeaderAsBearerToken()`.
- `ignoreExpiration = false`, token het han se bi reject.
- Strategy chi validate signature va expiry, sau do tra `{ id, email, role }` tu payload.
- Hien tai strategy khong lookup user trong DB cho moi request, nen access token da ky van ton tai den khi het han ke ca khi user bi xoa/doi role.

### 4.2. Refresh token

Refresh token la opaque token dang:

```text
rt_<64 random bytes base64url>
```

Storage:

- Plain refresh token chi tra ve client.
- Backend chi luu SHA-256 hash vao bang `auth_refresh_tokens`.

Bang `auth_refresh_tokens`:

| Column | Y nghia |
| --- | --- |
| `id` | UUID primary key. |
| `user_id` | FK toi `users.id`, cascade delete. |
| `token_hash` | SHA-256 hash, unique. |
| `expires_at` | Thoi diem het han. |
| `revoked_at` | Set khi logout hoac khi token duoc rotate. |
| `replaced_by_token_hash` | Hash cua refresh token moi sau rotation. |
| `created_at`, `updated_at` | Timestamp. |

Config thuc te trong code:

| Config | Default trong code | Ghi chu |
| --- | --- | --- |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | `7` | TTL theo ngay, bi cap toi da 365 ngay. |

Luu y: `.env.example` va root docs hien dang ghi `JWT_REFRESH_EXPIRES_IN=7d`, nhung code hien tai doc `JWT_REFRESH_EXPIRES_IN_DAYS`.

### 4.3. Candidate session access token

`SessionEntity.accessToken`:

- Sinh khi tao interview session bang `nanoid(24)`.
- Dung trong URL `/session/:token` tren frontend.
- API public dung `/api/sessions/access/:token/...`.
- WebSocket candidate gui query `{ sessionId, role: 'candidate', accessToken }` de backend doi chieu `session.id + session.accessToken`.

Day khong phai JWT va khong su dung `Authorization: Bearer`.

### 4.4. Public form token

Form session token:

- Sinh bang `form_` + `randomBytes(24).toString('hex')`.
- Backend luu SHA-256 hash vao `form_sessions.token_hash`.
- URL public la `${FRONTEND_URL}/form/${plainToken}`.
- Token hien tai het han sau 5 phut trong code.

Day khong phai JWT va khong su dung `Authorization: Bearer`.

## 5. Login flow

### 5.1. Password login

```http
POST /api/auth/login
Content-Type: application/json
```

Request:

```json
{
  "email": "admin.test@example.com",
  "password": "Test@123456"
}
```

Xu ly:

1. `LocalAuthGuard` goi `LocalStrategy`.
2. `LocalStrategy` dung field `email` lam username.
3. `AuthService.validateUser()` tim user theo email.
4. Password duoc so sanh bang `bcrypt.compare()`.
5. Neu hop le, `AuthService.login()` issue access token va tao refresh token.

Response:

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "rt_<opaque>",
  "user": {
    "id": "<uuid>",
    "email": "admin.test@example.com",
    "role": "ADMIN",
    "name": "Admin Test"
  }
}
```

Rate limit rieng:

```text
5 requests / 60 seconds
```

Neu sai credential, `LocalStrategy` throw `BadRequestException('Invalid credentials')`. Qua `ApiExceptionFilter`, response hien tai duoc normalize thanh `VALIDATION_ERROR` voi HTTP 400.

### 5.2. Google OAuth login

Entry point:

```http
GET /api/auth/google
```

Callback:

```http
GET /api/auth/google/callback
```

Xu ly:

1. Passport Google OAuth xin scope `email` va `profile`.
2. `GoogleStrategy.validate()` goi `AuthService.validateGoogleUser(profile)`.
3. Neu email da ton tai trong bang `users`, backend issue access token va refresh token.
4. Neu email nam trong `ADMIN_EMAILS`, backend auto-create user `ADMIN` voi password random roi issue token.
5. Neu email chua ton tai va khong nam trong `ADMIN_EMAILS`, backend reject.
6. Callback redirect frontend:

```text
${FRONTEND_URL}/auth/google/callback?token=<accessToken>&refreshToken=<refreshToken>
```

Frontend callback page:

1. Doc `token` va `refreshToken` tu query string.
2. Goi `apiClient.setTokens({ accessToken: token, refreshToken })`.
3. Navigate ve `/dashboard`.

Ghi chu security hien tai: token duoc dua qua query string, nen co the luu trong browser history hoac log proxy neu khong cau hinh can than.

## 6. Refresh flow

```http
POST /api/auth/refresh
Content-Type: application/json
```

Request:

```json
{
  "refreshToken": "rt_<opaque>"
}
```

Xu ly:

1. Backend trim va hash refresh token bang SHA-256.
2. Tim record theo `token_hash`, load relation `user`.
3. Reject neu:
   - token khong ton tai,
   - da revoked,
   - `expires_at <= now`,
   - khong load duoc user.
4. Neu token het han/invalid nhung record ton tai va chua revoked, backend mark `revoked_at`.
5. Neu hop le:
   - tao refresh token moi,
   - set `existingToken.revokedAt = now`,
   - set `existingToken.replacedByTokenHash = nextTokenHash`,
   - insert token moi voi expiry moi,
   - issue access token moi.

Response:

```json
{
  "accessToken": "<new jwt>",
  "refreshToken": "rt_<new opaque>",
  "user": {
    "id": "<uuid>",
    "email": "<email>",
    "role": "ADMIN | HR | INTERVIEWER",
    "name": "<name>"
  }
}
```

Rate limit rieng:

```text
30 requests / 60 seconds
```

Hien tai refresh token reuse khong revoke toan bo token family; token cu da revoked se bi reject.

## 7. Logout flow

```http
POST /api/auth/logout
Content-Type: application/json
```

Request:

```json
{
  "refreshToken": "rt_<opaque>"
}
```

Xu ly:

- Neu `refreshToken` rong hoac thieu, backend tra `{ "message": "Logged out" }`.
- Neu token ton tai va chua revoked, set `revoked_at = now`.
- Access token hien tai khong bi revoke server-side; no se het hieu luc theo `JWT_EXPIRES_IN`.

Frontend SPA logout:

1. Lay refresh token tu `apiClient`.
2. Goi `/auth/logout` best-effort.
3. Clear `localStorage` keys `token` va `refreshToken`.
4. Navigate ve `/login`.

Browser extension logout hien tai chi clear token trong `chrome.storage.session`, khong goi `/auth/logout`.

## 8. Protected request contract

Moi request noi bo can Bearer token phai gui:

```http
Authorization: Bearer <accessToken>
```

Neu request JSON:

```http
Content-Type: application/json
```

Neu upload multipart:

```http
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data; boundary=...
```

Luu y: client khong set manual `Content-Type` cho multipart; browser tu sinh boundary.

Response loi auth qua `ApiExceptionFilter`:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication is required.",
    "details": []
  },
  "meta": {
    "requestId": "<uuid-or-x-request-id>",
    "timestamp": "<iso>"
  }
}
```

Role bi tu choi:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action.",
    "details": []
  },
  "meta": {
    "requestId": "<uuid-or-x-request-id>",
    "timestamp": "<iso>"
  }
}
```

## 9. Frontend SPA token handling

Storage keys:

| Key | Noi dung |
| --- | --- |
| `token` | JWT access token. |
| `refreshToken` | Plain refresh token. |

Login password:

1. `LoginPage` goi `apiClient.post('/auth/login', data)`.
2. `apiClient.setTokens(res)` luu access token va refresh token vao memory + `localStorage`.
3. Navigate ve `/dashboard`.

Google callback:

1. `GoogleCallbackPage` doc `token` va `refreshToken` tu query string.
2. Goi `apiClient.setTokens(...)`.
3. Navigate ve `/dashboard`.

Protected layout:

1. `InterviewerLayout` doc `localStorage.getItem('token')` va `localStorage.getItem('refreshToken')`.
2. Neu khong co ca hai, redirect `/login`.
3. Goi `apiClient.setToken(token)` va `apiClient.setRefreshToken(refreshToken)`.
4. Goi `GET /auth/me`.
5. Neu `/auth/me` tra 401, clear token va redirect `/login`.
6. Neu network error khac, khong clear token.

Auto refresh:

- `apiClient.request()`, `upload()`, `uploadMulti()`, `downloadBlob()` deu retry khi response dau tien la 401.
- Client khong refresh cho `/auth/login`, `/auth/refresh`, `/auth/logout`.
- Refresh duoc serialize bang `refreshPromise` de tranh nhieu request refresh song song.
- Refresh thanh cong thi update token va retry request goc mot lan.
- Refresh fail hoac response refresh thieu token thi clear token.

## 10. Browser extension token handling

Storage keys:

| Key | Noi dung |
| --- | --- |
| `vcs_extension_access_token` | JWT access token trong `chrome.storage.session`. |
| `vcs_extension_refresh_token` | Plain refresh token trong `chrome.storage.session`. |

Login extension:

1. Side panel goi `login(email, password)` -> `/auth/login`.
2. Chi chap nhan user role `ADMIN` hoac `HR`.
3. Luu token bang `setAuthTokens()`.
4. Goi `/extension/instances/register` bang Bearer token.
5. Luu extension instance id de gui header `X-Extension-Instance-Id`.

Request extension:

```http
Authorization: Bearer <accessToken>
X-Extension-Instance-Id: <extensionInstanceId>
X-Extension-Version: <version>
X-Request-Id: <optional-request-id>
Idempotency-Key: <required-for-selected-write-endpoints>
```

Auto refresh:

- Extension API client refresh khi response la 401 va endpoint khong phai login/refresh/logout.
- Refresh thanh cong thi update `chrome.storage.session` va retry request.
- Refresh fail thi clear token va dua UI ve auth required.

Instance boundary:

- `/extension/instances/register` khong bat buoc `X-Extension-Instance-Id`.
- Heartbeat/task claim/task progress/complete/fail bat buoc `X-Extension-Instance-Id`.
- Backend resolve extension instance theo current user; instance khong thuoc user se bi reject trong service.

## 11. Role authorization model

Backend su dung 2 lop:

1. `JwtAuthGuard`: bat buoc JWT Bearer hop le.
2. `RolesGuard`: doc metadata tu `@Roles(...)` va so sanh voi `req.user.role`.

Neu endpoint chi co `@UseGuards(JwtAuthGuard)` thi moi user co token hop le deu vao duoc. Neu them `RolesGuard` va `@Roles(...)` thi chi role trong list duoc phep.

Role enum hien tai:

```text
ADMIN
HR
INTERVIEWER
```

Ma tran access theo route group hien tai:

| Route group | Auth | Role chinh | Ghi chu |
| --- | --- | --- | --- |
| `POST /api/auth/login` | Public | N/A | Local auth, rate limit 5/min. |
| `POST /api/auth/refresh` | Public | N/A | Refresh token body, rate limit 30/min. |
| `POST /api/auth/logout` | Public | N/A | Revoke refresh token body, rate limit 30/min. |
| `GET /api/auth/google` | Public OAuth | N/A | Redirect Google. |
| `GET /api/auth/google/callback` | Public OAuth | N/A | Redirect frontend kem token query. |
| `GET /api/auth/me` | Bearer | Any authenticated | Tra current user theo `req.user.id`. |
| `GET /api/auth/users/assignable` | Bearer | Any authenticated | Dropdown user assign. |
| `/api/auth/users*` | Bearer | `ADMIN` | User management. |
| `/api/candidates*` | Bearer | Any authenticated | Service filter theo creator/assignee/admin; delete `ADMIN`/`INTERVIEWER`, backfill slug `ADMIN`. |
| `/api/questions*` | Bearer | Any authenticated read, `ADMIN` write | Create/update/delete/reset/seed yeu cau `ADMIN`. |
| `/api/categories*`, `/api/sub-categories*` | Bearer | Any authenticated read, `ADMIN` write | Mutations yeu cau `ADMIN`. |
| `/api/positions*`, `/api/levels*` | Bearer | Any authenticated read, `ADMIN` write | Mutations yeu cau `ADMIN`. |
| `/api/sessions` create/update | Bearer | `ADMIN`, `INTERVIEWER`, `HR` | HR flow co auto-assign question theo AMIS career/category. |
| `/api/sessions` list/detail | Bearer | Any authenticated | Service scope theo role/user; HR bi exclude questions khi detail. |
| `/api/sessions/:id/...` live question actions | Bearer | `ADMIN`, `INTERVIEWER` | Cac endpoint activate questions, survey AI, next question, candidate view. |
| `/api/sessions/:id/delete` | Bearer | `ADMIN`, `INTERVIEWER` | Delete session. |
| `/api/sessions/access/:token*` | Public token | Candidate | Dung session access token, khong Bearer. |
| `/api/evaluations*` | Bearer | Any read, `ADMIN`/`INTERVIEWER` write/AI | Controller class bat JWT; mutating endpoints co role. |
| `/api/submissions*` | Bearer | Any authenticated | Candidate submission rieng dung `/sessions/access/:token/submissions`. |
| `/api/export/:sessionId` | Bearer | Any authenticated | Xuat BM04 theo session. |
| `/api/uploads/:filename` | Bearer | `ADMIN`, `INTERVIEWER`, `HR` | Serve upload file protected. |
| `/api/job-descriptions*` | Bearer | `ADMIN`, `HR` | Class-level role. |
| `/api/job-postings*` | Bearer | `ADMIN`, `HR` | Class-level role. |
| `/api/applications*` | Bearer | `ADMIN`, `HR` | Status patch chi `ADMIN`. |
| `/api/applications/:applicationId/cv*` | Bearer | `ADMIN`, `HR` | Clean CV stream protected. |
| `/api/form-sessions*` | Bearer | `ADMIN`, `HR` | Generate/list internal form sessions. |
| `/api/public/job-postings*` | Public | N/A | Public job detail/apply. |
| `/api/public/form-sessions/:token*` | Public token | Candidate | Plain form token trong URL, hash lookup backend. |
| `/api/extension/instances*` | Bearer | `ADMIN`, `HR` | Extension instance register/list/heartbeat/disable. |
| `/api/extension/tasks*` | Bearer | `ADMIN`, `HR` | Task lifecycle; nhieu endpoint can instance header. |
| `/api/extension/amis*` | Bearer | `ADMIN`, `HR`; mot so read `INTERVIEWER` | Class-level `ADMIN`/`HR`, endpoint careers read override them `INTERVIEWER`. |
| `/api/extension/facebook*` | Bearer | `ADMIN`, `HR` | Facebook publish target/account/history APIs. |
| `/api/ai-prompts*`, `/api/ai-model-overrides*` | Bearer | `ADMIN` | AI config management. |

## 12. Public candidate/session flows khong dung Bearer

### 12.1. Candidate interview page

Frontend route:

```text
/session/:token
```

API calls:

```http
GET /api/sessions/access/:token
GET /api/sessions/access/:token/survey
PATCH /api/sessions/access/:token/survey/answers
POST /api/sessions/access/:token/submit
POST /api/sessions/access/:token/submissions
GET /api/sessions/access/:token/submissions/:submissionId
POST /api/sessions/access/:token/complete
```

Behavior:

- `findByToken()` chi load active questions.
- Neu session dang `DRAFT`, backend auto-start sang `IN_PROGRESS` khi khong co survey hoac survey da duoc answer het.
- Submit answer/code chi hop le khi question thuoc session va dang active.
- Complete session set status `COMPLETED`.

WebSocket:

- Candidate connect voi query `sessionId`, `role=candidate`, `accessToken`.
- Backend join room tam thoi roi async validate `sessionId + accessToken`; invalid thi disconnect.
- Neu candidate mo nhieu tab/device, backend kick ket noi cu va ghi anti-cheat event.

### 12.2. Public form

Frontend route:

```text
/form/:token
```

API calls:

```http
GET /api/public/form-sessions/:token
POST /api/public/form-sessions/:token/submit
```

Behavior:

- Backend hash plain token va lookup `form_sessions.token_hash`.
- Reject neu form cancelled, submitted, expired.
- Khi get lan dau, set `openedAt`.
- Khi submit thanh cong, set status `SUBMITTED` va ghi workflow event.

### 12.3. Public job apply

API calls:

```http
GET /api/public/job-postings/:slug
POST /api/public/job-postings/:jobPostingId/apply
```

Behavior:

- Khong bat buoc Bearer.
- Apply dung multipart upload, `Idempotency-Key`, rate limit/audit/duplicate/CV validation theo spec CV apply.

## 13. User provisioning

### 13.1. Seed default admin

Khi module init:

- Neu `DEFAULT_ADMIN_EMAIL` va `DEFAULT_ADMIN_PASSWORD` co gia tri, backend tao user `ADMIN` neu email chua ton tai.
- `DEFAULT_ADMIN_NAME` fallback la `Default Admin`.

### 13.2. Seed development users

Neu `NODE_ENV !== 'production'`, backend auto-seed:

| Email | Role | Password |
| --- | --- | --- |
| `admin.test@example.com` | `ADMIN` | `Test@123456` |
| `hr.test@example.com` | `HR` | `Test@123456` |
| `interviewer.test@example.com` | `INTERVIEWER` | `Test@123456` |

### 13.3. Create user by admin

```http
POST /api/auth/users
Authorization: Bearer <adminAccessToken>
```

Admin tao user voi email/name/role. Backend tao password random bang `uuidv4()` va hash bcrypt; user duoc ky vong login bang Google neu khong co password duoc chia se.

### 13.4. Register service gap

`AuthService.register()` ton tai trong code nhung `AuthController` hien tai khong expose `POST /auth/register`. `RegisterPage` frontend dang goi `/auth/register` va `/auth/invite/:token`, nhung backend auth controller hien tai khong co cac route nay.

`OPEN_REGISTRATION` trong `.env.example` khong duoc auth controller hien tai su dung.

## 14. Security controls hien co

| Control | Hien trang |
| --- | --- |
| JWT secret required | `main.ts` throw neu thieu `JWT_SECRET`. |
| Access token expiry | `JWT_EXPIRES_IN`, default `15m`. |
| Refresh token storage | Chi luu SHA-256 hash trong DB. |
| Refresh token rotation | Moi lan refresh revoke token cu va insert token moi. |
| Password hash | bcryptjs cost 10. |
| Global validation | `ValidationPipe` whitelist + transform. |
| Helmet | Bat trong bootstrap. |
| Global rate limit | 5000 requests / 60 seconds. |
| Auth route rate limit | Login 5/min, refresh/logout 30/min. |
| REST CORS | Allow `FRONTEND_URL`, local dev origins, `EXTENSION_ALLOWED_ORIGINS`; production reject wildcard. |
| OAuth session cookie | `express-session`, httpOnly, sameSite strict, secure khi production, maxAge 60s. |
| Swagger | `.addBearerAuth()` va controller `@ApiBearerAuth()`. |
| Error shape | `ApiExceptionFilter` normalize 401 thanh `UNAUTHORIZED`, 403 thanh `FORBIDDEN`. |
| Public CV storage | Clean CV stream qua endpoint Bearer protected. |

## 15. Config can thiet

| Env | Bat buoc | Dung o dau | Ghi chu |
| --- | --- | --- | --- |
| `JWT_SECRET` | Co | `main.ts`, `auth.module.ts`, `jwt.strategy.ts`, OAuth session | Thieu thi app khong start. |
| `JWT_EXPIRES_IN` | Khong | `auth.module.ts` | Default `15m`. |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | Khong | `auth.service.ts` | Default `7`, max `365`. |
| `GOOGLE_CLIENT_ID` | Neu dung Google OAuth | `google.strategy.ts` | Default rong. |
| `GOOGLE_CLIENT_SECRET` | Neu dung Google OAuth | `google.strategy.ts` | Default rong. |
| `GOOGLE_CALLBACK_URL` | Neu dung Google OAuth | `google.strategy.ts` | Default `http://localhost:3002/api/auth/google/callback`. |
| `FRONTEND_URL` | Nen co | `main.ts`, `auth.controller.ts`, form emails, websocket CORS | Backend auth callback fallback `http://localhost:3001`; REST CORS fallback `http://localhost:4000`. |
| `ADMIN_EMAILS` | Khong | `auth.service.ts` | Auto-create admin khi Google login lan dau. |
| `DEFAULT_ADMIN_EMAIL` | Khong | `auth.service.ts` | Seed default admin. |
| `DEFAULT_ADMIN_PASSWORD` | Khong | `auth.service.ts` | Seed default admin. |
| `DEFAULT_ADMIN_NAME` | Khong | `auth.service.ts` | Fallback `Default Admin`. |
| `EXTENSION_ALLOWED_ORIGINS` | Neu dung extension production | `main.ts` | Comma-separated `chrome-extension://...`; production khong cho wildcard. |

## 16. End-to-end auth sequence

### 16.1. SPA password login va protected request

```text
User submit email/password
-> FE POST /api/auth/login
-> BE validate bcrypt password
-> BE issue accessToken + refreshToken
-> FE save localStorage(token, refreshToken)
-> FE navigate /dashboard
-> InterviewerLayout loads token
-> FE GET /api/auth/me with Authorization: Bearer accessToken
-> BE JwtAuthGuard validates JWT
-> FE renders protected workspace
```

### 16.2. Access token expired

```text
FE request protected API with expired accessToken
-> BE returns 401 UNAUTHORIZED
-> FE POST /api/auth/refresh with refreshToken
-> BE revokes old refresh token and creates next refresh token
-> BE returns new accessToken + refreshToken
-> FE saves tokens
-> FE retries original request once with new Bearer token
```

### 16.3. Logout

```text
User clicks logout
-> FE POST /api/auth/logout with refreshToken
-> BE marks refresh token revoked
-> FE clears localStorage token + refreshToken
-> FE navigates /login
```

### 16.4. Extension login

```text
HR/Admin opens extension side panel
-> Extension POST /auth/login
-> Extension verifies role is ADMIN or HR
-> Extension stores tokens in chrome.storage.session
-> Extension POST /extension/instances/register with Bearer token
-> Extension stores instance id
-> Extension calls extension APIs with Bearer token + X-Extension-Instance-Id
```

## 17. Diem can luu y / gap hien tai

| Gap | Tac dong | De xuat |
| --- | --- | --- |
| `JWT_REFRESH_EXPIRES_IN` trong docs/env example khac `JWT_REFRESH_EXPIRES_IN_DAYS` trong code | Cau hinh refresh TTL co the khong co tac dung nhu mong doi | Dong bo env name hoac support ca hai key. |
| JWT strategy khong lookup user DB moi request | User bi xoa/doi role van co the dung access token cu den khi het han | Lookup user active trong `validate()` hoac them token version/role version. |
| Access token khong revoke server-side | Logout chi revoke refresh token; access token cu con song den expiry | Giu access token ngan han; neu can hard logout, them denylist/token version. |
| Google callback dua token trong query string | Token co the nam trong browser history/proxy log/referrer neu khong can than | Chuyen sang short-lived one-time code hoac fragment/cookie strategy. |
| SPA luu token trong `localStorage` | XSS co the doc token | Can CSP, sanitize, khong inject HTML; can nhac httpOnly cookie neu production hardening. |
| Extension logout khong goi `/auth/logout` | Refresh token da luu truoc do van hop le neu bi lay duoc truoc khi clear | Goi logout best-effort voi refresh token truoc khi clear. |
| `AuthService.register()` co nhung controller khong expose | RegisterPage hien goi route khong ton tai | Xac nhan bo register UI hay implement route/invite policy. |
| `.env.example` `FRONTEND_URL=http://localhost:3001` khac local dev frontend `:4000` | OAuth redirect co the sai trong local dev neu copy nguyen example | Can dong bo example theo dev local hoac ghi ro docker/local. |
| Refresh token family reuse detection chua revoke toan bo family | Reuse token cu chi bi reject, khong invalidate token moi da thay the | Neu can chong theft, revoke family khi phat hien reused revoked token. |

## 18. Acceptance criteria cho auth Bearer hien tai

Auth Bearer flow duoc coi la dung theo code hien tai khi:

1. Login password hop le tra `accessToken`, `refreshToken`, `user`.
2. Protected endpoint reject request thieu Bearer token voi `401 UNAUTHORIZED`.
3. Protected endpoint accept `Authorization: Bearer <accessToken>` con han.
4. Endpoint role-restricted reject role sai voi `403 FORBIDDEN`.
5. `/auth/me` tra user theo `req.user.id` khi token hop le.
6. Access token het han lam client goi `/auth/refresh`.
7. Refresh thanh cong rotate refresh token cu sang revoked va tra token pair moi.
8. Request goc duoc retry mot lan bang access token moi.
9. Logout SPA revoke refresh token best-effort va clear local token storage.
10. Candidate interview `/sessions/access/:token` van hoat dong khong can Bearer.
11. Extension login chi cho `ADMIN`/`HR`, gui Bearer token va dang ky extension instance.
