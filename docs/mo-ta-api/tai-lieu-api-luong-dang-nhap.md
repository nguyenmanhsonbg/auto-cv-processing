# TÀI LIỆU ĐẶC TẢ API - LUỒNG XÁC THỰC & ĐĂNG NHẬP (AUTH FLOW)

> **Hệ thống:** VCS Interview Assistant  
> **Base URL:**
> - Local/Dev API: `http://localhost:3002/api` (hoặc thông qua Vite Dev Proxy: `http://localhost:4000/api`)
> - Production API: `https://<domain>/api`

---

## MỤC LỤC
1. [API 1: Đăng nhập bằng Email/Tài khoản và Mật khẩu](#1-api-1-đăng-nhập-bằng-emailtài-khoản-và-mật-khẩu-local-login)
2. [API 2: Đăng nhập qua Google SSO (Google OAuth 2.0)](#2-api-2-đăng-nhập-qua-google-sso-google-oauth-20)
3. [API 3: Làm mới Access Token (Refresh Token)](#3-api-3-làm-mới-access-token-refresh-token)
4. [API 4: Đăng xuất (Logout)](#4-api-4-đăng-xuất-logout)
5. [API 5: Lấy thông tin tài khoản hiện tại (Get Profile)](#5-api-5-lấy-thông-tin-tài-khoản-hiện-tại-get-profile)
6. [API 6: Yêu cầu cấp mật khẩu cho nhân sự nội bộ (Internal Request Password)](#6-api-6-yêu-cầu-cấp-mật-khẩu-cho-nhân-sự-nội-bộ-internal-request-password)
7. [API 7: Yêu cầu gửi mã OTP khôi phục mật khẩu](#7-api-7-yêu-cầu-gửi-mã-otp-khôi-phục-mật-khẩu-request-password-reset)
8. [API 8: Xác thực mã OTP khôi phục mật khẩu](#8-api-8-xác-thực-mã-otp-khôi-phục-mật-khẩu-verify-password-reset-otp)
9. [API 9: Hoàn tất đặt mật khẩu mới](#9-api-9-hoàn-tất-đặt-mật-khẩu-mới-complete-password-reset)
10. [API 10: Đổi mật khẩu tài khoản đang đăng nhập (Change Password)](#10-api-10-đổi-mật-khẩu-tài-khoản-đang-đăng-nhập-change-password)

---

## 1. API 1: Đăng nhập bằng Email/Tài khoản và Mật khẩu (Local Login)

### 1.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / Browser
    participant API as Auth Controller / Guard
    participant Service as AuthService
    participant DB as PostgreSQL DB

    Client->>API: POST /api/auth/login (login, password)
    API->>Service: validateUser(login, password)
    Service->>DB: Tìm user theo email hoặc mã định danh Freelancer
    DB-->>Service: User Entity
    
    alt Sai tài khoản / mật khẩu
        Service-->>Client: 400 Bad Request (Invalid credentials)
    else Tài khoản bị khóa / vô hiệu hóa
        Service-->>Client: 401 Unauthorized (INTERNAL_ACCOUNT_INACTIVE / FREELANCER_ACCOUNT_INACTIVE)
    else Hợp lệ
        Service->>DB: Lưu Refresh Token mới (SHA-256 hash)
        Service->>Service: Ký JWT Access Token (hạn 15 phút)
        Service-->>Client: 200 OK (accessToken, refreshToken, user)
    end
```

### 1.2 Url path
`/api/auth/login`

### 1.3 Request method
`POST`

### 1.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Định dạng payload gửi lên |

### 1.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `login` | `string` | Có | Min 3 ký tự | Email người dùng (Admin, HR, Interviewer, Internal) hoặc Mã định danh Freelancer (VD: `FL000001`) |
| `password` | `string` | Có | Min 6 ký tự | Mật khẩu tài khoản |

### 1.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `accessToken` | `string` | JWT Token dùng xác thực các API hệ thống (hạn 15 phút) |
| `refreshToken` | `string` | Refresh Token dạng `rt_...` dùng làm mới token (hạn 7 ngày) |
| `user` | `object` | Thông tin cơ bản người dùng |
| `user.id` | `string (UUID)` | ID định danh tài khoản |
| `user.email` | `string` | Email tài khoản |
| `user.role` | `string` | Vai trò (`ADMIN`, `HR`, `INTERVIEWER`, `FREELANCER`, `INTERNAL`) |

### 1.7 error code
- `400 Bad Request`: Sai thông tin đăng nhập hoặc dữ liệu không hợp lệ.
- `401 Unauthorized`: Tài khoản bị vô hiệu hóa / không có quyền truy cập.
- `429 Too Many Requests`: Vượt quá giới hạn (Rate limit: tối đa 5 requests/phút).

### 1.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "login": "admin.test@example.com",
    "password": "Test@123456"
  }'
```

**Response Success (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxOGY5N2ZjMy0yODk1LTQ2YWEtYWI5NC1mMmE4YWExZWY1YmEiLCJlbWFpbCI6ImFkbWluLnRlc3RAZXhhbXBsZS5jb20iLCJyb2xlIjoiQURNSU4iLCJpYXQiOjE3MDgwMDAwMDAsImV4cCI6MTcwODAwMDkwMH0.xxx",
  "refreshToken": "rt_V4k1lK_vX6vK1q0M...",
  "user": {
    "id": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
    "email": "admin.test@example.com",
    "role": "ADMIN"
  }
}
```

**Response Error (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": "Invalid credentials",
  "error": "Bad Request"
}
```

### 1.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | - | `Request payload is invalid.` | Dữ liệu `login` hoặc `password` không đúng định dạng. |
| `400` | - | `Invalid credentials` | Sai email/mã định danh hoặc sai mật khẩu. |
| `401` | `INTERNAL_ACCOUNT_INACTIVE` | `Internal account is inactive or unavailable.` | Tài khoản nhân sự nội bộ đã bị khóa hoặc chưa kích hoạt. |
| `401` | `FREELANCER_ACCOUNT_INACTIVE` | `Freelancer account is inactive or unavailable.` | Tài khoản Freelancer đã bị vô hiệu hóa. |
| `429` | - | `ThrottlerException: Too Many Requests` | Thực hiện đăng nhập sai quá 5 lần trong 1 phút. Cần đợi 60s trước khi thử lại. |

---

## 2. API 2: Đăng nhập qua Google SSO (Google OAuth 2.0)

### 2.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / Browser
    participant Backend as Backend Server
    participant Google as Google OAuth 2.0
    participant DB as PostgreSQL DB

    Client->>Backend: GET /api/auth/google
    Backend-->>Client: 302 Redirect to Google Consent Screen
    Client->>Google: Đăng nhập & Ủy quyền tài khoản Google
    Google-->>Backend: 302 Redirect /api/auth/google/callback?code=...
    Backend->>Google: Trao đổi code lấy Google Profile (email, name)
    Backend->>DB: Kiểm tra Email tồn tại trong bảng users / Danh sách ADMIN_EMAILS
    
    alt Email không có trong hệ thống & không thuộc Whitelist Admin
        Backend-->>Client: 302 Redirect ${FRONTEND_URL}/login?error=google_auth_failed
    else Email hợp lệ
        Backend->>DB: Cấp và lưu Refresh Token
        Backend-->>Client: 302 Redirect ${FRONTEND_URL}/auth/google/callback?token={jwt}&refreshToken={rt}
        Client->>Client: Lưu Token và chuyển hướng về Dashboard
    end
```

### 2.2 Url path
1. Khởi tạo xác thực: `/api/auth/google`
2. Endpoint nhận Callback: `/api/auth/google/callback`

### 2.3 Request method
`GET`

### 2.4 Header
Không yêu cầu header (Browser Navigation / HTTP Redirect).

### 2.5 input
**Query Parameters (tại callback `/api/auth/google/callback` do Google gửi):**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `code` | `string` | Có | Mã ủy quyền (Authorization code) từ Google OAuth |
| `scope` | `string` | Có | Quyền truy cập profile và email |

### 2.6 output
**HTTP 302 Redirect:**
- **Thành công:** Redirect về URL `${FRONTEND_URL}/auth/google/callback?token=${accessToken}&refreshToken=${refreshToken}`
- **Thất bại:** Redirect về URL `${FRONTEND_URL}/login?error=google_auth_failed`

### 2.7 error code
- `302 Found`: Redirect kèm tham số lỗi sang trang Login của Frontend.
- `401 Unauthorized`: Email không có trong hệ thống hoặc Google không cung cấp email.

### 2.8 example

**1. Khởi tạo đăng nhập (Browser link):**
```html
<a href="http://localhost:3002/api/auth/google">Continue with Google</a>
```

**2. Redirect Response thành công:**
```http
HTTP/1.1 302 Found
Location: http://localhost:4000/auth/google/callback?token=eyJhbGciOiJIUzI1Ni...&refreshToken=rt_7x9A...
```

**3. Redirect Response thất bại:**
```http
HTTP/1.1 302 Found
Location: http://localhost:4000/login?error=google_auth_failed
```

### 2.9 bảng mã lỗi
| HTTP Status | Code / Error Param | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `302` | `google_auth_failed` | `No access. Ask your admin to create an account for you.` | Email Google chưa được tạo tài khoản trong hệ thống. Cần liên hệ Admin để tạo tài khoản trước. |
| `401` | - | `No email from Google` | Người dùng không cấp quyền truy cập email khi xác thực Google. |

---

## 3. API 3: Làm mới Access Token (Refresh Token)

### 3.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / Axios Interceptor
    participant API as Auth Controller
    participant Service as AuthService
    participant DB as PostgreSQL DB

    Client->>API: POST /api/auth/refresh (refreshToken)
    API->>Service: refresh(refreshToken)
    Service->>Service: Hash SHA-256 refreshToken
    Service->>DB: Tìm token, kiểm tra revoked_at & expires_at
    
    alt Token không tồn tại / Hết hạn / Đã bị thu hồi
        Service-->>Client: 401 Unauthorized (Refresh token is invalid or expired)
    else Hợp lệ
        Service->>DB: Đánh dấu Token cũ đã thu hồi (Revoke & Rotate)
        Service->>DB: Tạo và lưu Refresh Token mới
        Service->>Service: Ký JWT Access Token mới
        Service-->>Client: 200 OK (accessToken mới, refreshToken mới, user)
    end
```

### 3.2 Url path
`/api/auth/refresh`

### 3.3 Request method
`POST`

### 3.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Định dạng payload gửi lên |

### 3.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `refreshToken` | `string` | Có | Min 20 ký tự | Chuỗi refresh token hiện tại của client |

### 3.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `accessToken` | `string` | JWT Access Token mới (hạn 15 phút) |
| `refreshToken` | `string` | Refresh Token mới (cơ chế Token Rotation) |
| `user` | `object` | Thông tin người dùng (`id`, `email`, `role`) |

### 3.7 error code
- `401 Unauthorized`: Token không hợp lệ, đã hết hạn, bị thu hồi hoặc tài khoản bị khóa.
- `429 Too Many Requests`: Vượt quá giới hạn (Rate limit: tối đa 30 requests/phút).

### 3.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "rt_V4k1lK-xxx..."
  }'
```

**Response Success (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "rt_NewTokenGenerated99...",
  "user": {
    "id": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
    "email": "admin.test@example.com",
    "role": "ADMIN"
  }
}
```

**Response Error (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Refresh token is invalid or expired",
  "error": "Unauthorized"
}
```

### 3.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `401` | - | `Refresh token is invalid or expired` | Refresh token không hợp lệ, đã quá hạn 7 ngày hoặc đã bị thu hồi trước đó. Client cần logout và yêu cầu đăng nhập lại. |
| `401` | `INTERNAL_ACCOUNT_INACTIVE` | `Internal account is inactive or unavailable.` | Tài khoản nội bộ đã bị vô hiệu hóa trong khi phiên còn hạn. |
| `401` | `FREELANCER_ACCOUNT_INACTIVE` | `Freelancer account is inactive or unavailable.` | Tài khoản Freelancer đã bị vô hiệu hóa. |
| `429` | - | `ThrottlerException: Too Many Requests` | Vượt quá 30 lần làm mới token trong 1 phút. |

---

## 4. API 4: Đăng xuất (Logout)

### 4.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / Browser
    participant API as Auth Controller
    participant Service as AuthService
    participant DB as PostgreSQL DB

    Client->>API: POST /api/auth/logout (refreshToken)
    API->>Service: logout(refreshToken)
    Service->>DB: Cập nhật revoked_at = NOW() cho refresh token
    DB-->>Service: Updated
    Service-->>Client: 200 OK (message: "Logged out")
    Client->>Client: Xóa sạch tokens trong LocalStorage
```

### 4.2 Url path
`/api/auth/logout`

### 4.3 Request method
`POST`

### 4.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Định dạng payload gửi lên |

### 4.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `refreshToken` | `string` | Không | Min 20 ký tự (nếu có) | Refresh token cần thu hồi |

### 4.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `message` | `string` | Thông báo đăng xuất thành công (`"Logged out"`) |

### 4.7 error code
- `429 Too Many Requests`: Vượt quá giới hạn (Rate limit: tối đa 30 requests/phút).

### 4.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/auth/logout" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "rt_V4k1lK-xxx..."
  }'
```

**Response Success (200 OK):**
```json
{
  "message": "Logged out"
}
```

### 4.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `429` | - | `ThrottlerException: Too Many Requests` | Gửi request đăng xuất liên tục quá 30 lần/phút. |

---

## 5. API 5: Lấy thông tin tài khoản hiện tại (Get Profile)

### 5.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / Browser
    participant Guard as JwtAuthGuard
    participant Service as AuthService
    participant DB as PostgreSQL DB

    Client->>Guard: GET /api/auth/me (Header: Bearer Token)
    Guard->>Guard: Xác thực chữ ký và hạn dùng JWT
    
    alt Token không hợp lệ / Hết hạn
        Guard-->>Client: 401 Unauthorized
    else Token hợp lệ
        Guard->>Service: findById(req.user.id)
        Service->>DB: Tìm User theo ID
        DB-->>Service: User Entity
        Service-->>Client: 200 OK (Thông tin User không kèm mật khẩu)
    end
```

### 5.2 Url path
`/api/auth/me`

### 5.3 Request method
`GET`

### 5.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Access Token còn hiệu lực |

### 5.5 input
Không có request body hoặc query parameters (Thông tin ID trích xuất trực tiếp từ JWT Payload).

### 5.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `id` | `string (UUID)` | ID định danh tài khoản |
| `email` | `string` | Email tài khoản |
| `name` | `string` | Tên hiển thị người dùng |
| `role` | `string` | Vai trò (`ADMIN`, `HR`, `INTERVIEWER`, `FREELANCER`, `INTERNAL`) |
| `createdAt` | `string (ISO 8601)` | Thời điểm tạo tài khoản |
| `updatedAt` | `string (ISO 8601)` | Thời điểm cập nhật tài khoản gần nhất |

### 5.7 error code
- `401 Unauthorized`: Header `Authorization` bị thiếu, sai định dạng hoặc Token đã hết hạn.

### 5.8 example

**Request (cURL):**
```bash
curl -X GET "http://localhost:3002/api/auth/me" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Success (200 OK):**
```json
{
  "id": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
  "email": "admin.test@example.com",
  "name": "Admin Test",
  "role": "ADMIN",
  "createdAt": "2026-01-15T08:30:00.000Z",
  "updatedAt": "2026-02-01T10:15:00.000Z"
}
```

**Response Error (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 5.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `401` | - | `Unauthorized` | Không có JWT Bearer token hoặc token đã hết hạn 15 phút. Client cần gọi `/api/auth/refresh` để làm mới. |

---

## 6. API 6: Yêu cầu cấp mật khẩu cho nhân sự nội bộ (Internal Request Password)

### 6.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Nhân sự nội bộ
    participant API as Auth Controller
    participant Service as AuthService
    participant DB as PostgreSQL DB
    participant Mail as MailService (SMTP)

    Client->>API: POST /api/auth/internal/request-password (email)
    API->>Service: requestInternalPassword(email)
    Service->>DB: Kiểm tra bảng internals (isActive: true)
    
    alt Email không tồn tại hoặc đã bị vô hiệu hóa
        Service-->>Client: 400 Bad Request (INTERNAL_EMAIL_NOT_FOUND)
    else Email đã liên kết với role khác
        Service-->>Client: 400 Bad Request (INTERNAL_ACCOUNT_CONFLICT)
    else Hợp lệ
        Service->>Service: Sinh mật khẩu ngẫu nhiên an toàn (12 ký tự)
        Service->>Mail: Gửi email chứa mật khẩu tới email nội bộ
        alt Gửi mail lỗi
            Service-->>Client: 400 Bad Request (INTERNAL_PASSWORD_EMAIL_FAILED)
        else Gửi mail thành công
            Service->>DB: Cập nhật User (role INTERNAL), hash mật khẩu, thu hồi toàn bộ Refresh Tokens cũ
            Service-->>Client: 200 OK (message)
        end
    end
```

### 6.2 Url path
`/api/auth/internal/request-password`

### 6.3 Request method
`POST`

### 6.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Định dạng payload gửi lên |

### 6.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `email` | `string` | Có | Định dạng Email | Email nhân sự nội bộ (VD: `staff@viettel.com.vn`) |

### 6.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `message` | `string` | Thông báo gửi mật khẩu thành công |

### 6.7 error code
- `400 Bad Request`: Email không tồn tại, xung đột tài khoản, hoặc lỗi gửi mail.
- `429 Too Many Requests`: Vượt quá giới hạn (Rate limit: tối đa 3 requests/phút).

### 6.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/auth/internal/request-password" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "employee@viettel.com.vn"
  }'
```

**Response Success (200 OK):**
```json
{
  "message": "Mật khẩu đã được gửi tới email nội bộ của bạn."
}
```

**Response Error (400 Bad Request):**
```json
{
  "statusCode": 400,
  "code": "INTERNAL_EMAIL_NOT_FOUND",
  "message": "Email nhân sự nội bộ chưa tồn tại hoặc đã bị vô hiệu hóa.",
  "error": "Bad Request"
}
```

### 6.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `INTERNAL_EMAIL_NOT_FOUND` | `Email nhân sự nội bộ chưa tồn tại hoặc đã bị vô hiệu hóa.` | Email chưa có trong danh sách nhân sự nội bộ hoặc đang bị vô hiệu hóa. |
| `400` | `INTERNAL_ACCOUNT_CONFLICT` | `Email này đã được liên kết với loại tài khoản khác.` | Email đã được gắn với tài khoản role khác trong hệ thống. |
| `400` | `INTERNAL_PASSWORD_EMAIL_FAILED` | `Không thể gửi email mật khẩu. Vui lòng kiểm tra cấu hình SMTP và thử lại sau.` | Máy chủ SMTP gửi mail gặp sự cố. |
| `429` | - | `ThrottlerException: Too Many Requests` | Yêu cầu gửi mật khẩu quá 3 lần/phút. |

---

## 7. API 7: Yêu cầu gửi mã OTP khôi phục mật khẩu (Request Password Reset)

### 7.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Người dùng
    participant API as Auth Controller
    participant Service as AuthService
    participant DB as PostgreSQL DB
    participant Mail as MailService

    Client->>API: POST /api/auth/password-reset/request (login)
    API->>Service: requestPasswordReset(login)
    Service->>DB: Tìm tài khoản theo email hoặc mã Freelancer
    
    alt Không tìm thấy tài khoản
        Service-->>Client: 400 Bad Request (INVALID_LOGIN)
    else Là nhân sự nội bộ chưa tạo mật khẩu lần đầu
        Service-->>Client: 400 Bad Request (INTERNAL_PASSWORD_REQUIRED)
    else Hợp lệ
        Service->>Service: Sinh mã OTP 6 chữ số ngẫu nhiên
        Service->>DB: Lưu PasswordResetRequestEntity (OTP hash, hạn 15 phút)
        Service->>Mail: Gửi mã OTP vào Email người dùng
        Service-->>Client: 200 OK (challengeId, masked email)
    end
```

### 7.2 Url path
`/api/auth/password-reset/request`

### 7.3 Request method
`POST`

### 7.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Định dạng payload gửi lên |

### 7.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `login` | `string` | Có | Min 1 ký tự | Email hoặc Mã định danh tài khoản cần khôi phục |

### 7.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `challengeId` | `string (UUID)` | Mã định danh phiên khôi phục (dùng cho bước xác thực OTP) |
| `email` | `string` | Email nhận mã OTP đã được làm mờ (VD: `a***n@vcs.com`) |
| `message` | `string` | Thông báo gửi mã thành công |

### 7.7 error code
- `400 Bad Request`: Tài khoản không tồn tại, tài khoản nội bộ chưa cấp mật khẩu hoặc gửi mail lỗi.
- `429 Too Many Requests`: Vượt quá giới hạn (Rate limit: tối đa 3 requests/phút).

### 7.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/auth/password-reset/request" \
  -H "Content-Type: application/json" \
  -d '{
    "login": "admin.test@example.com"
  }'
```

**Response Success (200 OK):**
```json
{
  "challengeId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "a*********t@example.com",
  "message": "Mã xác nhận đã được gửi tới Gmail của bạn."
}
```

**Response Error (400 Bad Request):**
```json
{
  "statusCode": 400,
  "code": "INVALID_LOGIN",
  "message": "Tên đăng nhập không hợp lệ. Vui lòng kiểm tra lại.",
  "error": "Bad Request"
}
```

### 7.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `INVALID_LOGIN` | `Tên đăng nhập không hợp lệ. Vui lòng kiểm tra lại.` | Không tìm thấy người dùng với email hoặc mã freelancer được cung cấp. |
| `400` | `INTERNAL_PASSWORD_REQUIRED` | `Nhân sự nội bộ chưa có tài khoản đăng nhập. Vui lòng chọn “Là nhân sự nội bộ” để lấy mật khẩu lần đầu.` | Tài khoản thuộc nhân sự nội bộ chưa từng kích hoạt nhận mật khẩu lần đầu. |
| `400` | `PASSWORD_RESET_EMAIL_FAILED` | `Không thể gửi mã xác nhận. Vui lòng thử lại sau.` | Gặp sự cố kết nối khi gửi email OTP. |
| `429` | - | `ThrottlerException: Too Many Requests` | Yêu cầu gửi OTP vượt quá 3 lần trong 1 phút. |

---

## 8. API 8: Xác thực mã OTP khôi phục mật khẩu (Verify Password Reset OTP)

### 8.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Người dùng
    participant API as Auth Controller
    participant Service as AuthService
    participant DB as PostgreSQL DB

    Client->>API: POST /api/auth/password-reset/verify (challengeId, otp)
    API->>Service: verifyPasswordReset(challengeId, otp)
    Service->>DB: Query PasswordResetRequest theo challengeId
    
    alt Session không tồn tại / Hết hạn 15p / Sai quá 5 lần / Sai OTP
        Service->>DB: Tăng attempts + 1
        Service-->>Client: 400 Bad Request (INVALID_OTP)
    else OTP chính xác
        Service->>Service: Sinh resetToken ngẫu nhiên (32 bytes hex)
        Service->>DB: Lưu resetTokenHash, resetTokenExpiresAt (15 phút) & verifiedAt = NOW()
        Service-->>Client: 200 OK (resetToken, message)
    end
```

### 8.2 Url path
`/api/auth/password-reset/verify`

### 8.3 Request method
`POST`

### 8.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Định dạng payload gửi lên |

### 8.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `challengeId` | `string (UUID)` | Có | UUID v4 | Mã phiên nhận được từ API yêu cầu OTP |
| `otp` | `string` | Có | 6 chữ số (`^\d{6}$`) | Mã OTP gồm 6 chữ số nhận qua email |

### 8.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `resetToken` | `string (Hex)` | Token dùng để đặt lại mật khẩu mới ở bước sau (hạn 15 phút) |
| `message` | `string` | `"Xác nhận OTP thành công."` |

### 8.7 error code
- `400 Bad Request`: OTP không đúng, hết hạn hoặc nhập sai quá 5 lần.
- `429 Too Many Requests`: Vượt quá giới hạn (Rate limit: tối đa 10 requests/phút).

### 8.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/auth/password-reset/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "challengeId": "550e8400-e29b-41d4-a716-446655440000",
    "otp": "482910"
  }'
```

**Response Success (200 OK):**
```json
{
  "resetToken": "8f3b2a1c9e4d5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4",
  "message": "Xác nhận OTP thành công."
}
```

**Response Error (400 Bad Request):**
```json
{
  "statusCode": 400,
  "code": "INVALID_OTP",
  "message": "OTP không đúng. Vui lòng kiểm tra lại.",
  "error": "Bad Request"
}
```

### 8.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `INVALID_OTP` | `OTP không đúng. Vui lòng kiểm tra lại.` | Nhập sai mã OTP, mã đã hết hạn sau 15 phút hoặc đã nhập sai vượt quá 5 lần. |
| `429` | - | `ThrottlerException: Too Many Requests` | Gửi yêu cầu xác thực OTP quá 10 lần trong 1 phút. |

---

## 9. API 9: Hoàn tất đặt mật khẩu mới (Complete Password Reset)

### 9.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Người dùng
    participant API as Auth Controller
    participant Service as AuthService
    participant DB as PostgreSQL DB

    Client->>API: POST /api/auth/password-reset/complete (resetToken, newPassword, confirmPassword)
    API->>Service: completePasswordReset(dto)
    
    alt newPassword != confirmPassword
        Service-->>Client: 400 Bad Request (Mật khẩu mới không khớp.)
    else Mật khẩu không đủ độ mạnh (8-16 ký tự, hoa, thường, số, ký tự đặc biệt)
        Service-->>Client: 400 Bad Request (Mật khẩu mới không hợp lệ. Vui lòng nhập lại.)
    else resetToken không hợp lệ hoặc đã hết hạn
        Service-->>Client: 400 Bad Request (INVALID_RESET_TOKEN)
    else Hợp lệ
        Service->>DB: Cập nhật mật khẩu mới (bcrypt hash) vào bảng users
        Service->>DB: Thu hồi (revoke) toàn bộ Refresh Tokens của user
        Service->>DB: Xóa bản ghi PasswordResetRequest hoàn tất
        Service-->>Client: 200 OK (message: "Đổi mật khẩu thành công.")
    end
```

### 9.2 Url path
`/api/auth/password-reset/complete`

### 9.3 Request method
`POST`

### 9.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Định dạng payload gửi lên |

### 9.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `resetToken` | `string` | Có | Min 20 ký tự | Token xác thực nhận từ API bước verify OTP |
| `newPassword` | `string` | Có | 8-16 ký tự, gồm chữ hoa, chữ thường, chữ số, ký tự đặc biệt | Mật khẩu mới |
| `confirmPassword` | `string` | Có | Khớp với `newPassword` | Xác nhận lại mật khẩu mới |

### 9.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `message` | `string` | `"Đổi mật khẩu thành công."` |

### 9.7 error code
- `400 Bad Request`: Mật khẩu không khớp, mật khẩu yếu, hoặc Reset Token không hợp lệ / hết hạn.
- `429 Too Many Requests`: Vượt quá giới hạn (Rate limit: tối đa 5 requests/phút).

### 9.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/auth/password-reset/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "resetToken": "8f3b2a1c9e4d5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4",
    "newPassword": "NewStrongPassword@2026",
    "confirmPassword": "NewStrongPassword@2026"
  }'
```

**Response Success (200 OK):**
```json
{
  "message": "Đổi mật khẩu thành công."
}
```

**Response Error (400 Bad Request):**
```json
{
  "statusCode": 400,
  "code": "INVALID_RESET_TOKEN",
  "message": "Phiên khôi phục mật khẩu đã hết hạn.",
  "error": "Bad Request"
}
```

### 9.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | - | `Mật khẩu mới không khớp.` | `newPassword` và `confirmPassword` không giống nhau. |
| `400` | - | `Mật khẩu mới không hợp lệ. Vui lòng nhập lại.` | Mật khẩu không thỏa mãn: 8-16 ký tự, có ít nhất 1 chữ hoa, 1 chữ thường, 1 chữ số, 1 ký tự đặc biệt. |
| `400` | `INVALID_RESET_TOKEN` | `Phiên khôi phục mật khẩu đã hết hạn.` | Reset token không đúng hoặc đã hết hạn 15 phút. |
| `400` | - | `Không tìm thấy tài khoản.` | Không tìm thấy tài khoản gắn với yêu cầu đặt lại mật khẩu. |
| `429` | - | `ThrottlerException: Too Many Requests` | Vượt quá 5 lần gọi trong 1 phút. |

---

## 10. API 10: Đổi mật khẩu tài khoản đang đăng nhập (Change Password)

### 10.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Người dùng đăng nhập
    participant Guard as JwtAuthGuard
    participant Service as AuthService
    participant DB as PostgreSQL DB

    Client->>Guard: PATCH /api/auth/password (Header: Bearer Token, Body: currentPassword, newPassword, confirmPassword)
    Guard->>Guard: Xác thực JWT Access Token
    Guard->>Service: changePassword(userId, dto)
    Service->>DB: Query User theo ID & đối chiếu bcrypt(currentPassword)
    
    alt Mật khẩu xác nhận không khớp
        Service-->>Client: 400 Bad Request (Mật khẩu mới không khớp.)
    else Mật khẩu hiện tại không đúng
        Service-->>Client: 400 Bad Request (Mật khẩu hiện tại không đúng.)
    else Hợp lệ
        Service->>DB: Cập nhật hash mật khẩu mới vào bảng users
        Service-->>Client: 200 OK (message: "Đổi mật khẩu thành công.")
    end
```

### 10.2 Url path
`/api/auth/password`

### 10.3 Request method
`PATCH`

### 10.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token của người dùng đang đăng nhập |
| `Content-Type` | `application/json` | Định dạng payload gửi lên |

### 10.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `currentPassword` | `string` | Có | Min 6 ký tự | Mật khẩu hiện tại của tài khoản |
| `newPassword` | `string` | Có | Min 6 ký tự | Mật khẩu mới |
| `confirmPassword` | `string` | Có | Khớp với `newPassword` | Xác nhận mật khẩu mới |

### 10.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `message` | `string` | `"Đổi mật khẩu thành công."` |

### 10.7 error code
- `400 Bad Request`: Mật khẩu hiện tại sai hoặc mật khẩu mới không khớp.
- `401 Unauthorized`: Token không hợp lệ hoặc đã hết hạn.

### 10.8 example

**Request (cURL):**
```bash
curl -X PATCH "http://localhost:3002/api/auth/password" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "OldPassword@123",
    "newPassword": "NewPassword@456",
    "confirmPassword": "NewPassword@456"
  }'
```

**Response Success (200 OK):**
```json
{
  "message": "Đổi mật khẩu thành công."
}
```

**Response Error (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": "Mật khẩu hiện tại không đúng.",
  "error": "Bad Request"
}
```

### 10.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | - | `Mật khẩu mới không khớp.` | `confirmPassword` không trùng với `newPassword`. |
| `400` | - | `Mật khẩu hiện tại không đúng.` | `currentPassword` nhập không khớp với mật khẩu đang lưu trữ. |
| `400` | - | `Không tìm thấy tài khoản.` | ID người dùng từ JWT không tồn tại trong hệ thống. |
| `401` | - | `Unauthorized` | Token đăng nhập không hợp lệ hoặc đã hết hạn. |
