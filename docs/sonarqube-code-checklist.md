# SonarQube Code Checklist

Checklist phòng ngừa lỗi SonarQube cho VCS Interview Assistant. Nội dung được tổng hợp từ các rule đã xuất hiện trong repository và các nhóm lỗi đã xử lý ở các đợt quét trước.

## 1. Nguyên tắc sử dụng

- SonarQube là công cụ phân tích tĩnh và kiểm soát chất lượng; không thay thế kiểm thử chức năng, kiểm thử API hoặc kiểm thử trên trình duyệt.
- Fix bằng source code và hành vi đúng của ứng dụng. Không sửa `sonar-project.properties`, Quality Gate, profile, exclusion hoặc trạng thái issue chỉ để làm báo cáo pass.
- Không tự suy diễn severity từ tên rule. Khi có issue mới, đọc đầy đủ `Where is the issue?`, `Why is this an issue?` và `How can I fix it?` trên SonarQube.
- Giữ nguyên contract của API, dữ liệu trả về, quyền truy cập và hành vi của các luồng không liên quan.
- Với rule có thể phụ thuộc phiên bản TypeScript, React, Node hoặc SonarQube, ưu tiên tài liệu rule đang hiển thị trên SonarQube local của repository.

## 2. Definition of Done cho mỗi chức năng mới

### Trước khi code

- [ ] Xác định input nào đến từ người dùng, trình duyệt, extension, API bên ngoài hoặc database.
- [ ] Xác định dữ liệu nhạy cảm: token, cookie, OTP, access token, thông tin ứng viên và thông tin tài khoản.
- [ ] Xác định trạng thái thành công, lỗi, timeout, retry, hủy thao tác và dữ liệu rỗng.
- [ ] Với UI, xác định control tương ứng, label hiển thị, keyboard flow và trạng thái loading/disabled.
- [ ] Chia chức năng thành các hàm nhỏ có trách nhiệm rõ ràng; tránh bắt đầu bằng một hàm xử lý toàn bộ workflow.

### Sau khi code

- [ ] Chạy `pnpm typecheck`.
- [ ] Kiểm tra `apps/backend/dev.log`; nếu có thay đổi frontend thì kiểm tra thêm `apps/frontend/dev.log`.
- [ ] Chạy smoke test API trên backend đang chạy và smoke test trên trình duyệt/extension.
- [ ] Kiểm tra các nhánh lỗi: input không hợp lệ, `null`/`undefined`, timeout, response thiếu field và quyền không đủ.
- [ ] Kiểm tra rằng không có dynamic execution, regex nguy hiểm, key React không ổn định hoặc implicit coercion mới.
- [ ] Chạy scanner và kiểm tra cả **New Code** lẫn **Overall Code**.
- [ ] Chỉ kết luận issue đã được xử lý sau lần phân tích mới; không tự chuyển issue sang Fixed.

## 3. Security và Reliability

### Dynamic execution và injection — `typescript:S1523`

- [ ] Không đưa input người dùng, dữ liệu từ DOM, URL, GraphQL hoặc API ngoài vào `eval`, `new Function`, `vm`, shell command hoặc cơ chế thực thi động.
- [ ] Nếu nghiệp vụ bắt buộc phải thực thi code, dùng allowlist rõ ràng, validate input trước khi xử lý, tách dữ liệu khỏi code và giới hạn timeout/memory/output.
- [ ] Không nối chuỗi input vào command, query hoặc đoạn code thực thi.
- [ ] Review cả đường đi gián tiếp: helper nhận string rồi gọi API thực thi ở nơi khác.

### Random dùng trong security — `typescript:S2245`

- [ ] Token, OTP, nonce, reset key, session key và giá trị dùng để phân quyền phải dùng nguồn ngẫu nhiên mật mã an toàn, ví dụ `crypto.randomInt`, `crypto.randomUUID` hoặc Web Crypto phù hợp.
- [ ] Chỉ dùng `Math.random()` cho UI, thứ tự hiển thị hoặc dữ liệu không có ý nghĩa bảo mật.
- [ ] Không tự ghép token bằng timestamp, counter hoặc chuỗi dự đoán được.

### Regex phức tạp và backtracking — `typescript:S5843`, `typescript:S8786`, `typescript:S5869`

- [ ] Regex có anchor và giới hạn độ dài khi xử lý input bên ngoài.
- [ ] Tránh các quantifier mơ hồ/lồng nhau, alternation chồng lấn và pattern có thể gây catastrophic/non-linear backtracking.
- [ ] Ưu tiên character class phủ định, quantifier có bound hoặc parser/string API đơn giản thay cho regex quá lớn.
- [ ] Không lặp ký tự trong character class; kiểm tra kỹ escape và range.
- [ ] Thử input rất dài, input sai định dạng, chuỗi rỗng và chuỗi chứa ký tự Unicode đặc biệt.

### Accessibility của label — `typescript:S6853`

- [ ] Mỗi input có label hiển thị hoặc accessible name có chủ đích.
- [ ] Dùng cặp `label htmlFor="stable-id"` và `input id="stable-id"`, hoặc label bao quanh control.
- [ ] `aria-label`/`aria-labelledby` chỉ dùng khi không thể có label hiển thị; không dùng để che một label sai.
- [ ] ID phải duy nhất khi render danh sách; kiểm tra keyboard focus, loading và disabled state.

### No-op và control flow — `typescript:S905`

- [ ] Xóa expression không tạo side effect.
- [ ] Kiểm tra các câu lệnh assignment bị viết nhầm thành comparison hoặc ngược lại.
- [ ] Đảm bảo callback/branch thực sự thay đổi state, trả về kết quả hoặc xử lý lỗi theo mục đích.

## 4. Complexity và cấu trúc hàm

### Cognitive Complexity — `typescript:S3776`, `javascript:S3776`

- [ ] Dùng early return để giảm `if` lồng nhau.
- [ ] Tách validation, mapping, persistence, retry và error handling thành helper có tên rõ nghĩa.
- [ ] Giảm số nhánh, vòng lặp và điều kiện kết hợp trong một hàm.
- [ ] Không chỉ chuyển nguyên một hàm quá lớn sang helper khác; helper mới phải có một trách nhiệm và complexity thấp hơn.
- [ ] Sau refactor, xác nhận output, thứ tự side effect và lỗi trả về không đổi.

### Nested ternary — `typescript:S3358`

- [ ] Không dùng ternary lồng nhau trong JSX hoặc business logic.
- [ ] Dùng biến trung gian, `if/else`, `switch` hoặc helper có tên mô tả điều kiện.

### Braces và block thừa — `typescript:S2681`, `typescript:S1199`

- [ ] Luôn dùng `{}` cho body nhiều dòng của `if`, `else`, loop và callback.
- [ ] Xóa block lồng nhau không tạo scope hoặc ý nghĩa mới.
- [ ] Khi block có chủ ý để tạo scope, ghi rõ lý do bằng comment ngắn.

### Return invariant — `typescript:S3516`

- [ ] Kiểm tra hàm có thật sự trả về giá trị phụ thuộc vào input hay luôn trả cùng một giá trị.
- [ ] Nếu callback chỉ cần side effect, dùng callback phù hợp và không tạo API giả vờ trả kết quả.
- [ ] Không thêm `return` giả để làm rule biến mất; sửa lại contract của hàm cho đúng.

### Không dùng `void` như cơ chế che lỗi — `typescript:S3735`

- [ ] Không dùng `void` để nuốt Promise hoặc che giá trị trả về.
- [ ] Với async handler, xử lý lỗi rõ ràng bằng `try/catch`, callback async có kiểm soát hoặc một helper quản lý Promise.
- [ ] Nếu cố ý không chờ Promise, ghi rõ lifecycle và bảo đảm rejection vẫn được xử lý.

### Tham số và selector — `typescript:S107`, `typescript:S2301`

- [ ] Hàm không nhận quá nhiều tham số độc lập.
- [ ] Gom các tham số cùng domain vào options object/type có tên rõ ràng.
- [ ] Tránh method có các cờ/selector làm thay đổi nhiều hành vi; tách thành method theo nghiệp vụ hoặc dùng strategy có kiểu rõ ràng.
- [ ] Không đổi thứ tự tham số để né rule; cập nhật toàn bộ caller và giữ contract dễ đọc.

### Helper và type dư thừa — `typescript:S7721`, `typescript:S6564`, `typescript:S1854`

- [ ] Đưa helper không cần closure lên scope cao nhất có thể.
- [ ] Xóa type alias chỉ lặp lại một type mà không thêm ngữ nghĩa.
- [ ] Xóa assignment trung gian không được đọc; nếu assignment dùng để reset state hoặc tạo side effect thì làm rõ mục đích.

## 5. TypeScript, JavaScript và React

### Immutability và hàm collection

- [ ] Không mutate array đầu vào ngoài ý muốn. Với kết quả mới, dùng `toSorted()` nếu môi trường hỗ trợ hoặc `[...items].sort()` — `typescript:S4043`.
- [ ] Khi chỉ cần phần tử đầu tiên phù hợp, dùng `find()`/`findLast()` thay vì `filter()[0]` — `typescript:S7750`.
- [ ] Khi chỉ kiểm tra tồn tại, dùng `Set.has()` thay vì array scan lặp lại — `typescript:S7776`.
- [ ] Dùng `element.remove()` thay vì `parent.removeChild(element)` khi chỉ cần xóa node — `typescript:S7762`.
- [ ] Không lặp lại hai hàm có implementation giống nhau; trích xuất helper dùng chung — `typescript:S4144`.

### Nullish và chuyển đổi kiểu

- [ ] Dùng `??` khi fallback chỉ dành cho `null`/`undefined`; giữ `||` khi `''`, `0` hoặc `false` cũng phải fallback — `typescript:S6606`.
- [ ] Không để object/class bị ép thành chuỗi thành `[object Object]`. Format rõ ràng, dùng field cụ thể hoặc `toString()` có ý nghĩa — `typescript:S6551`.
- [ ] Dùng `Object.hasOwn(object, key)` để kiểm tra own property — `typescript:S6653`.
- [ ] Dùng `RegExp.exec(value)` khi cần kết quả match — `typescript:S6594`.
- [ ] Không khai báo property vừa optional (`?`) vừa union với `undefined`; chọn một cách biểu diễn nhất quán — `typescript:S4782`.
- [ ] Với Node built-in, dùng protocol `node:` trong import — `javascript:S7772`, `typescript:S7772`.
- [ ] Trong module hỗ trợ, ưu tiên top-level `await` thay cho async IIFE hoặc promise chain không cần thiết — `javascript:S7785`.

### JSX và React

- [ ] Props được khai báo readonly hoặc dùng `Readonly<Props>`; component không mutate props — `typescript:S6759`.
- [ ] List dùng key ổn định từ ID domain. Không dùng array index nếu danh sách có thể sort, filter, thêm, xóa hoặc refresh — `typescript:S6479`.
- [ ] Không lồng template literal; tạo fragment/biến trung gian có tên rõ ràng — `typescript:S4624`.
- [ ] Không dùng role để thay thế semantic HTML khi có native element tương ứng — `typescript:S6819`.
- [ ] Không dùng nested ternary trong JSX — `typescript:S3358`.

## 6. CSS và giao diện

### Selector và stylesheet — `css:S4666`, `css:S4658`

- [ ] Không khai báo cùng selector ở nhiều block nếu có thể gộp thành một block canonical.
- [ ] Xóa rule CSS rỗng.
- [ ] Nếu cascade hoặc media query cần tách block, giữ cấu trúc có chủ ý và comment ngắn giải thích lý do.
- [ ] Sau khi gộp selector, kiểm tra specificity, responsive breakpoint, hover/focus và theme.

### Contrast — `css:S7924`

- [ ] Text thông thường đạt tương phản tối thiểu WCAG AA 4.5:1.
- [ ] Text lớn/bold đạt tối thiểu 3:1.
- [ ] Kiểm tra cả placeholder, disabled text, badge, link, focus ring, hover và dark mode.
- [ ] Không chỉ đổi màu chữ; kiểm tra background, border và trạng thái tương tác cùng nhau.

## 7. Test file và coverage

### Test file rỗng — `javascript:S2187`, `typescript:S2187`

- [ ] Không tạo file `*.spec.ts`, `*.test.ts` hoặc test tương đương nhưng không có test case được framework nhận diện.
- [ ] File test phải có `it`, `test` hoặc `specify` hợp lệ theo framework đang dùng.
- [ ] Nếu file không còn cần thiết, xóa theo quy trình của team thay vì để file rỗng.
- [ ] Quy tắc repository hiện tại không cho phép Codex tạo/sửa test file; khi một issue S2187 xuất hiện, cần chuyển cho owner test quyết định theo quy trình team.

### Coverage

- [ ] Khi backend có test coverage hợp lệ, tạo/refresh LCOV ở `apps/backend/coverage/sonar-lcov.info` bằng command hiện có của repository.
- [ ] Bảo đảm scanner đọc đúng `sonar.javascript.lcov.reportPaths`; không sửa đường dẫn hoặc exclusion chỉ để tăng phần trăm.
- [ ] Quality Gate của New Code yêu cầu coverage tối thiểu 80% theo cấu hình hiện tại; đây là ngưỡng kiểm soát code mới, không đồng nghĩa Overall Code phải đạt 80% ngay lập tức.
- [ ] Coverage không thay thế smoke test cho backend API, frontend và extension.

## 8. Quy trình chạy kiểm tra trước khi báo cáo

1. Hoàn thành checklist liên quan đến feature.
2. Chạy typecheck và kiểm tra log runtime.
3. Chạy API smoke test và browser/extension smoke test với output kỳ vọng.
4. Tạo coverage theo workflow test hiện có nếu feature có test coverage.
5. Chạy SonarQube local:

   ```powershell
   Set-Location C:\SourceCode\auto-cv-processing
   $env:SONAR_TOKEN = "<TOKEN_HIỆN_TẠI>"

   docker compose -f docker-compose.sonar.yml `
     --profile scan `
     run --rm `
     --pull never `
     sonar-scanner
   ```

6. Refresh project trên SonarQube và kiểm tra:
   - [ ] Quality Gate.
   - [ ] **New Code**: Security, Reliability, Maintainability, Coverage và Duplications.
   - [ ] **Overall Code** khi thay đổi ảnh hưởng code cũ.
   - [ ] Rule, file, line và remediation guidance của từng issue.
7. Chỉ báo cáo “đã fix” khi scanner của source code mới phản ánh kết quả. Không đổi status issue thủ công để thay thế việc re-scan.

## 9. Checklist ngắn để dán vào PR

- [ ] Tôi đã xác định trust boundary và không đưa input không tin cậy vào dynamic execution/command/query.
- [ ] Token/OTP/nonce dùng random an toàn.
- [ ] Regex có giới hạn, không có backtracking nguy hiểm và đã thử input xấu.
- [ ] Hàm không quá phức tạp, không nhiều tham số, không nested ternary/block dư thừa.
- [ ] Không có assignment thừa, type alias dư, hàm trùng, `void` nuốt Promise hoặc expression no-op.
- [ ] Không mutate dữ liệu ngoài ý muốn; collection API phù hợp (`find`, `Set`, `remove`, non-mutating sort).
- [ ] React props readonly và list key ổn định.
- [ ] Label/accessibility, semantic HTML và contrast đã được kiểm tra.
- [ ] CSS không có selector lặp hoặc block rỗng.
- [ ] Đã chạy `pnpm typecheck`, kiểm tra runtime logs, API smoke và browser/extension smoke.
- [ ] Đã chạy scanner và xem cả New Code/Overall Code; không sửa config hoặc trạng thái issue để làm pass.

## 10. Quy tắc cập nhật checklist

- Khi scanner phát hiện rule mới chưa có trong tài liệu, bổ sung rule đó cùng ví dụ phòng ngừa ngắn.
- Ghi lại nguyên nhân gốc và test/smoke case bảo vệ hành vi, không chỉ ghi cách làm Sonar hết cảnh báo.
- Khi refactor ảnh hưởng luồng hiện có, lưu lại output trước/sau và các case timeout, retry, quyền truy cập hoặc dữ liệu rỗng đã kiểm tra.
