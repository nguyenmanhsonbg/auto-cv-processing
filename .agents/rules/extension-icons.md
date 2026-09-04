# Extension Icons Convention

- Trong dự án `apps/extension`, tất cả các icon PHẢI được định nghĩa đồng nhất 100% dưới dạng React icon component (`.tsx`), lưu trữ đúng vị trí bên trong thư mục:
  `/Users/tinlq1/code/auto-cv-processing/apps/extension/src/assets/icons`
- Tuyệt đối **KHÔNG** để lẫn các file `.svg` thô trong thư mục này (tất cả các icon phải là React component `.tsx` hỗ trợ `IconProps` và `className`).
- Tất cả icon components phải được re-export tập trung qua:
  `apps/extension/src/assets/icons/index.tsx`
- Import icon trong các component/feature qua alias:
  `import { SomeIcon } from '@/assets/icons';`
- Tuyệt đối **KHÔNG** định nghĩa trực tiếp inline SVG icon components trong các file feature/component/modal (như `TopCvDatePicker.tsx`, `TopCvEditModal.tsx`, v.v.).
