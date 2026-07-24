# Extension Question Editor Redirect

## Decision

The extension must stop editing the synced JD question set inline. The existing `Chỉnh sửa bộ câu hỏi` action will open the frontend question-management route at `/questions` in a new active browser tab.

The extension continues to load and display the selected JD question set and to persist the selected question IDs for AMIS posting. Only question text editing moves to the frontend.

## Behavior

- The edit action is available when a JD with a synced question set is selected.
- Clicking it calls `chrome.tabs.create({ url: '<frontend-base>/questions', active: true })`.
- The frontend base URL is configurable through `VITE_FE_BASE_URL` and defaults to `http://localhost:4000`.
- The inline textarea editor and its PATCH call are removed from the extension.
- If opening a browser tab fails, the extension shows an error message in the question panel and leaves the selected question set unchanged.

## Verification

- `pnpm typecheck` passes for all packages.
- The running frontend route `/questions` opens successfully in the authenticated browser session.
- The extension source no longer imports or calls `updateJobDescriptionQuestionSetItem`.
- No backend API or question data model changes are required.
