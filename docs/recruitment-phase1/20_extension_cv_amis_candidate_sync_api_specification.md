# 20. Extension CV / AMIS Candidate Sync API Specification

## 1. Mục tiêu tài liệu

Tài liệu này đặc tả nhóm API backend đề xuất để thay phần mock/derived UI trong tab `CV` của Browser Extension VCS Recruitment.

Phạm vi xuất phát từ hai màn extension đã được thiết kế/implement bước đầu:

- `Hồ sơ ứng tuyển`: tổng quan job hiện tại, số lượng hồ sơ, trạng thái xử lý CV và AMIS sync.
- `Danh sách hồ sơ ứng viên`: danh sách candidate/applications của một AMIS recruitment, chọn nhiều ứng viên, mở review/confirm đồng bộ sang AMIS.

Các API trong tài liệu này phục vụ extension UI và phải dùng dữ liệu thật từ Recruitment Core thay vì tính tạm ở frontend cho:

- Match score CV-JD.
- Screening question status.
- CV processing readiness.
- Duplicate check trước khi đẩy ngược ứng viên sang AMIS.
- Sync preview / confirm cho một hồ sơ hoặc batch hồ sơ.

Tài liệu này không triển khai code, không thay đổi schema, không thay đổi Browser Extension source. Đây là contract đề xuất cho backend implementation sau.

## 2. Relationship với API hiện tại

Backend hiện đã có một số endpoint liên quan:

| Endpoint hiện tại | Trạng thái | Ghi chú |
| --- | --- | --- |
| `POST /api/extension/amis/applications/sync` | Implemented | Extension sync candidate/application rows đã capture từ AMIS vào Recruitment Core. |
| `GET /api/extension/amis/recruitments/:amisRecruitmentId/applications` | Implemented | Trả danh sách synced applications theo AMIS recruitment id; hiện chưa có filtering/sorting/overview aggregate đầy đủ. |
| `GET /api/applications` | Implemented | List application nội bộ, có pagination và filter cơ bản. |
| `GET /api/applications/:id` | Implemented | Detail application nội bộ gồm candidate/job/cv/mapping/form/ai summary nếu có. |
| `GET /api/applications/:id/parsed-profile` | Implemented | Parsed profile mới nhất cho application. |
| `GET /api/applications/:id/timeline` | Implemented | Workflow timeline. |
| `GET /api/applications/:id/audit-logs` | Implemented | Audit log đã redact sensitive metadata. |
| `GET /api/applications/:applicationId/cv/:cvDocumentId/clean-file` | Implemented | Download clean CV file; được extension dùng để load CV sạch vào AMIS form. |

Nhóm API đề xuất trong tài liệu này không thay thế các API trên. Chúng bổ sung các response shape chuyên biệt cho extension để tránh UI phải tự suy diễn từ nhiều nguồn rời rạc.

## 3. API convention

| Nhóm | Convention |
| --- | --- |
| Base prefix | `/api` |
| Auth | `Authorization: Bearer <jwt>` |
| Roles | `ADMIN`, `HR` |
| Response envelope | `{ success, data, meta }` |
| Error envelope | `{ success:false, error:{ code, message, details }, meta }` |
| Request trace | `X-Request-Id` optional |
| Extension version | `X-Extension-Version` optional |
| Idempotency | `Idempotency-Key` required for confirm APIs with side effect |
| Missing entity / invalid state | Use `BadRequestException`, not `NotFoundException`, per repo rule |
| Sensitive data | Do not return raw scanner logs, local file paths, AMIS cookies/session data, raw CV text, or full parser prompt/output |

## 4. Endpoint overview

| # | Method | Path | Purpose | Side effect |
| --- | --- | --- | --- | --- |
| 1 | `GET` | `/api/extension/amis/recruitments/:amisRecruitmentId/applications/overview` | Aggregate data for `Hồ sơ ứng tuyển` screen | No |
| 2 | `GET` | `/api/extension/amis/recruitments/:amisRecruitmentId/applications` | Extended candidate list for `Danh sách hồ sơ ứng viên` | No |
| 3 | `GET` | `/api/applications/:id/review-context` | One-call application detail for extension review drawer/detail screen | No |
| 4 | `GET` | `/api/applications/:id/cv-processing` | CV processing state, readiness and clean CV file summary | No |
| 5 | `GET` | `/api/applications/:id/screening-status` | Screening question/form status for application | No |
| 6 | `POST` | `/api/extension/amis/applications/:id/duplicate-check` | Check potential duplicate in AMIS/backend before sync | Optional audit only |
| 7 | `POST` | `/api/extension/amis/applications/:id/sync-preview` | Build preview plan for syncing one candidate to AMIS | No business write |
| 8 | `POST` | `/api/extension/amis/applications/sync-preview/batch` | Build preview plan for syncing selected candidates to AMIS | No business write |
| 9 | `POST` | `/api/extension/amis/applications/:id/sync-confirm` | Confirm sync of one candidate to AMIS | Yes |
| 10 | `POST` | `/api/extension/amis/applications/sync-confirm/batch` | Confirm batch sync to AMIS | Yes |

## 5. Shared DTO conventions

### 5.1 `ExtensionApplicationCandidateItem`

Used by list and overview APIs.

```json
{
  "applicationId": "uuid",
  "candidateId": "uuid",
  "candidateName": "Nguyễn Văn An",
  "email": "an.nguyen@example.com",
  "mobile": "0988123456",
  "sourceChannel": "VCS_PORTAL",
  "externalApplicationId": "amis-candidate-convert-id",
  "applyDate": "2026-07-01T07:20:00.000Z",
  "status": "APPLICATION_CREATED",
  "currentCvDocumentId": "uuid",
  "attachmentCvName": "nguyen-van-an-cv.pdf",
  "cv": {
    "scanStatus": "PASSED",
    "sanitizeStatus": "SANITIZED",
    "parseStatus": "PARSED",
    "documentType": "PDF",
    "cleanFileReady": true,
    "parseConfidence": 0.91
  },
  "matching": {
    "score": 82,
    "recommendation": "SHORTLIST",
    "status": "MAPPING_DONE",
    "missingMustHaveSkills": ["Kafka"]
  },
  "screening": {
    "status": "NOT_SENT",
    "questionSetName": "Java Backend Set",
    "answeredCount": 0,
    "totalQuestions": 8,
    "score": null
  },
  "amisSync": {
    "status": "NOT_SYNCED",
    "targetAmisRecruitmentId": "43823",
    "lastSyncedAt": null,
    "lastErrorCode": null
  },
  "readiness": {
    "overall": "READY_FOR_REVIEW",
    "canSyncToAmis": false,
    "blockingReasons": ["DUPLICATE_CHECK_REQUIRED"]
  }
}
```

### 5.2 Status enums

Recommended enums for extension-facing response. Backend can map from existing internal enums.

```ts
type ExtensionCvProcessingStatus =
  | 'NO_CV'
  | 'RAW_UPLOADED'
  | 'MALWARE_SCAN_PENDING'
  | 'MALWARE_SAFE'
  | 'MALWARE_FAILED'
  | 'CLEAN_CV_GENERATING'
  | 'CLEAN_CV_READY'
  | 'CLEAN_CV_FAILED'
  | 'PARSE_PENDING'
  | 'PARSED'
  | 'PARSE_FAILED';

type ExtensionScreeningStatus =
  | 'NOT_SENT'
  | 'SENT'
  | 'OPENED'
  | 'ANSWERED'
  | 'EXPIRED'
  | 'CANCELLED';

type ExtensionCandidateAmisSyncStatus =
  | 'NOT_SYNCED'
  | 'READY_AFTER_CONFIRM'
  | 'READY_TO_SYNC'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED'
  | 'BLOCKED';

type ExtensionSyncReadiness =
  | 'READY_TO_SYNC'
  | 'READY_AFTER_CONFIRM'
  | 'NEEDS_REVIEW'
  | 'BLOCKED';
```

### 5.3 Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `AMIS_RECRUITMENT_NOT_SYNCED` | 400 | AMIS recruitment id has no internal job posting mapping. Existing behavior already uses this pattern. |
| `APPLICATION_NOT_FOUND` | 400 | Application id is invalid or not accessible to actor. Use `BadRequestException`. |
| `APPLICATION_NOT_IN_RECRUITMENT` | 400 | Application does not belong to the target AMIS recruitment/job posting. |
| `CLEAN_CV_NOT_READY` | 400 | Clean CV file is missing or sanitize status is not ready. |
| `PARSED_PROFILE_NOT_READY` | 400 | Parsed profile is required for sync but missing. |
| `DUPLICATE_CHECK_REQUIRED` | 400 | Sync confirm called before duplicate check or preview approval. |
| `DUPLICATE_BLOCKED` | 400 | Duplicate check found high-confidence duplicate and policy blocks sync. |
| `AMIS_TARGET_JOB_MISSING` | 400 | Target AMIS job/recruitment context cannot be resolved. |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Confirm endpoint missing `Idempotency-Key`. |
| `IDEMPOTENCY_CONFLICT` | 409 | Same idempotency key reused with different request body. |
| `FORBIDDEN` | 403 | Actor lacks `ADMIN`/`HR` role. |
| `UNAUTHORIZED` | 401 | JWT missing/expired. |

## 6. API details

## 6.1 Application overview for AMIS recruitment

```http
GET /api/extension/amis/recruitments/:amisRecruitmentId/applications/overview
```

Purpose:

- Feed the `Hồ sơ ứng tuyển` screen.
- Return job context, counts and high-level status without fetching the full candidate list.

Auth:

- `ADMIN`, `HR`.

Path params:

| Name | Type | Required | Note |
| --- | --- | --- | --- |
| `amisRecruitmentId` | string | Yes | AMIS `RecruitmentID` captured by extension. |

Response:

```json
{
  "success": true,
  "data": {
    "currentJob": {
      "jobPostingId": "uuid",
      "jobDescriptionId": "uuid",
      "jobDescriptionVersionId": "uuid",
      "title": "Java Developer",
      "amisRecruitmentId": "43823",
      "publicUrl": "https://vcs.example/jobs/java-developer",
      "mapped": true,
      "lastSyncedAt": "2026-07-01T10:30:21.000Z"
    },
    "applicationOverview": {
      "totalApplied": 35,
      "newCount": 12,
      "processingCount": 4,
      "syncErrorCount": 1,
      "readyForReviewCount": 12,
      "readyToSyncAmisCount": 8
    },
    "jobStatus": {
      "jdSync": "SYNCED",
      "cvIntake": "ACTIVE",
      "cvProcessing": "PENDING",
      "amisCandidateSync": "FAILED"
    },
    "actions": {
      "canRefreshApplications": true,
      "canSyncJd": true,
      "canOpenPublicJob": true,
      "canOpenQuestionSet": true
    }
  },
  "meta": {
    "timestamp": "2026-07-04T00:00:00.000Z"
  }
}
```

Implementation notes:

- Can be implemented in `ExtensionIntegrationController` under `extension/amis`.
- Should reuse the external reference table to resolve `amisRecruitmentId -> jobPostingId`.
- If not mapped, return `400 AMIS_RECRUITMENT_NOT_SYNCED`.
- Counts should be computed server-side from `applications`, `cv_documents`, latest mapping result, form session and AMIS sync history when available.

## 6.2 Extended application list for AMIS recruitment

```http
GET /api/extension/amis/recruitments/:amisRecruitmentId/applications
```

This extends the existing endpoint. It can remain backward compatible by returning the current minimal fields plus optional extension-specific fields.

Query params:

| Name | Type | Required | Default | Note |
| --- | --- | --- | --- | --- |
| `status` | string | No | all | Filter extension status bucket: `new`, `ready`, `needs_review`, `failed`, `not_synced`, `sync_error`. |
| `sourceChannel` | string | No | all | `VCS_PORTAL`, `TOPCV`, `ITVIEC`, etc. |
| `search` | string | No | none | Candidate name/email/mobile. |
| `sortBy` | string | No | `matchScore` | `matchScore`, `applyDate`, `candidateName`, `status`. |
| `sortOrder` | string | No | `DESC` | `ASC` or `DESC`. |
| `page` | number | No | 1 | Pagination, optional for extension. |
| `limit` | number | No | 50 | Max recommended 100. |
| `includeDerived` | boolean | No | true | Include matching/screening/readiness summaries. |

Response:

```json
{
  "success": true,
  "data": {
    "amisRecruitmentId": "43823",
    "jobPostingId": "uuid",
    "total": 35,
    "summary": {
      "readyCount": 12,
      "needsReviewCount": 8,
      "failedCount": 15,
      "noAnswerCount": 5,
      "notSyncedAmisCount": 20,
      "syncErrorCount": 1
    },
    "applications": [
      {
        "applicationId": "uuid",
        "candidateId": "uuid",
        "candidateName": "Nguyễn Văn An",
        "email": "an.nguyen@example.com",
        "mobile": "0988123456",
        "sourceChannel": "VCS_PORTAL",
        "applyDate": "2026-07-01T07:20:00.000Z",
        "status": "WAITING_HR_REVIEW",
        "currentCvDocumentId": "uuid",
        "attachmentCvName": "nguyen-van-an-cv.pdf",
        "cv": {
          "scanStatus": "PASSED",
          "sanitizeStatus": "SANITIZED",
          "parseStatus": "PARSED",
          "cleanFileReady": true,
          "parseConfidence": 0.91
        },
        "matching": {
          "score": 82,
          "recommendation": "SHORTLIST",
          "status": "MAPPING_DONE"
        },
        "screening": {
          "status": "NOT_SENT",
          "questionSetName": "Java Backend Set",
          "answeredCount": 0,
          "totalQuestions": 8
        },
        "amisSync": {
          "status": "NOT_SYNCED",
          "lastSyncedAt": null,
          "lastErrorCode": null
        },
        "readiness": {
          "overall": "READY_AFTER_CONFIRM",
          "canSyncToAmis": false,
          "blockingReasons": ["DUPLICATE_CHECK_REQUIRED"]
        }
      }
    ]
  },
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 35,
    "totalPages": 1
  },
  "meta": {
    "timestamp": "2026-07-04T00:00:00.000Z"
  }
}
```

Compatibility notes:

- Existing extension client currently expects `AmisApplicationsForRecruitmentDto` with `applications` array. Backend may introduce this richer response under a new endpoint if avoiding breaking change is preferred:
  - `GET /api/extension/amis/recruitments/:amisRecruitmentId/applications/extended`
- Recommended path remains extending the current endpoint carefully because the UI already calls it.

## 6.3 Application review context

```http
GET /api/applications/:id/review-context
```

Purpose:

- Feed future extension candidate detail screen.
- Avoid many round trips to `GET /applications/:id`, `parsed-profile`, `timeline`, `audit-logs`, mapping, form and AI endpoints.

Response:

```json
{
  "success": true,
  "data": {
    "application": {
      "applicationId": "uuid",
      "status": "WAITING_HR_REVIEW",
      "sourceChannel": "VCS_PORTAL",
      "applyDate": "2026-07-01T07:20:00.000Z"
    },
    "candidate": {
      "candidateId": "uuid",
      "fullName": "Nguyễn Văn An",
      "email": "an.nguyen@example.com",
      "phone": "0988123456",
      "currentPosition": "Backend Developer",
      "location": "Hà Nội, Việt Nam"
    },
    "jobPosting": {
      "jobPostingId": "uuid",
      "title": "Java Developer",
      "amisRecruitmentId": "43823"
    },
    "cv": {
      "currentCvDocumentId": "uuid",
      "originalFileName": "nguyen-van-an-cv.pdf",
      "cleanFileReady": true,
      "cleanFileName": "clean-nguyen-van-an-cv.pdf"
    },
    "parsedProfile": {
      "summary": "Backend Developer có kinh nghiệm Java/Spring Boot...",
      "education": ["Đại học Công nghệ - Chuyên ngành CNTT"],
      "languages": ["English: Intermediate"],
      "skills": ["Java", "Spring Boot", "PostgreSQL"]
    },
    "matching": {
      "score": 82,
      "recommendation": "SHORTLIST",
      "skillMatch": 80,
      "experienceMatch": 85,
      "missingMustHaveSkills": ["Kafka"]
    },
    "screening": {
      "status": "NOT_SENT",
      "questionSetName": "Java Backend Set",
      "sendStatus": "SENT",
      "answerStatus": "WAITING",
      "score": null
    },
    "processingPipeline": [
      {
        "step": "CV_UPLOADED",
        "status": "DONE",
        "timestamp": "2026-07-01T07:20:00.000Z"
      }
    ],
    "amisSync": {
      "status": "NOT_SYNCED",
      "targetAmisRecruitmentId": "43823",
      "cvFileStatus": "CLEAN_CV_READY"
    }
  },
  "meta": {
    "timestamp": "2026-07-04T00:00:00.000Z"
  }
}
```

Implementation notes:

- Should redact sensitive parsed data.
- Should not return raw CV text; return summary/normalized structured fields only.
- Can be composed from existing `ApplicationsService.findDetail`, parsed profile, mapping result, form session and workflow timeline.

## 6.4 CV processing status

```http
GET /api/applications/:id/cv-processing
```

Purpose:

- Feed future `Xem CV / CV Processing` screen.
- Tell extension whether clean CV and parsed profile are ready before sync preview.

Response:

```json
{
  "success": true,
  "data": {
    "applicationId": "uuid",
    "candidateName": "Nguyễn Văn An",
    "rawCv": {
      "cvDocumentId": "uuid",
      "fileName": "nguyen-van-an-cv.pdf",
      "status": "UPLOADED",
      "storageMode": "QUARANTINE"
    },
    "malwareScan": {
      "status": "SAFE",
      "scanner": "stub-or-provider",
      "scannedAt": "2026-07-01T07:22:00.000Z"
    },
    "cleanCv": {
      "status": "READY",
      "cvDocumentId": "uuid",
      "fileName": "clean-nguyen-van-an-cv.pdf",
      "downloadUrl": "/api/applications/{applicationId}/cv/{cvDocumentId}/clean-file?disposition=attachment"
    },
    "parse": {
      "status": "PARSED",
      "confidence": 0.91,
      "warnings": []
    },
    "amisSyncReadiness": {
      "status": "READY_AFTER_CONFIRM",
      "checks": [
        {
          "key": "candidate_profile_available",
          "label": "Candidate profile available",
          "status": "OK"
        },
        {
          "key": "clean_cv_ready",
          "label": "Clean CV is ready",
          "status": "OK"
        },
        {
          "key": "target_amis_job_detected",
          "label": "Target AMIS job detected",
          "status": "OK"
        },
        {
          "key": "duplicate_check_needed",
          "label": "Duplicate check needed",
          "status": "BLOCK"
        }
      ]
    }
  },
  "meta": {
    "timestamp": "2026-07-04T00:00:00.000Z"
  }
}
```

## 6.5 Screening status

```http
GET /api/applications/:id/screening-status
```

Purpose:

- Replace extension mock for screening question status.
- Support candidate list badges: `ANSWERED`, `NOT_SENT`, `WAITING`, etc.

Response:

```json
{
  "success": true,
  "data": {
    "applicationId": "uuid",
    "questionSet": {
      "id": "uuid",
      "name": "Java Backend Set",
      "totalQuestions": 8
    },
    "formSession": {
      "formSessionId": "uuid",
      "status": "SENT",
      "sentAt": "2026-07-01T08:00:00.000Z",
      "openedAt": null,
      "submittedAt": null,
      "expiresAt": "2026-07-08T08:00:00.000Z"
    },
    "answers": {
      "answeredCount": 0,
      "totalQuestions": 8,
      "score": null,
      "status": "WAITING"
    }
  },
  "meta": {
    "timestamp": "2026-07-04T00:00:00.000Z"
  }
}
```

Implementation notes:

- If no form session exists, return `formSession: null` and `answers.status: "NOT_SENT"`.
- This API should be read-only.

## 6.6 Duplicate check

```http
POST /api/extension/amis/applications/:id/duplicate-check
```

Purpose:

- Check whether selected application/candidate may already exist in AMIS or internal sync records before sync confirm.
- Backend should not call AMIS directly unless a validated AMIS integration is available. For MVP extension, this can check internal records and return `requiresManualConfirm` when AMIS-side certainty is unavailable.

Request:

```json
{
  "targetAmisRecruitmentId": "43823",
  "candidate": {
    "fullName": "Nguyễn Văn An",
    "email": "an.nguyen@example.com",
    "mobile": "0988123456"
  },
  "policy": {
    "blockHighConfidenceDuplicate": true,
    "allowManualConfirm": true
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "applicationId": "uuid",
    "status": "NEEDS_CONFIRMATION",
    "requiresManualConfirm": true,
    "matches": [
      {
        "source": "INTERNAL_APPLICATION",
        "candidateId": "uuid",
        "confidence": 0.82,
        "matchedFields": ["email"],
        "message": "Potential overlap with existing candidate email."
      }
    ],
    "expiresAt": "2026-07-04T00:15:00.000Z"
  },
  "meta": {
    "timestamp": "2026-07-04T00:00:00.000Z"
  }
}
```

Allowed `data.status`:

- `CLEAR`
- `NEEDS_CONFIRMATION`
- `BLOCKED`
- `CHECK_UNAVAILABLE`

## 6.7 Sync preview for one application

```http
POST /api/extension/amis/applications/:id/sync-preview
```

Purpose:

- Build a server-side preview plan before extension shows confirm UI.
- No permanent business write. Backend may write an audit event `AMIS_CANDIDATE_SYNC_PREVIEWED` if desired, but must not mark application as synced.

Request:

```json
{
  "targetAmisRecruitmentId": "43823",
  "targetAmisJobTitle": "Java Developer",
  "includeCleanCv": true,
  "duplicateCheckToken": "optional-token-from-duplicate-check",
  "manualDuplicateConfirm": false
}
```

Response:

```json
{
  "success": true,
  "data": {
    "previewId": "uuid-or-signed-token",
    "mode": "SINGLE",
    "readiness": {
      "status": "READY_AFTER_CONFIRM",
      "percentage": 82,
      "checks": [
        {
          "key": "candidate_profile_available",
          "label": "Candidate profile available",
          "status": "OK"
        },
        {
          "key": "clean_cv_ready",
          "label": "Clean CV is ready",
          "status": "OK"
        },
        {
          "key": "duplicate_check_needed",
          "label": "Duplicate check needed",
          "status": "BLOCK"
        }
      ]
    },
    "targetAmisJob": {
      "amisRecruitmentId": "43823",
      "title": "Java Developer",
      "syncMode": "CREATE_CANDIDATE_PROFILE_AND_ATTACH_CLEAN_CV"
    },
    "candidateDataReview": [
      {
        "beField": "candidate.fullName",
        "amisField": "CandidateName",
        "valuePreview": "Nguyễn Văn An",
        "status": "OK"
      },
      {
        "beField": "candidate.email",
        "amisField": "Email",
        "valuePreview": "an.nguyen@example.com",
        "status": "OK"
      }
    ],
    "cvFile": {
      "cvDocumentId": "uuid",
      "fileName": "clean-nguyen-van-an-cv.pdf",
      "sizeBytes": 1780000,
      "status": "SAFE"
    },
    "expectedFlow": [
      {
        "step": "VALIDATE_CANDIDATE_DATA",
        "status": "DONE"
      },
      {
        "step": "CHECK_DUPLICATE_ON_AMIS",
        "status": "WAIT"
      },
      {
        "step": "UPLOAD_CLEAN_CV_FILE",
        "status": "WAIT"
      },
      {
        "step": "CREATE_OR_LINK_CANDIDATE_TO_JOB",
        "status": "WAIT"
      },
      {
        "step": "UPDATE_APPLICATION_SYNC_STATUS",
        "status": "WAIT"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-07-04T00:00:00.000Z"
  }
}
```

Implementation notes:

- `previewId` can be a persisted short-lived record or a signed token. Persisted record is easier for audit and confirm.
- Preview should snapshot field mappings so confirm cannot silently use changed data unless policy allows regeneration.
- Preview should expire, suggested TTL: 15 minutes.

## 6.8 Batch sync preview

```http
POST /api/extension/amis/applications/sync-preview/batch
```

Request:

```json
{
  "targetAmisRecruitmentId": "43823",
  "applicationIds": ["uuid-1", "uuid-2", "uuid-3", "uuid-4"],
  "includeCleanCv": true,
  "policy": {
    "skipBlockedApplications": false,
    "allowManualDuplicateConfirm": true
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "previewId": "uuid-or-signed-token",
    "mode": "BATCH",
    "selectedCount": 4,
    "readinessPercentage": 75,
    "aggregateChecks": [
      {
        "key": "candidate_profiles_available",
        "label": "Candidate profiles available",
        "status": "OK",
        "okCount": 4,
        "totalCount": 4
      },
      {
        "key": "clean_cvs_ready",
        "label": "Clean CVs ready",
        "status": "WARNING",
        "okCount": 3,
        "totalCount": 4,
        "items": [
          {
            "applicationId": "uuid-2",
            "candidateName": "Nguyễn Văn An",
            "issue": "Missing file"
          }
        ]
      }
    ],
    "targetAmisJobs": [
      {
        "amisRecruitmentId": "43823",
        "title": "Java Developer",
        "candidateCount": 3
      },
      {
        "amisRecruitmentId": "43901",
        "title": "Business Analyst",
        "candidateCount": 1
      }
    ],
    "mappingSummary": {
      "totalFields": 20,
      "okFields": 20,
      "invalidFields": 0
    },
    "cvPackage": {
      "packageName": "Batch_Sync_CVs_01072026.zip",
      "fileCount": 4,
      "safeCount": 3,
      "status": "READY_WITH_WARNINGS"
    }
  },
  "meta": {
    "timestamp": "2026-07-04T00:00:00.000Z"
  }
}
```

Batch validation rules:

- `applicationIds` required, non-empty.
- Suggested max: 50 per request for extension UI.
- All applications must be accessible to actor.
- All applications must belong to mapped job postings / AMIS recruitments.
- If target job differs per application, response must group by target AMIS job.

## 6.9 Confirm sync for one application

```http
POST /api/extension/amis/applications/:id/sync-confirm
Idempotency-Key: ext-amis-candidate-sync-<uuid>
```

Purpose:

- Confirm the one-candidate sync plan after HR reviews preview.
- This is the side-effect API. It should update sync status and optionally return instructions/payload for the extension to execute AMIS page actions if backend cannot call AMIS directly.

Request:

```json
{
  "previewId": "uuid-or-signed-token",
  "targetAmisRecruitmentId": "43823",
  "confirmedAt": "2026-07-04T00:03:00.000Z",
  "manualDuplicateConfirm": true,
  "executionMode": "EXTENSION_ASSISTED"
}
```

Allowed `executionMode`:

- `EXTENSION_ASSISTED`: backend records plan and extension performs browser-side AMIS upload/form action.
- `BACKEND_DIRECT`: future mode only if backend AMIS API integration is approved.
- `DRY_RUN`: for QA; no business write except audit.

Response:

```json
{
  "success": true,
  "data": {
    "syncRunId": "uuid",
    "applicationId": "uuid",
    "status": "READY_FOR_EXTENSION_EXECUTION",
    "targetAmisRecruitmentId": "43823",
    "steps": [
      {
        "step": "VALIDATE_CANDIDATE_DATA",
        "status": "DONE"
      },
      {
        "step": "UPLOAD_CLEAN_CV_FILE",
        "status": "WAIT_EXTENSION"
      },
      {
        "step": "CREATE_OR_LINK_CANDIDATE_TO_JOB",
        "status": "WAIT_EXTENSION"
      },
      {
        "step": "REPORT_RESULT",
        "status": "WAIT_EXTENSION"
      }
    ],
    "extensionPayload": {
      "candidate": {
        "fullName": "Nguyễn Văn An",
        "email": "an.nguyen@example.com",
        "mobile": "0988123456"
      },
      "cleanCvDownload": {
        "applicationId": "uuid",
        "cvDocumentId": "uuid",
        "fileName": "clean-nguyen-van-an-cv.pdf"
      }
    }
  },
  "meta": {
    "timestamp": "2026-07-04T00:03:00.000Z",
    "idempotencyKey": "ext-amis-candidate-sync-<uuid>"
  }
}
```

Follow-up endpoint recommended for extension-assisted execution result:

```http
POST /api/extension/amis/applications/:id/sync-result
```

This endpoint is not part of the original UI proposal but is needed once confirm becomes real.

## 6.10 Confirm batch sync

```http
POST /api/extension/amis/applications/sync-confirm/batch
Idempotency-Key: ext-amis-candidate-batch-sync-<uuid>
```

Request:

```json
{
  "previewId": "uuid-or-signed-token",
  "applicationIds": ["uuid-1", "uuid-2", "uuid-3", "uuid-4"],
  "confirmedAt": "2026-07-04T00:05:00.000Z",
  "manualDuplicateConfirm": true,
  "executionMode": "EXTENSION_ASSISTED"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "batchSyncRunId": "uuid",
    "status": "READY_FOR_EXTENSION_EXECUTION",
    "selectedCount": 4,
    "acceptedCount": 3,
    "blockedCount": 1,
    "items": [
      {
        "applicationId": "uuid-1",
        "candidateName": "Nguyễn Văn An",
        "status": "READY_FOR_EXTENSION_EXECUTION",
        "syncRunId": "uuid"
      },
      {
        "applicationId": "uuid-2",
        "candidateName": "Lê Minh Cường",
        "status": "BLOCKED",
        "blockingReasons": ["CLEAN_CV_NOT_READY"]
      }
    ],
    "package": {
      "fileName": "Batch_Sync_CVs_01072026.zip",
      "downloadUrl": "/api/extension/amis/applications/sync-runs/{batchSyncRunId}/cv-package"
    }
  },
  "meta": {
    "timestamp": "2026-07-04T00:05:00.000Z",
    "idempotencyKey": "ext-amis-candidate-batch-sync-<uuid>"
  }
}
```

Implementation notes:

- If `skipBlockedApplications=false`, any blocked item should block entire batch with `400 BATCH_SYNC_BLOCKED`.
- If `skipBlockedApplications=true`, response can accept ready items and list blocked ones.
- `batchSyncRunId` should become source of truth for later progress/result reporting.

## 7. Data persistence proposal

The following tables/entities are recommended if confirm sync becomes real.

### 7.1 `amis_candidate_sync_runs`

| Field | Type | Note |
| --- | --- | --- |
| `id` | uuid | Primary key. |
| `application_id` | uuid | FK to `applications`. |
| `job_posting_id` | uuid | FK to `job_postings`. |
| `target_amis_recruitment_id` | varchar | AMIS target job. |
| `mode` | enum | `SINGLE`, `BATCH_ITEM`. |
| `batch_run_id` | uuid nullable | Batch parent. |
| `status` | enum | `PREVIEWED`, `READY_FOR_EXTENSION_EXECUTION`, `SYNCING`, `SYNCED`, `FAILED`, `BLOCKED`. |
| `preview_snapshot` | jsonb | Redacted preview data. |
| `extension_payload` | jsonb | Redacted browser execution payload. |
| `idempotency_key` | varchar nullable | For confirm APIs. |
| `actor_user_id` | uuid | HR/Admin actor. |
| `last_error_code` | varchar nullable | Failure code. |
| `last_error_message` | text nullable | Redacted message. |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

### 7.2 `amis_candidate_batch_sync_runs`

| Field | Type | Note |
| --- | --- | --- |
| `id` | uuid | Primary key. |
| `job_posting_id` | uuid nullable | Nullable if batch spans jobs. |
| `selected_count` | int |  |
| `accepted_count` | int |  |
| `blocked_count` | int |  |
| `status` | enum | `PREVIEWED`, `READY_FOR_EXTENSION_EXECUTION`, `SYNCING`, `COMPLETED`, `FAILED`, `PARTIAL`. |
| `preview_snapshot` | jsonb | Redacted aggregate preview. |
| `idempotency_key` | varchar nullable |  |
| `actor_user_id` | uuid |  |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

### 7.3 Reuse existing entities where possible

- `applications`: update AMIS sync status fields only if current schema has room; otherwise use sync run table as source of truth.
- `workflow_events`: append events like `AMIS_CANDIDATE_SYNC_PREVIEWED`, `AMIS_CANDIDATE_SYNC_CONFIRMED`, `AMIS_CANDIDATE_SYNC_FAILED`.
- `audit_logs`: record actor, target, result and safe metadata.
- `cv_documents`: source for clean CV readiness and clean-file download.
- `mapping_results`, `form_sessions`, `ai_screening_results`: source for derived statuses.

## 8. Security and audit requirements

1. Only `ADMIN` and `HR` can call these APIs.
2. Confirm endpoints require `Idempotency-Key`.
3. Preview and confirm payloads must not include:
   - local storage paths,
   - raw CV text,
   - scanner command/log,
   - AMIS cookie/session/token,
   - full raw AMIS response,
   - unredacted parser prompt/output.
4. Clean CV download remains behind existing authenticated clean-file API.
5. Batch package download, if implemented, must be short-lived and authenticated.
6. Preview records should expire; suggested TTL 15 minutes.
7. Every confirm attempt should create audit/workflow event even if blocked.
8. Duplicate check should be conservative. If certainty is low, return `NEEDS_CONFIRMATION`, not `CLEAR`.

## 9. Implementation order proposal

| Step | Scope | Notes |
| --- | --- | --- |
| 1 | Extend `GET /extension/amis/recruitments/:id/applications` with derived fields | Lowest risk; immediately replaces extension mock list values. |
| 2 | Add `/applications/overview` | Enables first CV screen to stop deriving metrics in frontend. |
| 3 | Add `GET /applications/:id/cv-processing` and `/screening-status` | Enables detail/CV Processing screens. |
| 4 | Add `GET /applications/:id/review-context` | Composed endpoint for future detail screen. |
| 5 | Add duplicate check + sync preview single/batch | Still no AMIS write; safe product validation step. |
| 6 | Add confirm single/batch with `EXTENSION_ASSISTED` mode | Creates sync runs and returns payload for extension execution. |
| 7 | Add sync-result reporting endpoints | Required to close the loop after extension performs AMIS actions. |

## 10. Open decisions

| ID | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| `AMIS-CV-001` | Does backend call AMIS directly? | `EXTENSION_ASSISTED`, `BACKEND_DIRECT` | Keep `EXTENSION_ASSISTED` until AMIS API auth/security is approved. |
| `AMIS-CV-002` | Preview persistence | Signed token, DB record | DB record for audit, easier batch progress. |
| `AMIS-CV-003` | Batch max size | 20, 50, 100 | 50 for extension UI MVP. |
| `AMIS-CV-004` | Block policy for duplicate | Block always, allow manual confirm | Block high-confidence duplicates; allow manual confirm for medium confidence. |
| `AMIS-CV-005` | Where to store AMIS sync status | `applications` fields, sync run table | Sync run table as source of truth; cache latest status on application only if query performance needs it. |

## 11. Frontend/extension mapping

| Extension UI area | API source after implementation |
| --- | --- |
| Current Job card | `GET /extension/amis/recruitments/:id/applications/overview` |
| Application overview metrics | `GET /extension/amis/recruitments/:id/applications/overview` |
| Job status list | `GET /extension/amis/recruitments/:id/applications/overview` |
| Candidate list cards | `GET /extension/amis/recruitments/:id/applications?includeDerived=true` |
| Match score | `applications[].matching.score` |
| Question status | `applications[].screening.status` or `GET /applications/:id/screening-status` |
| CV status | `applications[].cv` or `GET /applications/:id/cv-processing` |
| Sync AMIS review modal | `POST /extension/amis/applications/:id/sync-preview` or batch preview |
| Confirm sync | `POST /extension/amis/applications/:id/sync-confirm` or batch confirm |

## 12. Backward compatibility

- Existing `POST /api/extension/amis/applications/sync` remains the AMIS -> Recruitment Core ingestion endpoint.
- Existing `GET /api/extension/amis/recruitments/:amisRecruitmentId/applications` can be extended in a backward-compatible way.
- If response shape change is considered risky, add `GET /api/extension/amis/recruitments/:amisRecruitmentId/applications/extended` and let extension migrate explicitly.
- Existing clean CV download endpoint should not be duplicated.

