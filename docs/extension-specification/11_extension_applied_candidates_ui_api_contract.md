# 11. Extension Applied Candidates UI + Backend API Contract

## 1. Mục tiêu tài liệu

Tài liệu này mô tả 5 màn chính của Browser Extension cho chức năng **Hồ sơ ứng tuyển** khi HR đang đứng tại màn chi tiết tin tuyển dụng trên AMIS.

5 màn trong scope:

1. Màn Job Context / Tin tuyển dụng hiện tại
2. Màn Danh sách hồ sơ ứng tuyển
3. Màn Chi tiết hồ sơ ứng viên
4. Màn Xem CV / CV Processing
5. Màn Đồng bộ hồ sơ sang AMIS

Mục tiêu chính:

- HR vẫn thao tác chính trên AMIS.
- Extension dùng AMIS Recruitment ID để xác định tin tuyển dụng hiện tại.
- Backend CV / Recruitment Core là source of truth cho JobPosting, Application, Candidate, CV processing, matching, screening và AMIS sync status.
- Extension chỉ hiển thị, preview, confirm và gọi API backend.
- Extension không ghi DB/object storage trực tiếp.
- Extension không log raw CV, token/JWT, AMIS cookie, full PII hoặc nội dung CV nhạy cảm.

## 2. Nguyên tắc UI / API chung

### 2.1. UI mode đề xuất

- UI chính: **Chrome Side Panel**.
- Popup: chỉ dùng launcher nhanh nếu cần.
- Injected UI trên AMIS: chỉ nên là badge/button nhỏ, ví dụ `HRM CV: 35 hồ sơ`.
- Không inject bảng/drawer lớn trực tiếp vào AMIS cho MVP nếu chưa khảo sát DOM/CSS của AMIS.

### 2.2. Flow tổng thể

```text
HR mở AMIS Recruitment Detail
→ Extension detect AMIS Recruitment ID
→ Extension gọi backend để resolve Job Context
→ Extension hiển thị danh sách hồ sơ apply theo JobPosting
→ HR xem chi tiết ứng viên / CV / processing / matching
→ HR quyết định shortlist/reject/gửi câu hỏi
→ HR confirm đồng bộ hồ sơ đạt sang AMIS
→ Backend/Extension cập nhật AMIS sync status
```

### 2.3. Auth / Header chung

Tất cả API trong tài liệu này đều đề xuất dùng JWT và role `HR` hoặc `ADMIN`.

```http
Authorization: Bearer <JWT>
X-Request-Id: <uuid optional>
X-Extension-Version: <extension version optional>
```

Header khuyến nghị:

| Header | Required | Mục đích |
|---|---:|---|
| `Authorization` | Yes | Xác thực HR/Admin |
| `X-Request-Id` | No / Recommended | Trace request |
| `X-Extension-Version` | No / Recommended | Debug version extension |

### 2.4. Response envelope chung

```json
{
  "success": true,
  "data": {},
  "meta": {
    "serverTime": "2026-07-01T10:30:21.000+07:00",
    "requestId": "req_01HXYZ",
    "extensionVersion": "0.1.0"
  }
}
```

### 2.5. Error envelope chung

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required field: amisRecruitmentId",
    "details": [
      {
        "field": "amisRecruitmentId",
        "message": "AMIS Recruitment ID is required"
      }
    ]
  },
  "meta": {
    "serverTime": "2026-07-01T10:30:21.000+07:00",
    "requestId": "req_01HXYZ"
  }
}
```

Error code đề xuất:

| Code | Khi nào dùng |
|---|---|
| `UNAUTHORIZED` | Chưa đăng nhập / token hết hạn |
| `FORBIDDEN` | Không có quyền HR/Admin |
| `VALIDATION_ERROR` | Request thiếu/sai field |
| `AMIS_JOB_NOT_DETECTED` | Không xác định được AMIS Recruitment ID |
| `JOB_POSTING_NOT_FOUND` | AMIS Recruitment ID chưa map với JobPosting backend |
| `APPLICATION_NOT_FOUND` | Không tìm thấy hồ sơ ứng tuyển |
| `CV_NOT_READY` | CV chưa scan/clean/parse xong |
| `AMIS_SYNC_NOT_READY` | Chưa đủ điều kiện đồng bộ AMIS |
| `AMIS_SYNC_FAILED` | Đồng bộ AMIS thất bại |
| `NETWORK_ERROR` | Lỗi network upstream/downstream |
| `INTERNAL_ERROR` | Lỗi hệ thống |

## 3. Shared enum đề xuất

### 3.1. Application status

```text
NEW
REVIEWING
SHORTLISTED
REJECTED
NEED_MORE_INFO
WAITING_SCREENING
SCREENING_COMPLETED
AMIS_SYNC_PENDING
AMIS_SYNCED
AMIS_SYNC_FAILED
```

### 3.2. CV processing status

```text
UPLOADED
QUARANTINED
SCAN_PENDING
SCANNING
SCAN_SAFE
SCAN_FAILED
SCAN_INFECTED
CLEAN_GENERATING
CLEAN_READY
CLEAN_FAILED
PARSE_PENDING
PARSING
PARSED
PARSE_FAILED
MATCH_PENDING
MATCHED
MATCH_FAILED
READY_FOR_HR_REVIEW
```

### 3.3. Question status

```text
NOT_SENT
SENDING
SENT
SEND_FAILED
ANSWERED
EVALUATED
```

### 3.4. AMIS sync status

```text
NOT_SYNCED
READY_TO_SYNC
SYNCING
SYNCED
FAILED
MANUAL_REQUIRED
DUPLICATE_REVIEW_REQUIRED
```

### 3.5. Source channel

```text
VCS_PORTAL
TOPCV
ITVIEC
FACEBOOK
LINKEDIN
VIETNAMWORKS
MANUAL
OTHER
```

---

# 4. Màn 1 — Job Context / Tin tuyển dụng hiện tại

## 4.1. Mục đích màn

Màn này xác định HR đang đứng ở tin tuyển dụng nào trên AMIS và tin đó đã được map với JobPosting nào trong backend.

Màn này là cửa vào của toàn bộ chức năng Hồ sơ ứng tuyển. Nếu không resolve được Job Context thì không hiển thị danh sách ứng viên.

## 4.2. UI chính

Frame Figma:

```text
Draft - Applied Candidates / Job Context Screen
```

Thành phần UI:

| Khu vực | Nội dung |
|---|---|
| Header | `Hồ sơ ứng tuyển` |
| Detection Banner | Trạng thái phát hiện AMIS recruitment detail page |
| Current Job Card | Tên tin, AMIS ID, JobPosting ID, Public URL, Last Synced |
| Application Overview | Tổng hồ sơ, hồ sơ mới, đang xử lý, lỗi sync |
| Job Status | JD Sync, CV Intake, CV Processing, AMIS Candidate Sync |
| Actions | Open Applied Candidates, Refresh, View Public Job, Sync JD |

## 4.3. State UI

| State | UI behavior |
|---|---|
| `UNSUPPORTED_PAGE` | Chưa phát hiện màn AMIS recruitment detail, disable action |
| `DETECTING` | Loading detect context |
| `CONTEXT_READY` | Hiển thị job context và counters |
| `JOB_NOT_SYNCED` | Tin AMIS chưa có JobPosting backend, gợi ý sync JD trước |
| `AUTH_REQUIRED` | Yêu cầu đăng nhập backend |
| `ERROR` | Hiển thị lỗi + requestId |

## 4.4. API đề xuất — Resolve Job Context

```http
GET /api/extension/amis/job-postings/{amisRecruitmentId}/application-context
```

### Request

Path params:

| Field | Type | Required | Note |
|---|---|---:|---|
| `amisRecruitmentId` | string | Yes | ID tin tuyển dụng lấy từ AMIS |

Query params:

| Field | Type | Required | Note |
|---|---|---:|---|
| `amisUrl` | string | No | URL AMIS hiện tại, dùng audit/debug |
| `includeCounters` | boolean | No | Default `true` |

Example:

```http
GET /api/extension/amis/job-postings/43823/application-context?includeCounters=true
```

### Response

```json
{
  "success": true,
  "data": {
    "detected": true,
    "mapped": true,
    "amisRecruitmentId": "43823",
    "amisUrl": "https://amisapp.misa.vn/recruitment/.../43823",
    "jobPosting": {
      "id": "job_posting_7f4a_c21d",
      "title": "Java Developer",
      "status": "PUBLISHED",
      "sourceSystem": "AMIS",
      "externalRecruitmentId": "43823",
      "publishedUrl": "https://vcs-portal.vn/jobs/java-developer",
      "lastSyncedAt": "2026-07-01T10:30:21.000+07:00",
      "lastSnapshotHash": "sha256:2b4a..."
    },
    "counters": {
      "totalApplications": 35,
      "newApplications": 12,
      "processingCv": 4,
      "parseFailed": 2,
      "matched": 20,
      "shortlisted": 8,
      "questionSent": 6,
      "questionAnswered": 3,
      "amisSynced": 3,
      "amisSyncFailed": 1
    },
    "jobStatus": {
      "jdSyncStatus": "SYNCED",
      "cvIntakeStatus": "ACTIVE",
      "cvProcessingStatus": "HAS_PENDING",
      "amisCandidateSyncStatus": "HAS_FAILED"
    },
    "availableActions": [
      "OPEN_APPLICATIONS",
      "REFRESH",
      "VIEW_PUBLIC_JOB",
      "SYNC_JD"
    ]
  },
  "meta": {
    "serverTime": "2026-07-01T10:30:21.000+07:00",
    "requestId": "req_001"
  }
}
```

### Error cases

| Case | HTTP | Error code | UI |
|---|---:|---|---|
| Không có token | 401 | `UNAUTHORIZED` | Hiển thị login |
| Không đủ quyền | 403 | `FORBIDDEN` | Không cho xem hồ sơ |
| Không tìm thấy JobPosting | 404 | `JOB_POSTING_NOT_FOUND` | Gợi ý sync JD trước |
| AMIS ID thiếu/sai | 400 | `VALIDATION_ERROR` | Disable list |

---

# 5. Màn 2 — Danh sách hồ sơ ứng tuyển

## 5.1. Mục đích màn

Hiển thị danh sách ứng viên đã apply vào tin tuyển dụng hiện tại. Đây là màn làm việc chính của HR sau khi backend đã nhận CV từ public job posting.

## 5.2. UI chính

Frame Figma:

```text
Draft - Applied Candidates / Application List Screen
```

Thành phần UI:

| Khu vực | Nội dung |
|---|---|
| Header | `Danh sách hồ sơ ứng tuyển` |
| Compact Job Context | Tên tin, AMIS ID, tổng hồ sơ |
| Summary Metrics | Tổng, mới, đang xử lý, lỗi sync |
| Search / Sort | Tìm theo tên/email/phone, sort mới nhất/match score |
| Filter Chips | Tất cả, mới, đang xử lý, đạt match, chưa gửi câu hỏi, chưa sync AMIS, sync lỗi |
| Candidate List | Card từng ứng viên |
| Footer Actions | Refresh, Bulk Actions |

## 5.3. Bộ lọc đề xuất

| Filter | Query value |
|---|---|
| Tất cả | `ALL` |
| Mới apply | `NEW` |
| Chưa xử lý | `UNREVIEWED` |
| CV đang xử lý | `CV_PROCESSING` |
| CV parse lỗi | `PARSE_FAILED` |
| Đã parse | `PARSED` |
| Điểm match cao | `HIGH_MATCH` |
| Chưa gửi câu hỏi | `QUESTION_NOT_SENT` |
| Đã trả lời câu hỏi | `QUESTION_ANSWERED` |
| Chưa sync AMIS | `AMIS_NOT_SYNCED` |
| Sync AMIS lỗi | `AMIS_SYNC_FAILED` |
| Đã loại | `REJECTED` |

## 5.4. API đề xuất — Get Application List

```http
GET /api/extension/job-postings/{jobPostingId}/applications
```

### Request

Path params:

| Field | Type | Required |
|---|---|---:|
| `jobPostingId` | string | Yes |

Query params:

| Field | Type | Required | Default | Note |
|---|---|---:|---|---|
| `page` | number | No | `1` | 1-based |
| `pageSize` | number | No | `20` | Max đề xuất `100` |
| `search` | string | No | null | Tên/email/phone |
| `filter` | string | No | `ALL` | Theo filter phía trên |
| `sortBy` | string | No | `appliedAt` | `appliedAt`, `matchScore`, `status` |
| `sortDirection` | string | No | `desc` | `asc`, `desc` |
| `sourceChannel` | string | No | null | Lọc theo nguồn apply |

Example:

```http
GET /api/extension/job-postings/job_posting_7f4a_c21d/applications?page=1&pageSize=20&filter=ALL&sortBy=appliedAt&sortDirection=desc
```

### Response

```json
{
  "success": true,
  "data": {
    "jobPosting": {
      "id": "job_posting_7f4a_c21d",
      "title": "Java Developer",
      "amisRecruitmentId": "43823"
    },
    "summary": {
      "totalApplications": 35,
      "newApplications": 12,
      "processingCv": 4,
      "amisSyncFailed": 1
    },
    "items": [
      {
        "applicationId": "app_001",
        "candidateId": "cand_001",
        "candidate": {
          "fullName": "Nguyễn Văn An",
          "email": "an.nguyen@email.com",
          "phone": "0988 123 456",
          "maskedEmail": "a***@email.com",
          "maskedPhone": "0988 *** 456"
        },
        "sourceChannel": "VCS_PORTAL",
        "appliedAt": "2026-07-01T09:24:00.000+07:00",
        "applicationStatus": "NEW",
        "cvStatus": "PARSED",
        "match": {
          "status": "MATCHED",
          "overallScore": 82,
          "recommendation": "SHORTLIST"
        },
        "questionStatus": "NOT_SENT",
        "amisSyncStatus": "NOT_SYNCED",
        "badges": ["NEW", "PARSED", "HIGH_MATCH"],
        "availableActions": [
          "VIEW_DETAIL",
          "VIEW_CV",
          "SEND_QUESTIONS",
          "SHORTLIST",
          "SYNC_TO_AMIS"
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 35,
      "totalPages": 2,
      "hasNext": true,
      "hasPrevious": false
    }
  },
  "meta": {
    "serverTime": "2026-07-01T10:30:21.000+07:00",
    "requestId": "req_002"
  }
}
```

## 5.5. API đề xuất — Bulk action metadata

Dùng khi UI mở menu bulk actions.

```http
GET /api/extension/job-postings/{jobPostingId}/applications/bulk-actions
```

### Response

```json
{
  "success": true,
  "data": {
    "availableBulkActions": [
      {
        "action": "SEND_QUESTIONS",
        "label": "Gửi bộ câu hỏi",
        "enabled": true,
        "requiresConfirm": true
      },
      {
        "action": "RUN_MATCHING",
        "label": "Chạy matching CV-JD",
        "enabled": true,
        "requiresConfirm": true
      },
      {
        "action": "SYNC_TO_AMIS",
        "label": "Đồng bộ sang AMIS",
        "enabled": false,
        "disabledReason": "Chỉ hỗ trợ sync từng hồ sơ trong MVP"
      }
    ]
  },
  "meta": {
    "serverTime": "2026-07-01T10:30:21.000+07:00"
  }
}
```

---

# 6. Màn 3 — Chi tiết hồ sơ ứng viên

## 6.1. Mục đích màn

Hiển thị toàn bộ thông tin liên quan đến một hồ sơ ứng tuyển: candidate, application, CV, parse result, matching, screening, AMIS sync và timeline.

## 6.2. UI chính

Frame Figma:

```text
Draft - Applied Candidates / Candidate Detail Screen
```

Thành phần UI:

| Khu vực | Nội dung |
|---|---|
| Candidate Hero | Tên, email, phone, source, thời gian apply |
| Tabs | Tổng quan, CV, Parse, Matching, AMIS Sync |
| Quick Stats | CV Status, Match Score, AMIS Sync |
| Profile | Email, phone, current position, experience, location |
| CV Processing | Raw CV, malware scan, clean CV, parse result |
| Parsed Profile | Summary, skills, education, languages |
| Matching CV-JD | Overall score, recommendation, missing must-have |
| Screening Questions | Bộ câu hỏi, trạng thái gửi/trả lời |
| AMIS Sync | Target job, clean CV, status |
| Timeline | Lịch sử xử lý |

## 6.3. API đề xuất — Get Application Detail

```http
GET /api/extension/applications/{applicationId}
```

### Request

Path params:

| Field | Type | Required |
|---|---|---:|
| `applicationId` | string | Yes |

Query params:

| Field | Type | Required | Default | Note |
|---|---|---:|---|---|
| `includeCv` | boolean | No | `true` | Include CV metadata, không include raw file |
| `includeParsedProfile` | boolean | No | `true` | Include parse result summary |
| `includeMatching` | boolean | No | `true` | Include matching score |
| `includeTimeline` | boolean | No | `true` | Include audit/timeline |

Example:

```http
GET /api/extension/applications/app_001?includeCv=true&includeParsedProfile=true&includeMatching=true&includeTimeline=true
```

### Response

```json
{
  "success": true,
  "data": {
    "application": {
      "id": "app_001",
      "status": "NEW",
      "sourceChannel": "VCS_PORTAL",
      "appliedAt": "2026-07-01T09:24:00.000+07:00",
      "jobPostingId": "job_posting_7f4a_c21d",
      "amisRecruitmentId": "43823"
    },
    "candidate": {
      "id": "cand_001",
      "fullName": "Nguyễn Văn An",
      "email": "an.nguyen@email.com",
      "phone": "0988 123 456",
      "location": "Hà Nội, Việt Nam",
      "currentPosition": "Backend Developer",
      "yearsOfExperience": 3.5
    },
    "cv": {
      "rawDocumentId": "cv_raw_001",
      "cleanDocumentId": "cv_clean_001",
      "rawFileName": "nguyen-van-an-cv.pdf",
      "cleanFileName": "clean-nguyen-van-an-cv.pdf",
      "fileType": "application/pdf",
      "fileSizeBytes": 1780000,
      "scanStatus": "SCAN_SAFE",
      "cleanStatus": "CLEAN_READY",
      "parseStatus": "PARSED"
    },
    "parsedProfile": {
      "confidence": "HIGH",
      "summary": "Backend Developer có kinh nghiệm Java/Spring Boot, REST API, PostgreSQL và Docker.",
      "skills": [
        { "name": "Java", "level": "GOOD", "source": "CV" },
        { "name": "Spring Boot", "level": "GOOD", "source": "CV" },
        { "name": "PostgreSQL", "level": "GOOD", "source": "CV" },
        { "name": "Kafka", "level": "UNKNOWN", "source": "MISSING_OR_UNCLEAR" }
      ],
      "experiences": [
        {
          "company": "ABC Software",
          "title": "Backend Developer",
          "startDate": "2023-01",
          "endDate": "2026-06",
          "description": "Xây dựng REST API và backend service."
        }
      ],
      "education": [
        {
          "school": "Đại học Công nghệ",
          "major": "Công nghệ thông tin",
          "degree": "Bachelor"
        }
      ],
      "languages": [
        { "name": "English", "level": "Intermediate" }
      ]
    },
    "matching": {
      "status": "MATCHED",
      "overallScore": 82,
      "skillScore": 80,
      "experienceScore": 85,
      "educationScore": 70,
      "recommendation": "SHORTLIST",
      "strengths": [
        "Có kinh nghiệm Java/Spring Boot",
        "Có kinh nghiệm PostgreSQL",
        "Từng làm backend system"
      ],
      "missingOrUnclear": [
        "Kafka chưa rõ",
        "Cloud chưa rõ"
      ]
    },
    "screening": {
      "questionSetId": "qset_java_backend",
      "questionSetName": "JAVA BACKEND SET",
      "questionStatus": "NOT_SENT",
      "answerStatus": "WAITING",
      "evaluationStatus": "NOT_EVALUATED"
    },
    "amisSync": {
      "status": "NOT_SYNCED",
      "targetAmisRecruitmentId": "43823",
      "lastAttemptAt": null,
      "lastErrorCode": null,
      "lastErrorMessage": null
    },
    "timeline": [
      {
        "time": "2026-07-01T09:24:00.000+07:00",
        "event": "APPLICATION_CREATED",
        "message": "Ứng viên apply từ VCS Portal"
      },
      {
        "time": "2026-07-01T09:25:00.000+07:00",
        "event": "CV_SCAN_SAFE",
        "message": "CV scan pass"
      },
      {
        "time": "2026-07-01T09:27:00.000+07:00",
        "event": "CV_PARSED",
        "message": "CV parsed successfully"
      }
    ],
    "availableActions": [
      "VIEW_CV",
      "DOWNLOAD_CLEAN_CV",
      "SEND_QUESTIONS",
      "RUN_MATCHING",
      "SHORTLIST",
      "REJECT",
      "SYNC_TO_AMIS"
    ]
  },
  "meta": {
    "serverTime": "2026-07-01T10:30:21.000+07:00",
    "requestId": "req_003"
  }
}
```

## 6.4. API đề xuất — Update HR Review Decision

```http
POST /api/extension/applications/{applicationId}/review-decision
```

### Request

```json
{
  "decision": "SHORTLISTED",
  "note": "CV phù hợp Java/Spring Boot, cần kiểm tra thêm Kafka ở vòng screening."
}
```

Allowed `decision`:

```text
SHORTLISTED
REJECTED
NEED_MORE_INFO
REVIEWING
```

### Response

```json
{
  "success": true,
  "data": {
    "applicationId": "app_001",
    "previousStatus": "NEW",
    "currentStatus": "SHORTLISTED",
    "updatedAt": "2026-07-01T10:35:00.000+07:00"
  },
  "meta": {
    "serverTime": "2026-07-01T10:35:00.000+07:00",
    "requestId": "req_004"
  }
}
```

---

# 7. Màn 4 — Xem CV / CV Processing

## 7.1. Mục đích màn

Cho HR xem CV, nhưng ưu tiên **CV sạch** sau khi scan/clean. Màn này cũng hiển thị pipeline xử lý CV: upload, quarantine, malware scan, clean CV, parse, matching và readiness cho HR review.

## 7.2. UI chính

Frame Figma:

```text
Draft - Applied Candidates / CV Viewer Processing Screen
```

Thành phần UI:

| Khu vực | Nội dung |
|---|---|
| Candidate Context | Ứng viên hiện tại, tin apply, source, trạng thái parsed |
| File Switcher | CV gốc / CV sạch |
| CV Viewer | Preview CV sạch dạng PDF |
| Viewer Actions | Mở tab mới, tải CV sạch, copy link |
| Processing Pipeline | CV Uploaded → Malware Scan → Clean CV → Parsed → Matching → Ready |
| Status Details | Raw storage, scan result, clean CV, parse confidence, AMIS readiness |
| Security Notice | Chỉ dùng CV sạch để preview/sync AMIS |
| Main Actions | Tiếp tục review, chạy lại scan, chạy lại parse, xem log |

## 7.3. API đề xuất — Get CV Processing Detail

```http
GET /api/extension/applications/{applicationId}/cv-processing
```

### Response

```json
{
  "success": true,
  "data": {
    "applicationId": "app_001",
    "candidate": {
      "id": "cand_001",
      "fullName": "Nguyễn Văn An"
    },
    "documents": {
      "raw": {
        "documentId": "cv_raw_001",
        "fileName": "nguyen-van-an-cv.pdf",
        "fileType": "application/pdf",
        "fileSizeBytes": 1780000,
        "storageZone": "QUARANTINE",
        "viewAllowed": false,
        "downloadAllowed": false
      },
      "clean": {
        "documentId": "cv_clean_001",
        "fileName": "clean-nguyen-van-an-cv.pdf",
        "fileType": "application/pdf",
        "fileSizeBytes": 1700000,
        "storageZone": "CLEAN",
        "viewAllowed": true,
        "downloadAllowed": true
      }
    },
    "pipeline": [
      {
        "step": "CV_UPLOADED",
        "status": "DONE",
        "time": "2026-07-01T09:24:00.000+07:00",
        "message": "Raw file stored in quarantine"
      },
      {
        "step": "MALWARE_SCAN",
        "status": "DONE",
        "time": "2026-07-01T09:25:00.000+07:00",
        "message": "No threat detected"
      },
      {
        "step": "CLEAN_CV_GENERATED",
        "status": "DONE",
        "time": "2026-07-01T09:26:00.000+07:00",
        "message": "Safe copy is ready"
      },
      {
        "step": "CV_PARSED",
        "status": "DONE",
        "time": "2026-07-01T09:27:00.000+07:00",
        "message": "Profile extracted"
      },
      {
        "step": "MATCHING_CV_JD",
        "status": "DONE",
        "time": "2026-07-01T09:28:00.000+07:00",
        "message": "Score 82/100"
      },
      {
        "step": "READY_FOR_HR_REVIEW",
        "status": "PENDING_HR",
        "time": null,
        "message": "Waiting HR action"
      }
    ],
    "statusDetails": {
      "rawCvStorage": "QUARANTINE",
      "scanResult": "SAFE",
      "cleanCv": "READY",
      "parseConfidence": "HIGH",
      "amisSyncReadiness": "READY_AFTER_HR_CONFIRM"
    },
    "availableActions": [
      "VIEW_CLEAN_CV",
      "DOWNLOAD_CLEAN_CV",
      "OPEN_CLEAN_CV_NEW_TAB",
      "RETRY_SCAN",
      "RETRY_PARSE",
      "VIEW_LOG"
    ]
  },
  "meta": {
    "serverTime": "2026-07-01T10:30:21.000+07:00",
    "requestId": "req_005"
  }
}
```

## 7.4. API đề xuất — Get signed view/download URL

```http
POST /api/extension/cv-documents/{documentId}/signed-url
```

### Request

```json
{
  "purpose": "VIEW",
  "variant": "CLEAN",
  "expiresInSeconds": 300
}
```

Allowed `purpose`:

```text
VIEW
DOWNLOAD
```

Allowed `variant`:

```text
RAW
CLEAN
```

Rule bảo mật đề xuất:

- `RAW` chỉ cho phép nếu user có quyền đặc biệt hoặc debug/audit mode được bật.
- UI mặc định chỉ dùng `CLEAN`.
- Signed URL TTL ngắn, ví dụ 5 phút.
- Không log signed URL.

### Response

```json
{
  "success": true,
  "data": {
    "documentId": "cv_clean_001",
    "variant": "CLEAN",
    "purpose": "VIEW",
    "fileName": "clean-nguyen-van-an-cv.pdf",
    "contentType": "application/pdf",
    "signedUrl": "https://storage.example/signed/clean-nguyen-van-an-cv.pdf?...",
    "expiresAt": "2026-07-01T10:35:21.000+07:00"
  },
  "meta": {
    "serverTime": "2026-07-01T10:30:21.000+07:00",
    "requestId": "req_006"
  }
}
```

## 7.5. API đề xuất — Retry CV processing

```http
POST /api/extension/applications/{applicationId}/cv-processing/retry
```

### Request

```json
{
  "steps": ["PARSE", "MATCHING"],
  "reason": "HR requested retry from extension"
}
```

Allowed `steps`:

```text
SCAN
CLEAN
PARSE
MATCHING
```

### Response

```json
{
  "success": true,
  "data": {
    "applicationId": "app_001",
    "createdJobs": [
      {
        "jobId": "job_parse_retry_001",
        "step": "PARSE",
        "status": "QUEUED"
      },
      {
        "jobId": "job_matching_retry_001",
        "step": "MATCHING",
        "status": "QUEUED"
      }
    ]
  },
  "meta": {
    "serverTime": "2026-07-01T10:30:21.000+07:00",
    "requestId": "req_007"
  }
}
```

---

# 8. Màn 5 — Đồng bộ hồ sơ sang AMIS

## 8.1. Mục đích màn

Cho HR preview dữ liệu candidate/application/CV sạch trước khi xác nhận đồng bộ hồ sơ sang AMIS.

Màn này chỉ được enable khi:

- Có AMIS Recruitment ID hiện tại.
- Application đã có candidate profile.
- CV sạch đã sẵn sàng.
- CV không bị scan failed/infected.
- HR có quyền thực hiện sync.
- HR đã confirm trước khi gửi.

## 8.2. UI chính

Frame Figma:

```text
Draft - Applied Candidates / AMIS Candidate Sync Screen
```

Thành phần UI:

| Khu vực | Nội dung |
|---|---|
| Candidate Sync Context | Ứng viên, tin apply, match score, clean CV ready |
| Step Indicator | Preview → Confirm → Sync Result |
| Sync Readiness Check | Candidate profile, clean CV, target AMIS job, duplicate check |
| Target AMIS Job | AMIS Recruitment ID, title, JobPosting ID, sync mode |
| Candidate Data Preview | Mapping BE field → AMIS field |
| CV File To Upload | Clean CV file |
| Sync Options | Create candidate, link recruitment, attach clean CV, add screening note |
| Confirm Warning | Cảnh báo trước khi sync |
| Expected Sync Flow | Validate, duplicate check, upload CV, create/link candidate, update status |
| Main Actions | Xác nhận sync, lưu nháp, kiểm tra trùng, xem log |

## 8.3. Ghi chú quan trọng về AMIS sync

Phần đồng bộ hồ sơ sang AMIS cần khảo sát thêm AMIS API/DOM/Network trước khi chốt implementation.

Có 3 phương án kỹ thuật:

| Mode | Mô tả | Ghi chú |
|---|---|---|
| `BE_AMIS_API` | Backend gọi AMIS API chính thức/internal API nếu hợp lệ | Ưu tiên nếu AMIS API ổn định và được phép dùng |
| `EXTENSION_UI_AUTOMATION` | Extension thao tác AMIS UI/DOM để upload hồ sơ/CV sạch | Chỉ làm sau khi khảo sát DOM/API/upload flow |
| `MANUAL_REQUIRED` | Backend chuẩn bị data, HR tự thao tác hoặc extension hỗ trợ copy | Fallback an toàn |

MVP nên thiết kế API trả về `syncMode` để UI biết cách xử lý.

## 8.4. API đề xuất — Get AMIS sync readiness

```http
GET /api/extension/applications/{applicationId}/amis-sync/readiness
```

### Response

```json
{
  "success": true,
  "data": {
    "applicationId": "app_001",
    "candidateId": "cand_001",
    "target": {
      "amisRecruitmentId": "43823",
      "amisJobTitle": "Java Developer",
      "jobPostingId": "job_posting_7f4a_c21d"
    },
    "readiness": {
      "ready": true,
      "status": "READY_TO_SYNC",
      "checks": [
        {
          "code": "CANDIDATE_PROFILE_AVAILABLE",
          "status": "PASS",
          "message": "Candidate profile available"
        },
        {
          "code": "CLEAN_CV_READY",
          "status": "PASS",
          "message": "Clean CV is ready"
        },
        {
          "code": "TARGET_AMIS_JOB_DETECTED",
          "status": "PASS",
          "message": "AMIS Recruitment ID: 43823"
        },
        {
          "code": "DUPLICATE_CHECK_RECOMMENDED",
          "status": "WARN",
          "message": "Cần kiểm tra trùng email/phone trên AMIS trước khi submit"
        }
      ]
    },
    "syncMode": "BE_AMIS_API",
    "candidatePreview": {
      "fullName": "Nguyễn Văn An",
      "email": "an.nguyen@email.com",
      "phone": "0988 123 456",
      "sourceChannel": "VCS_PORTAL",
      "matchScore": 82,
      "cleanCvDocumentId": "cv_clean_001",
      "cleanCvFileName": "clean-nguyen-van-an-cv.pdf"
    },
    "fieldMappings": [
      {
        "sourceField": "candidate.fullName",
        "targetField": "CandidateName",
        "valuePreview": "Nguyễn Văn An",
        "status": "OK"
      },
      {
        "sourceField": "candidate.email",
        "targetField": "Email",
        "valuePreview": "an.nguyen@email.com",
        "status": "OK"
      },
      {
        "sourceField": "candidate.phone",
        "targetField": "Mobile",
        "valuePreview": "0988 123 456",
        "status": "OK"
      },
      {
        "sourceField": "cleanCv.fileId",
        "targetField": "Attachment/CV",
        "valuePreview": "clean-nguyen-van-an-cv.pdf",
        "status": "OK"
      }
    ],
    "availableActions": [
      "CONFIRM_SYNC",
      "CHECK_DUPLICATE",
      "VIEW_CLEAN_CV",
      "SAVE_DRAFT"
    ]
  },
  "meta": {
    "serverTime": "2026-07-01T10:30:21.000+07:00",
    "requestId": "req_008"
  }
}
```

## 8.5. API đề xuất — Check duplicate before AMIS sync

```http
POST /api/extension/applications/{applicationId}/amis-sync/check-duplicate
```

### Request

```json
{
  "strategy": "EMAIL_OR_PHONE",
  "targetAmisRecruitmentId": "43823"
}
```

Allowed `strategy`:

```text
EMAIL
PHONE
EMAIL_OR_PHONE
EMAIL_AND_PHONE
```

### Response — no duplicate

```json
{
  "success": true,
  "data": {
    "applicationId": "app_001",
    "duplicateStatus": "NO_DUPLICATE",
    "matchedCandidates": [],
    "canProceed": true
  },
  "meta": {
    "serverTime": "2026-07-01T10:30:21.000+07:00",
    "requestId": "req_009"
  }
}
```

### Response — duplicate review required

```json
{
  "success": true,
  "data": {
    "applicationId": "app_001",
    "duplicateStatus": "POSSIBLE_DUPLICATE",
    "matchedCandidates": [
      {
        "amisCandidateId": "amis_cand_998",
        "fullName": "Nguyễn Văn An",
        "email": "an.nguyen@email.com",
        "phone": "0988 123 456",
        "matchedBy": ["EMAIL", "PHONE"]
      }
    ],
    "canProceed": false,
    "requiredAction": "HR_REVIEW_DUPLICATE"
  },
  "meta": {
    "serverTime": "2026-07-01T10:30:21.000+07:00",
    "requestId": "req_010"
  }
}
```

## 8.6. API đề xuất — Confirm sync to AMIS

```http
POST /api/extension/applications/{applicationId}/amis-sync
```

### Request

```json
{
  "targetAmisRecruitmentId": "43823",
  "syncMode": "BE_AMIS_API",
  "confirm": true,
  "duplicateDecision": {
    "checked": true,
    "decision": "NO_DUPLICATE"
  },
  "options": {
    "createCandidateIfNotExists": true,
    "linkToCurrentRecruitment": true,
    "attachCleanCv": true,
    "attachRawCv": false,
    "includeScreeningSummaryAsNote": true,
    "includeMatchingSummaryAsNote": true
  }
}
```

Field rules:

| Field | Required | Note |
|---|---:|---|
| `targetAmisRecruitmentId` | Yes | AMIS job hiện tại |
| `syncMode` | Yes | `BE_AMIS_API`, `EXTENSION_UI_AUTOMATION`, `MANUAL_REQUIRED` |
| `confirm` | Yes | Phải là `true` |
| `duplicateDecision.checked` | Recommended | Nên check duplicate trước |
| `options.attachCleanCv` | Yes | MVP nên bắt buộc `true` |
| `options.attachRawCv` | Yes | MVP nên luôn `false` |

### Response — sync completed

```json
{
  "success": true,
  "data": {
    "applicationId": "app_001",
    "candidateId": "cand_001",
    "syncStatus": "SYNCED",
    "syncMode": "BE_AMIS_API",
    "amis": {
      "amisRecruitmentId": "43823",
      "amisCandidateId": "amis_cand_1001",
      "amisApplicationId": "amis_app_2001",
      "amisCandidateUrl": "https://amisapp.misa.vn/recruitment/.../candidate/amis_cand_1001"
    },
    "uploadedCv": {
      "documentId": "cv_clean_001",
      "fileName": "clean-nguyen-van-an-cv.pdf",
      "amisFileId": "amis_file_3001"
    },
    "timelineEvent": {
      "event": "AMIS_SYNCED",
      "time": "2026-07-01T10:40:00.000+07:00",
      "message": "Candidate profile and clean CV synced to AMIS"
    }
  },
  "meta": {
    "serverTime": "2026-07-01T10:40:00.000+07:00",
    "requestId": "req_011"
  }
}
```

### Response — manual/extension automation required

```json
{
  "success": true,
  "data": {
    "applicationId": "app_001",
    "syncStatus": "MANUAL_REQUIRED",
    "syncMode": "EXTENSION_UI_AUTOMATION",
    "manualActionRequired": true,
    "instructions": {
      "title": "Cần thao tác trên AMIS UI để hoàn tất upload CV",
      "steps": [
        "Mở popup hồ sơ ứng viên trên AMIS",
        "Điền thông tin ứng viên theo preview",
        "Upload clean CV",
        "Xác nhận lưu hồ sơ"
      ]
    },
    "preparedPayloadId": "amis_sync_payload_001"
  },
  "meta": {
    "serverTime": "2026-07-01T10:40:00.000+07:00",
    "requestId": "req_012"
  }
}
```

### Response — sync failed

```json
{
  "success": false,
  "error": {
    "code": "AMIS_SYNC_FAILED",
    "message": "Upload CV to AMIS failed",
    "details": [
      {
        "step": "UPLOAD_CV",
        "errorCode": "AMIS_UPLOAD_LIMIT_EXCEEDED",
        "message": "AMIS rejected file upload"
      }
    ]
  },
  "meta": {
    "serverTime": "2026-07-01T10:40:00.000+07:00",
    "requestId": "req_013"
  }
}
```

## 8.7. API đề xuất — Get AMIS sync status

```http
GET /api/extension/applications/{applicationId}/amis-sync/status
```

### Response

```json
{
  "success": true,
  "data": {
    "applicationId": "app_001",
    "syncStatus": "SYNCED",
    "lastAttemptAt": "2026-07-01T10:40:00.000+07:00",
    "lastSuccessAt": "2026-07-01T10:40:00.000+07:00",
    "lastErrorCode": null,
    "lastErrorMessage": null,
    "amisCandidateId": "amis_cand_1001",
    "amisApplicationId": "amis_app_2001",
    "amisCandidateUrl": "https://amisapp.misa.vn/recruitment/.../candidate/amis_cand_1001"
  },
  "meta": {
    "serverTime": "2026-07-01T10:45:00.000+07:00",
    "requestId": "req_014"
  }
}
```

---

# 9. API summary

| Màn | API | Method | Path |
|---|---|---|---|
| Job Context | Resolve context | GET | `/api/extension/amis/job-postings/{amisRecruitmentId}/application-context` |
| Danh sách hồ sơ | Get applications | GET | `/api/extension/job-postings/{jobPostingId}/applications` |
| Danh sách hồ sơ | Get bulk actions | GET | `/api/extension/job-postings/{jobPostingId}/applications/bulk-actions` |
| Chi tiết ứng viên | Get detail | GET | `/api/extension/applications/{applicationId}` |
| Chi tiết ứng viên | Review decision | POST | `/api/extension/applications/{applicationId}/review-decision` |
| Xem CV | Get CV processing | GET | `/api/extension/applications/{applicationId}/cv-processing` |
| Xem CV | Get signed URL | POST | `/api/extension/cv-documents/{documentId}/signed-url` |
| Xem CV | Retry processing | POST | `/api/extension/applications/{applicationId}/cv-processing/retry` |
| Đồng bộ AMIS | Get readiness | GET | `/api/extension/applications/{applicationId}/amis-sync/readiness` |
| Đồng bộ AMIS | Check duplicate | POST | `/api/extension/applications/{applicationId}/amis-sync/check-duplicate` |
| Đồng bộ AMIS | Confirm sync | POST | `/api/extension/applications/{applicationId}/amis-sync` |
| Đồng bộ AMIS | Get sync status | GET | `/api/extension/applications/{applicationId}/amis-sync/status` |

---

# 10. Backend implementation note

## 10.1. Module đề xuất

Có thể đặt các API này trong module backend riêng:

```text
apps/backend/src/extension-applications
```

Controller đề xuất:

```text
ExtensionApplicationContextController
ExtensionApplicationsController
ExtensionCvDocumentsController
ExtensionAmisCandidateSyncController
```

Service đề xuất:

```text
ExtensionApplicationContextService
ExtensionApplicationQueryService
ExtensionCvProcessingQueryService
ExtensionAmisCandidateSyncService
```

## 10.2. Data source đề xuất

Các API nên đọc từ các domain/module hiện có hoặc sẽ có:

| Data | Module / source |
|---|---|
| JobPosting | `job-postings` |
| Application | `applications` |
| Candidate | `candidates` |
| CV document | `cv-documents` |
| Clean CV / sanitization | `cv-sanitization` |
| Parse result | `cv-parsing` |
| Matching | `cv-jd-matching` / mapping engine |
| Screening questions | `question-sets`, `form-sessions` |
| AMIS sync | `amis-integration` / `extension-integration` |
| Audit/timeline | `audit-logs`, `workflow-state` |

## 10.3. Security note

- Không trả raw CV content trong API JSON.
- Chỉ trả metadata + signed URL ngắn hạn.
- Không log signed URL.
- Không log JWT, AMIS cookie, raw CV, full parsed CV nếu có PII.
- Mask email/phone ở list nếu cần; detail mới hiển thị đầy đủ cho HR/Admin.
- Tất cả action thay đổi trạng thái phải ghi audit log.
- Sync sang AMIS phải yêu cầu `confirm: true`.

## 10.4. MVP nên implement trước

Thứ tự backend/UI đề xuất:

```text
1. Resolve Job Context
2. Get Application List
3. Get Application Detail
4. Get CV Processing + signed URL clean CV
5. AMIS Sync Readiness
6. Confirm Sync To AMIS
7. Retry/error/log APIs sau
```

---

# 11. Acceptance Criteria MVP

## 11.1. Job Context

- HR mở AMIS job detail, extension detect được `amisRecruitmentId`.
- Extension gọi API context và hiển thị đúng JobPosting/counters.
- Nếu tin chưa sync backend, UI hướng dẫn sync JD trước.

## 11.2. Application List

- HR xem được danh sách hồ sơ apply theo đúng tin.
- Search/filter/sort hoạt động theo query backend.
- Mỗi item hiển thị candidate, source, appliedAt, CV status, match score, question status, AMIS sync status.

## 11.3. Candidate Detail

- HR mở được chi tiết ứng viên.
- Hiển thị candidate profile, CV metadata, parsed profile, matching, screening, AMIS sync và timeline.
- HR có thể cập nhật review decision.

## 11.4. CV Viewer / Processing

- HR xem được clean CV bằng signed URL.
- Không dùng raw CV để preview mặc định.
- Pipeline processing hiển thị rõ step pass/pending/failed.
- Retry scan/parse/matching chỉ hiển thị khi user có quyền và trạng thái hợp lệ.

## 11.5. AMIS Sync

- UI chỉ enable sync khi readiness pass hoặc warning đã được HR xác nhận.
- HR phải confirm trước khi gọi sync API.
- Backend trả sync result rõ ràng: `SYNCED`, `FAILED`, `MANUAL_REQUIRED`, `DUPLICATE_REVIEW_REQUIRED`.
- Sau sync thành công, application cập nhật trạng thái `AMIS_SYNCED`.
- Sau sync lỗi, UI hiển thị error code, message và requestId để support/retry.
