# Extension Filter Components Design

## Goal

Tách các phần giao diện filter lặp lại trong extension thành component dùng chung, đồng thời giữ state và logic nghiệp vụ ở từng feature để dễ maintain.

## Component boundaries

Tạo nhóm component dùng chung tại `apps/extension/src/components/filters/`:

- `SearchField`: ô tìm kiếm, icon và trạng thái nhập liệu.
- `SelectFilter`: label, select/options và callback thay đổi giá trị.
- `DateRangeFilter`: một filter duy nhất gồm hai ô `Từ ngày` và `Đến ngày`, nhận/trả về một object range chung. Không tách thành hai filter độc lập.
- `FilterBar` hoặc `FilterGrid`: chỉ phụ trách layout và spacing.
- `FilterDropdown`: component dropdown dùng chung, được tách từ `CvFilterDropdown` hiện đang nằm trong `side-panel.tsx`.

Các component này chỉ xử lý presentation và interaction cơ bản; không biết trạng thái CV, JD, referral hay Facebook.

## Feature boundaries

Mỗi feature sẽ có component composition riêng:

- `features/freelancer/components/FreelancerCvFilters.tsx`
- `features/referrals/components/ReferralFilters.tsx`
- `features/recruitment/components/CvFilters.tsx` khi refactor phần filter lớn trong `side-panel.tsx`

Các component feature-specific quyết định filter nào xuất hiện, option nào được truyền vào và cách map dữ liệu filter vào business logic. State có thể tiếp tục ở component hiện tại trong bước đầu; chỉ tách thành hook riêng khi logic đủ lớn.

## Date range contract

`DateRangeFilter` dùng một value duy nhất:

```ts
type DateRangeValue = {
  from: string;
  to: string;
};
```

Một lần thay đổi ngày sẽ gọi callback với range mới. Feature tự chịu trách nhiệm validate range, reset range và áp dụng vào dữ liệu.

## Rollout

1. Tạo primitives và style dùng chung.
2. Refactor filter của freelancer và referral, ưu tiên các phần có UI tương đồng.
3. Tách `CvFilterDropdown` khỏi `side-panel.tsx`.
4. Tách tiếp filter lớn của recruitment/HR theo từng feature, không gom toàn bộ vào một universal filter component.

## Verification

- Chạy `pnpm typecheck`.
- Chạy các regression checks hiện có của extension.
- Kiểm tra filter freelancer, referral và CV vẫn giữ nguyên hành vi, đặc biệt là date range dùng chung một filter.
- Kiểm tra runtime logs theo quy định của repository.
