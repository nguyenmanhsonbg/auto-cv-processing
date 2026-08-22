# TÀI LIỆU ĐẶC TẢ API - PHÂN HỆ FREELANCER & NHÂN SỰ NỘI BỘ (INTERNAL)

> **Hệ thống:** VCS Interview Assistant  
> **Base URL:**
> - Local/Dev API: `http://localhost:3002/api` (hoặc qua Vite Dev Proxy: `http://localhost:4000/api`)
> - Production API: `https://<domain>/api`

---

## MỤC LỤC

### A. PHÂN HỆ FREELANCER
1. [API 1: Tạo mới tài khoản Freelancer (Admin/HR)](#1-tạo-mới-tài-khoản-freelancer)
2. [API 2: Lấy thông tin tổng quan Freelancer cá nhân (Me Summary)](#2-lấy-thông-tin-tổng-quan-freelancer-cá-nhân)
3. [API 3: Danh sách hồ sơ ứng viên do Freelancer giới thiệu (Me Applications)](#3-danh-sách-hồ-sơ-ứng-viên-do-freelancer-giới-thiệu)
4. [API 4: Cập nhật ghi chú đánh giá ứng viên (Me Evaluation)](#4-cập-nhật-ghi-chú-đánh-giá-ứng-viên)
5. [API 5: Xem/Tải CV đã làm sạch thông tin (Clean CV)](#5-xemtải-cv-đã-làm-sạch-thông-tin-clean-cv)
6. [API 6: Danh sách tài khoản Freelancer trong hệ thống (Admin/HR)](#6-danh-sách-tài-khoản-freelancer-trong-hệ-thống)
7. [API 7: Xem chi tiết tài khoản Freelancer (Admin/HR)](#7-xem-chi-tiết-tài-khoản-freelancer)
8. [API 8: Danh sách hồ sơ giới thiệu của một Freelancer (Admin/HR)](#8-danh-sách-hồ-sơ-giới-thiệu-của-một-freelancer)
9. [API 9: Kích hoạt / Khóa tài khoản Freelancer (Admin/HR)](#9-kích-hoạt--khóa-tài-khoản-freelancer)

### B. PHÂN HỆ NHÂN SỰ NỘI BỘ (INTERNAL)
10. [API 10: Tạo hồ sơ nhân sự nội bộ (Admin/HR)](#10-tạo-hồ-sơ-nhân-sự-nội-bộ)
11. [API 11: Danh sách nhân sự nội bộ trong hệ thống (Admin/HR)](#11-danh-sách-nhân-sự-nội-bộ-trong-hệ-thống)
12. [API 12: Xem chi tiết hồ sơ nhân sự nội bộ (Admin/HR)](#12-xem-chi-tiết-hồ-sơ-nhân-sự-nội-bộ)
13. [API 13: Danh sách hồ sơ ứng viên do nhân sự nội bộ giới thiệu (Admin/HR)](#13-danh-sách-hồ-sơ-ứng-viên-do-nhân-sự-nội-bộ-giới-thiệu)
14. [API 14: Kích hoạt / Khóa hồ sơ nhân sự nội bộ (Admin/HR)](#14-kích-hoạt--khóa-hồ-sơ-nhân-sự-nội-bộ)

---

# A. PHÂN HỆ FREELANCER

## 1. Tạo mới tài khoản Freelancer

### 1.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / HR
    participant API as Freelancers Controller
    participant Service as Freelancers Service
    participant DB as PostgreSQL DB

    Admin->>API: POST /api/freelancers (name, email, phone)
    API->>Service: create(dto, createdById)
    Service->>DB: Kiểm tra trùng email trong bảng users
    
    alt Email đã tồn tại & Freelancer đang hoạt động
        Service-->>Admin: 400 Bad Request (DUPLICATE_EMAIL)
    else Email đã tồn tại & Freelancer đang bị khóa
        Service->>DB: Mở khóa (Active lại), cập nhật mật khẩu về mã định danh cũ
        Service-->>Admin: 200 OK (data + initialPassword)
    else Email chưa tồn tại
        Service->>DB: Tăng bộ đếm FreelancerIdentifierCounter (FL000001 -> FL999999)
        Service->>DB: Tạo User (role: FREELANCER, password: hash(identifier))
        Service->>DB: Tạo Freelancer profile
        Service-->>Admin: 200 OK (data + initialPassword)
    end
```

### 1.2 Url path
`/api/freelancers`

### 1.3 Request method
`POST`

### 1.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token của tài khoản có vai trò `ADMIN` hoặc `HR` |
| `Content-Type` | `application/json` | Định dạng payload gửi lên |

### 1.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `name` | `string` | Có | 1 - 255 ký tự | Họ và tên Freelancer |
| `email` | `string` | Có | Email hợp lệ, max 255 | Email định danh liên hệ |
| `phone` | `string` | Không | Max 50 ký tự | Số điện thoại liên hệ |

### 1.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | Trạng thái thành công (`true`) |
| `data` | `object` | Dữ liệu Freelancer vừa tạo |
| `data.freelancerId` | `string (UUID)` | ID định danh hồ sơ Freelancer |
| `data.identifier` | `string` | Mã định danh duy nhất (VD: `FL000001`) |
| `data.phone` | `string \| null` | Số điện thoại |
| `data.isActive` | `boolean` | Trạng thái hoạt động (`true`) |
| `data.applicationCount` | `number` | Số lượng CV đã giới thiệu (khởi tạo: `0`) |
| `data.user` | `object` | Tài khoản đăng nhập liên kết |
| `data.user.userId` | `string (UUID)` | ID tài khoản người dùng |
| `data.user.name` | `string` | Tên người dùng |
| `data.user.email` | `string` | Email tài khoản |
| `data.user.role` | `string` | Vai trò (`FREELANCER`) |
| `data.initialPassword` | `string` | Mật khẩu khởi tạo 1 lần (chính là mã `identifier`) |
| `data.createdBy` | `object \| null` | Thông tin người tạo (Admin/HR) |
| `data.createdAt` | `string (ISO 8601)` | Thời gian tạo |
| `data.updatedAt` | `string (ISO 8601)` | Thời gian cập nhật |
| `meta.timestamp` | `string (ISO 8601)` | Thời điểm xử lý request |

### 1.7 error code
- `400 Bad Request`: Email đã tồn tại, dữ liệu thiếu/sai định dạng, hoặc vượt quá giới hạn mã định danh (`FREELANCER_IDENTIFIER_LIMIT_REACHED`).
- `401 Unauthorized`: Chưa đăng nhập hoặc token hết hạn.
- `403 Forbidden`: Người dùng không có quyền `ADMIN` hoặc `HR`.

### 1.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/freelancers" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nguyễn Văn A",
    "email": "freelancer.a@example.com",
    "phone": "0988123456"
  }'
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "freelancerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "identifier": "FL000001",
    "phone": "0988123456",
    "isActive": true,
    "applicationCount": 0,
    "user": {
      "userId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "name": "Nguyễn Văn A",
      "email": "freelancer.a@example.com",
      "role": "FREELANCER"
    },
    "createdBy": {
      "userId": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
      "name": "Admin Test",
      "email": "admin.test@example.com"
    },
    "createdAt": "2026-08-19T04:00:00.000Z",
    "updatedAt": "2026-08-19T04:00:00.000Z",
    "initialPassword": "FL000001"
  },
  "meta": {
    "timestamp": "2026-08-19T04:00:00.123Z"
  }
}
```

**Response Error (400 Bad Request):**
```json
{
  "statusCode": 400,
  "code": "DUPLICATE_EMAIL",
  "message": "Email đã được sử dụng.",
  "error": "Bad Request"
}
```

### 1.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `DUPLICATE_EMAIL` | `Email đã được sử dụng.` | Email đã được liên kết với một tài khoản khác trong hệ thống. |
| `400` | `FREELANCER_IDENTIFIER_LIMIT_REACHED` | `Freelancer identifier limit has been reached.` | Đã phát hành hết dải mã định danh từ `FL000001` đến `FL999999`. |
| `401` | - | `Unauthorized` | Thiếu hoặc token không hợp lệ. |
| `403` | - | `Forbidden resource` | Tài khoản gọi API không có quyền `ADMIN` hoặc `HR`. |

---

## 2. Lấy thông tin tổng quan Freelancer cá nhân

### 2.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Freelancer / Internal
    participant Guard as JwtAuthGuard & RolesGuard
    participant Service as Freelancers Service
    participant DB as PostgreSQL DB

    Client->>Guard: GET /api/freelancers/me/summary (Bearer Token)
    Guard->>Guard: Kiểm tra quyền FREELANCER hoặc INTERNAL
    Guard->>Service: findMySummary(userId, role)
    
    alt Role là INTERNAL
        Service->>DB: Lấy thông tin từ bảng internals & đếm số referral
    else Role là FREELANCER
        Service->>DB: Lấy thông tin từ bảng freelancers (isActive = true)
    end
    
    DB-->>Service: Dữ liệu tổng quan
    Service-->>Client: 200 OK (data + applicationCount)
```

### 2.2 Url path
`/api/freelancers/me/summary`

### 2.3 Request method
`GET`

### 2.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token của tài khoản có vai trò `FREELANCER` hoặc `INTERNAL` |

### 2.5 input
Không có body hay query parameter. Dữ liệu trích xuất từ JWT token hiện tại.

### 2.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data.freelancerId` | `string (UUID)` | ID hồ sơ Freelancer hoặc Internal |
| `data.identifier` | `string` | Mã định danh (`FL000001` hoặc `INTERNAL`) |
| `data.phone` | `string \| null` | Số điện thoại liên hệ |
| `data.isActive` | `boolean` | Trạng thái hoạt động |
| `data.applicationCount` | `number` | Tổng số hồ sơ CV ứng viên đã giới thiệu |
| `data.user` | `object` | Thông tin tài khoản (`userId`, `name`, `email`, `role`) |
| `data.createdBy` | `object \| null` | Người tạo tài khoản |

### 2.7 error code
- `400 Bad Request`: Hồ sơ không tồn tại hoặc bị khóa (`FREELANCER_NOT_FOUND`).
- `401 Unauthorized`: Chưa xác thực token.
- `403 Forbidden`: Người dùng không có vai trò `FREELANCER` hoặc `INTERNAL`.

### 2.8 example

**Request (cURL):**
```bash
curl -X GET "http://localhost:3002/api/freelancers/me/summary" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "freelancerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "identifier": "FL000001",
    "phone": "0988123456",
    "isActive": true,
    "applicationCount": 12,
    "user": {
      "userId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "name": "Nguyễn Văn A",
      "email": "freelancer.a@example.com",
      "role": "FREELANCER"
    },
    "createdBy": {
      "userId": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
      "name": "Admin Test",
      "email": "admin.test@example.com"
    },
    "createdAt": "2026-08-19T04:00:00.000Z",
    "updatedAt": "2026-08-19T04:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-08-19T04:15:00.000Z"
  }
}
```

### 2.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `FREELANCER_NOT_FOUND` | `Freelancer not found.` | Tài khoản không có hồ sơ liên kết hoặc hồ sơ đã bị khóa. |
| `401` | - | `Unauthorized` | Token không hợp lệ hoặc hết hạn. |
| `403` | - | `Forbidden resource` | Người dùng không phải là `FREELANCER` hoặc `INTERNAL`. |

---

## 3. Danh sách hồ sơ ứng viên do Freelancer giới thiệu

### 3.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Freelancer / Internal
    participant API as Freelancers Controller
    participant Service as Freelancers Service
    participant DB as PostgreSQL DB

    Client->>API: GET /api/freelancers/me/applications (Query: page, limit, search, status...)
    API->>Service: findMyApplications(userId, query, role)
    Service->>DB: Query bảng application_referrals lọc theo ownerId & sourceType
    DB-->>Service: Danh sách applications + tổng số
    Service-->>Client: 200 OK (data, pagination, meta)
```

### 3.2 Url path
`/api/freelancers/me/applications`

### 3.3 Request method
`GET`

### 3.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `FREELANCER` hoặc `INTERNAL` |

### 3.5 input
**Query Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `integer` | Không | `1` | Số thứ tự trang (Min: 1) |
| `limit` | `integer` | Không | `20` | Số bản ghi / trang (1 - 100) |
| `search` | `string` | Không | - | Tìm theo tên ứng viên hoặc tiêu đề vị trí tuyển dụng |
| `processStatus` | `string` | Không | - | Trạng thái ứng tuyển (`NEW`, `SCREENING`, `INTERVIEW_ROUND_1`, `OFFERED`, `REJECTED`...) |
| `hrReceptionStatus` | `string` | Không | - | Trạng thái tiếp nhận HR (`ACCEPT`, `REJECT`) |
| `sortOrder` | `string` | Không | `DESC` | Thứ tự sắp xếp (`ASC` hoặc `DESC`) theo ngày nộp |

### 3.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `array` | Danh sách hồ sơ đã nộp |
| `data[].referralId` | `string (UUID)` | ID bản ghi giới thiệu referral |
| `data[].applicationId` | `string (UUID)` | ID hồ sơ ứng tuyển |
| `data[].candidate.candidateId` | `string (UUID)` | ID ứng viên |
| `data[].candidate.fullName` | `string` | Họ tên ứng viên |
| `data[].jobPosting.jobPostingId` | `string (UUID)` | ID tin tuyển dụng |
| `data[].jobPosting.title` | `string` | Tiêu đề tin tuyển dụng |
| `data[].processStatus` | `string` | Trạng thái tiến trình ứng tuyển |
| `data[].hrReceptionStatus` | `string \| null` | Trạng thái HR đánh giá tiếp nhận |
| `data[].evaluation` | `string \| null` | Ghi chú đánh giá do Freelancer tự ghi |
| `data[].appliedAt` | `string (ISO 8601)` | Thời điểm nộp hồ sơ |
| `data[].assignees` | `array` | Danh sách HR/Interviewer phụ trách |
| `pagination` | `object` | Thông tin phân trang (`page`, `limit`, `total`, `totalPages`) |
| `meta.timestamp` | `string (ISO 8601)` | Thời điểm xử lý request |

### 3.7 error code
- `400 Bad Request`: Tham số truy vấn không hợp lệ hoặc không tìm thấy hồ sơ.
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không có quyền truy cập.

### 3.8 example

**Request (cURL):**
```bash
curl -X GET "http://localhost:3002/api/freelancers/me/applications?page=1&limit=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "referralId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "applicationId": "d4e5f6a7-b8c9-0123-def1-234567890123",
      "candidate": {
        "candidateId": "e5f6a7b8-c9d0-1234-ef12-345678901234",
        "fullName": "Trần Thị B"
      },
      "jobPosting": {
        "jobPostingId": "f6a7b8c9-d0e1-2345-f123-456789012345",
        "title": "Senior Backend NodeJS Engineer"
      },
      "processStatus": "HR_REVIEW",
      "hrReceptionStatus": "ACCEPT",
      "evaluation": "Ứng viên có 4 năm kinh nghiệm làm việc với NestJS và PostgreSQL.",
      "appliedAt": "2026-08-18T10:00:00.000Z",
      "assignees": [
        {
          "userId": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
          "name": "HR Lead",
          "email": "hr.lead@vcs.com"
        }
      ],
      "createdAt": "2026-08-18T10:00:00.000Z",
      "updatedAt": "2026-08-18T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "timestamp": "2026-08-19T04:20:00.000Z"
  }
}
```

### 3.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `FREELANCER_NOT_FOUND` | `Freelancer not found.` | Hồ sơ Freelancer không hợp lệ hoặc đã bị khóa. |
| `401` | - | `Unauthorized` | Token hết hạn hoặc không đúng. |
| `403` | - | `Forbidden resource` | Người dùng không có quyền truy cập endpoint này. |

---

## 4. Cập nhật ghi chú đánh giá ứng viên

### 4.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Freelancer / Internal
    participant API as Freelancers Controller
    participant Service as Freelancers Service
    participant DB as PostgreSQL DB

    Client->>API: PATCH /api/freelancers/me/applications/:referralId/evaluation (Body: evaluation)
    API->>Service: updateMyApplicationEvaluation(userId, {referralId, evaluation}, role)
    Service->>DB: Tìm referral theo referralId và ownerId
    
    alt Không tìm thấy bản ghi referral thuộc sở hữu của user
        Service-->>Client: 400 Bad Request (FREELANCER_APPLICATION_NOT_FOUND)
    else Hợp lệ
        Service->>DB: Cập nhật trường evaluation (tối đa 2000 ký tự)
        Service-->>Client: 200 OK (data cập nhật)
    end
```

### 4.2 Url path
`/api/freelancers/me/applications/:referralId/evaluation`

### 4.3 Request method
`PATCH`

### 4.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `FREELANCER` hoặc `INTERNAL` |
| `Content-Type` | `application/json` | Định dạng payload |

### 4.5 input
**Path Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `referralId` | `string (UUID)` | Có | ID bản ghi giới thiệu ứng viên |

**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `evaluation` | `string \| null` | Có | Max 2000 ký tự | Nội dung nhận xét/đánh giá ứng viên. Truyền `null` để xóa ghi chú |

### 4.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `object` | Bản ghi referral sau khi cập nhật ghi chú |

### 4.7 error code
- `400 Bad Request`: `referralId` không tồn tại hoặc không thuộc quyền quản lý của Freelancer.
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không có quyền thực hiện.

### 4.8 example

**Request (cURL):**
```bash
curl -X PATCH "http://localhost:3002/api/freelancers/me/applications/c3d4e5f6-a7b8-9012-cdef-123456789012/evaluation" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "evaluation": "Ứng viên có kỹ năng thuật toán tốt, đã từng lead dự án quy mô 10 người."
  }'
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "referralId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "applicationId": "d4e5f6a7-b8c9-0123-def1-234567890123",
    "candidate": {
      "candidateId": "e5f6a7b8-c9d0-1234-ef12-345678901234",
      "fullName": "Trần Thị B"
    },
    "jobPosting": {
      "jobPostingId": "f6a7b8c9-d0e1-2345-f123-456789012345",
      "title": "Senior Backend NodeJS Engineer"
    },
    "processStatus": "HR_REVIEW",
    "hrReceptionStatus": "ACCEPT",
    "evaluation": "Ứng viên có kỹ năng thuật toán tốt, đã từng lead dự án quy mô 10 người.",
    "appliedAt": "2026-08-18T10:00:00.000Z",
    "assignees": [],
    "createdAt": "2026-08-18T10:00:00.000Z",
    "updatedAt": "2026-08-19T04:25:00.000Z"
  },
  "meta": {
    "timestamp": "2026-08-19T04:25:00.123Z"
  }
}
```

### 4.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `FREELANCER_APPLICATION_NOT_FOUND` | `Freelancer application referral not found.` | `referralId` không tồn tại hoặc không phải do người dùng này giới thiệu. |
| `400` | `FREELANCER_NOT_FOUND` | `Freelancer not found.` | Tài khoản không có hồ sơ liên kết hợp lệ. |

---

## 5. Xem/Tải CV đã làm sạch thông tin (Clean CV)

### 5.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Client as Freelancer / Internal
    participant API as Freelancers Controller
    participant Service as Freelancers Service
    participant DocService as CvDocumentsService
    participant Storage as File System Storage

    Client->>API: GET /api/freelancers/me/applications/:referralId/cv?disposition=inline|attachment
    API->>Service: getMyApplicationCv(userId, referralId, accessMode, role)
    Service->>DocService: Kiểm tra quyền & Lấy đường dẫn file Clean CV đã che thông tin nhạy cảm
    
    alt File không tồn tại trên ổ đĩa
        API-->>Client: 503 Service Unavailable (CLEAN_CV_FILE_UNAVAILABLE)
    else File sẵn sàng
        DocService-->>API: filePath, mimeType, fileSize, fileName
        API-->>Client: 200 OK (Stream nhị phân PDF/Word kèm header Content-Disposition)
    end
```

### 5.2 Url path
`/api/freelancers/me/applications/:referralId/cv`

### 5.3 Request method
`GET`

### 5.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `FREELANCER` hoặc `INTERNAL` |

### 5.5 input
**Path Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `referralId` | `string (UUID)` | Có | ID bản ghi referral ứng viên |

**Query Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `disposition` | `string` | Không | `inline` | Chế độ hiển thị: `inline` (xem trực tiếp trên trình duyệt) hoặc `attachment` (tải file về máy) |

### 5.6 output
**Binary Stream:** Trả về file nhị phân trực tiếp (không bọc trong JSON envelope).
- `Content-Type`: `application/pdf` hoặc định dạng MIME gốc của file.
- `Content-Disposition`: `inline; filename="..."` hoặc `attachment; filename="..."`
- `Content-Length`: Kích thước file (bytes).

### 5.7 error code
- `400 Bad Request`: `referralId` không hợp lệ hoặc CV chưa được xử lý làm sạch.
- `503 Service Unavailable`: File vật lý trên server tạm thời không khả dụng (`CLEAN_CV_FILE_UNAVAILABLE`).

### 5.8 example

**Request (cURL):**
```bash
curl -X GET "http://localhost:3002/api/freelancers/me/applications/c3d4e5f6-a7b8-9012-cdef-123456789012/cv?disposition=inline" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  --output "clean_cv_preview.pdf"
```

**Response Headers (200 OK):**
```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Length: 245120
Content-Disposition: inline; filename="Clean_CV_TranThiB.pdf"
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

### 5.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `FREELANCER_APPLICATION_NOT_FOUND` | `Freelancer application referral not found.` | Bản ghi referral không thuộc về tài khoản này. |
| `400` | `CURRENT_CV_NOT_AVAILABLE` | `Current CV is not available for this application.` | Hồ sơ ứng tuyển chưa có CV được upload hoặc chưa qua bước làm sạch. |
| `503` | `CLEAN_CV_FILE_UNAVAILABLE` | `Clean CV file is not available.` | File vật lý trên đĩa cứng bị thiếu hoặc gặp lỗi khi đọc luồng stream. |

---

## 6. Danh sách tài khoản Freelancer trong hệ thống

### 6.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / HR
    participant API as Freelancers Controller
    participant Service as Freelancers Service
    participant DB as PostgreSQL DB

    Admin->>API: GET /api/freelancers (page, limit, search, status, sortBy, sortOrder)
    API->>Service: findPaginated(query)
    Service->>DB: Query bảng freelancers join users, đếm số hồ sơ ứng tuyển đã nộp
    DB-->>Service: Danh sách Freelancers + total count
    Service-->>Admin: 200 OK (data, pagination, meta)
```

### 6.2 Url path
`/api/freelancers`

### 6.3 Request method
`GET`

### 6.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token của tài khoản vai trò `ADMIN` hoặc `HR` |

### 6.5 input
**Query Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `integer` | Không | `1` | Số trang (Min: 1) |
| `limit` | `integer` | Không | `20` | Số lượng bản ghi / trang (1 - 100) |
| `search` | `string` | Không | - | Tìm kiếm theo tên, email hoặc mã định danh `identifier` |
| `status` | `string` | Không | - | Lọc theo trạng thái: `ACTIVE` hoặc `INACTIVE` |
| `sortBy` | `string` | Không | `createdAt` | Trường sắp xếp: `identifier`, `name`, `email`, `createdAt`, `updatedAt` |
| `sortOrder` | `string` | Không | `DESC` | Chiều sắp xếp: `ASC` hoặc `DESC` |

### 6.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `array` | Danh sách tài khoản Freelancer |
| `data[].freelancerId` | `string (UUID)` | ID hồ sơ Freelancer |
| `data[].identifier` | `string` | Mã định danh (`FL000001`) |
| `data[].phone` | `string \| null` | Số điện thoại |
| `data[].isActive` | `boolean` | Trạng thái hoạt động |
| `data[].applicationCount` | `number` | Tổng số hồ sơ đã nộp qua Freelancer này |
| `data[].user` | `object` | Thông tin tài khoản (`userId`, `name`, `email`, `role`) |
| `data[].createdBy` | `object \| null` | Thông tin người tạo |
| `data[].createdAt` | `string (ISO 8601)` | Ngày tạo |
| `data[].updatedAt` | `string (ISO 8601)` | Ngày cập nhật |
| `pagination` | `object` | Phân trang (`page`, `limit`, `total`, `totalPages`) |

### 6.7 error code
- `401 Unauthorized`: Chưa đăng nhập hoặc token không đúng.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 6.8 example

**Request (cURL):**
```bash
curl -X GET "http://localhost:3002/api/freelancers?page=1&limit=20&status=ACTIVE" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "freelancerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "identifier": "FL000001",
      "phone": "0988123456",
      "isActive": true,
      "applicationCount": 5,
      "user": {
        "userId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "name": "Nguyễn Văn A",
        "email": "freelancer.a@example.com",
        "role": "FREELANCER"
      },
      "createdBy": {
        "userId": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
        "name": "Admin Test",
        "email": "admin.test@example.com"
      },
      "createdAt": "2026-08-19T04:00:00.000Z",
      "updatedAt": "2026-08-19T04:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "timestamp": "2026-08-19T04:30:00.000Z"
  }
}
```

### 6.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `401` | - | `Unauthorized` | Token thiếu hoặc không đúng. |
| `403` | - | `Forbidden resource` | Tài khoản không có vai trò `ADMIN` hoặc `HR`. |

---

## 7. Xem chi tiết tài khoản Freelancer

### 7.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / HR
    participant API as Freelancers Controller
    participant Service as Freelancers Service
    participant DB as PostgreSQL DB

    Admin->>API: GET /api/freelancers/:id (UUID)
    API->>Service: findOne(id)
    Service->>DB: Query Freelancer theo id kèm relations user, createdBy
    
    alt Không tìm thấy Freelancer
        Service-->>Admin: 400 Bad Request (FREELANCER_NOT_FOUND)
    else Hợp lệ
        Service-->>Admin: 200 OK (data chi tiết)
    end
```

### 7.2 Url path
`/api/freelancers/:id`

### 7.3 Request method
`GET`

### 7.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `ADMIN` hoặc `HR` |

### 7.5 input
**Path Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `string (UUID)` | Có | ID định danh hồ sơ Freelancer |

### 7.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `object` | Chi tiết hồ sơ Freelancer (`freelancerId`, `identifier`, `phone`, `isActive`, `applicationCount`, `user`, `createdBy`, `createdAt`, `updatedAt`) |

### 7.7 error code
- `400 Bad Request`: ID không đúng định dạng UUID hoặc không tìm thấy Freelancer (`FREELANCER_NOT_FOUND`).
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 7.8 example

**Request (cURL):**
```bash
curl -X GET "http://localhost:3002/api/freelancers/a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "freelancerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "identifier": "FL000001",
    "phone": "0988123456",
    "isActive": true,
    "applicationCount": 5,
    "user": {
      "userId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "name": "Nguyễn Văn A",
      "email": "freelancer.a@example.com",
      "role": "FREELANCER"
    },
    "createdBy": {
      "userId": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
      "name": "Admin Test",
      "email": "admin.test@example.com"
    },
    "createdAt": "2026-08-19T04:00:00.000Z",
    "updatedAt": "2026-08-19T04:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-08-19T04:35:00.000Z"
  }
}
```

### 7.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `FREELANCER_NOT_FOUND` | `Freelancer not found.` | Không tìm thấy bản ghi Freelancer tương ứng với ID truyền vào. |
| `400` | - | `Validation failed (uuid is expected)` | Tham số `:id` không đúng chuẩn UUID v4. |

---

## 8. Danh sách hồ sơ giới thiệu của một Freelancer

### 8.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / HR
    participant API as Freelancers Controller
    participant Service as Freelancers Service
    participant DB as PostgreSQL DB

    Admin->>API: GET /api/freelancers/:id/applications (query params)
    API->>Service: findApplications(id, query)
    Service->>DB: Kiểm tra Freelancer id tồn tại
    Service->>DB: Query các đơn ứng tuyển do Freelancer id này giới thiệu
    DB-->>Service: Danh sách đơn ứng tuyển + count
    Service-->>Admin: 200 OK (data, pagination, meta)
```

### 8.2 Url path
`/api/freelancers/:id/applications`

### 8.3 Request method
`GET`

### 8.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `ADMIN` hoặc `HR` |

### 8.5 input
**Path Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `string (UUID)` | Có | ID định danh hồ sơ Freelancer |

**Query Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `integer` | Không | `1` | Số trang (Min: 1) |
| `limit` | `integer` | Không | `20` | Số lượng bản ghi / trang (1 - 100) |
| `search` | `string` | Không | - | Tìm kiếm theo tên ứng viên hoặc tiêu đề công việc |
| `processStatus` | `string` | Không | - | Trạng thái ứng tuyển (`NEW`, `SCREENING`, `INTERVIEW_ROUND_1`...) |
| `hrReceptionStatus` | `string` | Không | - | Trạng thái tiếp nhận HR (`ACCEPT`, `REJECT`) |
| `sortOrder` | `string` | Không | `DESC` | Sắp xếp `ASC` hoặc `DESC` |

### 8.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `array` | Danh sách đơn ứng tuyển (`referralId`, `applicationId`, `candidate`, `jobPosting`, `processStatus`, `hrReceptionStatus`, `evaluation`, `appliedAt`, `assignees`) |
| `pagination` | `object` | Thông tin phân trang |

### 8.7 error code
- `400 Bad Request`: Freelancer không tồn tại (`FREELANCER_NOT_FOUND`).
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 8.8 example

**Request (cURL):**
```bash
curl -X GET "http://localhost:3002/api/freelancers/a1b2c3d4-e5f6-7890-abcd-ef1234567890/applications?page=1&limit=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "referralId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "applicationId": "d4e5f6a7-b8c9-0123-def1-234567890123",
      "candidate": {
        "candidateId": "e5f6a7b8-c9d0-1234-ef12-345678901234",
        "fullName": "Trần Thị B"
      },
      "jobPosting": {
        "jobPostingId": "f6a7b8c9-d0e1-2345-f123-456789012345",
        "title": "Senior Backend NodeJS Engineer"
      },
      "processStatus": "HR_REVIEW",
      "hrReceptionStatus": "ACCEPT",
      "evaluation": "Ứng viên tiềm năng",
      "appliedAt": "2026-08-18T10:00:00.000Z",
      "assignees": [],
      "createdAt": "2026-08-18T10:00:00.000Z",
      "updatedAt": "2026-08-18T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "timestamp": "2026-08-19T04:40:00.000Z"
  }
}
```

### 8.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `FREELANCER_NOT_FOUND` | `Freelancer not found.` | ID Freelancer không tồn tại. |

---

## 9. Kích hoạt / Khóa tài khoản Freelancer

### 9.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / HR
    participant API as Freelancers Controller
    participant Service as Freelancers Service
    participant DB as PostgreSQL DB

    Admin->>API: PATCH /api/freelancers/:id/status (Body: isActive)
    API->>Service: updateStatus(id, isActive)
    Service->>DB: Kiểm tra trạng thái hiện tại
    
    alt Trạng thái cần cập nhật trùng với trạng thái hiện tại
        Service-->>Admin: 400 Bad Request (FREELANCER_ALREADY_ACTIVE / FREELANCER_ALREADY_INACTIVE)
    else Hợp lệ
        Service->>DB: Cập nhật isActive trong bảng freelancers
        Service-->>Admin: 200 OK (data chi tiết mới)
    end
```

### 9.2 Url path
`/api/freelancers/:id/status`

### 9.3 Request method
`PATCH`

### 9.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `ADMIN` hoặc `HR` |
| `Content-Type` | `application/json` | Định dạng dữ liệu |

### 9.5 input
**Path Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `string (UUID)` | Có | ID định danh hồ sơ Freelancer |

**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `isActive` | `boolean` | Có | `true` hoặc `false` | Trạng thái cần cập nhật: `true` (Mở khóa), `false` (Khóa tài khoản) |

### 9.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `object` | Hồ sơ Freelancer sau khi cập nhật trạng thái |

### 9.7 error code
- `400 Bad Request`: Freelancer không tồn tại hoặc trạng thái tài khoản đã ở giá trị yêu cầu.
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 8.8 example

**Request (cURL):**
```bash
curl -X PATCH "http://localhost:3002/api/freelancers/a1b2c3d4-e5f6-7890-abcd-ef1234567890/status" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": false
  }'
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "freelancerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "identifier": "FL000001",
    "phone": "0988123456",
    "isActive": false,
    "applicationCount": 5,
    "user": {
      "userId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "name": "Nguyễn Văn A",
      "email": "freelancer.a@example.com",
      "role": "FREELANCER"
    },
    "createdBy": {
      "userId": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
      "name": "Admin Test",
      "email": "admin.test@example.com"
    },
    "createdAt": "2026-08-19T04:00:00.000Z",
    "updatedAt": "2026-08-19T04:45:00.000Z"
  },
  "meta": {
    "timestamp": "2026-08-19T04:45:00.123Z"
  }
}
```

### 9.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `FREELANCER_NOT_FOUND` | `Freelancer not found.` | ID Freelancer không tồn tại trong hệ thống. |
| `400` | `FREELANCER_ALREADY_ACTIVE` | `Nhân sự đã được mở khoá.` | Gửi request `isActive: true` khi tài khoản đã đang mở khóa. |
| `400` | `FREELANCER_ALREADY_INACTIVE` | `Nhân sự đã bị khoá.` | Gửi request `isActive: false` khi tài khoản đã đang bị khóa. |

---

# B. PHÂN HỆ NHÂN SỰ NỘI BỘ (INTERNAL)

## 10. Tạo hồ sơ nhân sự nội bộ

### 10.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / HR
    participant API as Internals Controller
    participant Service as Internals Service
    participant DB as PostgreSQL DB

    Admin->>API: POST /api/internals (name, email, phone)
    API->>Service: create(dto, createdById)
    Service->>Service: Chuẩn hóa email (trim, lowercase)
    Service->>DB: Kiểm tra trùng email trong bảng internals
    
    alt Email đã tồn tại
        Service-->>Admin: 400 Bad Request (INTERNAL_EMAIL_EXISTS)
    else Hợp lệ
        Service->>DB: Lưu bản ghi mới vào bảng internals (isActive: true)
        Service-->>Admin: 200 OK (data + meta)
    end
```

### 10.2 Url path
`/api/internals`

### 10.3 Request method
`POST`

### 10.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token của tài khoản có vai trò `ADMIN` hoặc `HR` |
| `Content-Type` | `application/json` | Định dạng payload |

### 10.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `name` | `string` | Có | 1 - 255 ký tự | Họ và tên nhân sự nội bộ |
| `email` | `string` | Có | 1 - 255 ký tự, email hợp lệ | Email nội bộ công ty (VD: `employee@viettel.com.vn`) |
| `phone` | `string` | Có | 1 - 50 ký tự | Số điện thoại nhân sự |

### 10.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data.internalId` | `string (UUID)` | ID hồ sơ nhân sự nội bộ |
| `data.name` | `string` | Họ và tên |
| `data.email` | `string` | Email nội bộ |
| `data.phone` | `string` | Số điện thoại |
| `data.isActive` | `boolean` | Trạng thái hoạt động (`true`) |
| `data.applicationCount` | `number` | Số lượng CV đã giới thiệu (khởi tạo: `0`) |
| `data.createdBy` | `object \| null` | Thông tin người tạo (Admin/HR) |
| `data.createdAt` | `string (ISO 8601)` | Ngày tạo |
| `data.updatedAt` | `string (ISO 8601)` | Ngày cập nhật |
| `meta.timestamp` | `string (ISO 8601)` | Thời điểm xử lý request |

### 10.7 error code
- `400 Bad Request`: Email đã tồn tại hoặc dữ liệu không hợp lệ.
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 10.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/internals" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lê Văn C",
    "email": "levanc@viettel.com.vn",
    "phone": "0977123456"
  }'
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "internalId": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
    "name": "Lê Văn C",
    "email": "levanc@viettel.com.vn",
    "phone": "0977123456",
    "isActive": true,
    "applicationCount": 0,
    "createdBy": {
      "userId": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
      "name": "Admin Test",
      "email": "admin.test@example.com"
    },
    "createdAt": "2026-08-19T05:00:00.000Z",
    "updatedAt": "2026-08-19T05:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-08-19T05:00:00.123Z"
  }
}
```

**Response Error (400 Bad Request):**
```json
{
  "statusCode": 400,
  "code": "INTERNAL_EMAIL_EXISTS",
  "message": "An Internal with this email already exists.",
  "error": "Bad Request"
}
```

### 10.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `INTERNAL_EMAIL_EXISTS` | `An Internal with this email already exists.` | Email này đã được đăng ký trong danh sách nhân sự nội bộ trước đó. |
| `401` | - | `Unauthorized` | Token hết hạn hoặc không hợp lệ. |
| `403` | - | `Forbidden resource` | Tài khoản không có vai trò `ADMIN` hoặc `HR`. |

---

## 11. Danh sách nhân sự nội bộ trong hệ thống

### 11.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / HR
    participant API as Internals Controller
    participant Service as Internals Service
    participant DB as PostgreSQL DB

    Admin->>API: GET /api/internals (page, limit, search, status, sortBy, sortOrder)
    API->>Service: findPaginated(query)
    Service->>DB: Query bảng internals, tìm kiếm name/email/phone, đếm số referral
    DB-->>Service: Danh sách Internals + total
    Service-->>Admin: 200 OK (data, pagination, meta)
```

### 11.2 Url path
`/api/internals`

### 11.3 Request method
`GET`

### 11.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `ADMIN` hoặc `HR` |

### 11.5 input
**Query Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `integer` | Không | `1` | Số trang (Min: 1) |
| `limit` | `integer` | Không | `20` | Số bản ghi / trang (1 - 100) |
| `search` | `string` | Không | - | Tìm kiếm theo tên, email hoặc số điện thoại |
| `status` | `string` | Không | - | Lọc theo trạng thái: `ACTIVE` hoặc `INACTIVE` |
| `sortBy` | `string` | Không | `createdAt` | Trường sắp xếp: `email`, `createdAt`, `updatedAt` |
| `sortOrder` | `string` | Không | `DESC` | Sắp xếp: `ASC` hoặc `DESC` |

### 11.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `array` | Danh sách nhân sự nội bộ |
| `data[].internalId` | `string (UUID)` | ID hồ sơ nội bộ |
| `data[].name` | `string` | Họ tên |
| `data[].email` | `string` | Email |
| `data[].phone` | `string` | Số điện thoại |
| `data[].isActive` | `boolean` | Trạng thái hoạt động |
| `data[].applicationCount` | `number` | Số lượng CV đã giới thiệu |
| `data[].createdBy` | `object \| null` | Thông tin người tạo |
| `data[].createdAt` | `string (ISO 8601)` | Ngày tạo |
| `data[].updatedAt` | `string (ISO 8601)` | Ngày cập nhật |
| `pagination` | `object` | Thông tin phân trang |

### 11.7 error code
- `401 Unauthorized`: Chưa xác thực token.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 11.8 example

**Request (cURL):**
```bash
curl -X GET "http://localhost:3002/api/internals?page=1&limit=10&status=ACTIVE" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "internalId": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
      "name": "Lê Văn C",
      "email": "levanc@viettel.com.vn",
      "phone": "0977123456",
      "isActive": true,
      "applicationCount": 3,
      "createdBy": {
        "userId": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
        "name": "Admin Test",
        "email": "admin.test@example.com"
      },
      "createdAt": "2026-08-19T05:00:00.000Z",
      "updatedAt": "2026-08-19T05:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "timestamp": "2026-08-19T05:05:00.000Z"
  }
}
```

### 11.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `401` | - | `Unauthorized` | Token hết hạn hoặc không đúng. |
| `403` | - | `Forbidden resource` | Tài khoản không có vai trò `ADMIN` hoặc `HR`. |

---

## 12. Xem chi tiết hồ sơ nhân sự nội bộ

### 12.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / HR
    participant API as Internals Controller
    participant Service as Internals Service
    participant DB as PostgreSQL DB

    Admin->>API: GET /api/internals/:id (UUID)
    API->>Service: findOne(id)
    Service->>DB: Query Internal theo id kèm relations & count
    
    alt Không tìm thấy Internal
        Service-->>Admin: 400 Bad Request (INTERNAL_NOT_FOUND)
    else Hợp lệ
        Service-->>Admin: 200 OK (data chi tiết)
    end
```

### 12.2 Url path
`/api/internals/:id`

### 12.3 Request method
`GET`

### 12.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `ADMIN` hoặc `HR` |

### 12.5 input
**Path Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `string (UUID)` | Có | ID định danh hồ sơ nhân sự nội bộ |

### 12.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `object` | Chi tiết hồ sơ (`internalId`, `name`, `email`, `phone`, `isActive`, `applicationCount`, `createdBy`, `createdAt`, `updatedAt`) |

### 12.7 error code
- `400 Bad Request`: Không tìm thấy bản ghi (`INTERNAL_NOT_FOUND`) hoặc sai định dạng UUID.
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 12.8 example

**Request (cURL):**
```bash
curl -X GET "http://localhost:3002/api/internals/f1e2d3c4-b5a6-7890-1234-567890abcdef" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "internalId": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
    "name": "Lê Văn C",
    "email": "levanc@viettel.com.vn",
    "phone": "0977123456",
    "isActive": true,
    "applicationCount": 3,
    "createdBy": {
      "userId": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
      "name": "Admin Test",
      "email": "admin.test@example.com"
    },
    "createdAt": "2026-08-19T05:00:00.000Z",
    "updatedAt": "2026-08-19T05:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-08-19T05:10:00.000Z"
  }
}
```

### 12.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `INTERNAL_NOT_FOUND` | `Internal not found.` | Không tìm thấy hồ sơ nhân sự nội bộ tương ứng với ID. |

---

## 13. Danh sách hồ sơ ứng viên do nhân sự nội bộ giới thiệu

### 13.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / HR
    participant API as Internals Controller
    participant Service as Internals Service
    participant DB as PostgreSQL DB

    Admin->>API: GET /api/internals/:id/applications (query params)
    API->>Service: findApplications(id, query)
    Service->>DB: Kiểm tra Internal id tồn tại
    Service->>DB: Query bảng application_referrals (internalId, sourceType: INTERNAL)
    DB-->>Service: Danh sách đơn ứng tuyển + count
    Service-->>Admin: 200 OK (data, pagination, meta)
```

### 13.2 Url path
`/api/internals/:id/applications`

### 13.3 Request method
`GET`

### 13.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `ADMIN` hoặc `HR` |

### 13.5 input
**Path Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `string (UUID)` | Có | ID định danh hồ sơ nhân sự nội bộ |

**Query Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `integer` | Không | `1` | Số trang (Min: 1) |
| `limit` | `integer` | Không | `20` | Số bản ghi / trang (1 - 100) |
| `search` | `string` | Không | - | Tìm kiếm theo tên ứng viên hoặc tiêu đề công việc |
| `processStatus` | `string` | Không | - | Trạng thái ứng tuyển (`NEW`, `SCREENING`, `INTERVIEW_ROUND_1`...) |
| `hrReceptionStatus` | `string` | Không | - | Trạng thái tiếp nhận HR (`ACCEPT`, `REJECT`) |
| `sortOrder` | `string` | Không | `DESC` | Sắp xếp: `ASC` hoặc `DESC` |

### 13.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `array` | Danh sách đơn ứng tuyển (`referralId`, `applicationId`, `candidate`, `jobPosting`, `processStatus`, `hrReceptionStatus`, `evaluation`, `appliedAt`, `assignees`) |
| `pagination` | `object` | Thông tin phân trang |

### 13.7 error code
- `400 Bad Request`: ID không tồn tại (`INTERNAL_NOT_FOUND`) hoặc dữ liệu ứng tuyển không đầy đủ (`INTERNAL_APPLICATION_INCOMPLETE`).
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 13.8 example

**Request (cURL):**
```bash
curl -X GET "http://localhost:3002/api/internals/f1e2d3c4-b5a6-7890-1234-567890abcdef/applications?page=1&limit=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "referralId": "e4f5a6b7-c8d9-0123-ef12-345678901234",
      "applicationId": "f5a6b7c8-d9e0-1234-f123-456789012345",
      "candidate": {
        "candidateId": "a6b7c8d9-e0f1-2345-1234-567890abcdef",
        "fullName": "Phạm Văn D"
      },
      "jobPosting": {
        "jobPostingId": "b7c8d9e0-f1a2-3456-2345-67890abcdef1",
        "title": "DevOps Engineer"
      },
      "processStatus": "OFFERED",
      "hrReceptionStatus": "ACCEPT",
      "evaluation": "Nhân sự nội bộ đánh giá ứng viên xuất sắc, phù hợp văn hóa.",
      "appliedAt": "2026-08-17T09:00:00.000Z",
      "assignees": [],
      "createdAt": "2026-08-17T09:00:00.000Z",
      "updatedAt": "2026-08-18T14:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "timestamp": "2026-08-19T05:15:00.000Z"
  }
}
```

### 13.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `INTERNAL_NOT_FOUND` | `Internal not found.` | ID nhân sự nội bộ không tồn tại. |
| `400` | `INTERNAL_APPLICATION_INCOMPLETE` | `Internal application data is incomplete.` | Dữ liệu ứng viên hoặc tin tuyển dụng gắn với đơn ứng tuyển bị thiếu. |

---

## 14. Kích hoạt / Khóa hồ sơ nhân sự nội bộ

### 14.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / HR
    participant API as Internals Controller
    participant Service as Internals Service
    participant DB as PostgreSQL DB

    Admin->>API: PATCH /api/internals/:id/status (Body: isActive)
    API->>Service: updateStatus(id, isActive)
    Service->>DB: Kiểm tra trạng thái hiện tại
    
    alt Trạng thái cần cập nhật trùng với trạng thái hiện tại
        Service-->>Admin: 400 Bad Request (INTERNAL_ALREADY_ACTIVE / INTERNAL_ALREADY_INACTIVE)
    else Hợp lệ
        Service->>DB: Cập nhật isActive trong bảng internals
        Service-->>Admin: 200 OK (data mới)
    end
```

### 14.2 Url path
`/api/internals/:id/status`

### 14.3 Request method
`PATCH`

### 14.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `ADMIN` hoặc `HR` |
| `Content-Type` | `application/json` | Định dạng payload |

### 14.5 input
**Path Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | `string (UUID)` | Có | ID định danh hồ sơ nhân sự nội bộ |

**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `isActive` | `boolean` | Có | `true` hoặc `false` | Trạng thái cần đặt: `true` (Mở khóa), `false` (Khóa hồ sơ) |

### 14.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `object` | Hồ sơ nhân sự sau khi cập nhật trạng thái |

### 14.7 error code
- `400 Bad Request`: Hồ sơ không tồn tại hoặc trạng thái cập nhật trùng với trạng thái hiện tại.
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 14.8 example

**Request (cURL):**
```bash
curl -X PATCH "http://localhost:3002/api/internals/f1e2d3c4-b5a6-7890-1234-567890abcdef/status" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": false
  }'
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "internalId": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
    "name": "Lê Văn C",
    "email": "levanc@viettel.com.vn",
    "phone": "0977123456",
    "isActive": false,
    "applicationCount": 3,
    "createdBy": {
      "userId": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
      "name": "Admin Test",
      "email": "admin.test@example.com"
    },
    "createdAt": "2026-08-19T05:00:00.000Z",
    "updatedAt": "2026-08-19T05:20:00.000Z"
  },
  "meta": {
    "timestamp": "2026-08-19T05:20:00.123Z"
  }
}
```

### 14.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `INTERNAL_NOT_FOUND` | `Internal not found.` | ID nhân sự nội bộ không tồn tại. |
| `400` | `INTERNAL_ALREADY_ACTIVE` | `Nhân sự đã được mở khoá.` | Gửi `isActive: true` khi hồ sơ đang mở khóa. |
| `400` | `INTERNAL_ALREADY_INACTIVE` | `Nhân sự đã bị khoá.` | Gửi `isActive: false` khi hồ sơ đang bị khóa. |
