# Extension Filter Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tách các filter UI dùng chung trong extension, với date range là một filter duy nhất gồm ngày bắt đầu và ngày kết thúc.

**Architecture:** Component dùng chung tại `src/components/filters/` chỉ xử lý presentation và interaction. Mỗi feature composition các primitive theo nhu cầu riêng, giữ state và business logic tại feature hiện tại. Refactor theo từng nhóm để không thay đổi hành vi lọc.

**Tech Stack:** React, TypeScript, Vite, CSS hiện hữu của extension.

## Global Constraints

- Dùng pnpm only.
- Không tạo hoặc sửa `*.spec.ts` / `*.test.ts`.
- Không build, lint hoặc khởi động app.
- Sau mỗi nhóm code change chạy `pnpm typecheck` và kiểm tra runtime logs.
- Chạy các regression scripts hiện có của extension sau khi hoàn tất.

### Task 1: Shared filter primitives

**Files:**
- Create: `apps/extension/src/components/filters/SearchField.tsx`
- Create: `apps/extension/src/components/filters/SelectFilter.tsx`
- Create: `apps/extension/src/components/filters/DateRangeFilter.tsx`
- Create: `apps/extension/src/components/filters/FilterBar.tsx`
- Create: `apps/extension/src/components/filters/index.ts`
- Modify: `apps/extension/src/app/styles.css`

**Interfaces:**
- `DateRangeValue = { from: string; to: string }`.
- `DateRangeFilter` nhận `value`, `onChange`, `label`, và placeholder/disabled tùy chọn; callback luôn trả về cả range.
- `SelectFilter` nhận `label`, `value`, `options`, `onChange`.
- `SearchField` nhận `value`, `onChange`, `placeholder`, `ariaLabel`.
- `FilterBar` nhận children và className để cung cấp layout chung.

- [ ] Tạo các component presentational với class names riêng trong namespace `shared-filter-*`.
- [ ] Bảo đảm `DateRangeFilter` render hai input trong cùng một wrapper và không expose hai filter độc lập.
- [ ] Thêm style chung, giữ kích thước/spacing tương thích với CSS hiện có.
- [ ] Export toàn bộ public types/components qua `index.ts`.
- [ ] Chạy `pnpm typecheck` và kiểm tra `apps/frontend/dev.log` cùng `apps/backend/dev.log`.

### Task 2: Freelancer filter composition

**Files:**
- Create: `apps/extension/src/features/freelancer/components/FreelancerCvFilters.tsx`
- Modify: `apps/extension/src/features/freelancer/freelancer-cv-panel.tsx`
- Modify: `apps/extension/src/app/styles.css`

**Interfaces:**
- `FreelancerCvFilterValues` giữ các field hiện tại: search, status, JD, fromDate, toDate.
- `FreelancerCvFilters` nhận values/options và callbacks từ panel; không tự fetch hoặc lọc dữ liệu.

- [ ] Di chuyển markup toolbar hiện tại của freelancer vào component feature-specific.
- [ ] Dùng `SearchField`, `SelectFilter` và một `DateRangeFilter` cho toolbar.
- [ ] Map range chung về `fromDate`/`toDate` ở boundary của freelancer để không đổi filtering logic.
- [ ] Xóa markup/state duplication không còn cần trong panel và giữ nguyên UX hiện tại.
- [ ] Chạy `pnpm typecheck` và extension regression checks liên quan.

### Task 3: Referral filter composition

**Files:**
- Create: `apps/extension/src/features/referrals/components/ReferralFilters.tsx`
- Modify: `apps/extension/src/features/referrals/referral-management.tsx`
- Modify: `apps/extension/src/app/styles.css`

**Interfaces:**
- `ReferralFilters` chỉ nhận filter values/options và event callbacks của referral.
- Không đưa metrics hoặc referral business rules vào shared filter primitives.

- [ ] Tách search/filter toolbar hiện tại của referral thành component riêng.
- [ ] Tái sử dụng shared search/select/date primitives nếu UI tương ứng.
- [ ] Giữ nguyên option labels, default values, pagination và filter behavior.
- [ ] Chạy `pnpm typecheck` và regression checks của referral/results.

### Task 4: Extract CV filter dropdown from side panel

**Files:**
- Create: `apps/extension/src/components/filters/FilterDropdown.tsx`
- Modify: `apps/extension/src/app/side-panel.tsx`
- Modify: `apps/extension/src/app/styles.css`
- Modify: `apps/extension/scripts/cv-list-regression.test.mjs` only if import path assertions require it

**Interfaces:**
- `FilterDropdown` giữ generic option shape và callback hiện tại của `CvFilterDropdown`.
- Side panel tiếp tục sở hữu các enum/filter values và business actions.

- [ ] Di chuyển implementation dropdown ra khỏi `side-panel.tsx`.
- [ ] Cập nhật import và giữ nguyên keyboard/click-outside/selected-state behavior.
- [ ] Dùng component mới tại toàn bộ call sites hiện có.
- [ ] Chạy typecheck và CV list regression script.

### Task 5: Final verification

**Files:**
- No new test files.

- [ ] Chạy `pnpm typecheck`.
- [ ] Chạy các regression scripts hiện có: `test:cv-list`, `test:tab-labels`, `test:results-toggle`, `test:group-modal`, và `amis-source-selection-regression.test.mjs`.
- [ ] Kiểm tra runtime logs; ghi nhận nếu backend port 3002 đang được user tắt.
- [ ] Rà lại import tree để không còn duplicate `side-panel.tsx` hoặc filter implementation cũ không dùng.
