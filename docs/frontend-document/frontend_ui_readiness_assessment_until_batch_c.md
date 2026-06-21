# Frontend + Specification UI Readiness Assessment up to Batch C

Nguon audit: `docs/recruitment-phase1` va source frontend hien tai trong `apps/frontend`.

Pham vi danh gia: chi tinh den Batch C, tuc la JD / Job Posting / Application Core va CV processing MVP. Khong dua Mapping CV-JD, Pre-screening Form, AI Screening, HR Review decision, Channel dashboard, Bot UI, Offer, Interview, Onboarding vao danh sach UI can lam ngay.

Ket qua nay la assessment/audit, khong phai implementation plan chi tiet.

## 1. Ket Luan Ngan

- Muc du cua specification: `GAN DU, CAN BO SUNG NHO`.
- Muc san sang cua frontend hien tai: `CO THE REUSE MOT PHAN`.
- Co the tao danh sach UI Batch C chua: Co.
- Ly do chinh: specification da du flow, API va security boundary cho JD, Job Posting, Application, CV upload, quarantine, scan, sanitize, parse, clean CV, CV version va timeline. Frontend da co React/Vite, routing, layout, auth, API wrapper, table/form/modal/toast/upload/download pattern. Tuy nhien chua co route/type/domain UI rieng cho Recruitment Phase 1, va UI hien tai van xoay quanh `Candidate` / `Interview Session`.

## 2. File Specification Da Doc

| File | Vai tro | Lien quan UI Batch C? | Ghi chu |
|---|---|---:|---|
| `01_phase1_context_summary.md` | Context Phase 1 | Co | Xac dinh recruitment core, application-centric flow |
| `02_target_architecture_phase1.md` | Kien truc target | Co | Module boundary va dependency huong UI/API |
| `03_module_extension_plan.md` | Module extension | Co | `applications` la trung tam, khong dung `sessions` lam flow tuyen dung |
| `04_domain_model_and_relationships.md` | Domain model | Co | JD, JobPosting, Application, CV, WorkflowEvent |
| `05_workflow_state_machine.md` | State machine | Co | Status can hien thi tren Application/CV |
| `06_database_migration_plan.md` | DB model | Co | Field/table/status enum cho UI list/detail |
| `07_api_contract_specification.md` | API contract | Co | Public apply, application API, CV API, clean file, parsed profile |
| `08_cv_processing_specification.md` | CV processing | Co | Upload/scan/sanitize/parse/version/security |
| `14_security_and_audit_log_specification.md` | Role/security/audit | Co | HR/Admin clean CV, public khong thay raw/clean CV |
| `15_implementation_task_breakdown.md` | Batch scope | Co | Batch C = P1-C01..P1-C09; mapping/form/AI/HR Review de later |
| `09`-`13` specs | Batch sau C | Khong dua vao UI hien tai | Chi dung de xac dinh out-of-scope |

## 3. Source Frontend Da Doc

| Path/File | Vai tro | Nhan xet |
|---|---|---|
| `package.json` | Workspace scripts | Turbo/pnpm workspace |
| `apps/frontend/package.json` | Frontend stack | Vite React, React Router, Tailwind/Radix, lucide, zod, react-hook-form |
| `apps/frontend/vite.config.ts` | Dev/proxy config | `/api` proxy sang backend `127.0.0.1:3002`; alias shared |
| `apps/frontend/src/app/routes.tsx` | Routes | Co auth routes, internal layout, candidate session token; chua co recruitment routes |
| `apps/frontend/src/app/layouts/InterviewerLayout.tsx` | Sidebar/auth layout | Co sidebar, JWT check, admin menu; HR menu chua tach ro |
| `apps/frontend/src/lib/api-client.ts` | API wrapper | Co JSON/upload/download helper; chua co idempotency header |
| `apps/frontend/src/lib/auth-context.tsx` | Auth context | Co user context toi gian |
| `apps/frontend/src/components/ui/*` | UI primitives | Co button/input/select/table/dialog/tabs/toast/badge/pagination |
| `apps/frontend/src/pages/interviewer/candidates/*` | Candidate UI | Reuse layout/table/upload/preview pattern nhung flow cu conflict voi Batch C |
| `apps/frontend/src/pages/interviewer/settings/ManagementPage.tsx` | CRUD admin pattern | Reuse tot cho JD/JobPosting CRUD |
| `packages/shared/src/types/*` | Shared types | Co legacy candidate/session/user; chua co Phase 1 types |

## 4. Hien Trang Frontend

### 4.1. Framework / Routing / Layout

Frontend la React Vite voi `react-router-dom`. Route chinh nam o `apps/frontend/src/app/routes.tsx`.

Routes hien co:

- `/login`
- `/auth/google/callback`
- `/dashboard`
- `/candidates`
- `/questions`
- `/sessions`
- `/settings/*`
- `/session/:token`

Co `InterviewerLayout` cho internal authenticated UI va `CandidateLayout` cho token session. Chua co public route cho job detail/apply, chua co HR workspace route cho JD/JobPosting/Application/CV.

### 4.2. Auth / Role / Route Protection

Auth hien dua vao `localStorage token`, `apiClient.setToken()`, va call `/auth/me` trong `InterviewerLayout`.

Sidebar co admin-only menu bang `UserRole.ADMIN`.

Role hien co trong shared:

- `ADMIN`
- `INTERVIEWER`
- `HR`

Chua co guard component ro cho tung route HR/Admin, va HR menu chua duoc thiet ke rieng cho recruitment workspace.

### 4.3. API Client / State Management

API wrapper nam o `apps/frontend/src/lib/api-client.ts`, dung `fetch`, co:

- `get`
- `post`
- `put`
- `patch`
- `delete`
- `upload`
- `uploadMulti`
- `downloadBlob`

Chua thay React Query, SWR, Zustand hoac Redux. State chu yeu la local component state.

Diem can bo sung cho Batch C:

- Support `Idempotency-Key`.
- Error normalization theo code nhu `MALWARE_DETECTED`, `CV_SCAN_FAILED`, `CV_SANITIZE_FAILED`, `CV_PARSE_FAILED`.
- Can quyet dinh viec tiep tuc hardcode `/api` hay dung `VITE_API_URL`.

### 4.4. Component Co The Reuse

Co the reuse:

- `Button`
- `Input`
- `Select`
- `Textarea`
- `Checkbox`
- `Switch`
- `Table`
- `DataTablePagination`
- `SortableHeader`
- `Dialog`
- `Tabs`
- `Toast`
- `Badge`
- `Card`
- `Tooltip`

Co upload/download/preview pattern trong Candidate pages, nhung chua co reusable `FileUpload` component. Co PDF/XLSX preview pattern trong `CandidateDetailPage`. Chua co timeline/stepper component rieng.

### 4.5. Existing Screens Co The Reuse

| Existing screen/path | Chuc nang hien tai | Reuse cho UI Batch C | Muc reuse |
|---|---|---|---|
| `CandidateListPage` | Search/filter/table/pagination | Application list | Trung binh |
| `CandidateDetailPage` | Detail layout, upload, file preview, parsed profile cards | Application detail, CV panel, Parsed Profile | Mot phan, phai doi business flow |
| `CandidateCreatePage` | Upload multi-file candidate | Public apply/upload pattern | Thap-trung binh, flow cu conflict |
| `ManagementPage` | CRUD table/dialog/settings | JD/JobPosting CRUD | Cao |
| `InterviewerLayout` | Internal sidebar/auth shell | HR workspace shell | Trung binh |
| `DashboardPage` | Summary cards/recent sessions | Recruitment dashboard later | Thap |
| `Session*Page` | Interview/session flow | Khong dua vao Batch C | Khong reuse business flow |

## 5. UI Co The Xac Dinh Tinh Den Batch C

| UI group | Screen / Function | Actor | Source spec | Existing frontend reuse | Muc do chac chan | Ghi chu |
|---|---|---|---|---|---|---|
| Candidate/Public | Public job detail | Public | `07`, `15 P1-B04`, `14` | Card/Button/Badge | Cao | Can route moi |
| Candidate/Public | Apply form | Public | `07`, `14`, `15 P1-B05` | Form/Input/Select/Dialog pattern | Trung binh | Can chot field/consent UX |
| Candidate/Public | Upload CV trong apply | Public | `08`, `15 P1-C01/C02` | Upload pattern cu | Cao | Khong reuse `/candidates/upload` |
| Candidate/Public | Malware detected message | Public | `07`, `08`, `14` | Toast/error state | Cao | Chi hien thi safe message |
| Candidate/Public | Accepted/processing page | Public | `07`, `08` | Card/status pattern | Cao | Khong cho sanitize/parse |
| HR Workspace | JD list/detail/create/edit | Admin/HR | `03`, `06`, `07`, `15 P1-B01/B02` | `ManagementPage` pattern | Cao | Can route/domain types |
| HR Workspace | JD version/mark ready | Admin/HR | `06`, `07`, `15` | Button/Dialog/Badge | Trung binh | Can chot UX action |
| HR Workspace | Job posting list/detail/create/edit | Admin/HR | `07`, `15 P1-B03/B04` | CRUD table/dialog | Cao | Co publish/open/close status |
| HR Workspace | Application list | Admin/HR | `06`, `07`, `15 P1-B08` | `CandidateListPage` pattern | Cao | Application-centric |
| HR Workspace | Application detail | Admin/HR | `06`, `07`, `08` | `CandidateDetailPage` layout | Cao | Khong lay Candidate lam trung tam |
| HR Workspace | CV processing panel | Admin/HR | `08`, `15 P1-C01..C08` | Badge/Card/Table | Cao | Hien thi scan/sanitize/parse status |
| HR Workspace | Clean CV preview/download | Admin/HR | `07`, `08`, `14`, `15 P1-C09` | `downloadBlob`, PDF preview | Cao | Chi dung clean-file API |
| HR Workspace | Parsed profile view | Admin/HR | `07`, `08` | Parsed profile cards cu | Trung binh | Can type Phase 1 |
| HR Workspace | CV version history | Admin/HR | `06`, `08`, `15 P1-C08` | Table/Badge | Cao | Theo `applicationId` |
| HR Workspace | Workflow timeline/audit basic | Admin/HR | `06`, `07`, `14`, `15 P1-B07` | Table/Card | Trung binh | Chua co timeline component |
| Admin/Operation | Retry sanitize/parse | Admin/HR/System | `07`, `08` | Button/Dialog/Toast | Trung binh | Co API spec, can policy UX |

## 6. UI Chua Nen Dua Vao Tinh Den Batch C

| UI | Ly do chua dua vao |
|---|---|
| Mapping CV-JD UI | Batch D, sau CV parsed |
| Pre-screening form UI | Batch E |
| AI Screening UI | Batch F |
| HR Review decision UI | Batch G |
| Channel posting dashboard hoan chinh | Batch H/later |
| Bot conversation UI | Later |
| Offer/interview/onboarding | Ngoai scope Phase 1 hien tai |
| Session/evaluation UI hien co | Legacy interview flow, khong keo vao Batch C |
| Raw CV download/view UI | Spec cam expose raw/original CV thong thuong |
| CV processing job monitor day du | Chua du spec van hanh/job monitor UI |
| Failure notification status | Spec co rule chung, chua du UX/status chi tiet |
| Scanner/sanitizer mode view | Chua co config/status spec UI ro |

## 7. Thong Tin Con Thieu De Tao UI List Chinh Xac Hon

| Thieu thong tin | Anh huong toi UI | Nguon can bo sung | Priority |
|---|---|---|---|
| Field apply form chinh thuc | Khong chot duoc form labels/required/validation | UI spec/API DTO | High |
| Consent/privacy/captcha UX | Public apply co the thieu compliance/security controls | Security/public endpoint spec | High |
| Status label/color mapping | UI status de lech backend enum | Frontend UI spec | High |
| Idempotency key UX | Retry upload/apply co the tao duplicate | API/frontend spec | High |
| HR ownership/scope rule | Route/action visibility cho HR chua chac | Security/role spec | Medium |
| ParsedProfile field display | Parsed profile UI co the reuse sai legacy type | CV parsing/UI spec | Medium |
| Retry sanitize/parse policy | Action button/rerun dialog chua ro | CV operation spec | Medium |
| Error copy public-safe | Tranh leak scanner/parser/storage detail | Security/UI copy spec | Medium |

## 8. Conflict / Risk Giua Spec Va Frontend Hien Tai

| Conflict / Risk | Source lien quan | Tac dong | De xuat xu ly |
|---|---|---|---|
| Candidate upload cu dung `/candidates/upload` | `CandidateCreatePage`, `CandidateDetailPage`; spec `08`, `15 P1-C01` | De reuse sai flow raw CV | Tao application-centric upload UI/API rieng |
| `.xls` dang duoc accept o UI cu | `CandidateDetailPage`; spec `08` | Batch C khong support `.xls` | Batch C chi allow `.pdf,.docx,.xlsx` |
| Existing file preview dung URL legacy | `CandidateDetailPage`, `apiClient.downloadBlob`; spec `07`, `08`, `14` | Co nguy co dung `/api/uploads/:filename` cho clean CV | Clean CV phai qua `/applications/:applicationId/cv/:cvDocumentId/clean-file` |
| UI hien tai Candidate-centric | `/candidates`, `CandidateDetailPage`; spec `03`, `06` | Sai trung tam workflow | Application detail/list la man chinh |
| Session/evaluation UI hien huu | `Session*Page`; spec `15` guardrail | De keo nham interview flow vao Batch C | Chi reuse UI pattern, khong reuse business flow |
| Public token cu la `/session/:token` | `CandidateLayout`, `CandidateSessionPage`; spec `14` | Khong dung cho apply/form Phase 1 | Tao public job/apply route rieng |
| HR/Admin role UI chua day du | `InterviewerLayout`, `UserRole` | HR workspace menu/action chua ro | Them navigation/guards theo role |
| Shared types thieu Phase 1 model | `packages/shared/src/types/*` | Frontend phai tu dinh nghia tam hoac cho shared types | Bo sung types truoc UI implementation |
| `apiClient` thieu idempotency header | `api-client.ts`; spec `07`, `08`, `14` | Retry upload/apply khong chuan | Mo rong API client options/header |
| `.env.example` co `VITE_API_URL` nhung client hardcode `/api` | `apps/frontend/.env.example`, `api-client.ts` | Deploy khac proxy co the loi | Quyet dinh dung env hoac giu proxy convention |

## 9. Danh Gia Kha Nang Reuse Frontend Hien Tai

| UI Batch C | Reuse tu dau? | Muc reuse | Viec can lam them |
|---|---|---|---|
| Public job detail | Card/Button/Badge | Trung binh | Route public + API call + SEO/basic states |
| Apply form | Login/Register/form patterns | Trung binh | DTO/schema, validation, safe errors |
| CV upload | Candidate upload pattern | Mot phan | Viet lai endpoint, allowlist, idempotency |
| Upload result/processing | Toast/Card/Badge | Cao | Status copy theo spec |
| JD management | `ManagementPage` CRUD pattern | Cao | Domain pages/routes/types |
| Job posting management | `ManagementPage` CRUD pattern | Cao | Publish/close actions |
| Application list | `CandidateListPage` table pattern | Cao | Filters/status/source columns |
| Application detail | `CandidateDetailPage` layout | Trung binh | Re-center theo Application |
| CV processing panel | Badge/Card/Table | Trung binh | Status mapping, retry actions |
| Clean CV preview/download | `downloadBlob`, PDF dialog | Cao | Dung clean-file endpoint va audit-safe action |
| Parsed profile view | Candidate parsed profile cards | Trung binh | Type/schema Phase 1 |
| CV version history | Table/Badge/Pagination | Cao | Version metadata model |
| Workflow timeline/audit basic | Table/Card | Trung binh | Tao timeline component moi |

## 10. De Xuat Buoc Tiep Theo

Nen tao file UI specification rieng:

- Ten de xuat: `docs/recruitment-phase1/16_frontend_ui_scope_until_batch_c.md`
- Noi dung de xuat:
  - Scope / non-scope
  - Actors / permissions
  - Route map
  - Screen list
  - Screen-by-screen data/API dependency
  - Status/error copy
  - Clean CV security rule
  - Component reuse
  - Open questions

Nen tao frontend implementation task breakdown rieng:

- Ten de xuat: `docs/recruitment-phase1/17_frontend_implementation_task_breakdown_until_batch_c.md`
- Noi dung de xuat:
  - Frontend foundation/types
  - API client idempotency
  - Routes/navigation
  - Public job/apply
  - HR JD screens
  - Job posting screens
  - Application list/detail
  - CV upload/processing panel
  - Clean CV access
  - Parsed profile
  - Version history/timeline
  - Checkpoint commands user-run

