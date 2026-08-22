# TÀI LIỆU ĐẶC TẢ API - PHÂN HỆ TÍCH HỢP KÊNH TUYỂN DỤNG TOPCV

> **Hệ thống:** VCS Interview Assistant  
> **Kiến trúc tích hợp:**  
> - **Backend Core:** Chuẩn hóa dữ liệu tin tuyển dụng nội bộ sang schema TopCV, kiểm soát cảnh báo và tiếp nhận ứng viên từ nguồn TopCV.
> - **Browser Extension:** Tương tác trực tiếp với API nhà tuyển dụng của TopCV (`tuyendung-api.topcv.vn`) để xác thực phiên, tra cứu danh mục và đăng tin tự động.

---

## MỤC LỤC
1. [API 1: Chuẩn bị dữ liệu form đăng tin TopCV (Prepare TopCV Form)](#1-chuẩn-bị-dữ-liệu-form-đăng-tin-topcv)
2. [API 2: Đổi / Làm mới Access Token TopCV (Exchange Token)](#2-đổi--làm-mới-access-token-topcv)
3. [API 3: Kiểm tra tính hợp lệ của phiên đăng nhập TopCV (Check Auth / Me)](#3-kiểm-tra-tính-hợp-lệ-của-phiên-đăng-nhập-topcv)
4. [API 4: Lấy danh mục Tỉnh / Thành phố TopCV (Get Provinces)](#4-lấy-danh-mục-tỉnh--thành-phố-topcv)
5. [API 5: Lấy danh mục Quận / Huyện theo Tỉnh TopCV (Get Districts)](#5-lấy-danh-mục-quận--huyện-theo-tỉnh-topcv)
6. [API 6: Lấy cây danh mục Ngành nghề 3 cấp TopCV (Get Job Families)](#6-lấy-cây-danh-mục-ngành-nghề-3-cấp-topcv)
7. [API 7: Đăng tin tuyển dụng lên nền tảng TopCV (Publish TopCV Job)](#7-đăng-tin-tuyển-dụng-lên-nền-tảng-topcv)
8. [API 8: Tiếp nhận hồ sơ ứng viên từ nguồn TopCV (Ingest Application)](#8-tiếp-nhận-hồ-sơ-ứng-viên-từ-nguồn-topcv)

---

## 1. Chuẩn bị dữ liệu form đăng tin TopCV

### 1.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor HR as HR / Recruiter (Extension)
    participant API as ChannelPublishingController
    participant Service as ChannelPublishingService
    participant Mapper as TopCvMapper
    participant DB as PostgreSQL DB

    HR->>API: POST /api/extension/job-postings/:jobPostingId/channels/TOPCV/prepare
    API->>Service: prepare(TOPCV, jobPostingId)
    Service->>DB: Query JobPosting kèm JobDescription, Level, Position
    
    alt Không tìm thấy JobPosting
        Service-->>HR: 400 Bad Request (Job posting not found)
    else Hợp lệ
        Service->>Mapper: map(posting)
        Mapper->>Mapper: Map fields (title, desc, req, benefits...), tính snapshotHash, warnings & missingFields
        Service-->>HR: 200 OK (form schema, auth config, missingRequiredFields, warnings)
    end
```

### 1.2 Url path
`/api/extension/job-postings/:jobPostingId/channels/TOPCV/prepare`

### 1.3 Request method
`POST`

### 1.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <accessToken>` | JWT Token của tài khoản vai trò `ADMIN` hoặc `HR` |

### 1.5 input
**Path Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `jobPostingId` | `string (UUID)` | Có | ID tin tuyển dụng nội bộ cần đăng lên TopCV |

### 1.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data.channel` | `string` | Kênh đăng tuyển (`TOPCV`) |
| `data.jobPostingId` | `string (UUID)` | ID tin tuyển dụng |
| `data.snapshotHash` | `string` | Mã SHA-256 hash của snapshot form |
| `data.executionMode` | `string` | Chế độ thực thi (`EXTENSION`) |
| `data.form` | `object` | Dữ liệu form đã map sang cấu trúc TopCV |
| `data.form.title` | `object` | Tiêu đề công việc (`value`, `source`, `required`) |
| `data.form.jobDescription` | `object` | Mô tả công việc (trách nhiệm) |
| `data.form.jobRequirement` | `object` | Yêu cầu ứng viên |
| `data.form.jobBenefit` | `object` | Chế độ đãi ngộ |
| `data.missingRequiredFields`| `array[string]` | Danh sách trường TopCV bắt buộc còn thiếu cần người dùng chọn trên UI |
| `data.warnings` | `array[object]` | Cảnh báo các trường cần bổ sung (`TOPCV_LOCATIONS_REQUIRED`...) |
| `data.auth` | `object` | Cấu hình xác thực với TopCV (`host`, `tokenKey`, `exchangeTokenUrl`...) |
| `meta.timestamp` | `string (ISO 8601)` | Thời điểm xử lý |
| `meta.actorUserId` | `string (UUID)` | ID người thực hiện |

### 1.7 error code
- `400 Bad Request`: `jobPostingId` không tồn tại hoặc sai định dạng UUID.
- `401 Unauthorized`: Chưa đăng nhập hoặc token hết hạn.
- `403 Forbidden`: Người dùng không có quyền `ADMIN` hoặc `HR`.

### 1.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/extension/job-postings/b7c8d9e0-f1a2-3456-2345-67890abcdef1/channels/TOPCV/prepare" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "channel": "TOPCV",
    "jobPostingId": "b7c8d9e0-f1a2-3456-2345-67890abcdef1",
    "snapshotHash": "a9f8b7c6d5e4f3a2b1c0987654321fedcba0987654321abcdef0123456789abc",
    "executionMode": "EXTENSION",
    "form": {
      "title": { "value": "Senior NodeJS Developer", "source": "JOB_POSTING", "editable": true, "required": true },
      "jobDescription": { "value": "Phát triển hệ thống microservices...", "source": "JOB_POSTING", "editable": true, "required": true },
      "jobRequirement": { "value": "Từ 3 năm kinh nghiệm với NodeJS/TypeScript...", "source": "JOB_POSTING", "editable": true, "required": true },
      "jobBenefit": { "value": "Lương tháng 13, thưởng hiệu quả dự án...", "source": "JOB_POSTING", "editable": true, "required": false },
      "quantity": { "value": 1, "source": "DEFAULT", "editable": true, "required": false },
      "requireCv": { "value": true, "source": "DEFAULT", "editable": true, "required": false }
    },
    "missingRequiredFields": [
      "salaryFrom",
      "salaryTo",
      "locations",
      "categoryIds",
      "employeeLevel",
      "experience",
      "contactEmail",
      "contactPhone"
    ],
    "warnings": [
      {
        "code": "TOPCV_SALARYFROM_REQUIRED",
        "field": "salaryFrom",
        "message": "TopCV salary_from is not mapped from the internal salary text."
      },
      {
        "code": "TOPCV_LOCATIONS_REQUIRED",
        "field": "locations",
        "message": "TopCV locations require user selection."
      }
    ],
    "auth": {
      "required": true,
      "host": "tuyendung.topcv.vn",
      "tokenKey": "local_storage__token.refresh",
      "expirationKey": "local_storage__token_expiration.refresh",
      "publishRequiresBearer": true,
      "exchangeTokenUrl": "https://tuyendung-api.topcv.vn/api/v1/auth/exchange-token"
    }
  },
  "meta": {
    "timestamp": "2026-08-19T06:00:00.000Z",
    "actorUserId": "18f97fc3-2895-46aa-ab94-f2a8aa1ef5ba"
  }
}
```

### 1.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | - | `Job posting not found` | Không tìm thấy tin tuyển dụng với `jobPostingId` được chỉ định. |
| `400` | `CHANNEL_ADAPTER_NOT_CONFIGURED` | `No channel adapter is configured for ...` | Kênh truyền vào không phải là `TOPCV`. |
| `401` | - | `Unauthorized` | Token xác thực thiếu hoặc không hợp lệ. |
| `403` | - | `Forbidden resource` | Tài khoản không có quyền Admin/HR. |

---

## 2. Đổi / Làm mới Access Token TopCV

### 2.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Ext as Browser Extension
    participant TopCV as TopCV API (tuyendung-api.topcv.vn)
    participant Storage as Chrome Local Storage

    Ext->>Storage: Đọc refreshToken & tracking headers (_tafp, _taid, _tajr)
    Ext->>TopCV: POST https://tuyendung-api.topcv.vn/api/v1/auth/exchange-token
    
    alt Refresh Token hết hạn (SESSION_TIMEOUT)
        TopCV-->>Ext: 200 OK { error_name: "SESSION_TIMEOUT", message: "Hết hạn" }
        Ext->>Storage: Xóa session & yêu cầu đăng nhập lại TopCV
    else Refresh Token không hợp lệ (INVALID_TOKEN)
        TopCV-->>Ext: 400 Bad Request { error_name: "INVALID_TOKEN" }
        Ext->>Storage: Xóa session & yêu cầu đăng nhập lại
    else Thành công
        TopCV-->>Ext: 200 OK { access_token: "eyJhbGci..." }
        Ext->>Storage: Cập nhật accessToken mới
    end
```

### 2.2 Url path
`https://tuyendung-api.topcv.vn/api/v1/auth/exchange-token`

### 2.3 Request method
`POST`

### 2.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Định dạng payload |
| `Accept` | `application/json` | Định dạng phản hồi |
| `Origin` | `https://tuyendung.topcv.vn` | Header CORS bắt buộc của TopCV |
| `Referer` | `https://tuyendung.topcv.vn/` | Header Referer |
| `_tafp` | `string` (tuỳ chọn) | TopCV Tracking Fingerprint |
| `_taid` | `string` (tuỳ chọn) | TopCV Tracking Identifier |
| `_tajr` | `string` (tuỳ chọn) | TopCV Tracking Session Key |

### 2.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `refresh_token` | `string` | Có | Refresh token đã lưu của tài khoản nhà tuyển dụng TopCV |

### 2.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `access_token` | `string` | JWT Token mới dùng để gọi các API tuyển dụng của TopCV |
| `token_type` | `string` | `"bearer"` |
| `expires_in` | `number` | Thời hạn của token (giây) |

### 2.7 error code
- `200 OK` (kèm `error_name: "SESSION_TIMEOUT"`): Phiên đăng nhập hết hạn.
- `400 Bad Request` / `error_name: "INVALID_TOKEN"`: Token bị sai hoặc không hợp lệ.

### 2.8 example

**Request (cURL):**
```bash
curl -X POST "https://tuyendung-api.topcv.vn/api/v1/auth/exchange-token" \
  -H "Content-Type: application/json" \
  -H "Origin: https://tuyendung.topcv.vn" \
  -H "Referer: https://tuyendung.topcv.vn/" \
  -d '{
    "refresh_token": "def502005a9..."
  }'
```

**Response Success (200 OK):**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
  "token_type": "bearer",
  "expires_in": 86400
}
```

### 2.9 bảng mã lỗi
| HTTP Status | Error Name / Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `200` / `401` | `SESSION_TIMEOUT` | `Phiên làm việc đã hết hạn` | Refresh token của TopCV đã hết hạn. Extension cần kích hoạt đăng nhập lại. |
| `400` | `INVALID_TOKEN` | `Token không hợp lệ` | Chuỗi refresh token bị hỏng hoặc đã bị thu hồi. |

---

## 3. Kiểm tra tính hợp lệ của phiên đăng nhập TopCV

### 3.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Ext as Browser Extension
    participant TopCV as TopCV API

    Ext->>TopCV: GET https://tuyendung-api.topcv.vn/api/v1/auth/me (Authorization: Bearer <accessToken>)
    
    alt Token hợp lệ
        TopCV-->>Ext: 200 OK (Thông tin tài khoản NTD)
    else Token hết hạn hoặc sai
        TopCV-->>Ext: 401/403 hoặc SESSION_TIMEOUT
    end
```

### 3.2 Url path
`https://tuyendung-api.topcv.vn/api/v1/auth/me`

### 3.3 Request method
`GET`

### 3.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <TopCvAccessToken>` | Token truy cập của tài khoản TopCV |
| `Origin` | `https://tuyendung.topcv.vn` | Origin nhà tuyển dụng TopCV |
| `Referer` | `https://tuyendung.topcv.vn/` | Referer |

### 3.5 input
Không có body hay query parameters.

### 3.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `id` | `number` | ID nhà tuyển dụng TopCV |
| `email` | `string` | Email tài khoản nhà tuyển dụng |
| `name` | `string` | Tên nhà tuyển dụng |
| `company_name` | `string` | Tên công ty |

### 3.7 error code
- `401 Unauthorized`: Token không hợp lệ hoặc hết hạn.
- `429 Too Many Requests`: TopCV giới hạn tần suất gọi API.

### 3.8 example

**Request (cURL):**
```bash
curl -X GET "https://tuyendung-api.topcv.vn/api/v1/auth/me" \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -H "Origin: https://tuyendung.topcv.vn" \
  -H "Referer: https://tuyendung.topcv.vn/"
```

**Response Success (200 OK):**
```json
{
  "id": 123456,
  "email": "hr@viettelcyber.com",
  "name": "VCS Recruiter",
  "company_name": "Công ty An ninh mạng Viettel"
}
```

### 3.9 bảng mã lỗi
| HTTP Status | Error Name | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `401` | `UNAUTHORIZED` | `Unauthorized` | Access token hết hạn. Cần thực hiện `exchange-token` hoặc đăng nhập lại. |
| `429` | `TOO_MANY_REQUESTS` | `Too Many Requests` | Gọi API quá nhanh. Extension sẽ tự động thử lại sau 2 giây. |

---

## 4. Lấy danh mục Tỉnh / Thành phố TopCV

### 4.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Ext as Extension LocationPicker
    participant Cache as In-Memory Cache
    participant TopCV as TopCV API

    Ext->>Cache: Kiểm tra cachedProvinces
    alt Có sẵn trong cache
        Cache-->>Ext: Trả về danh sách Tỉnh/Thành phố
    else Chưa có trong cache
        Ext->>TopCV: GET https://tuyendung-api.topcv.vn/api/v1/provinces
        TopCV-->>Ext: 200 OK ({ provinces: [...] })
        Ext->>Cache: Lưu vào cachedProvinces
    end
```

### 4.2 Url path
`https://tuyendung-api.topcv.vn/api/v1/provinces`

### 4.3 Request method
`GET`

### 4.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <TopCvAccessToken>` | Token xác thực TopCV |
| `Origin` | `https://tuyendung.topcv.vn` | Origin |
| `Referer` | `https://tuyendung.topcv.vn/` | Referer |

### 4.5 input
Không có tham số đầu vào.

### 4.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `provinces` | `array[object]` | Danh sách tỉnh/thành phố |
| `provinces[].id` | `number` | ID tỉnh thành (VD: `1` cho Hà Nội, `2` cho TP.HCM) |
| `provinces[].name` | `string` | Tên tỉnh/thành phố |
| `provinces[].title` | `string` | Tiêu đề hiển thị |
| `provinces[].alias` | `string` | Định danh URL alias (VD: `ha-noi`) |

### 4.7 error code
- `401 Unauthorized`: Chưa đăng nhập TopCV.

### 4.8 example

**Request (cURL):**
```bash
curl -X GET "https://tuyendung-api.topcv.vn/api/v1/provinces" \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -H "Origin: https://tuyendung.topcv.vn" \
  -H "Referer: https://tuyendung.topcv.vn/"
```

**Response Success (200 OK):**
```json
{
  "provinces": [
    { "id": 1, "name": "Hà Nội", "title": "Hà Nội", "alias": "ha-noi" },
    { "id": 2, "name": "Hồ Chí Minh", "title": "Hồ Chí Minh", "alias": "ho-chi-minh" },
    { "id": 3, "name": "Đà Nẵng", "title": "Đà Nẵng", "alias": "da-nang" }
  ]
}
```

### 4.9 bảng mã lỗi
| HTTP Status | Error Name | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `401` | `UNAUTHORIZED` | `Unauthorized` | Phiên TopCV đã hết hạn. |

---

## 5. Lấy danh mục Quận / Huyện theo Tỉnh TopCV

### 5.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Ext as Extension LocationPicker
    participant TopCV as TopCV API

    Ext->>TopCV: GET https://tuyendung-api.topcv.vn/api/v1/provinces/:provinceId/districts?option_all=true
    TopCV-->>Ext: 200 OK ({ districts: [...] })
    Ext->>Ext: Lọc bỏ lựa chọn "Tất cả" (id: -1) & Lưu Cache
```

### 5.2 Url path
`https://tuyendung-api.topcv.vn/api/v1/provinces/:provinceId/districts`

### 5.3 Request method
`GET`

### 5.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <TopCvAccessToken>` | Token xác thực TopCV |
| `Origin` | `https://tuyendung.topcv.vn` | Origin |
| `Referer` | `https://tuyendung.topcv.vn/` | Referer |

### 5.5 input
**Path Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `provinceId` | `integer` | Có | ID tỉnh thành (VD: `1` cho Hà Nội) |

**Query Parameters:**
| Tham số | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `option_all` | `boolean` | Không | `true` | Yêu cầu trả về danh mục đầy đủ |

### 5.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `districts` | `array[object]` | Danh sách quận/huyện |
| `districts[].id` | `number` | ID quận/huyện |
| `districts[].name` | `string` | Tên quận/huyện |
| `districts[].title` | `string` | Tiêu đề hiển thị |
| `districts[].alias` | `string` | Alias URL |

### 5.7 error code
- `401 Unauthorized`: Phiên đăng nhập hết hạn.
- `404 Not Found`: Không tìm thấy ID tỉnh thành.

### 5.8 example

**Request (cURL):**
```bash
curl -X GET "https://tuyendung-api.topcv.vn/api/v1/provinces/1/districts?option_all=true" \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -H "Origin: https://tuyendung.topcv.vn" \
  -H "Referer: https://tuyendung.topcv.vn/"
```

**Response Success (200 OK):**
```json
{
  "districts": [
    { "id": 1, "name": "Quận Ba Đình", "title": "Quận Ba Đình", "alias": "quan-ba-dinh" },
    { "id": 2, "name": "Quận Cầu Giấy", "title": "Quận Cầu Giấy", "alias": "quan-cau-giay" },
    { "id": 3, "name": "Quận Nam Từ Liêm", "title": "Quận Nam Từ Liêm", "alias": "quan-nam-tu-liem" }
  ]
}
```

### 5.9 bảng mã lỗi
| HTTP Status | Error Name | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `401` | `UNAUTHORIZED` | `Unauthorized` | Token hết hạn. |
| `404` | `NOT_FOUND` | `Province not found` | `provinceId` không hợp lệ. |

---

## 6. Lấy cây danh mục Ngành nghề 3 cấp TopCV

### 6.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Ext as Extension JobFamilyPicker
    participant Cache as Local Cache (TTL 1 hour)
    participant TopCV as TopCV API

    Ext->>Cache: Kiểm tra dữ liệu ngành nghề (còn trong 1h)
    alt Đã có trong cache
        Cache-->>Ext: Trả về cây ngành nghề 3 cấp
    else Cache hết hạn / Trống
        Ext->>TopCV: GET https://tuyendung-api.topcv.vn/api/v1/job-families/all
        TopCV-->>Ext: 200 OK (Cây danh mục Level 1 -> Level 2 -> Level 3)
        Ext->>Cache: Cập nhật cache & timestamp
    end
```

### 6.2 Url path
`https://tuyendung-api.topcv.vn/api/v1/job-families/all`

### 6.3 Request method
`GET`

### 6.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <TopCvAccessToken>` | Token xác thực TopCV |
| `Origin` | `https://tuyendung.topcv.vn` | Origin |
| `Referer` | `https://tuyendung.topcv.vn/` | Referer |

### 6.5 input
Không có tham số đầu vào.

### 6.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `data` | `array[object]` | Danh sách nhóm ngành cấp 1 (`Level 1`) |
| `data[].id` | `number` | ID nhóm ngành cấp 1 |
| `data[].name` | `string` | Tên nhóm ngành cấp 1 (VD: `"IT - Phần mềm"`) |
| `data[].level` | `number` | Cấp độ (`1`) |
| `data[].children` | `array[object]` | Danh sách ngành nghề cấp 2 (`Level 2`) |
| `data[].children[].children` | `array[object]` | Danh sách vị trí chuyên môn cấp 3 (`Level 3`) |

### 6.7 error code
- `401 Unauthorized`: Chưa đăng nhập TopCV.

### 6.8 example

**Request (cURL):**
```bash
curl -X GET "https://tuyendung-api.topcv.vn/api/v1/job-families/all" \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -H "Origin: https://tuyendung.topcv.vn" \
  -H "Referer: https://tuyendung.topcv.vn/"
```

**Response Success (200 OK):**
```json
{
  "data": [
    {
      "id": 100,
      "name": "IT - Phần mềm",
      "level": 1,
      "tag": null,
      "fields": [],
      "children": [
        {
          "id": 101,
          "name": "Lập trình viên / Kỹ sư phần mềm",
          "level": 2,
          "tag": null,
          "fields": [],
          "children": [
            {
              "id": 102,
              "name": "NodeJS Developer",
              "level": 3,
              "tag": null,
              "fields": []
            }
          ]
        }
      ]
    }
  ]
}
```

### 6.9 bảng mã lỗi
| HTTP Status | Error Name | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `401` | `UNAUTHORIZED` | `Unauthorized` | Token hết hạn hoặc không đúng. |

---

## 7. Đăng tin tuyển dụng lên nền tảng TopCV

### 7.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor HR as HR Recruiter (Extension)
    participant Ext as Extension TopCV Service
    participant TopCV as TopCV API (tuyendung-api.topcv.vn)
    participant Storage as Chrome Storage

    HR->>Ext: Bấm "Đăng tin lên TopCV"
    Ext->>Ext: Chuyển đổi payload (HTML paragraphs, map employee_level, experience, working_time, locations, job_family_category)
    Ext->>TopCV: POST https://tuyendung-api.topcv.vn/api/v1/jobs
    
    alt Bị Rate Limit (HTTP 429 hoặc "quá nhanh")
        TopCV-->>Ext: 429 Too Many Requests
        Ext->>Ext: Tự động retry tối đa 3 lần (chờ 2s mỗi lần)
    else Token hết hạn (SESSION_TIMEOUT)
        TopCV-->>Ext: 200 OK / 401 { error_name: "SESSION_TIMEOUT" }
        Ext->>TopCV: Tự động gọi exchange-token lấy access_token mới
        Ext->>TopCV: Thực hiện lại POST /jobs với token mới
    else Đăng tin thành công
        TopCV-->>Ext: 200 OK (Chi tiết Job TopCV đã đăng)
        Ext-->>HR: Thông báo đăng tin TopCV thành công
    end
```

### 7.2 Url path
`https://tuyendung-api.topcv.vn/api/v1/jobs`

### 7.3 Request method
`POST`

### 7.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <TopCvAccessToken>` | Token truy cập của TopCV |
| `Content-Type` | `application/json` | Định dạng dữ liệu |
| `Accept` | `application/json` | Định dạng phản hồi |
| `Origin` | `https://tuyendung.topcv.vn` | Origin |
| `Referer` | `https://tuyendung.topcv.vn/` | Referer |

### 7.5 input
**Body (JSON):**
| Trường | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `title` | `string` | Có | Tiêu đề tin tuyển dụng |
| `type` | `number` | Có | Loại công việc (mặc định: `11` - tuyển dụng thường) |
| `salary_type` | `number` | Có | `1` (Theo khoảng lương) hoặc `2` (Thỏa thuận) |
| `salary_from` | `number` | Có | Mức lương tối thiểu (VNĐ) |
| `salary_to` | `number` | Có | Mức lương tối đa (VNĐ) |
| `salary_currency` | `string` | Có | Đơn vị tiền tệ (mặc định: `"VND"`) |
| `quantity` | `number` | Có | Số lượng cần tuyển (mặc định: `1`) |
| `job_description` | `string` | Có | Mô tả công việc (đã wrap các thẻ `<p>...</p>`) |
| `job_requirement` | `string` | Có | Yêu cầu công việc (đã wrap các thẻ `<p>...</p>`) |
| `job_benefit` | `string` | Có | Quyền lợi được hưởng (đã wrap các thẻ `<p>...</p>`) |
| `employee_level` | `number` | Có | Cấp bậc: `1` (Nhân viên), `2` (Fresher), `3` (Junior), `4` (Senior), `5` (Trưởng nhóm)... |
| `experience` | `string` | Có | Kinh nghiệm: `"0-0"` (Không yêu cầu), `"0-1"`, `"1-3"`, `"3-5"`, `"3-0"` (Trên 5 năm) |
| `education` | `number` | Có | Học vấn: `3` (Cao đẳng), `4` (Đại học), `5` (Đại học trở lên)... |
| `locations` | `array[object]`| Có | Danh sách địa điểm làm việc (`province_id`, `addresses`...) |
| `working_time` | `object` | Có | Cấu hình thời gian làm việc (`date_from`, `date_to`, `start_time`, `end_time`...) |
| `deadline` | `string` | Có | Hạn chót nhận hồ sơ (định dạng `YYYY-MM-DD`) |
| `job_family_category` | `array[number]`| Có | Bộ 3 ID ngành nghề `[level1_id, level2_id, level3_id]` |
| `mappedJobFamilyCategory` | `object` | Có | Cây phân cấp ngành nghề đầy đủ của Level 3 |
| `contact_name` | `string` | Có | Tên người nhận hồ sơ |
| `contact_phone` | `string` | Có | Số điện thoại liên hệ |
| `contact_email` | `string` | Có | Email nhận hồ sơ ứng tuyển |

### 7.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `id` | `number` | ID tin tuyển dụng trên hệ thống TopCV |
| `title` | `string` | Tiêu đề tin tuyển dụng |
| `status` | `string \| number` | Trạng thái tin tuyển dụng trên TopCV |
| `url` | `string` | Đường dẫn xem tin tuyển dụng công khai trên TopCV |

### 7.7 error code
- `400 Bad Request`: Thiếu trường bắt buộc hoặc sai định dạng payload.
- `401 Unauthorized`: Token hết hạn (kèm mã `SESSION_TIMEOUT`).
- `429 Too Many Requests`: Đăng tin quá nhanh (`TOPCV_RATE_LIMITED`).

### 7.8 example

**Request (cURL):**
```bash
curl -X POST "https://tuyendung-api.topcv.vn/api/v1/jobs" \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -H "Content-Type: application/json" \
  -H "Origin: https://tuyendung.topcv.vn" \
  -H "Referer: https://tuyendung.topcv.vn/" \
  -d '{
    "title": "Senior NodeJS Engineer",
    "type": 11,
    "salary_type": 1,
    "salary_from": 30000000,
    "salary_to": 45000000,
    "salary_currency": "VND",
    "quantity": 2,
    "job_description": "<p>Phát triển hệ thống backend microservices.</p><p>Tối ưu hóa hiệu năng cơ sở dữ liệu PostgreSQL.</p>",
    "job_requirement": "<p>Tối thiểu 3 năm kinh nghiệm làm việc với NodeJS/NestJS.</p>",
    "job_benefit": "<p>Thưởng KPI, bảo hiểm sức khỏe cao cấp.</p>",
    "employee_level": 4,
    "experience": "3-5",
    "education": 5,
    "locations": [
      {
        "province_id": 1,
        "province_name": "Hà Nội",
        "addresses": [
          { "district_id": 2, "district_name": "Quận Cầu Giấy", "working_address": "Duy Tân, Cầu Giấy" }
        ],
        "id": "TjIPX"
      }
    ],
    "working_time": {
      "working_time_settings": [
        { "date_from": 1, "date_to": 5, "start_time": "08:30", "end_time": "18:00" }
      ],
      "category": 2,
      "shift": null
    },
    "deadline": "2026-09-30",
    "job_family_category": [100, 101, 102],
    "contact_name": "Nguyễn Thị HR",
    "contact_phone": "0988123456",
    "contact_email": "tuyendung@viettelcyber.com"
  }'
```

**Response Success (200 OK):**
```json
{
  "id": 987654,
  "title": "Senior NodeJS Engineer",
  "status": "ACTIVE",
  "url": "https://www.topcv.vn/viec-lam/senior-nodejs-engineer/987654.html"
}
```

### 7.9 bảng mã lỗi
| HTTP Status | Error Name / Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `TOPCV_PUBLISH_FAILED` | `...` | Lỗi trường dữ liệu không hợp lệ theo yêu cầu của TopCV. |
| `401` | `TOPCV_SESSION_TIMEOUT` | `Session timeout` | Phiên đăng nhập TopCV hết hạn sau khi đã thử làm mới token. |
| `429` | `TOPCV_RATE_LIMITED` | `Thao tác quá nhanh` | Bị TopCV chặn tạm thời do tần suất request cao. Hệ thống tự thử lại sau 2 giây. |

---

## 8. Tiếp nhận hồ sơ ứng viên từ nguồn TopCV

### 8.1 Flow -> diagram luồng
```mermaid
sequenceDiagram
    autonumber
    actor Webhook as TopCV Ingestion Webhook / Bot
    participant API as VcsPortalApplyWebhookController
    participant Service as VcsPortalApplyWebhookService
    participant Parser as CvDocumentsService & CvParsingService
    participant DB as PostgreSQL DB

    Webhook->>API: POST /api/vcs-portal-webhooks/apply (multipart/form-data: payloadJson, cvFile)
    API->>Service: handleApplyWebhook(input)
    Service->>Service: Xác thực Secret Webhook Key
    Service->>Service: Normalize Payload: sourceChannel = TOPCV, trafficSource = topcv
    Service->>DB: Tìm JobPosting tương ứng theo sourceJobId / URL
    Service->>Parser: Lưu CV vào Storage cách ly (Quarantine), kiểm tra mã độc & Parse thông tin ứng viên
    Service->>DB: Tạo Candidate, Application (kênh: TOPCV) & gán nguồn referral
    Service-->>Webhook: 200 OK (applicationId, status)
```

### 8.2 Url path
`/api/vcs-portal-webhooks/apply`

### 8.3 Request method
`POST`

### 8.4 Header
| Header | Giá trị bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `X-Webhook-Key` | `<SecretKey>` | Khóa bí mật xác thực webhook từ nguồn tích hợp |
| `Content-Type` | `multipart/form-data` | Định dạng tải lên đa phần (File CV + Dữ liệu JSON) |

### 8.5 input
**Multipart Form Data:**
| Tên trường | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `payloadJson` | `string (JSON String)` | Có | Chuỗi JSON chứa thông tin ứng tuyển từ nguồn TopCV |
| `cvFile` | `File (Binary)` | Có | File CV đính kèm của ứng viên (PDF/DOCX/DOC) |

**Cấu trúc JSON trong `payloadJson`:**
```json
{
  "source": "vcs_portal",
  "form_id": 2500,
  "traffic_source": "topcv",
  "source_channel": "TOPCV",
  "entry_id": "topcv-apply-123456",
  "submitted_at": "2026-08-19T06:30:00.000Z",
  "job": {
    "source_job_id": "b7c8d9e0-f1a2-3456-2345-67890abcdef1",
    "title": "Senior NodeJS Engineer"
  },
  "candidate": {
    "name": "Hoàng Văn E",
    "email": "hoangvane@gmail.com",
    "phone": "0912345678"
  }
}
```

### 8.6 output
**Body (JSON):**
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` |
| `data.applicationId` | `string (UUID)` | ID hồ sơ ứng tuyển vừa được tạo trong hệ thống |
| `data.candidateId` | `string (UUID)` | ID ứng viên |
| `data.status` | `string` | Trạng thái tiếp nhận ban đầu (`NEW` hoặc `SCREENING`) |
| `data.sourceChannel` | `string` | Kênh nguồn ứng viên (`TOPCV`) |
| `meta.timestamp` | `string (ISO 8601)` | Thời điểm tiếp nhận |

### 8.7 error code
- `400 Bad Request`: Thiếu file CV (`CLEAN_CV_FILE_REQUIRED`) hoặc payload JSON không đúng chuẩn.
- `401 Unauthorized`: Khóa `X-Webhook-Key` không hợp lệ.
- `422 Unprocessable Entity`: Không tìm thấy tin tuyển dụng tương ứng trong hệ thống.

### 8.8 example

**Request (cURL):**
```bash
curl -X POST "http://localhost:3002/api/vcs-portal-webhooks/apply" \
  -H "X-Webhook-Key: your_vcs_portal_webhook_secret_key" \
  -F 'payloadJson={"source":"vcs_portal","form_id":2500,"traffic_source":"topcv","source_channel":"TOPCV","entry_id":"topcv-app-9988","submitted_at":"2026-08-19T06:30:00.000Z","job":{"source_job_id":"b7c8d9e0-f1a2-3456-2345-67890abcdef1","title":"Senior NodeJS Engineer"},"candidate":{"name":"Hoàng Văn E","email":"hoangvane@gmail.com","phone":"0912345678"}}' \
  -F 'cvFile=@/path/to/CV_HoangVanE.pdf'
```

**Response Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "applicationId": "8a7b6c5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d",
    "candidateId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "status": "NEW",
    "sourceChannel": "TOPCV"
  },
  "meta": {
    "timestamp": "2026-08-19T06:30:01.000Z"
  }
}
```

### 8.9 bảng mã lỗi
| HTTP Status | Application Code | Message | Nguyên nhân & Cách xử lý |
| :--- | :--- | :--- | :--- |
| `400` | `CLEAN_CV_FILE_REQUIRED` | `Clean CV file is required.` | Không đính kèm trường file `cvFile`. |
| `400` | `INVALID_PAYLOAD` | `Invalid apply payload.` | Chuỗi `payloadJson` sai cú pháp JSON hoặc thiếu thông tin ứng viên. |
| `401` | `UNAUTHORIZED` | `Unauthorized webhook access.` | Sai hoặc thiếu header `X-Webhook-Key`. |
| `422` | `JOB_POSTING_NOT_FOUND` | `Target job posting not found.` | `source_job_id` trong payload không khớp với bất kỳ tin tuyển dụng nào trong CSDL. |
