# TÀI LIỆU ĐẶC TẢ API - PHÂN HỆ NGUỒN GIỚI THIỆU TIỆN ÍCH (EXTENSION REFERRAL SOURCES)

> **Hệ thống:** VCS Interview Assistant  
> **Module Backend:** `ExtensionIntegrationModule` (`apps/backend/src/extension-integration/extension-integration.module.ts`)  
> **Controller:** `ExtensionIntegrationController` (`@Controller('extension/amis')`)  
> **Base URL:**
> - Local/Dev API: `http://localhost:3002/api` (hoặc thông qua Vite Dev Proxy: `http://localhost:4000/api`)
> - Production API: `https://<domain>/api`

---

## MỤC LỤC
1. [API 1: Danh sách nguồn giới thiệu và hồ sơ ứng tuyển (List Referral Sources)](#1-danh-sách-nguồn-giới-thiệu-và-hồ-sơ-ứng-tuyển)
2. [API 2: Tạo mới nguồn giới thiệu Freelancer từ Extension (Create Referral Freelancer)](#2-tạo-mới-nguồn-giới-thiệu-freelancer-từ-extension)
3. [API 3: Tạo mới nguồn giới thiệu Nội bộ từ Extension (Create Referral Internal)](#3-tạo-mới-nguồn-giới-thiệu-nội-bộ-từ-extension)
4. [API 4: Kích hoạt / Khóa nguồn giới thiệu Freelancer từ Extension (Update Referral Freelancer Status)](#4-kích-hoạt--khóa-nguồn-giới-thiệu-freelancer-từ-extension)
5. [API 5: Kích hoạt / Khóa nguồn giới thiệu Nội bộ từ Extension (Update Referral Internal Status)](#5-kích-hoạt--khóa-nguồn-giới-thiệu-nội-bộ-từ-extension)

---

## 1. Danh sách nguồn giới thiệu và hồ sơ ứng tuyển

### 1.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor HR as HR / Recruiter (Extension)
    participant API as ExtensionIntegrationController
    participant Service as ExtensionIntegrationService
    participant Core as FreelancersService / InternalsService
    participant DB as PostgreSQL DB

    HR->>API: GET /api/extension/amis/referral-sources (source: FREELANCER | INTERNAL, page, limit, search, status)
    API->>Service: listExtensionReferralSources(query)
    
    alt query.source == 'INTERNAL'
        Service->>Core: internalsService.findPaginated(...)
        Core->>DB: Query bảng internals & application_referrals (INTERNAL)
        Service->>Service: Tính toán chỉ số metrics (total, processing, passed, passRate) & map currentAmisStage
    else query.source == 'FREELANCER'
        Service->>Core: freelancersService.findPaginated(...)
        Core->>DB: Query bảng freelancers & application_referrals (FREELANCER)
        Service->>Service: Tính toán chỉ số metrics (total, processing, passed, passRate) & map currentAmisStage
    end
    
    Service-->>HR: 200 OK (data: ExtensionReferralSourceGroup[], pagination, meta)
```

### 1.2 Url path
`/api/extension/amis/referral-sources`

### 1.3 Request method
`GET`

### 1.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `ADMIN` hoặc `HR` |

### 1.5 input
**Query Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `source` | `string` | Có | - | Loại nguồn giới thiệu: `FREELANCER` (Cộng tác viên) hoặc `INTERNAL` (Nhân sự nội bộ) |
| `page` | `integer` | Không | `1` | Trang hiện tại (Min: 1) |
| `limit` | `integer` | Không | `20` | Số lượng bản ghi / trang (1 - 100) |
| `search` | `string` | Không | - | Tìm kiếm theo họ tên, email, số điện thoại hoặc mã định danh |
| `status` | `string` | Không | - | Lọc trạng thái: `ACTIVE` hoặc `INACTIVE` |

### 1.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `array[object]` | Danh sách nhóm nguồn giới thiệu |
| `data[].sourceType` | `string` | `FREELANCER` hoặc `INTERNAL` |
| `data[].sourceId` | `string (UUID)` | ID định danh nguồn |
| `data[].identifier` | `string \| null` | Mã định danh (`FL000001` đối với Freelancer, `null` đối với Internal) |
| `data[].name` | `string` | Họ và tên người giới thiệu |
| `data[].email` | `string` | Email liên hệ |
| `data[].phone` | `string \| null` | Số điện thoại |
| `data[].isActive` | `boolean` | Trạng thái hoạt động |
| `data[].applicationCount` | `number` | Tổng số hồ sơ CV đã nộp |
| `data[].metrics` | `object` | Thống kê tỷ lệ đậu/rớt hồ sơ |
| `data[].metrics.total` | `number` | Tổng số CV |
| `data[].metrics.processing` | `number` | Số CV đang xử lý |
| `data[].metrics.passed` | `number` | Số CV đã trúng tuyển |
| `data[].metrics.passRate` | `number` | Tỷ lệ trúng tuyển (%) |
| `data[].applications` | `array[object]` | Danh sách hồ sơ chi tiết đã giới thiệu |
| `data[].applications[].referralId` | `string (UUID)` | ID bản ghi referral |
| `data[].applications[].applicationId` | `string (UUID)` | ID hồ sơ ứng tuyển |
| `data[].applications[].candidate` | `object` | Thông tin ứng viên (`candidateId`, `fullName`) |
| `data[].applications[].jobPosting` | `object` | Tin tuyển dụng (`jobPostingId`, `title`) |
| `data[].applications[].processStatus` | `string` | Trạng thái ứng tuyển nội bộ |
| `data[].applications[].hrReceptionStatus` | `string \| null` | Trạng thái tiếp nhận HR |
| `data[].applications[].statusCategory` | `string` | Phân loại trạng thái (`PROCESSING`, `PASSED`, `REJECTED`) |
| `data[].applications[].currentAmisStage` | `object \| null` | Vòng tuyển dụng hiện tại trên AMIS (`recruitmentRoundName`...) |
| `data[].applications[].evaluation` | `string \| null` | Ghi chú đánh giá của người giới thiệu |
| `data[].applications[].appliedAt` | `string (ISO 8601)` | Ngày nộp hồ sơ |
| `data[].createdAt` | `string (ISO 8601)` | Ngày tạo nguồn |
| `data[].updatedAt` | `string (ISO 8601)` | Ngày cập nhật nguồn |
| `pagination` | `object` | Phân trang (`page`, `limit`, `total`, `totalPages`) |
| `meta.timestamp` | `string (ISO 8601)` | Thời điểm xử lý request |

### 1.7 error code
- `400 Bad Request`: Thiếu tham số `source` hoặc sai định dạng.
- `401 Unauthorized`: Chưa đăng nhập hoặc token hết hạn.
- `403 Forbidden`: Người dùng không có quyền `ADMIN` hoặc `HR`.

### 1.8 example

**Request (cURL):**
```bash
curl -X GET "http://localhost:3002/api/extension/amis/referral-sources?source=FREELANCER&page=1&limit=10&status=ACTIVE" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "sourceType": "FREELANCER",
      "sourceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "identifier": "FL000001",
      "name": "Nguyễn Văn A",
      "email": "freelancer.a@example.com",
      "phone": "0988123456",
      "isActive": true,
      "applicationCount": 2,
      "metrics": {
        "total": 2,
        "processing": 1,
        "passed": 1,
        "passRate": 50
      },
      "applications": [
        {
          "referralId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
          "applicationId": "d4e5f6a7-b8c9-0123-def1-234567890123",
          "candidate": {
            "candidateId": "e5f6a7b8-c9d0-1234-ef12-345678901234",
            "fullName": "Trần Thị B"
          },
          "jobPosting": {
            "jobPostingId": "f6a7b8c9-d0e1-2345-f123-456789012345",
            "title": "Senior NodeJS Engineer"
          },
          "processStatus": "OFFERED",
          "hrReceptionStatus": "ACCEPT",
          "statusCategory": "PASSED",
          "currentAmisStage": {
            "recruitmentRoundId": "round-offer-01",
            "recruitmentRoundName": "Mời nhận việc",
            "amisStatus": 1,
            "reasonRemoved": null,
            "updatedAt": "2026-08-19T04:00:00.000Z"
          },
          "evaluation": "Ứng viên phù hợp vị trí Tech Lead.",
          "appliedAt": "2026-08-18T10:00:00.000Z",
          "createdAt": "2026-08-18T10:00:00.000Z",
          "updatedAt": "2026-08-19T04:00:00.000Z",
          "assignees": []
        }
      ],
      "createdAt": "2026-08-18T00:00:00.000Z",
      "updatedAt": "2026-08-19T04:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "timestamp": "2026-08-19T07:00:00.000Z"
  }
}
```

### 1.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | - | `source must be one of the following values: FREELANCER, INTERNAL` | Thiếu hoặc truyền sai giá trị tham số `source`. |
| `401` | - | `Unauthorized` | Token xác thực hết hạn hoặc không đúng. |
| `403` | - | `Forbidden resource` | Tài khoản không có quyền Admin/HR. |

---

## 2. Tạo mới nguồn giới thiệu Freelancer từ Extension

### 2.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor HR as HR / Recruiter (Extension)
    participant API as ExtensionIntegrationController
    participant Service as ExtensionIntegrationService
    participant FreelancerService as FreelancersService
    participant Mail as MailService
    participant DB as PostgreSQL DB

    HR->>API: POST /api/extension/amis/referral-sources/freelancers (name, email, phone)
    API->>Service: createExtensionReferralFreelancer(dto, actorUserId)
    Service->>FreelancerService: create(dto)
    FreelancerService->>DB: Tạo User (FREELANCER) & Freelancer (Mã FL00000X)
    DB-->>FreelancerService: FreelancerCreateResult (identifier, initialPassword)
    Service->>Mail: Gửi email tự động thông báo tài khoản & mật khẩu cho Freelancer
    Service-->>HR: 200 OK (data Freelancer vừa tạo)
```

### 2.2 Url path
`/api/extension/amis/referral-sources/freelancers`

### 2.3 Request method
`POST`

### 2.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `ADMIN` hoặc `HR` |
| `Content-Type` | `application/json` | Định dạng dữ liệu |

### 2.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `name` | `string` | Có | 1 - 255 ký tự | Họ và tên cộng tác viên |
| `email` | `string` | Có | Định dạng email hợp lệ | Email nhận thông tin tài khoản |
| `phone` | `string` | Không | Max 50 ký tự | Số điện thoại liên hệ |

### 2.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `object` | Thông tin Freelancer vừa tạo |
| `data.freelancerId` | `string (UUID)` | ID định danh Freelancer |
| `data.identifier` | `string` | Mã định danh (`FL000001`) |
| `data.phone` | `string \| null` | Số điện thoại |
| `data.isActive` | `boolean` | Trạng thái hoạt động (`true`) |
| `data.applicationCount` | `number` | Số CV (mặc định: `0`) |
| `data.user` | `object` | Tài khoản (`userId`, `name`, `email`, `role: "FREELANCER"`) |
| `data.initialPassword` | `string` | Mật khẩu khởi tạo 1 lần |
| `data.createdBy` | `object` | Người tạo tài khoản |
| `data.createdAt` | `string (ISO 8601)` | Ngày tạo |
| `data.updatedAt` | `string (ISO 8601)` | Ngày cập nhật |
| `meta.timestamp` | `string (ISO 8601)` | Thời điểm xử lý request |

### 2.7 error code
- `400 Bad Request`: Email đã được sử dụng hoặc số điện thoại quá dài (`FREELANCER_PHONE_TOO_LONG`).
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 2.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/extension/amis/referral-sources/freelancers" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nguyễn Văn Freelancer",
    "email": "fl.nguyen@example.com",
    "phone": "0988667788"
  }'
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "freelancerId": "74dcf9e5-34d7-45ff-84b0-58fbeab91c93",
    "identifier": "FL000015",
    "phone": "0988667788",
    "isActive": true,
    "applicationCount": 0,
    "user": {
      "userId": "85edfae6-45e8-56aa-95c1-69acfbc02da4",
      "name": "Nguyễn Văn Freelancer",
      "email": "fl.nguyen@example.com",
      "role": "FREELANCER"
    },
    "createdBy": {
      "userId": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba",
      "name": "Admin Test",
      "email": "admin.test@example.com"
    },
    "createdAt": "2026-08-19T07:15:00.000Z",
    "updatedAt": "2026-08-19T07:15:00.000Z",
    "initialPassword": "FL000015"
  },
  "meta": {
    "timestamp": "2026-08-19T07:15:00.123Z"
  }
}
```

### 2.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `DUPLICATE_EMAIL` | `Email đã được sử dụng.` | Email đã liên kết với tài khoản khác trong hệ thống. |
| `400` | `FREELANCER_PHONE_TOO_LONG` | `Freelancer phone must be 50 characters or fewer.` | Số điện thoại vượt quá độ dài 50 ký tự. |
| `401` | - | `Unauthorized` | Token hết hạn. |

---

## 3. Tạo mới nguồn giới thiệu Nội bộ từ Extension

### 3.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor HR as HR / Recruiter (Extension)
    participant API as ExtensionIntegrationController
    participant Service as ExtensionIntegrationService
    participant InternalService as InternalsService
    participant DB as PostgreSQL DB

    HR->>API: POST /api/extension/amis/referral-sources/internals (name, email, phone)
    API->>Service: createExtensionReferralInternal(dto, actorUserId)
    Service->>InternalService: create(dto)
    InternalService->>DB: Kiểm tra trùng email và lưu bản ghi vào bảng internals
    DB-->>InternalService: Bản ghi Internal mới
    Service->>Service: Đóng gói sang nhóm ExtensionReferralSourceGroup
    Service-->>HR: 200 OK (data: ExtensionReferralSourceGroup)
```

### 3.2 Url path
`/api/extension/amis/referral-sources/internals`

### 3.3 Request method
`POST`

### 3.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `ADMIN` hoặc `HR` |
| `Content-Type` | `application/json` | Định dạng dữ liệu |

### 3.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `name` | `string` | Có | 1 - 255 ký tự | Họ và tên nhân sự nội bộ |
| `email` | `string` | Có | 1 - 255 ký tự, email hợp lệ | Email nội bộ công ty (VD: `staff@viettel.com.vn`) |
| `phone` | `string` | Có | 1 - 50 ký tự | Số điện thoại nhân sự |

### 3.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `object` | Nhóm nguồn giới thiệu nội bộ |
| `data.sourceType` | `string` | `"INTERNAL"` |
| `data.sourceId` | `string (UUID)` | ID hồ sơ nội bộ |
| `data.identifier` | `null` | `null` |
| `data.name` | `string` | Họ và tên nhân sự |
| `data.email` | `string` | Gmail nội bộ nhân sự |
| `data.phone` | `string` | Số điện thoại |
| `data.isActive` | `boolean` | Trạng thái hoạt động (`true`) |
| `data.applicationCount` | `number` | Số CV ban đầu (`0`) |
| `data.metrics` | `object` | Chỉ số thống kê (`total: 0`, `processing: 0`, `passed: 0`, `passRate: 0`) |
| `data.applications` | `array` | Danh sách hồ sơ (`[]`) |
| `data.createdAt` | `string (ISO 8601)` | Ngày tạo |
| `data.updatedAt` | `string (ISO 8601)` | Ngày cập nhật |
| `meta.timestamp` | `string (ISO 8601)` | Thời điểm xử lý |

### 3.7 error code
- `400 Bad Request`: Email nội bộ đã tồn tại trong danh sách (`INTERNAL_EMAIL_EXISTS`).
- `401 Unauthorized`: Chưa xác thực token.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 3.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/extension/amis/referral-sources/internals" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Trần Văn Nội Bộ",
    "email": "tranvanoibo@viettel.com.vn",
    "phone": "0966123456"
  }'
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "sourceType": "INTERNAL",
    "sourceId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "identifier": null,
    "name": "Trần Văn Nội Bộ",
    "email": "tranvanoibo@viettel.com.vn",
    "phone": "0966123456",
    "isActive": true,
    "applicationCount": 0,
    "metrics": {
      "total": 0,
      "processing": 0,
      "passed": 0,
      "passRate": 0
    },
    "applications": [],
    "createdAt": "2026-08-19T07:20:00.000Z",
    "updatedAt": "2026-08-19T07:20:00.000Z"
  },
  "meta": {
    "timestamp": "2026-08-19T07:20:00.123Z"
  }
}
```

### 3.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `INTERNAL_EMAIL_EXISTS` | `An Internal with this email already exists.` | Email đã tồn tại trong danh sách nhân sự nội bộ. |
| `401` | - | `Unauthorized` | Token hết hạn. |

---

## 4. Kích hoạt / Khóa nguồn giới thiệu Freelancer từ Extension

### 4.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor HR as HR / Recruiter (Extension)
    participant API as ExtensionIntegrationController
    participant Service as ExtensionIntegrationService
    participant FreelancerService as FreelancersService
    participant DB as PostgreSQL DB

    HR->>API: PATCH /api/extension/amis/referral-sources/freelancers/:freelancerId/status (Body: isActive)
    API->>Service: updateExtensionReferralFreelancerStatus(freelancerId, isActive)
    Service->>FreelancerService: updateStatus(freelancerId, isActive)
    FreelancerService->>DB: Cập nhật isActive trong bảng freelancers
    DB-->>FreelancerService: Updated record
    Service->>Service: Build lại dữ liệu ExtensionReferralSourceGroup
    Service-->>HR: 200 OK (data ExtensionReferralSourceGroup)
```

### 4.2 Url path
`/api/extension/amis/referral-sources/freelancers/:freelancerId/status`

### 4.3 Request method
`PATCH`

### 4.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `ADMIN` hoặc `HR` |
| `Content-Type` | `application/json` | Định dạng payload |

### 4.5 input
**Path Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `freelancerId` | `string (UUID)` | Có | ID định danh nguồn Freelancer |

**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `isActive` | `boolean` | Có | `true` hoặc `false` | Trạng thái cần đổi: `true` (Mở khóa), `false` (Khóa tài khoản) |

### 4.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `object` | Nhóm nguồn Freelancer với trạng thái `isActive` đã được cập nhật |
| `meta.timestamp` | `string (ISO 8601)` | Thời điểm xử lý |

### 4.7 error code
- `400 Bad Request`: Không tìm thấy Freelancer (`FREELANCER_NOT_FOUND`) hoặc trạng thái cập nhật trùng trạng thái hiện tại.
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 4.8 example

**Request (cURL):**
```bash
curl -X PATCH "http://localhost:3002/api/extension/amis/referral-sources/freelancers/74dcf9e5-34d7-45ff-84b0-58fbeab91c93/status" \
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
    "sourceType": "FREELANCER",
    "sourceId": "74dcf9e5-34d7-45ff-84b0-58fbeab91c93",
    "identifier": "FL000015",
    "name": "Nguyễn Văn Freelancer",
    "email": "fl.nguyen@example.com",
    "phone": "0988667788",
    "isActive": false,
    "applicationCount": 2,
    "metrics": {
      "total": 2,
      "processing": 1,
      "passed": 1,
      "passRate": 50
    },
    "applications": [],
    "createdAt": "2026-08-19T07:15:00.000Z",
    "updatedAt": "2026-08-19T07:25:00.000Z"
  },
  "meta": {
    "timestamp": "2026-08-19T07:25:00.123Z"
  }
}
```

### 4.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `FREELANCER_NOT_FOUND` | `Freelancer not found.` | `freelancerId` không tồn tại trong hệ thống. |
| `400` | `FREELANCER_ALREADY_ACTIVE` | `Nhân sự đã được mở khoá.` | Gửi `isActive: true` khi tài khoản đã đang mở khóa. |
| `400` | `FREELANCER_ALREADY_INACTIVE` | `Nhân sự đã bị khoá.` | Gửi `isActive: false` khi tài khoản đã đang bị khóa. |

---

## 5. Kích hoạt / Khóa nguồn giới thiệu Nội bộ từ Extension

### 5.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor HR as HR / Recruiter (Extension)
    participant API as ExtensionIntegrationController
    participant Service as ExtensionIntegrationService
    participant InternalService as InternalsService
    participant DB as PostgreSQL DB

    HR->>API: PATCH /api/extension/amis/referral-sources/internals/:internalId/status (Body: isActive)
    API->>Service: updateExtensionReferralInternalStatus(internalId, isActive)
    Service->>InternalService: updateStatus(internalId, isActive)
    InternalService->>DB: Cập nhật isActive trong bảng internals
    DB-->>InternalService: Updated record
    Service->>Service: Build lại dữ liệu ExtensionReferralSourceGroup
    Service-->>HR: 200 OK (data ExtensionReferralSourceGroup)
```

### 5.2 Url path
`/api/extension/amis/referral-sources/internals/:internalId/status`

### 5.3 Request method
`PATCH`

### 5.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token vai trò `ADMIN` hoặc `HR` |
| `Content-Type` | `application/json` | Định dạng payload |

### 5.5 input
**Path Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `internalId` | `string (UUID)` | Có | ID định danh nguồn nội bộ |

**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `isActive` | `boolean` | Có | `true` hoặc `false` | Trạng thái: `true` (Mở khóa), `false` (Khóa hồ sơ) |

### 5.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data` | `object` | Nhóm nguồn nội bộ với trạng thái `isActive` đã được cập nhật |
| `meta.timestamp` | `string (ISO 8601)` | Thời điểm xử lý |

### 5.7 error code
- `400 Bad Request`: Không tìm thấy bản ghi nội bộ (`INTERNAL_NOT_FOUND`) hoặc trạng thái cập nhật trùng với hiện tại.
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không có quyền `ADMIN` hoặc `HR`.

### 5.8 example

**Request (cURL):**
```bash
curl -X PATCH "http://localhost:3002/api/extension/amis/referral-sources/internals/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/status" \
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
    "sourceType": "INTERNAL",
    "sourceId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "identifier": null,
    "name": "Trần Văn Nội Bộ",
    "email": "tranvanoibo@viettel.com.vn",
    "phone": "0966123456",
    "isActive": false,
    "applicationCount": 0,
    "metrics": {
      "total": 0,
      "processing": 0,
      "passed": 0,
      "passRate": 0
    },
    "applications": [],
    "createdAt": "2026-08-19T07:20:00.000Z",
    "updatedAt": "2026-08-19T07:30:00.000Z"
  },
  "meta": {
    "timestamp": "2026-08-19T07:30:00.123Z"
  }
}
```

### 5.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `INTERNAL_NOT_FOUND` | `Internal not found.` | `internalId` không tồn tại. |
| `400` | `INTERNAL_ALREADY_ACTIVE` | `Nhân sự đã được mở khoá.` | Gửi `isActive: true` khi hồ sơ đang mở khóa. |
| `400` | `INTERNAL_ALREADY_INACTIVE` | `Nhân sự đã bị khoá.` | Gửi `isActive: false` khi hồ sơ đang bị khóa. |
